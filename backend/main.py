"""
InterviewAI — FastAPI Backend
All routes for the AI-powered interview platform (supports both standard and teammate API schemas).
"""
import uuid
import os
import hashlib
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from resume_parser import extract_text_from_pdf
from speaker import generate_speech_bytes
from llm_service import (
    summarize_resume, 
    generate_question, 
    generate_evaluation, 
    generate_conclusion_statement, 
    is_conclusion_statement,
    generate_coding_problem,
    evaluate_code_submission,
    check_upload_seriousness,
    check_chat_seriousness,
    format_conduct_warning
)


# =====================================================================
# TEAMMATE MODULE IMPORTS (WITH SAFE FALLBACKS)
# =====================================================================

try:
    from Resume_Reader import extract_resume_text
    print(" Loaded teammate's Resume_Reader.py successfully.")
except ImportError:
    print(" Resume_Reader.py not found. Falling back to internal PDF parser.")
    def extract_resume_text(file_bytes: bytes, filename: str) -> str:
        try:
            return extract_text_from_pdf(file_bytes)
        except Exception:
            return (
                f"[Mock Resume Content from {filename}] "
                "Skills: Python, C, Data Structures, Embedded Systems, FastAPI, Machine Learning. "
                "Projects: Built an automated exam paper predictor and a quadcopter flight controller."
            )

try:
    from video_proctor import analyze_frame_for_integrity
    print(" Loaded teammate's video_proctor.py successfully.")
except ImportError:
    print(" video_proctor.py not found. Using fallback mock proctor.")
    def analyze_frame_for_integrity(frame_base64: str) -> Dict[str, Any]:
        return {"is_looking_away": False, "reason": "Focused on screen", "confidence": 0.98}


# =====================================================================
# APP INITIALIZATION
# =====================================================================

app = FastAPI(title="InterviewAI", version="1.0.0")

# CORS — allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory session store ──────────────────────────────────────────────────
sessions: Dict[str, dict] = {}

MAX_QUESTIONS = 11  # Standard 10-13 question structure (concludes after 11th turn)
MIN_QUESTIONS_FOR_EVALUATION = 3  # Minimum candidate answers before evaluation is valid


# ── Pydantic models (Supports both current frontend & prev main.py) ──────────
class StartRequest(BaseModel):
    session_id: str

class RespondRequest(BaseModel):
    session_id: str
    answer: str

class EndRequest(BaseModel):
    session_id: str
    attention_flags: list = []
    sentiment_metrics: Optional[dict] = None
    coding_submissions: Optional[list] = None

class CodingProblemRequest(BaseModel):
    session_id: str

class CodeSubmissionRequest(BaseModel):
    session_id: str
    code: str
    language: Optional[str] = "python"
    problem_title: Optional[str] = "Live Coding Challenge"
    problem_description: Optional[str] = ""

class SentimentSnapshotRequest(BaseModel):
    session_id: str
    metrics: dict

class ChatRequest(BaseModel):
    session_id: str
    candidate_answer: str

class ProctorRequest(BaseModel):
    session_id: str
    frame_base64: Optional[str] = None
    browser_event: Optional[str] = None

class EvaluationSchema(BaseModel):
    overall_score: int
    role_suitability: str
    strengths: List[str]
    gaps_and_improvements: List[str]
    technical_assessment: str
    communication_assessment: str

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "en-US-JennyNeural"
    rate: Optional[str] = "-3%"


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "InterviewAI"}


TTS_CACHE_DIR = os.path.join(os.path.dirname(__file__), "tts_cache")
os.makedirs(TTS_CACHE_DIR, exist_ok=True)

@app.get("/api/tts")
async def tts_stream_get(text: str, voice: str = "en-US-JennyNeural", rate: str = "-3%"):
    """
    Generate and stream ultra-realistic Neural TTS (edge-tts en-US-JennyNeural / en-US-AriaNeural).
    Includes on-disk caching by hash for low latency and zero repeated generation cost.
    """
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text parameter is required.")

    clean_text = text.strip()
    cache_key = hashlib.md5(f"{voice}:{rate}:{clean_text}".encode("utf-8")).hexdigest()
    cache_file = os.path.join(TTS_CACHE_DIR, f"{cache_key}.mp3")

    if os.path.exists(cache_file):
        with open(cache_file, "rb") as f:
            audio_bytes = f.read()
        return Response(content=audio_bytes, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})

    try:
        audio_bytes = await generate_speech_bytes(clean_text, voice=voice, rate=rate)
        with open(cache_file, "wb") as f:
            f.write(audio_bytes)
        return Response(content=audio_bytes, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})
    except Exception as e:
        print(f"[TTS Error] edge-tts generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"TTS generation error: {str(e)}")


@app.post("/api/tts")
async def tts_stream_post(req: TTSRequest):
    """POST endpoint for Neural TTS audio stream."""
    return await tts_stream_get(text=req.text, voice=req.voice or "en-US-JennyNeural", rate=req.rate or "-3%")


# ---------------------------------------------------------------------
# CURRENT PROJECT ENDPOINTS (Used by index.html / interview.html / report.html)
# ---------------------------------------------------------------------

@app.post("/api/upload-resume")
async def upload_resume(
    file: UploadFile = File(...),
    role: str = Form(...),
    warning_count: int = Form(0)
):
    """Upload a resume PDF and create an interview session with seriousness validation."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    
    file_bytes = await file.read()
    try:
        resume_text = extract_text_from_pdf(file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse PDF. Please try a different file.")
    
    # ── CHECK FOR INTENTIONAL NON-SERIOUS CONTENT IN RESUME OR ROLE ──
    seriousness = check_upload_seriousness(role=role, resume_text=resume_text)
    if not seriousness.get("is_serious", True):
        reason = seriousness.get("reason", "Intentional non-serious content detected.")
        if warning_count >= 1:
            # Exceeded 1 warning limit
            raise HTTPException(
                status_code=400,
                detail={
                    "status": "blocked",
                    "blocked": True,
                    "warning": True,
                    "warning_count": warning_count + 1,
                    "max_warnings": 1,
                    "message": f"Upload blocked: Maximum warning limit reached (1/1). Non-serious content submitted again ({reason}). Please provide an authentic resume and legitimate job role.",
                    "reason": reason,
                    "issues": seriousness.get("issues", [])
                }
            )
        else:
            # Issue the 1 allowed warning for resume or role
            raise HTTPException(
                status_code=400,
                detail={
                    "status": "warning",
                    "blocked": False,
                    "warning": True,
                    "warning_count": 1,
                    "max_warnings": 1,
                    "message": f"⚠️ Content Warning (1/1): Intentional non-serious content detected. {reason}. Please upload an authentic professional resume and enter a genuine target role.",
                    "reason": reason,
                    "issues": seriousness.get("issues", []),
                    "role_is_serious": seriousness.get("role_is_serious", True),
                    "resume_is_serious": seriousness.get("resume_is_serious", True)
                }
            )

    try:
        resume_summary = summarize_resume(resume_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze resume: {str(e)}")
    
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "session_id": session_id,
        "candidate_name": resume_summary.get("candidate_name", "Candidate"),
        "role": role,
        "target_role": role,
        "resume_text": resume_text,
        "resume_summary": resume_summary,
        "conversation_history": [],
        "transcript": [],
        "questions_asked": 0,
        "max_questions": MAX_QUESTIONS,
        "attention_flags": [],
        "integrity_logs": [],
        "coding_submissions": [],
        "sentiment_metrics": {},
        "chat_warnings": 0,
        "max_chat_warnings": 2,
        "terminated_due_to_conduct": False,
        "termination_reason": None,
        "status": "ready",
        "evaluation": None,
    }
    
    return {
        "session_id": session_id,
        "candidate_name": resume_summary.get("candidate_name", "Candidate"),
        "resume_summary": resume_summary,
    }


def get_or_create_session(session_id: str) -> dict:
    """Retrieve an existing session or auto-initialize a resilient fallback session."""
    session = sessions.get(session_id)
    if not session:
        session = {
            "session_id": session_id,
            "candidate_name": "Candidate",
            "role": "Software Engineer",
            "target_role": "Software Engineer",
            "resume_text": "",
            "resume_summary": {
                "candidate_name": "Candidate",
                "top_skills": ["Software Engineering", "System Design", "Problem Solving"],
                "summary": "Candidate profile"
            },
            "conversation_history": [],
            "transcript": [],
            "questions_asked": 0,
            "max_questions": MAX_QUESTIONS,
            "attention_flags": [],
            "integrity_logs": [],
            "coding_submissions": [],
            "sentiment_metrics": {},
            "chat_warnings": 0,
            "max_chat_warnings": 2,
            "terminated_due_to_conduct": False,
            "termination_reason": None,
            "status": "ready",
            "evaluation": None,
        }
        sessions[session_id] = session
    return session


@app.post("/api/interview/start")
async def interview_start(req: StartRequest):
    """Start the interview — generate the first question or resume active session."""
    session = get_or_create_session(req.session_id)
    
    # If the session is already active and has questions, resume gracefully on refresh!
    if session["status"] == "active" and session["conversation_history"]:
        last_q = next((m.get("content") or m.get("text") for m in reversed(session["conversation_history"]) if m.get("role") == "interviewer"), None)
        return {
            "question": last_q or "Welcome back! Let's continue our conversation.",
            "question_number": session["questions_asked"],
            "total_questions": session["max_questions"],
            "is_final": session["questions_asked"] >= session["max_questions"],
            "resumed": True,
            "history": session["conversation_history"],
        }
    
    # If the session was already completed, reset it so candidate can re-take interview
    if session["status"] == "completed":
        session["conversation_history"] = []
        session["transcript"] = []
        session["questions_asked"] = 0
        session["attention_flags"] = []
        session["integrity_logs"] = []
        session["evaluation"] = None
    
    session["status"] = "active"
    session["questions_asked"] = 1
    
    question = generate_question(
        role=session["role"],
        resume_summary=session["resume_summary"],
        conversation_history=[],
        question_number=1,
        max_questions=session["max_questions"],
    )
    
    entry = {"role": "interviewer", "content": question, "text": question, "timestamp": datetime.now().isoformat()}
    session["conversation_history"].append(entry)
    session["transcript"].append(entry)
    
    return {
        "question": question,
        "question_number": 1,
        "total_questions": session["max_questions"],
        "is_final": False,
        "resumed": False,
    }


@app.post("/api/interview/respond")
async def interview_respond(req: RespondRequest):
    """Receive candidate's answer and generate the next adaptive question or conclude."""
    session = get_or_create_session(req.session_id)
    
    # Check if session was already terminated due to conduct violations
    if session.get("status") == "terminated" or session.get("terminated_due_to_conduct"):
        return {
            "question": "This interview has been terminated due to conduct violations. Please review your evaluation report.",
            "question_number": session["questions_asked"],
            "total_questions": session["max_questions"],
            "is_final": True,
            "concluded": True,
            "terminated": True,
            "is_warning": True,
            "warning_number": session.get("chat_warnings", 2),
            "max_warnings": 2,
            "warning_message": "Interview terminated due to conduct violations."
        }
    
    # Always ensure session is active
    session["status"] = "active"
    
    # Retrieve the last interviewer question asked
    last_interviewer_q = next(
        (m.get("content") or m.get("text") for m in reversed(session["conversation_history"]) if m.get("role") == "interviewer"),
        "Could you walk me through your technical experience?"
    )
    
    # ── CHECK FOR INTENTIONAL NON-SERIOUS CHAT CONTENT ──
    chat_check = check_chat_seriousness(
        answer=req.answer,
        last_question=last_interviewer_q,
        role=session["role"]
    )
    
    if not chat_check.get("is_serious", True):
        # Intentional non-serious content detected in chat!
        session["chat_warnings"] = session.get("chat_warnings", 0) + 1
        w_num = session["chat_warnings"]
        
        # Append candidate's answer to history
        cand_entry = {
            "role": "candidate", 
            "content": req.answer, 
            "text": req.answer, 
            "timestamp": datetime.now().isoformat(),
            "flagged_non_serious": True,
            "warning_number": w_num
        }
        session["conversation_history"].append(cand_entry)
        session["transcript"].append(cand_entry)
        
        if w_num == 1:
            # ━━ 1ST WARNING: Give clear warning and prompt candidate to answer seriously ━━
            warning_log = {
                "type": "conduct_warning",
                "warning_number": 1,
                "description": f"Warning 1/2: Non-serious / troll response: '{req.answer[:80]}'",
                "reason": chat_check.get("reason", "Non-serious content"),
                "timestamp": datetime.now().isoformat()
            }
            session["attention_flags"].append(warning_log)
            session["integrity_logs"].append({
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "reason": f"Conduct Warning 1/2: Non-serious response ('{req.answer[:60]}')"
            })
            
            warning_msg = format_conduct_warning(
                warning_number=1,
                role=session["role"],
                candidate_answer=req.answer,
                last_question=last_interviewer_q
            )
            
            interviewer_entry = {
                "role": "interviewer",
                "content": warning_msg,
                "text": warning_msg,
                "timestamp": datetime.now().isoformat(),
                "is_conduct_warning": True,
                "warning_number": 1
            }
            session["conversation_history"].append(interviewer_entry)
            session["transcript"].append(interviewer_entry)
            
            return {
                "question": warning_msg,
                "question_number": session["questions_asked"],
                "total_questions": session["max_questions"],
                "is_final": False,
                "concluded": False,
                "terminated": False,
                "is_warning": True,
                "warning_number": 1,
                "max_warnings": 2,
                "warning_message": "Warning 1/2: Non-serious response detected. 1 warning remaining before interview termination."
            }
            
        else:
            # ━━ 2ND WARNING: TERMINATE THE CHAT IMMEDIATELY ━━
            session["status"] = "terminated"
            session["terminated_due_to_conduct"] = True
            session["termination_reason"] = "Repeated non-serious conduct during interview (2 warnings reached)."
            
            term_log = {
                "type": "conduct_termination",
                "warning_number": 2,
                "description": f"Warning 2/2: Interview terminated. Candidate gave 2nd non-serious response: '{req.answer[:80]}'",
                "reason": chat_check.get("reason", "2nd non-serious response"),
                "timestamp": datetime.now().isoformat()
            }
            session["attention_flags"].append(term_log)
            session["integrity_logs"].append({
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "reason": "Conduct Warning 2/2: Interview Terminated due to repeated non-serious conduct"
            })
            
            term_msg = format_conduct_warning(
                warning_number=2,
                role=session["role"],
                candidate_answer=req.answer,
                last_question=last_interviewer_q
            )
            
            interviewer_entry = {
                "role": "interviewer",
                "content": term_msg,
                "text": term_msg,
                "timestamp": datetime.now().isoformat(),
                "is_conduct_termination": True,
                "warning_number": 2
            }
            session["conversation_history"].append(interviewer_entry)
            session["transcript"].append(interviewer_entry)
            
            candidate_answers = [m for m in session["conversation_history"] if m.get("role") == "candidate"]
            evaluation = {
                "overall_score": 1.0,
                "overall_rating": "Terminated — Conduct Policy Violation",
                "role_fit_score": 1,
                "communication_score": 1,
                "technical_score": 1,
                "problem_solving_score": 1,
                "cultural_fit_score": 1,
                "confidence_score": 1,
                "strengths": [
                    "No substantive strengths demonstrated — candidate was dismissed for unprofessional conduct."
                ],
                "areas_for_improvement": [
                    "Professional Decorum: Candidate repeatedly provided non-serious / troll answers during a formal interview.",
                    "Accountability: Failed to heed official conduct warning (1/2), resulting in session termination."
                ],
                "key_observations": [
                    f"Interview was terminated early after candidate accumulated 2 conduct warnings for non-serious responses.",
                    f"Final flagged answer: '{req.answer[:100]}'."
                ],
                "integrity_assessment": {
                    "flags_count": len(session["attention_flags"]),
                    "risk_level": "Failed",
                    "notes": "Candidate was disqualified and terminated due to repeated intentional non-serious responses (2 warnings reached)."
                },
                "sentiment_and_delivery": {
                    "confidence_score": 10,
                    "confidence_level": "Low",
                    "verbal_assertiveness": "Non-serious / flippant delivery",
                    "pace_and_fluency": "Disrupted by conduct violations",
                    "tips": "Take professional interviews seriously and provide authentic technical responses."
                },
                "coaching_plan": {
                    "summary": "Candidate must develop workplace communication decorum before re-interviewing.",
                    "readiness_verdict": "Disqualified / Needs Foundational Upskilling",
                    "action_items": [
                        {
                            "skill_area": "Professional Conduct",
                            "action": "Review professional interview etiquette and standard communication standards.",
                            "recommended_resource": "Professional Workplace Communication Guidelines"
                        }
                    ]
                },
                "recommendation": "Do Not Hire — Disqualified. Candidate displayed intentional non-serious behavior and received two formal conduct warnings, leading to session termination.",
                "suggested_follow_up_topics": ["Candidate ineligible for re-interview at this time."],
                "interview_completeness": f"{len(candidate_answers)}/{session['max_questions']} (Terminated)",
                "is_incomplete": True,
                "is_terminated_conduct": True
            }
            session["evaluation"] = evaluation
            
            return {
                "question": term_msg,
                "question_number": session["questions_asked"],
                "total_questions": session["max_questions"],
                "is_final": True,
                "concluded": True,
                "terminated": True,
                "is_warning": True,
                "warning_number": 2,
                "max_warnings": 2,
                "warning_message": "Interview Terminated: 2nd warning reached for non-serious conduct."
            }
    
    # ── GENUINE SERIOUS RESPONSE: PROCEED NORMALLY ──
    cand_entry = {"role": "candidate", "content": req.answer, "text": req.answer, "timestamp": datetime.now().isoformat()}
    session["conversation_history"].append(cand_entry)
    session["transcript"].append(cand_entry)
    
    # Total candidate answers given in this session
    candidate_answers = [m for m in session["conversation_history"] if m.get("role") == "candidate"]
    num_candidate_answers = len(candidate_answers)
    
    # ── CHECK FOR INTERVIEW CONCLUSION ──
    if num_candidate_answers >= session["max_questions"]:
        session["status"] = "concluded"
        closing_statement = generate_conclusion_statement(
            candidate_name=session["candidate_name"],
            role=session["role"],
            conversation_history=session["conversation_history"]
        )
        interviewer_entry = {
            "role": "interviewer", 
            "content": closing_statement, 
            "text": closing_statement, 
            "timestamp": datetime.now().isoformat()
        }
        session["conversation_history"].append(interviewer_entry)
        session["transcript"].append(interviewer_entry)
        
        return {
            "question": closing_statement,
            "question_number": session["max_questions"],
            "total_questions": session["max_questions"],
            "is_final": True,
            "concluded": True,
            "terminated": False,
            "is_warning": False,
        }
    
    # Otherwise, progress to next question
    session["questions_asked"] = num_candidate_answers + 1
    q_num = session["questions_asked"]
    is_final = q_num >= session["max_questions"]
    
    question = generate_question(
        role=session["role"],
        resume_summary=session["resume_summary"],
        conversation_history=session["conversation_history"],
        question_number=q_num,
        max_questions=session["max_questions"],
    )
    
    # Check if the LLM itself signaled conclusion naturally (between Q10 and Q12)
    is_concluded = False
    if q_num >= 10 and is_conclusion_statement(question):
        is_concluded = True
        session["status"] = "concluded"
    
    interviewer_entry = {"role": "interviewer", "content": question, "text": question, "timestamp": datetime.now().isoformat()}
    session["conversation_history"].append(interviewer_entry)
    session["transcript"].append(interviewer_entry)
    
    return {
        "question": question,
        "question_number": q_num,
        "total_questions": session["max_questions"],
        "is_final": is_final or is_concluded,
        "concluded": is_concluded,
        "terminated": False,
        "is_warning": False,
    }


@app.post("/api/interview/end")
async def interview_end(req: EndRequest):
    """End the interview and generate the evaluation report."""
    session = get_or_create_session(req.session_id)
    
    # If terminated due to conduct warnings, preserve and return the disqualified evaluation
    if session.get("terminated_due_to_conduct") and session.get("evaluation"):
        return {"evaluation": session["evaluation"]}
    
    if session["status"] == "completed" and session["evaluation"]:
        return {"evaluation": session["evaluation"]}
    
    if req.attention_flags:
        session["attention_flags"].extend(req.attention_flags)
    if req.sentiment_metrics:
        session["sentiment_metrics"].update(req.sentiment_metrics)
    if req.coding_submissions:
        session["coding_submissions"].extend(req.coding_submissions)
    
    # Count how many candidate answers exist
    candidate_answers = [m for m in session["conversation_history"] if m.get("role") == "candidate"]
    num_answers = len(candidate_answers)
    
    session["status"] = "completed"
    
    # If interview was too short, generate a low-data evaluation
    if num_answers < MIN_QUESTIONS_FOR_EVALUATION:
        evaluation = {
            "overall_score": max(1, round(num_answers * 1.5, 1)),
            "overall_rating": "Insufficient Interview" if num_answers == 0 else "Incomplete Interview",
            "role_fit_score": 1 if num_answers == 0 else 2,
            "communication_score": 1 if num_answers == 0 else 2,
            "technical_score": 1 if num_answers == 0 else 2,
            "problem_solving_score": 1,
            "cultural_fit_score": 1 if num_answers == 0 else 2,
            "confidence_score": 1 if num_answers == 0 else 2,
            "strengths": [
                "Insufficient data — the interview was ended before enough questions were answered to identify strengths."
            ],
            "areas_for_improvement": [
                f"The candidate answered only {num_answers} out of {session['max_questions']} questions. A full interview is required for meaningful assessment."
            ],
            "key_observations": [
                f"Interview terminated early after {num_answers} candidate response(s). Evaluation cannot be considered reliable."
            ] + (
                ["The candidate did not answer any questions. No assessment is possible."]
                if num_answers == 0 else []
            ),
            "integrity_assessment": {
                "flags_count": len(session["attention_flags"]),
                "risk_level": "High" if num_answers == 0 else "Medium",
                "notes": f"Interview ended prematurely with only {num_answers}/{session['max_questions']} answers. This may indicate disengagement, technical issues, or intentional abandonment."
            },
            "recommendation": f"Cannot recommend — the interview was ended after only {num_answers} response(s) out of {session['max_questions']}. A complete interview is needed before any hiring decision.",
            "suggested_follow_up_topics": ["Complete the full interview before evaluation"],
            "interview_completeness": f"{num_answers}/{session['max_questions']} questions answered",
            "is_incomplete": True
        }
        session["evaluation"] = evaluation
        return {"evaluation": evaluation}
    
    try:
        evaluation = generate_evaluation(
            candidate_name=session["candidate_name"],
            role=session["role"],
            resume_summary=session["resume_summary"],
            conversation_history=session["conversation_history"],
            attention_flags=session["attention_flags"],
            speech_metrics=session.get("sentiment_metrics"),
            coding_submissions=session.get("coding_submissions")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate evaluation: {str(e)}")
    
    session["evaluation"] = evaluation
    return {"evaluation": evaluation}


@app.get("/api/interview/status")
async def interview_status(session_id: str):
    """Get current interview status."""
    session = get_or_create_session(session_id)
    return {
        "session_id": session["session_id"],
        "candidate_name": session["candidate_name"],
        "role": session["role"],
        "status": session["status"],
        "questions_asked": session["questions_asked"],
        "max_questions": session["max_questions"],
        "coding_submissions_count": len(session.get("coding_submissions", [])),
    }


# ---------------------------------------------------------------------
# NOVEL FEATURE: LEETCODE-STYLE LIVE CODING ASSESSMENT ENDPOINTS
# ---------------------------------------------------------------------

@app.post("/api/coding/problem")
async def get_coding_problem(req: CodingProblemRequest):
    """Generate or retrieve a live interview coding challenge tailored to candidate's skills."""
    session = get_or_create_session(req.session_id)
    skills = session.get("resume_summary", {}).get("top_skills", ["Python", "Algorithms"])
    
    problem = generate_coding_problem(role=session.get("role", "Software Engineer"), skills=skills)
    return {"problem": problem}


@app.post("/api/coding/submit")
async def submit_code(req: CodeSubmissionRequest):
    """Evaluate candidate's live code submission with AI judge."""
    session = get_or_create_session(req.session_id)
    
    result = evaluate_code_submission(
        role=session.get("role", "Software Engineer"),
        title=req.problem_title or "Interview Coding Challenge",
        description=req.problem_description or "",
        language=req.language or "python",
        code=req.code
    )
    
    submission_entry = {
        "timestamp": datetime.now().isoformat(),
        "problem_title": req.problem_title,
        "language": req.language,
        "code": req.code,
        "evaluation": result
    }
    
    if "coding_submissions" not in session:
        session["coding_submissions"] = []
    session["coding_submissions"].append(submission_entry)
    
    # Also add a brief mention into the conversation transcript so the interviewer knows they coded!
    status_summary = f"[Candidate submitted code for '{req.problem_title}'. Status: {result.get('status', 'Submitted')}, Score: {result.get('score', 'N/A')}/10, Complexity: {result.get('time_complexity', 'N/A')}]"
    session["conversation_history"].append({
        "role": "candidate",
        "content": status_summary,
        "text": status_summary,
        "timestamp": datetime.now().isoformat()
    })
    
    return {"result": result}


@app.get("/api/coding/session-submissions")
async def get_session_coding_submissions(session_id: str):
    """Retrieve all coding submissions for a session."""
    session = get_or_create_session(session_id)
    return {"submissions": session.get("coding_submissions", [])}


# ---------------------------------------------------------------------
# PREV MAIN.PY / TEAMMATE COMPATIBILITY ENDPOINTS
# ---------------------------------------------------------------------

@app.post("/api/start-interview")
async def start_interview(
    target_role: str = Form(...),
    resume: UploadFile = File(...),
    warning_count: int = Form(0)
):
    """
    1-step interview startup: Parses resume, validates seriousness, creates session, generates 1st question.
    (Prev main.py compatibility endpoint)
    """
    file_bytes = await resume.read()
    resume_text = extract_resume_text(file_bytes, resume.filename)
    
    # ── CHECK FOR INTENTIONAL NON-SERIOUS CONTENT IN RESUME OR ROLE ──
    seriousness = check_upload_seriousness(role=target_role, resume_text=resume_text)
    if not seriousness.get("is_serious", True):
        reason = seriousness.get("reason", "Intentional non-serious content detected.")
        if warning_count >= 1:
            raise HTTPException(
                status_code=400,
                detail={
                    "status": "blocked",
                    "blocked": True,
                    "warning": True,
                    "warning_count": warning_count + 1,
                    "max_warnings": 1,
                    "message": f"Upload blocked: Maximum warning limit reached (1/1). Non-serious content submitted again ({reason}). Please provide an authentic resume and legitimate job role.",
                    "reason": reason,
                    "issues": seriousness.get("issues", [])
                }
            )
        else:
            raise HTTPException(
                status_code=400,
                detail={
                    "status": "warning",
                    "blocked": False,
                    "warning": True,
                    "warning_count": 1,
                    "max_warnings": 1,
                    "message": f"⚠️ Content Warning (1/1): Intentional non-serious content detected. {reason}. Please provide authentic details.",
                    "reason": reason,
                    "issues": seriousness.get("issues", []),
                    "role_is_serious": seriousness.get("role_is_serious", True),
                    "resume_is_serious": seriousness.get("resume_is_serious", True)
                }
            )
    
    session_id = str(uuid.uuid4())
    try:
        resume_summary = summarize_resume(resume_text)
    except Exception:
        resume_summary = {"candidate_name": "Candidate", "technical_skills": [], "experience_level": "Mid", "summary": resume_text[:300]}
    
    opening_question = generate_question(
        role=target_role,
        resume_summary=resume_summary,
        conversation_history=[],
        question_number=1,
        max_questions=MAX_QUESTIONS,
    )

    entry = {"role": "interviewer", "content": opening_question, "text": opening_question, "timestamp": datetime.now().isoformat()}
    
    sessions[session_id] = {
        "session_id": session_id,
        "candidate_name": resume_summary.get("candidate_name", "Candidate"),
        "role": target_role,
        "target_role": target_role,
        "resume_text": resume_text,
        "resume_summary": resume_summary,
        "conversation_history": [entry],
        "transcript": [entry],
        "questions_asked": 1,
        "max_questions": MAX_QUESTIONS,
        "attention_flags": [],
        "integrity_logs": [],
        "chat_warnings": 0,
        "max_chat_warnings": 2,
        "terminated_due_to_conduct": False,
        "termination_reason": None,
        "status": "active",
        "evaluation": None,
    }

    return {
        "session_id": session_id,
        "question": opening_question,
        "parsed_resume_preview": resume_text[:200] + "..."
    }


@app.post("/api/chat")
async def chat_turn(req: ChatRequest):
    """
    Receives spoken/typed answer and returns adaptive follow-up question.
    (Prev main.py compatibility endpoint with conduct warning system)
    """
    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.get("status") == "terminated" or session.get("terminated_due_to_conduct"):
        return {
            "session_id": req.session_id,
            "question": "This interview has been terminated due to repeated conduct violations.",
            "turn_count": len(session["conversation_history"]) // 2,
            "concluded": True,
            "terminated": True,
            "is_final": True,
            "is_warning": True,
            "warning_number": session.get("chat_warnings", 2),
            "max_warnings": 2
        }

    last_interviewer_q = next(
        (m.get("content") or m.get("text") for m in reversed(session["conversation_history"]) if m.get("role") == "interviewer"),
        "Could you tell me about your technical experience?"
    )

    # ── CHECK FOR INTENTIONAL NON-SERIOUS CHAT CONTENT ──
    chat_check = check_chat_seriousness(
        answer=req.candidate_answer,
        last_question=last_interviewer_q,
        role=session["role"]
    )

    if not chat_check.get("is_serious", True):
        session["chat_warnings"] = session.get("chat_warnings", 0) + 1
        w_num = session["chat_warnings"]

        cand_entry = {
            "role": "candidate",
            "content": req.candidate_answer,
            "text": req.candidate_answer,
            "timestamp": datetime.now().isoformat(),
            "flagged_non_serious": True,
            "warning_number": w_num
        }
        session["conversation_history"].append(cand_entry)
        session["transcript"].append(cand_entry)

        if w_num == 1:
            warning_msg = format_conduct_warning(
                warning_number=1,
                role=session["role"],
                candidate_answer=req.candidate_answer,
                last_question=last_interviewer_q
            )
            interviewer_entry = {
                "role": "interviewer",
                "content": warning_msg,
                "text": warning_msg,
                "timestamp": datetime.now().isoformat(),
                "is_conduct_warning": True,
                "warning_number": 1
            }
            session["conversation_history"].append(interviewer_entry)
            session["transcript"].append(interviewer_entry)
            session["attention_flags"].append({
                "type": "conduct_warning",
                "warning_number": 1,
                "description": f"Warning 1/2: Non-serious response: '{req.candidate_answer[:80]}'",
                "timestamp": datetime.now().isoformat()
            })

            return {
                "session_id": req.session_id,
                "question": warning_msg,
                "turn_count": len(session["conversation_history"]) // 2,
                "concluded": False,
                "terminated": False,
                "is_final": False,
                "is_warning": True,
                "warning_number": 1,
                "max_warnings": 2
            }
        else:
            session["status"] = "terminated"
            session["terminated_due_to_conduct"] = True
            session["termination_reason"] = "Repeated non-serious conduct during interview (2 warnings reached)."

            term_msg = format_conduct_warning(
                warning_number=2,
                role=session["role"],
                candidate_answer=req.candidate_answer,
                last_question=last_interviewer_q
            )
            interviewer_entry = {
                "role": "interviewer",
                "content": term_msg,
                "text": term_msg,
                "timestamp": datetime.now().isoformat(),
                "is_conduct_termination": True,
                "warning_number": 2
            }
            session["conversation_history"].append(interviewer_entry)
            session["transcript"].append(interviewer_entry)
            session["attention_flags"].append({
                "type": "conduct_termination",
                "warning_number": 2,
                "description": f"Warning 2/2: Terminated. 2nd non-serious response: '{req.candidate_answer[:80]}'",
                "timestamp": datetime.now().isoformat()
            })

            return {
                "session_id": req.session_id,
                "question": term_msg,
                "turn_count": len(session["conversation_history"]) // 2,
                "concluded": True,
                "terminated": True,
                "is_final": True,
                "is_warning": True,
                "warning_number": 2,
                "max_warnings": 2
            }

    # Genuine response
    cand_entry = {"role": "candidate", "content": req.candidate_answer, "text": req.candidate_answer, "timestamp": datetime.now().isoformat()}
    session["conversation_history"].append(cand_entry)
    session["transcript"].append(cand_entry)

    candidate_answers = [m for m in session["conversation_history"] if m.get("role") == "candidate"]
    num_candidate_answers = len(candidate_answers)

    if num_candidate_answers >= session["max_questions"]:
        session["status"] = "concluded"
        closing = generate_conclusion_statement(
            candidate_name=session["candidate_name"],
            role=session["role"],
            conversation_history=session["conversation_history"]
        )
        interviewer_entry = {"role": "interviewer", "content": closing, "text": closing, "timestamp": datetime.now().isoformat()}
        session["conversation_history"].append(interviewer_entry)
        session["transcript"].append(interviewer_entry)
        return {
            "session_id": req.session_id,
            "question": closing,
            "turn_count": len(session["conversation_history"]) // 2,
            "concluded": True,
            "terminated": False,
            "is_final": True
        }

    session["questions_asked"] = num_candidate_answers + 1
    q_num = session["questions_asked"]

    next_question = generate_question(
        role=session["role"],
        resume_summary=session["resume_summary"],
        conversation_history=session["conversation_history"],
        question_number=q_num,
        max_questions=session["max_questions"],
    )

    is_concluded = False
    if q_num >= 10 and is_conclusion_statement(next_question):
        is_concluded = True
        session["status"] = "concluded"

    interviewer_entry = {"role": "interviewer", "content": next_question, "text": next_question, "timestamp": datetime.now().isoformat()}
    session["conversation_history"].append(interviewer_entry)
    session["transcript"].append(interviewer_entry)

    return {
        "session_id": req.session_id,
        "question": next_question,
        "turn_count": len(session["conversation_history"]) // 2,
        "concluded": is_concluded,
        "terminated": False,
        "is_final": q_num >= session["max_questions"] or is_concluded
    }


@app.post("/api/proctor")
async def proctor_check(req: ProctorRequest):
    """
    Receives webcam frames or browser events and logs suspicious behavior.
    (Prev main.py compatibility endpoint)
    """
    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    flagged = False
    reason = "Normal"

    if req.browser_event:
        flagged = True
        reason = req.browser_event
    elif req.frame_base64:
        proctor_result = analyze_frame_for_integrity(req.frame_base64)
        if proctor_result.get("is_looking_away"):
            flagged = True
            reason = proctor_result.get("reason", "Candidate looking away from screen")

    if flagged:
        log_entry = {
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "reason": reason
        }
        session["integrity_logs"].append(log_entry)
        session["attention_flags"].append({
            "type": "proctor_violation",
            "description": reason,
            "timestamp": datetime.now().isoformat()
        })

    return {
        "flagged": flagged,
        "reason": reason,
        "total_flags": len(session["integrity_logs"])
    }


@app.get("/api/evaluate/{session_id}")
async def evaluate_interview(session_id: str):
    """
    Returns comprehensive evaluation report.
    (Prev main.py compatibility endpoint)
    """
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.get("terminated_due_to_conduct") and session.get("evaluation"):
        flag_count = len(session["integrity_logs"]) + len(session["attention_flags"])
        return {
            "session_id": session_id,
            "target_role": session.get("target_role", session.get("role")),
            "evaluation": session["evaluation"],
            "integrity_report": {
                "status": "Failed / Terminated for Conduct Violation",
                "total_flags": flag_count,
                "logs": session["integrity_logs"]
            },
            "transcript": session["transcript"]
        }

    if not session.get("evaluation"):
        try:
            session["evaluation"] = generate_evaluation(
                candidate_name=session["candidate_name"],
                role=session["role"],
                resume_summary=session["resume_summary"],
                conversation_history=session["conversation_history"],
                attention_flags=session["attention_flags"],
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate evaluation: {str(e)}")

    flag_count = len(session["integrity_logs"]) + len(session["attention_flags"])
    integrity_status = "High Trust" if flag_count <= 2 else ("Moderate Risk" if flag_count <= 5 else "Low Trust / Flagged")

    return {
        "session_id": session_id,
        "target_role": session.get("target_role", session.get("role")),
        "evaluation": session["evaluation"],
        "integrity_report": {
            "status": integrity_status,
            "total_flags": flag_count,
            "logs": session["integrity_logs"]
        },
        "transcript": session["transcript"]
    }


# ── Serve frontend static files ─────────────────────────────────────────────
import os
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if not os.path.exists(frontend_dir):
    frontend_dir = "frontend"
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)

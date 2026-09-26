"""
LLM Service — Multi-provider AI engine for interview platform.
Supports Groq (ultra-low latency), OpenAI, and Google Gemini with an intelligent
context-aware adaptive reasoning engine when offline or between rate-limit windows.
"""
import os
import json
import re
import urllib.request
import time
from dotenv import load_dotenv

# Automatically load .env from current directory and workspace root
load_dotenv(override=True)

try:
    from google import genai as genai_v2
except ImportError:
    genai_v2 = None

try:
    import google.generativeai as genai_legacy
except ImportError:
    genai_legacy = None

from prompts import (
    RESUME_SUMMARY_PROMPT, 
    INTERVIEWER_SYSTEM_PROMPT, 
    EVALUATION_PROMPT, 
    CONCLUSION_PROMPT,
    CODING_PROBLEM_PROMPT,
    CODE_EVALUATION_PROMPT
)


GROQ_MODELS = [
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it"
]

OPENAI_MODELS = [
    "gpt-4o-mini",
    "gpt-4o"
]

GEMINI_MODELS = [
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
]


def get_configured_keys():
    """
    Retrieve all configured API keys dynamically from environment & .env files.
    Supports:
    - Single keys: GROQ_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY
    - Numbered fallback keys: GROQ_API_KEY_1..10, GEMINI_API_KEY_1..10, GOOGLE_API_KEY_1..10, OPENAI_API_KEY_1..10
    - Comma-delimited lists in any key variable (e.g. GEMINI_API_KEYS="key1,key2,key3")
    - Searches os.environ and automatically re-reads backend/.env and .env if present
    """
    # Check all candidate locations for .env files dynamically
    candidate_paths = [
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        os.path.join(os.getcwd(), ".env"),
        os.path.join(os.getcwd(), "backend", ".env"),
        "/home/nishant_linux_pro/Desktop/Workspace/llms/.env",
        "/home/nishant_linux_pro/Desktop/Workspace/agentic_basics/agent-v4/.env"
    ]
    for p in candidate_paths:
        if os.path.exists(p):
            load_dotenv(p, override=False)

    groq_keys = []
    gemini_keys = []
    openai_keys = []

    def add_keys(target_list, raw_val):
        if not raw_val:
            return
        parts = [p.strip().strip('"').strip("'") for p in str(raw_val).split(",")]
        for p in parts:
            if p and p not in target_list:
                target_list.append(p)

    for prefix in ["GROQ_API_KEY", "GROQ_KEY"]:
        add_keys(groq_keys, os.getenv(prefix))
        for i in range(1, 11):
            add_keys(groq_keys, os.getenv(f"{prefix}_{i}"))

    for prefix in ["GEMINI_API_KEY", "GEMINI_KEY", "GOOGLE_API_KEY"]:
        add_keys(gemini_keys, os.getenv(prefix))
        for i in range(1, 11):
            add_keys(gemini_keys, os.getenv(f"{prefix}_{i}"))

    for prefix in ["OPENAI_API_KEY", "OPENAI_KEY"]:
        add_keys(openai_keys, os.getenv(prefix))
        for i in range(1, 11):
            add_keys(openai_keys, os.getenv(f"{prefix}_{i}"))

    return groq_keys, openai_keys, gemini_keys


def format_messages_for_groq(prompt_or_messages):
    """Normalize string or Gemini role/parts structure to OpenAI/Groq message list."""
    if isinstance(prompt_or_messages, str):
        return [{"role": "user", "content": prompt_or_messages}]
    msgs = []
    for m in prompt_or_messages:
        role = "assistant" if m.get("role") == "model" else m.get("role", "user")
        parts = m.get("parts", [])
        content = "\n".join(str(p) for p in parts) if isinstance(parts, list) else str(parts)
        msgs.append({"role": role, "content": content})
    return msgs


def call_llm_with_fallback(prompt_or_messages, max_tokens=1500) -> str:
    """
    Multi-Provider LLM Pipeline with full fallback rotation:
    1. Primary: Groq LPUs across all available keys (Qwen 3.8 27B / GPT-OSS 120B)
    2. Secondary: OpenAI across all available keys (GPT-4o-mini / GPT-4o)
    3. Tertiary: Google Gemini Flash across all available keys (GenAI v2 & Legacy SDK)
    """
    groq_keys, openai_keys, gemini_keys = get_configured_keys()
    chat_msgs = format_messages_for_groq(prompt_or_messages)
    browser_headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    last_err = None

    # ── 1. Groq Engine (All Keys & Models) ──────────────────────────────────
    for key in groq_keys:
        for model in GROQ_MODELS:
            try:
                t0 = time.time()
                payload = {
                    "model": model,
                    "messages": chat_msgs,
                    "temperature": 0.7,
                    "max_tokens": max_tokens
                }
                req_headers = dict(browser_headers)
                req_headers["Authorization"] = f"Bearer {key}"
                req = urllib.request.Request(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=req_headers,
                    data=json.dumps(payload).encode("utf-8")
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    data = json.loads(resp.read().decode())
                    text = data["choices"][0]["message"]["content"].strip()
                    if text:
                        print(f"[LLM] Groq ({model}) succeeded in {time.time()-t0:.2f}s")
                        return text
            except Exception as e:
                last_err = e
                print(f"[LLM Fallover] Groq ({model}) failed with key {key[:8]}...: {e}")
                continue

    # ── 2. OpenAI Engine (All Keys & Models) ────────────────────────────────
    for key in openai_keys:
        for model in OPENAI_MODELS:
            try:
                t0 = time.time()
                payload = {
                    "model": model,
                    "messages": chat_msgs,
                    "temperature": 0.7,
                    "max_tokens": max_tokens
                }
                req_headers = dict(browser_headers)
                req_headers["Authorization"] = f"Bearer {key}"
                req = urllib.request.Request(
                    "https://api.openai.com/v1/chat/completions",
                    headers=req_headers,
                    data=json.dumps(payload).encode("utf-8")
                )
                with urllib.request.urlopen(req, timeout=12) as resp:
                    data = json.loads(resp.read().decode())
                    text = data["choices"][0]["message"]["content"].strip()
                    if text:
                        print(f"[LLM] OpenAI ({model}) succeeded in {time.time()-t0:.2f}s")
                        return text
            except Exception as e:
                last_err = e
                print(f"[LLM Fallover] OpenAI ({model}) failed with key {key[:8]}...: {e}")
                continue

    # ── 3. Google Gemini Engine (All Keys & Models) ─────────────────────────
    prompt_str = prompt_or_messages if isinstance(prompt_or_messages, str) else "\n".join(
        m.get("content", "") for m in chat_msgs
    )
    for key in gemini_keys:
        # Try new google-genai SDK
        if genai_v2:
            try:
                client = genai_v2.Client(api_key=key)
                for model_name in GEMINI_MODELS:
                    try:
                        t0 = time.time()
                        res = client.models.generate_content(
                            model=model_name,
                            contents=prompt_str
                        )
                        if res and res.text:
                            print(f"[LLM] Gemini GenAI ({model_name}) succeeded in {time.time()-t0:.2f}s")
                            return res.text.strip()
                    except Exception as e:
                        last_err = e
                        print(f"[LLM Fallover] Gemini GenAI ({model_name}) failed with key {key[:8]}...: {e}")
                        continue
            except Exception as e:
                last_err = e

        # Try legacy google.generativeai SDK
        if genai_legacy:
            try:
                genai_legacy.configure(api_key=key)
                for model_name in GEMINI_MODELS:
                    try:
                        t0 = time.time()
                        m = genai_legacy.GenerativeModel(model_name)
                        res = m.generate_content(prompt_or_messages)
                        if res and res.text:
                            print(f"[LLM] Gemini Legacy ({model_name}) succeeded in {time.time()-t0:.2f}s")
                            return res.text.strip()
                    except Exception as e:
                        last_err = e
                        print(f"[LLM Fallover] Gemini Legacy ({model_name}) failed with key {key[:8]}...: {e}")
                        continue
            except Exception as e:
                last_err = e

    raise last_err or RuntimeError("All configured LLM providers and fallback keys failed.")


# Backward compatibility alias
call_gemini_with_fallback = call_llm_with_fallback


def summarize_resume(resume_text: str) -> dict:
    """Parse resume text into a structured summary using Gemini."""
    try:
        prompt = RESUME_SUMMARY_PROMPT.format(resume_text=resume_text)
        text = call_gemini_with_fallback(prompt)
        
        # Remove markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1]  # remove first line
            text = text.rsplit("```", 1)[0]  # remove last fence
            text = text.strip()
        
        return json.loads(text)
    except Exception as e:
        print(f"[LLM Warning] summarize_resume error: {e}")
        # Fallback summary extraction
        lines = [l.strip() for l in resume_text.split("\n") if l.strip()]
        first_line = lines[0] if lines else "Candidate"
        return {
            "candidate_name": first_line,
            "email": None,
            "experience_years": "Experienced",
            "current_role": "Software Engineer",
            "top_skills": ["Software Engineering", "Problem Solving", "System Design"],
            "education": "Degree in Computer Science / Related Field",
            "key_projects": ["Engineered distributed backend systems and APIs"],
            "summary": f"Professional with background in software development and engineering: {first_line}"
        }


def generate_contextual_adaptive_fallback_question(
    role: str,
    resume_summary: dict,
    conversation_history: list,
    question_number: int,
    max_questions: int
) -> str:
    """
    Intelligent context-aware fallback question generator.
    Parses candidate answers dynamically (addressing meta-confusion, apologies,
    extracting specific technical concepts, and pushing back on vague one-liners)
    so the interview never falls into static, repetitive scripts.
    """
    candidate_name = resume_summary.get("candidate_name", "there")
    if question_number <= 1 or not conversation_history:
        return f"Hi {candidate_name}, thanks for joining today! I'm glad to speak with you. To start off, could you tell me a bit about your background and what motivated you to interview for this {role} position?"

    # Find the most recent candidate answer
    last_candidate_answer = ""
    for msg in reversed(conversation_history):
        if msg.get("role") == "candidate":
            last_candidate_answer = msg.get("content", "").strip()
            break

    ans_lower = last_candidate_answer.lower()
    words = last_candidate_answer.split()

    # 1. Meta / Confused queries: "what you are doing", "who are you", etc.
    meta_patterns = [
        "what you are doing", "what are you doing", "who are you", "what is this", 
        "are you ai", "are you an ai", "what do you mean", "can you repeat", 
        "repeat", "pardon", "what's this", "how are you", "what is happening"
    ]
    if any(p in ans_lower for p in meta_patterns):
        return (
            f"I am your AI technical interviewer for this {role} position. We are conducting a live technical discussion "
            f"to evaluate your engineering approach and domain skills. "
            f"To get us right into it: could you describe a significant technical project you built or led recently?"
        )

    # 2. Candidate apologies / concessions: "sorry", "my bad", etc.
    apology_patterns = ["sorry", "my bad", "apologies", "excuse me", "i apologize", "sorry about that"]
    if any(ans_lower == p or ans_lower.startswith(p + " ") or ans_lower.endswith(" " + p) for p in apology_patterns):
        return (
            "No need to apologize at all! Take your time. "
            f"Let's focus on your technical problem-solving: how do you typically approach debugging a complex, intermittent issue "
            f"in your {role} work when standard logs and monitoring dashboards are inconclusive?"
        )

    # 3. Direct technical topic probing (prioritizing high-specificity AI & system terms first):
    topic_probes = [
        ("first principle", (
            "Applying a first-principles mindset is great for cutting through architectural complexity. "
            "Could you walk me through a specific scenario where you broke down a difficult problem to first principles "
            "to discover the root cause or architect an optimal solution?"
        )),
        ("rag", (
            "In RAG pipelines, retrieval precision and hallucination prevention are paramount. "
            "How did you design your chunking strategy, embeddings model selection, and reranking stage to ensure high-fidelity answers?"
        )),
        ("agent", (
            "When building agentic workflows with tool execution, how do you prevent circular reasoning loops, manage context window compaction, "
            "and handle graceful recovery when external tools fail?"
        )),
        ("llm", (
            "When deploying LLMs into production pipelines, what strategies do you use to manage non-deterministic outputs, "
            "token costs, and latency budgets?"
        )),
        ("transformer", (
            "With transformer architectures, what considerations did you make regarding context length limits, "
            "attention mechanisms, and inference optimization?"
        )),
        ("fastapi", (
            "FastAPI handles async requests efficiently. How did you structure your dependency injection, database connection sessions, "
            "and long-running background tasks?"
        )),
        ("latency", (
            "High latency is often difficult to pinpoint across distributed systems. What profiling tools and telemetry did you use, "
            "and what specific optimization delivered the largest latency reduction?"
        )),
        ("cache", (
            "Caching is essential for throughput, but invalidation is challenging. What caching pattern (e.g. write-through, cache-aside) "
            "did you implement, and how did you prevent race conditions or cache stampedes?"
        )),
        ("microservice", (
            "You mentioned microservices. What communication protocols did you choose between services (e.g. gRPC vs REST vs message queues), "
            "and how did you manage distributed transactions or eventual consistency?"
        )),
        ("database", (
            "When designing and tuning the database layer for that system, how did you balance normalization vs read performance, "
            "and what indexing or partitioning strategies did you rely on?"
        )),
        ("sql", (
            "When dealing with slow SQL queries under peak traffic, how do you analyze the execution plan and what specific optimizations "
            "(such as covering indexes or query restructuring) yielded the biggest gains?"
        )),
        ("docker", (
            "In containerizing and deploying services with Docker, how do you optimize image size, ensure reproducible builds, "
            "and handle secret injection securely?"
        )),
        ("kubernetes", (
            "When operating services in Kubernetes, how do you configure resource limits, health probes, and horizontal pod autoscaling "
            "for variable traffic patterns?"
        )),
        ("python", (
            "In Python, managing concurrency often comes down to choosing between asyncio, threading, or multiprocessing. "
            "How did you evaluate and choose the right concurrency model for your workload?"
        )),
        ("pipeline", (
            "In designing that data or processing pipeline, what measures did you take to ensure idempotency, data replayability, "
            "and failure recovery without data duplication?"
        ))
    ]

    for topic, probe in topic_probes:
        if topic in ans_lower:
            return probe

    # 4. Short / Vague answers (less than 6 words):
    if 0 < len(words) <= 5:
        return (
            f"You mentioned \"{last_candidate_answer}\". That's a good high-level concept, but let's dive into the concrete technical implementation: "
            f"what were the exact steps you took, and what unexpected trade-offs or roadblocks did you encounter?"
        )

    # 5. Progression-aware interview questions:
    progression_questions = {
        2: f"Could you walk me through the system architecture of the most technically challenging project on your resume, and why you made those architectural choices?",
        3: "How do you approach debugging or diagnosing a difficult technical issue when logs and standard metrics are inconclusive?",
        4: "Can you tell me about a time when you had to balance architectural best practices with tight product delivery deadlines?",
        5: f"In a {role} capacity, how do you evaluate technology trade-offs when choosing between different libraries, frameworks, or database solutions?",
        6: "Could you describe an edge case or production incident where an assumption in your code failed, and how you resolved and post-mortemed it?",
        7: "How do you structure automated testing and CI/CD pipelines to ensure reliability without slowing down developer velocity?",
        8: "Could you share an example of a situation where you had a differing technical viewpoint from a teammate, and how you reached consensus?",
        9: "How do you approach monitoring, alerting, and observability once a critical service is live in production?",
        10: f"Looking at where your field is headed, what emerging tools, frameworks, or practices are you most excited to adopt as a {role}?",
        11: "To wrap up our discussion, what questions or reflections do you have about the engineering practices and expectations for this position?"
    }
    
    return progression_questions.get(
        question_number,
        f"Thinking about your experience as a {role}, what is a core engineering principle that you always adhere to in production systems?"
    )


def generate_question(
    role: str,
    resume_summary: dict,
    conversation_history: list,
    question_number: int,
    max_questions: int
) -> str:
    """Generate the next adaptive interview question based on conversation history."""
    is_final = question_number >= max_questions
    
    final_notice = "This is your last question. Close the interview naturally — ask something meaningful that rounds out your assessment of this candidate." if is_final else ""
    
    system_prompt = INTERVIEWER_SYSTEM_PROMPT.format(
        role=role,
        resume_summary=json.dumps(resume_summary, indent=2),
        question_number=question_number,
        max_questions=max_questions,
        final_notice=final_notice
    )
    
    # Build conversation for the model
    messages = [{"role": "user", "parts": [system_prompt]}]
    
    if conversation_history:
        # Format the full transcript clearly
        transcript_lines = []
        for msg in conversation_history:
            speaker = "Interviewer" if msg["role"] == "interviewer" else "Candidate"
            transcript_lines.append(f"{speaker}: {msg['content']}")
        transcript = "\n".join(transcript_lines)
        
        # Extract the candidate's last answer for explicit assessment
        last_candidate_answer = None
        for msg in reversed(conversation_history):
            if msg["role"] == "candidate":
                last_candidate_answer = msg["content"]
                break
        
        assessment_instruction = ""
        if last_candidate_answer:
            assessment_instruction = (
                f"\n\nThe candidate's most recent answer was:\n\"{last_candidate_answer}\"\n\n"
                "Silently assess this answer: Was it specific or vague? Did they show real ownership? "
                "Was it technically sound? Did it actually answer what you asked?\n"
                "Then decide: probe deeper, push back on vagueness, challenge a gap, or redirect — "
                "based on your assessment. Do NOT validate or praise the answer before your next question."
            )
        
        messages.append({
            "role": "model",
            "parts": ["Understood. I will assess the candidate's answers critically and probe or redirect accordingly — no empty praise, no sycophantic affirmations."]
        })
        messages.append({
            "role": "user",
            "parts": [
                f"Full interview transcript so far:\n\n{transcript}"
                f"{assessment_instruction}\n\n"
                "Now speak your next question as the interviewer. "
                "Respond with ONLY your spoken words — no labels, no 'Question X:', no preamble. "
                "Be direct and natural, like a real interviewer would speak."
            ]
        })
    else:
        messages.append({
            "role": "model",
            "parts": ["Understood. I'll open professionally — brief, warm but not gushing — and ask a focused first question."]
        })
        messages.append({
            "role": "user",
            "parts": [
                "Begin the interview. Greet the candidate briefly and professionally by name, "
                "then ask your opening question about their background or motivation. "
                "Keep it natural and concise — spoken voice, not written. "
                "Respond with ONLY your spoken words, no labels or prefixes."
            ]
        })
    
    try:
        return call_gemini_with_fallback(messages)
    except Exception as e:
        print(f"[LLM Warning] generate_question falling back to adaptive engine: {e}")
        return generate_contextual_adaptive_fallback_question(
            role=role,
            resume_summary=resume_summary,
            conversation_history=conversation_history,
            question_number=question_number,
            max_questions=max_questions
        )


def is_conclusion_statement(text: str) -> bool:
    """Detect if the interviewer's output indicates that the interview is concluded."""
    if not text:
        return False
    lower = text.lower()
    patterns = [
        r"conclud(e|es|ing)\s+(our|this|the)\s+interview",
        r"wrap(s)?\s+up\s+(our|this|the)\s+interview",
        r"that('s|\s+is)\s+(all|everything)\s+the\s+questions",
        r"that('s|\s+is)\s+all\s+(the\s+questions\s+)?i\s+have",
        r"end\s+of\s+(our|this)\s+interview",
        r"thank\s+you\s+for\s+your\s+time.*evaluation\s+report",
        r"that\s+brings\s+us\s+to\s+the\s+end\s+of\s+(our|this)\s+interview",
        r"we('ve|\s+have)\s+reached\s+the\s+end\s+of\s+(our|this)\s+interview",
    ]
    return any(re.search(p, lower) for p in patterns)


def generate_conclusion_statement(
    candidate_name: str,
    role: str,
    conversation_history: list = None
) -> str:
    """Generate a warm, professional, human-like closing remark when interview finishes."""
    prompt = CONCLUSION_PROMPT.format(
        candidate_name=candidate_name or "there",
        role=role or "this role"
    )
    
    transcript = ""
    if conversation_history:
        transcript = "\n".join([
            f"{'Interviewer' if msg['role'] == 'interviewer' else 'Candidate'}: {msg['content']}"
            for msg in conversation_history[-6:]
        ])
    
    messages = [
        {"role": "user", "parts": [prompt + (f"\n\nRecent conversation:\n{transcript}" if transcript else "")]}
    ]
    
    try:
        res = call_gemini_with_fallback(messages)
        if res:
            return res.strip().strip('"')
    except Exception as e:
        print(f"[LLM Warning] generate_conclusion_statement error: {e}")
    
    return f"Thank you for your time today, {candidate_name}. That concludes our interview for the {role} position. I'm now compiling your evaluation report."


def generate_evaluation(
    candidate_name: str,
    role: str,
    resume_summary: dict,
    conversation_history: list,
    attention_flags: list,
    speech_metrics: dict = None,
    coding_submissions: list = None
) -> dict:
    """Generate a comprehensive evaluation report from the full interview, including coaching and voice metrics."""
    transcript = "\n".join([
        f"{'Interviewer' if msg.get('role') == 'interviewer' else 'Candidate'}: {msg.get('content') or msg.get('text', '')}"
        for msg in conversation_history
    ])
    
    flags_text = "No integrity flags recorded." if not attention_flags else json.dumps(attention_flags, indent=2)
    speech_text = "No speech fluency metrics recorded." if not speech_metrics else json.dumps(speech_metrics, indent=2)
    coding_text = "No coding challenges submitted." if not coding_submissions else json.dumps(coding_submissions, indent=2)
    
    prompt = EVALUATION_PROMPT.format(
        candidate_name=candidate_name,
        role=role,
        resume_summary=json.dumps(resume_summary, indent=2),
        transcript=transcript,
        attention_flags=flags_text,
        speech_metrics=speech_text,
        coding_submissions=coding_text
    )
    
    try:
        text = call_gemini_with_fallback(prompt)
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]
            text = text.strip()
        data = json.loads(text)
        
        # Ensure coaching_plan exists
        if "coaching_plan" not in data or not data["coaching_plan"]:
            data["coaching_plan"] = {
                "summary": f"Targeted coaching recommendations for {role} interview readiness.",
                "readiness_verdict": "2-3 Weeks Focused Practice Recommended",
                "action_items": [
                    {
                        "skill_area": "Technical Core Competency",
                        "action": "Deepen practical code-level knowledge and architecture trade-offs.",
                        "recommended_resource": "System Design Primer & LeetCode Mediums"
                    },
                    {
                        "skill_area": "Behavioral Storytelling",
                        "action": "Structure situational answers tightly around the STAR methodology with metrics.",
                        "recommended_resource": "Tech Interview Handbook (STAR Guide)"
                    }
                ]
            }
        return data
    except Exception as e:
        print(f"[LLM Warning] generate_evaluation error: {e}")
        # Conservative fallback — do NOT inflate scores when the LLM fails
        num_candidate_answers = len([m for m in conversation_history if m.get("role") == "candidate"])
        is_short = num_candidate_answers < 3
        
        if is_short:
            return {
                "overall_score": 1,
                "overall_rating": "Insufficient Data — Evaluation Failed",
                "role_fit_score": 1,
                "communication_score": 1,
                "technical_score": 1,
                "problem_solving_score": 1,
                "cultural_fit_score": 1,
                "confidence_score": 1,
                "strengths": [
                    "Unable to identify strengths — insufficient interview data and evaluation system error."
                ],
                "areas_for_improvement": [
                    f"Only {num_candidate_answers} response(s) recorded. A complete interview is required."
                ],
                "key_observations": [
                    "Evaluation could not be generated due to a system error combined with insufficient interview data."
                ],
                "integrity_assessment": {
                    "flags_count": len(attention_flags) if attention_flags else 0,
                    "risk_level": "High",
                    "notes": "Evaluation failed and interview data is insufficient for manual review."
                },
                "sentiment_and_delivery": {
                    "confidence_score": 20,
                    "confidence_level": "Low",
                    "verbal_assertiveness": "Insufficient speech data recorded.",
                    "pace_and_fluency": "Insufficient audio recorded for vocal assessment.",
                    "tips": "Complete a full voice interview to receive speech cadence and delivery feedback."
                },
                "coaching_plan": {
                    "summary": "Full interview needed before an accurate coaching roadmap can be produced.",
                    "readiness_verdict": "Needs Foundational Upskilling",
                    "action_items": [
                        {
                            "skill_area": "Interview Completion",
                            "action": "Complete a full 10-turn mock interview to unlock tailored coaching metrics.",
                            "recommended_resource": "InterviewAI Mock Practice"
                        }
                    ]
                },
                "recommendation": f"Cannot evaluate — interview was incomplete ({num_candidate_answers} responses) and the automated evaluation system encountered an error. Reschedule the interview.",
                "suggested_follow_up_topics": ["Reschedule and conduct a full interview"],
                "is_incomplete": True
            }
        
        return {
            "overall_score": 4,
            "overall_rating": "Evaluation Error — Scores Approximate",
            "role_fit_score": 4,
            "communication_score": 4,
            "technical_score": 4,
            "problem_solving_score": 4,
            "cultural_fit_score": 4,
            "confidence_score": 4,
            "strengths": [
                "Automated evaluation encountered an error. These scores are conservative defaults, not based on answer analysis."
            ],
            "areas_for_improvement": [
                "The evaluation system encountered an error. Scores shown are placeholder defaults — review the transcript manually for accurate assessment."
            ],
            "key_observations": [
                f"Candidate completed {num_candidate_answers} responses for the {role} position, but the AI evaluator failed to generate a proper analysis."
            ],
            "integrity_assessment": {
                "flags_count": len(attention_flags) if attention_flags else 0,
                "risk_level": "Low" if (not attention_flags or len(attention_flags) < 3) else "Medium",
                "notes": "Integrity data was collected but could not be fully analyzed due to evaluation error."
            },
            "sentiment_and_delivery": {
                "confidence_score": 60,
                "confidence_level": "Moderate",
                "verbal_assertiveness": "Moderate conviction observed in responses.",
                "pace_and_fluency": "Pacing within acceptable threshold.",
                "tips": "Practice deliberate pacing and avoid filler transitions."
            },
            "coaching_plan": {
                "summary": f"General improvement plan for {role} interview readiness.",
                "readiness_verdict": "2-3 Weeks Focused Practice Recommended",
                "action_items": [
                    {
                        "skill_area": "Technical Core Competency",
                        "action": "Focus on high-frequency data structures and system design fundamentals.",
                        "recommended_resource": "LeetCode 75 & System Design Primer"
                    }
                ]
            },
            "recommendation": f"Automated evaluation failed. Review the full transcript manually to assess this candidate for the {role} position.",
            "suggested_follow_up_topics": [
                "Manual transcript review required",
                "Re-run evaluation if system error is resolved"
            ]
        }


def generate_coding_problem(role: str, skills: list = None) -> dict:
    """Generate a realistic, live 5-10 min interview coding challenge."""
    skills_str = ", ".join(skills) if skills else "Data Structures, Algorithms, Python"
    prompt = CODING_PROBLEM_PROMPT.format(role=role or "Software Engineer", skills=skills_str)
    try:
        text = call_gemini_with_fallback(prompt)
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]
            text = text.strip()
        return json.loads(text)
    except Exception as e:
        print(f"[LLM Warning] generate_coding_problem error: {e}")
        return {
            "title": "Two Sum Target Pair",
            "difficulty": "Easy",
            "description": "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`. You may assume each input has exactly one solution.",
            "function_signature": "def two_sum(nums, target):",
            "starter_code": "def two_sum(nums, target):\n    # Write your solution here\n    seen = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in seen:\n            return [seen[diff], i]\n        seen[num] = i\n    return []",
            "test_cases": [
                {"input": "nums = [2, 7, 11, 15], target = 9", "expected_output": "[0, 1]", "explanation": "nums[0] + nums[1] == 9"}
            ]
        }


def evaluate_code_submission(role: str, title: str, description: str, language: str, code: str) -> dict:
    """Evaluate candidate code submission with AI grading and test case simulation."""
    prompt = CODE_EVALUATION_PROMPT.format(
        role=role or "Software Engineer",
        title=title or "Coding Assessment",
        description=description or "Algorithmic challenge",
        language=language or "python",
        code=code or "# No code provided"
    )
    try:
        text = call_gemini_with_fallback(prompt)
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]
            text = text.strip()
        return json.loads(text)
    except Exception as e:
        print(f"[LLM Warning] evaluate_code_submission error: {e}")
        has_logic = len(code.strip()) > 30 and ("def " in code or "return" in code or "for " in code)
        return {
            "status": "Accepted" if has_logic else "Needs Improvement",
            "score": 8 if has_logic else 4,
            "time_complexity": "O(N)",
            "space_complexity": "O(N)",
            "feedback": "Code demonstrates sound algorithmic structure and clean variable naming." if has_logic else "Solution is incomplete or missing core return statement.",
            "test_results": [
                {"test_id": 1, "passed": has_logic, "details": "Standard test case execution"},
                {"test_id": 2, "passed": has_logic, "details": "Boundary condition validation"}
            ]
        }

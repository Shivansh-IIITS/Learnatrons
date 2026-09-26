# Learnatrons — AI-Powered Adaptive Technical Interviewer

An intelligent, voice-first interview platform that analyzes candidate resumes, conducts real-time adaptive technical interviews with dynamic follow-up questions, monitors candidate attention and integrity via webcam, and generates comprehensive evaluation reports.

---

##  Key Features

-  **Smart Resume Parsing**: Extracts skills, experience, and projects from candidate PDF resumes using `pdfplumber` & Gemini LLM.
-  **Adaptive Voice Interviews**: Conducts natural, voice-driven technical Q&A using Web Speech API (STT/TTS) with dynamic probing based on response depth.
-  **Proctoring & Integrity Monitoring**: Real-time webcam attention tracking and tab-switch detection.
-  **Structured Evaluation Reports**: Instant candidate scorecard detailing overall rating, technical proficiency, communication skills, strengths, and areas of growth.
-  **Dual-API Backend Architecture**: Seamless REST API designed for high-concurrency screening and flexible frontend integration.

---

##  Architecture & Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+), Tailwind CSS
- **Backend**: FastAPI (Python 3.12), Uvicorn
- **AI / LLM Integration**: Google Gemini Flash Model (`gemini-2.5-flash`)
- **PDF Extraction**: `pdfplumber`

---

## Quick Start

### 1. Requirements & Setup
- Python 3.10+
- Environment Variable: `GEMINI_API_KEY`

### 2. Installation
```bash
# Clone repository
git clone https://github.com/Shivansh-IIITS/Learnatrons.git
cd Learnatrons

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

### 3. Running the Server
```bash
# Set your Gemini API key
export GEMINI_API_KEY="your-gemini-api-key"

# Start FastAPI backend
cd backend
python main.py
```
Open your browser and navigate to: **`http://localhost:8000`**

---

## Repository Structure

```
Learnatrons/
├── backend/
│   ├── main.py              # FastAPI app & dual-compatibility routes
│   ├── llm_service.py       # Gemini Flash prompt orchestration
│   ├── prompts.py           # Structured evaluation & questioning prompts
│   ├── resume_parser.py     # PDF text extraction module
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── index.html           # Resume upload page
│   ├── interview.html       # Voice interview workspace
│   ├── report.html          # Interactive evaluation dashboard
│   └── js/                  # STT/TTS & API integration scripts
├── sample_resume.pdf        # Test resume for rapid onboarding
└── README.md
```

---

## License
Licensed under the [MIT License](LICENSE).

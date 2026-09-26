/**
 * upload.js — Resume upload and analysis logic
 */
const API_BASE = window.location.origin;

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('resumeFile');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const uploadSuccess = document.getElementById('uploadSuccess');
const fileNameEl = document.getElementById('fileName');
const roleInput = document.getElementById('roleInput');
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
const btnSpinner = document.getElementById('btnSpinner');
const uploadCard = document.getElementById('uploadCard');
const summaryCard = document.getElementById('summaryCard');
const startInterviewBtn = document.getElementById('startInterviewBtn');

let selectedFile = null;
let sessionId = null;

// ── File selection ──────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.pdf')) {
        handleFileSelect(file);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
    }
});

function handleFileSelect(file) {
    selectedFile = file;
    uploadPlaceholder.classList.add('hidden');
    uploadSuccess.classList.remove('hidden');
    fileNameEl.textContent = file.name;
    checkFormValid();
}

roleInput.addEventListener('input', checkFormValid);

function checkFormValid() {
    submitBtn.disabled = !(selectedFile && roleInput.value.trim());
}

// ── Form submission ─────────────────────────────────────────────────────────
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile || !roleInput.value.trim()) return;

    // Show loading state
    submitBtn.disabled = true;
    btnText.textContent = 'Analyzing Resume...';
    btnSpinner.classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('role', roleInput.value.trim());

    try {
        const res = await fetch(`${API_BASE}/api/upload-resume`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Upload failed');
        }

        const data = await res.json();
        sessionId = data.session_id;

        // Store session data for the interview page
        localStorage.setItem('interviewai_session_id', sessionId);
        localStorage.setItem('interviewai_candidate_name', data.candidate_name);
        localStorage.setItem('interviewai_role', roleInput.value.trim());
        localStorage.setItem('interviewai_resume_summary', JSON.stringify(data.resume_summary));

        // Show summary
        displaySummary(data.resume_summary);
    } catch (err) {
        alert('Error: ' + err.message);
        submitBtn.disabled = false;
        btnText.textContent = 'Upload & Analyze Resume';
        btnSpinner.classList.add('hidden');
    }
});

function displaySummary(summary) {
    document.getElementById('summaryName').textContent = summary.candidate_name || '—';
    document.getElementById('summaryExp').textContent = summary.experience_years || '—';
    document.getElementById('summaryRole').textContent = summary.current_role || '—';
    document.getElementById('summaryEdu').textContent = summary.education || '—';
    document.getElementById('summarySummary').textContent = summary.summary || '—';

    const skillsContainer = document.getElementById('summarySkills');
    skillsContainer.innerHTML = '';
    (summary.top_skills || []).forEach(skill => {
        const tag = document.createElement('span');
        tag.className = 'bg-blue-500/10 text-blue-400 font-medium text-xs px-3 py-1 rounded-full border border-blue-500/20';
        tag.textContent = skill;
        skillsContainer.appendChild(tag);
    });

    // Hide upload card, show summary
    uploadCard.style.display = 'none';
    summaryCard.classList.remove('hidden');

    // Reset button
    btnText.textContent = 'Upload & Analyze Resume';
    btnSpinner.classList.add('hidden');
}

// ── Start Interview ─────────────────────────────────────────────────────────
startInterviewBtn.addEventListener('click', () => {
    window.location.href = 'interview.html';
});

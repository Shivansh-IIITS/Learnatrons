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
const uploadWarningBox = document.getElementById('uploadWarningBox');
const uploadWarningTitle = document.getElementById('uploadWarningTitle');
const uploadWarningBadge = document.getElementById('uploadWarningBadge');
const uploadWarningDesc = document.getElementById('uploadWarningDesc');
const uploadBlockedBox = document.getElementById('uploadBlockedBox');
const uploadBlockedDesc = document.getElementById('uploadBlockedDesc');

let selectedFile = null;
let sessionId = null;
let uploadWarningsReceived = 0;

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
    dropZone.classList.remove('border-rose-500', 'bg-rose-500/5');
    uploadPlaceholder.classList.add('hidden');
    uploadSuccess.classList.remove('hidden');
    fileNameEl.textContent = file.name;
    checkFormValid();
}

roleInput.addEventListener('input', () => {
    roleInput.classList.remove('border-rose-500', 'bg-rose-500/5');
    checkFormValid();
});

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
    formData.append('warning_count', uploadWarningsReceived);

    try {
        const res = await fetch(`${API_BASE}/api/upload-resume`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const detail = err.detail;

            // Handle intentional non-serious content warning / block
            if (detail && typeof detail === 'object' && detail.warning) {
                if (detail.blocked) {
                    // Exceeded allowable warning limit
                    uploadWarningBox.classList.add('hidden');
                    uploadBlockedBox.classList.remove('hidden');
                    uploadBlockedDesc.textContent = detail.message || 'Upload blocked due to repeated non-serious content.';
                    submitBtn.disabled = true;
                    btnText.textContent = 'Upload Blocked';
                    btnSpinner.classList.add('hidden');
                    return;
                } else {
                    // 1st warning issued
                    uploadWarningsReceived = 1;
                    uploadWarningBox.classList.remove('hidden');
                    uploadBlockedBox.classList.add('hidden');
                    uploadWarningTitle.textContent = `⚠️ Content Warning (${detail.warning_count || 1}/${detail.max_warnings || 1})`;
                    uploadWarningBadge.textContent = '1 Warning Issued';
                    uploadWarningDesc.textContent = detail.message || detail.reason || 'Intentional non-serious content detected. Please provide an authentic resume and professional role.';
                    
                    if (detail.role_is_serious === false) {
                        roleInput.classList.add('border-rose-500', 'bg-rose-500/5');
                    }
                    if (detail.resume_is_serious === false) {
                        dropZone.classList.add('border-rose-500', 'bg-rose-500/5');
                    }

                    submitBtn.disabled = false;
                    btnText.textContent = 'Re-upload & Validate (Warning 1/1)';
                    btnSpinner.classList.add('hidden');
                    return;
                }
            }

            const errorMsg = typeof detail === 'string' ? detail : (detail?.message || 'Upload failed. Please try again.');
            throw new Error(errorMsg);
        }

        const data = await res.json();
        sessionId = data.session_id;

        // Hide any previous warnings
        uploadWarningBox.classList.add('hidden');
        uploadBlockedBox.classList.add('hidden');

        // Store session data for the interview page
        localStorage.setItem('interviewai_session_id', sessionId);
        localStorage.setItem('interviewai_candidate_name', data.candidate_name);
        localStorage.setItem('interviewai_role', roleInput.value.trim());
        localStorage.setItem('interviewai_resume_summary', JSON.stringify(data.resume_summary));

        // Show summary
        displaySummary(data.resume_summary);
    } catch (err) {
        alert('Notice: ' + err.message);
        submitBtn.disabled = false;
        btnText.textContent = uploadWarningsReceived >= 1 ? 'Re-upload & Validate' : 'Upload & Analyze Resume';
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
        tag.className = 'liquid-glass-subcard text-[#111114] font-bold text-xs px-3 py-1.5 rounded-full';
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

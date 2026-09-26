/**
 * report.js — Renders the evaluation report from localStorage
 */

// Load data
const rawEval = localStorage.getItem('interviewai_evaluation');
const candidateName = localStorage.getItem('interviewai_candidate_name') || 'Candidate';
const role = localStorage.getItem('interviewai_role') || 'Position';

if (!rawEval) {
    alert('No evaluation data found. Redirecting to home.');
    window.location.href = 'index.html';
}

const evalData = JSON.parse(rawEval);

// ── Incomplete Interview Warning Banner ────────────────────────────────────
if (evalData.is_incomplete || evalData.overall_rating?.includes('Insufficient') || evalData.overall_rating?.includes('Incomplete')) {
    const banner = document.createElement('div');
    banner.className = 'bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 mb-8 fade-in';
    banner.innerHTML = `
        <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <div>
                <h2 class="text-base font-bold text-rose-400 mb-1">Incomplete Interview — Evaluation Unreliable</h2>
                <p class="text-xs text-slate-300 leading-relaxed">
                    ${evalData.interview_completeness 
                        ? `Only <strong class="text-rose-400">${evalData.interview_completeness}</strong> questions were answered.`
                        : 'The interview was ended before enough questions were answered.'
                    }
                    A minimum of 3 substantive responses is required for a meaningful evaluation.
                    Scores shown below are <strong class="text-rose-400">not reliable</strong> and should not be used for hiring decisions.
                </p>
                <a href="index.html" class="inline-flex items-center gap-1.5 mt-3 bg-[#111827] hover:bg-[#1f293d] text-rose-400 text-xs font-semibold px-3 py-1.5 rounded-lg border border-rose-500/40 transition shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                    </svg>
                    <span>Start a New Interview</span>
                </a>
            </div>
        </div>
    `;
    const main = document.querySelector('main');
    main.insertBefore(banner, main.firstChild.nextSibling);
}

// ── Score Color Coding (low scores = red/amber, high = green) ──────────────
function getScoreColor(score) {
    if (score <= 3) return 'text-rose-400';
    if (score <= 5) return 'text-amber-400';
    if (score <= 7) return 'text-blue-400';
    return 'text-emerald-400';
}

function getBarColor(score) {
    if (score <= 3) return 'bg-rose-500';
    if (score <= 5) return 'bg-amber-500';
    if (score <= 7) return 'bg-blue-500';
    return 'bg-emerald-500';
}

// ── Populate Candidate Info ─────────────────────────────────────────────────
document.getElementById('candidateName').textContent = candidateName;
document.getElementById('roleTitle').textContent = `Target Role: ${role}`;

// ── Overall Score & Rating ──────────────────────────────────────────────────
const overallScore = evalData.overall_score || 0;
document.getElementById('overallScore').textContent = overallScore.toFixed(1);
document.getElementById('overallRating').textContent = evalData.overall_rating || '—';

// Color-code the overall rating text based on score
const ratingEl = document.getElementById('overallRating');
if (overallScore <= 3) {
    ratingEl.className = 'text-lg font-bold text-rose-400';
} else if (overallScore <= 5) {
    ratingEl.className = 'text-lg font-bold text-amber-400';
} else {
    ratingEl.className = 'text-lg font-bold text-blue-400';
}

// Score circle gradient percentage — color-coded
const pct = (overallScore / 10) * 100;
const circleEl = document.getElementById('overallScoreCircle');
if (circleEl) {
    circleEl.style.setProperty('--pct', `${pct}%`);
    let circleColor = '#3b82f6';
    if (overallScore <= 3) circleColor = '#f43f5e';
    else if (overallScore <= 5) circleColor = '#f59e0b';
    else if (overallScore >= 8) circleColor = '#10b981';
    circleEl.style.background = `conic-gradient(${circleColor} ${pct}%, #1f293d ${pct}%)`;
}

// ── Dimension Scores ────────────────────────────────────────────────────────
function setScore(scoreId, barId, value) {
    const scoreEl = document.getElementById(scoreId);
    const barEl = document.getElementById(barId);
    if (scoreEl && barEl) {
        scoreEl.textContent = value != null ? value : '—';
        barEl.style.width = `${((value || 0) / 10) * 100}%`;
        // Color code the score text and bar based on value
        scoreEl.className = `text-2xl font-bold ${getScoreColor(value || 0)}`;
        barEl.className = `h-1.5 rounded-full ${getBarColor(value || 0)}`;
    }
}

setScore('roleFitScore', 'roleFitBar', evalData.role_fit_score);
setScore('techScore', 'techBar', evalData.technical_score);
setScore('commScore', 'commBar', evalData.communication_score);
setScore('psScore', 'psBar', evalData.problem_solving_score);
setScore('cultureScore', 'cultureBar', evalData.cultural_fit_score);

// ── Recommendation ──────────────────────────────────────────────────────────
document.getElementById('recommendationText').textContent = evalData.recommendation || '—';

// ── Strengths ───────────────────────────────────────────────────────────────
const strengthsList = document.getElementById('strengthsList');
strengthsList.innerHTML = '';
(evalData.strengths || []).forEach(strength => {
    const li = document.createElement('li');
    li.className = 'flex items-start gap-2 text-xs text-slate-300 leading-relaxed';
    li.innerHTML = `
        <svg class="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
        <span>${strength}</span>
    `;
    strengthsList.appendChild(li);
});

// ── Areas for Improvement ───────────────────────────────────────────────────
const improvementsList = document.getElementById('improvementsList');
improvementsList.innerHTML = '';
(evalData.areas_for_improvement || []).forEach(area => {
    const li = document.createElement('li');
    li.className = 'flex items-start gap-2 text-xs text-slate-300 leading-relaxed';
    li.innerHTML = `
        <svg class="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <span>${area}</span>
    `;
    improvementsList.appendChild(li);
});

// ── Integrity ───────────────────────────────────────────────────────────────
const integrity = evalData.integrity_assessment || {};
const riskEl = document.getElementById('integrityRisk');
const riskLevel = integrity.risk_level || 'Low';

riskEl.textContent = riskLevel;
if (riskLevel === 'Low') {
    riskEl.className = 'font-bold text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
} else if (riskLevel === 'Medium') {
    riskEl.className = 'font-bold text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20';
} else {
    riskEl.className = 'font-bold text-xs px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20';
}

document.getElementById('integrityFlags').textContent = integrity.flags_count || 0;
document.getElementById('integrityNotes').textContent = integrity.notes || 'No issues detected during the session.';

// ── Observations ────────────────────────────────────────────────────────────
const observationsList = document.getElementById('observationsList');
observationsList.innerHTML = '';
(evalData.key_observations || []).forEach(obs => {
    const li = document.createElement('li');
    li.className = 'flex items-start gap-2';
    li.innerHTML = `<span class="text-blue-400 font-bold mt-0.5">•</span><span>${obs}</span>`;
    observationsList.appendChild(li);
});

// ── Follow-up Topics ────────────────────────────────────────────────────────
const followUpContainer = document.getElementById('followUpTopics');
followUpContainer.innerHTML = '';
(evalData.suggested_follow_up_topics || []).forEach(topic => {
    const tag = document.createElement('span');
    tag.className = 'bg-blue-500/10 text-blue-400 font-semibold text-xs px-3 py-1 rounded-full border border-blue-500/20';
    tag.textContent = topic;
    followUpContainer.appendChild(tag);
});

// ── Coaching Plan Rendering ─────────────────────────────────────────────────
const coachingPlan = evalData.coaching_plan || {};
const coachingSummaryEl = document.getElementById('coachingSummary');
const readinessBadgeEl = document.getElementById('readinessBadge');
const coachingItemsList = document.getElementById('coachingItemsList');

if (coachingSummaryEl && coachingPlan.summary) {
    coachingSummaryEl.textContent = coachingPlan.summary;
}
if (readinessBadgeEl && coachingPlan.readiness_verdict) {
    readinessBadgeEl.textContent = coachingPlan.readiness_verdict;
}

if (coachingItemsList) {
    coachingItemsList.innerHTML = '';
    const actionItems = coachingPlan.action_items || [
        {
            skill_area: "High-Frequency System Design",
            action: "Review data flow trade-offs, caching patterns, and database sharding.",
            recommended_resource: "System Design Primer"
        },
        {
            skill_area: "Structured Technical Communication",
            action: "Practice stating constraints and assumptions before jumping into implementation.",
            recommended_resource: "Cracking the Coding Interview"
        }
    ];

    actionItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'bg-[#0d1322] border border-[#1f293d] rounded-xl p-4 flex flex-col justify-between';
        div.innerHTML = `
            <div>
                <span class="text-xs uppercase tracking-wider font-bold text-blue-400">${item.skill_area || 'Focus Area'}</span>
                <p class="text-xs text-slate-300 mt-1 mb-3 leading-relaxed">${item.action || ''}</p>
            </div>
            ${item.recommended_resource ? `
                <div class="pt-2 border-t border-[#1f293d] flex items-center gap-1.5 text-xs text-blue-400">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                    </svg>
                    <span>Resource:</span>
                    <span class="font-semibold">${item.recommended_resource}</span>
                </div>
            ` : ''}
        `;
        coachingItemsList.appendChild(div);
    });
}

// ── Voice Sentiment & Delivery Rendering ────────────────────────────────────
const deliveryData = evalData.sentiment_and_delivery || {};
const deliveryConfEl = document.getElementById('deliveryConfidence');
const deliveryPacingEl = document.getElementById('deliveryPacing');
const deliveryTipsEl = document.getElementById('deliveryTips');

if (deliveryConfEl) {
    const conf = deliveryData.confidence_level || 'Moderate';
    deliveryConfEl.textContent = conf;
    if (conf.toLowerCase().includes('high')) {
        deliveryConfEl.className = 'font-bold text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    } else if (conf.toLowerCase().includes('low')) {
        deliveryConfEl.className = 'font-bold text-xs px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20';
    } else {
        deliveryConfEl.className = 'font-bold text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20';
    }
}

if (deliveryPacingEl) {
    deliveryPacingEl.textContent = deliveryData.pace_and_fluency || 'Even cadence with minimal filler pauses.';
}

if (deliveryTipsEl) {
    deliveryTipsEl.textContent = deliveryData.tips || 'Continue anchoring your examples with explicit metrics to reinforce clarity.';
}

// ── Live Coding Submissions Rendering ───────────────────────────────────────
const codingList = document.getElementById('codingSubmissionsList');
const codingEmptyMsg = document.getElementById('codingEmptyMsg');

let submissions = [];
try {
    const stored = localStorage.getItem('interviewai_coding_submissions');
    if (stored) submissions = JSON.parse(stored);
} catch (e) {}

if (!submissions.length && evalData.coding_submissions) {
    submissions = evalData.coding_submissions;
}

if (submissions && submissions.length > 0 && codingList && codingEmptyMsg) {
    codingEmptyMsg.classList.add('hidden');
    codingList.classList.remove('hidden');
    codingList.innerHTML = '';

    submissions.forEach(sub => {
        const evalRes = sub.evaluation || {};
        const card = document.createElement('div');
        card.className = 'bg-[#0d1322] border border-[#1f293d] rounded-xl p-4';
        card.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <span class="font-bold text-xs text-white">${sub.problem_title || 'Coding Challenge'}</span>
                <span class="text-[10px] px-2 py-0.5 rounded font-mono font-bold ${evalRes.status === 'Accepted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}">
                    ${evalRes.status || 'Evaluated'}
                </span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-2 font-mono">
                <div>Time: <span class="text-white font-bold">${evalRes.time_complexity || 'O(N)'}</span></div>
                <div>Space: <span class="text-white font-bold">${evalRes.space_complexity || 'O(1)'}</span></div>
            </div>
            <p class="text-xs text-slate-300 leading-relaxed">${evalRes.feedback || 'Logic successfully submitted and analyzed.'}</p>
        `;
        codingList.appendChild(card);
    });
}

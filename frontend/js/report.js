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

// ── Conduct Termination & Incomplete Interview Banners ────────────────────
if (evalData.is_terminated_conduct || evalData.overall_rating?.includes('Terminated') || evalData.overall_rating?.includes('Conduct')) {
    const banner = document.createElement('div');
    banner.className = 'bg-rose-500/15 border-2 border-rose-500/40 rounded-2xl p-6 mb-8 fade-in';
    banner.innerHTML = `
        <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-xl bg-rose-500/25 text-rose-800 flex items-center justify-center shrink-0 border border-rose-500/30">
                <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                </svg>
            </div>
            <div>
                <h2 class="text-base font-extrabold text-rose-950 mb-1">Interview Terminated — Conduct Policy Violation</h2>
                <p class="text-xs text-rose-900 leading-relaxed font-medium">
                    This interview was officially terminated before completion because the candidate received <strong class="text-rose-950 font-bold">two conduct warnings</strong> for submitting intentional non-serious, flippant, or troll responses.
                    Candidate is rated <strong class="text-rose-950 font-bold">Disqualified / Do Not Hire</strong>.
                </p>
                <div class="mt-3 flex items-center gap-3">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/25 text-rose-950 text-xs font-bold">
                        Disqualified (2 Warnings Reached)
                    </span>
                    <a href="index.html" class="inline-flex items-center gap-1.5 btn-liquid-black text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                        </svg>
                        <span>Start Fresh Interview</span>
                    </a>
                </div>
            </div>
        </div>
    `;
    const main = document.querySelector('main');
    main.insertBefore(banner, main.firstChild.nextSibling);
} else if (evalData.is_incomplete || evalData.overall_rating?.includes('Insufficient') || evalData.overall_rating?.includes('Incomplete')) {
    const banner = document.createElement('div');
    banner.className = 'bg-rose-500/10 border border-rose-500/25 rounded-2xl p-6 mb-8 fade-in';
    banner.innerHTML = `
        <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-700 flex items-center justify-center shrink-0 border border-rose-500/20">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <div>
                <h2 class="text-base font-bold text-rose-800 mb-1">Incomplete Interview — Evaluation Unreliable</h2>
                <p class="text-xs text-[#555560] leading-relaxed">
                    ${evalData.interview_completeness 
                        ? `Only <strong class="text-rose-700">${evalData.interview_completeness}</strong> questions were answered.`
                        : 'The interview was ended before enough questions were answered.'
                    }
                    A minimum of 3 substantive responses is required for a meaningful evaluation.
                    Scores shown below are <strong class="text-rose-700">not reliable</strong> and should not be used for hiring decisions.
                </p>
                <a href="index.html" class="inline-flex items-center gap-1.5 mt-3 btn-liquid-black text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm">
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
    if (score <= 3) return 'text-rose-600';
    if (score <= 5) return 'text-amber-600';
    if (score <= 7) return 'text-[#111114]';
    return 'text-emerald-700';
}

function getBarColor(score) {
    if (score <= 3) return 'bg-rose-500';
    if (score <= 5) return 'bg-amber-500';
    if (score <= 7) return 'bg-[#111114]';
    return 'bg-emerald-600';
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
    ratingEl.className = 'text-lg font-extrabold text-rose-600';
} else if (overallScore <= 5) {
    ratingEl.className = 'text-lg font-extrabold text-amber-600';
} else {
    ratingEl.className = 'text-lg font-extrabold text-[#111114]';
}

// Score circle gradient percentage — color-coded
const pct = (overallScore / 10) * 100;
const circleEl = document.getElementById('overallScoreCircle');
if (circleEl) {
    circleEl.style.setProperty('--pct', `${pct}%`);
    let circleColor = '#111114';
    if (overallScore <= 3) circleColor = '#e11d48';
    else if (overallScore <= 5) circleColor = '#d97706';
    else if (overallScore >= 8) circleColor = '#059669';
    circleEl.style.background = `conic-gradient(${circleColor} ${pct}%, rgba(0, 0, 0, 0.08) ${pct}%)`;
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
        barEl.className = `h-2 rounded-full ${getBarColor(value || 0)}`;
    }
}

setScore('roleFitScore', 'roleFitBar', evalData.role_fit_score);
setScore('techScore', 'techBar', evalData.technical_score);
setScore('commScore', 'commBar', evalData.communication_score);
setScore('psScore', 'psBar', evalData.problem_solving_score);
setScore('cultureScore', 'cultureBar', evalData.cultural_fit_score);
const derivedConfidence = evalData.confidence_score != null 
    ? evalData.confidence_score 
    : (evalData.sentiment_and_delivery && evalData.sentiment_and_delivery.confidence_score 
        ? Math.round(evalData.sentiment_and_delivery.confidence_score / 10) 
        : 7);
setScore('confidenceScore', 'confidenceBar', derivedConfidence);

// ── Recommendation ──────────────────────────────────────────────────────────
document.getElementById('recommendationText').textContent = evalData.recommendation || '—';

// ── Strengths ───────────────────────────────────────────────────────────────
const strengthsList = document.getElementById('strengthsList');
strengthsList.innerHTML = '';
(evalData.strengths || []).forEach(strength => {
    const li = document.createElement('li');
    li.className = 'flex items-start gap-2.5 text-xs text-[#111114] leading-relaxed font-medium';
    li.innerHTML = `
        <svg class="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
        </svg>
        <span class="text-[#111114] font-medium">${strength}</span>
    `;
    strengthsList.appendChild(li);
});

// ── Areas for Improvement ───────────────────────────────────────────────────
const improvementsList = document.getElementById('improvementsList');
improvementsList.innerHTML = '';
(evalData.areas_for_improvement || []).forEach(area => {
    const li = document.createElement('li');
    li.className = 'flex items-start gap-2.5 text-xs text-[#111114] leading-relaxed font-medium';
    li.innerHTML = `
        <svg class="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <span class="text-[#111114] font-medium">${area}</span>
    `;
    improvementsList.appendChild(li);
});

// ── Integrity ───────────────────────────────────────────────────────────────
const integrity = evalData.integrity_assessment || {};
const riskEl = document.getElementById('integrityRisk');
const riskLevel = integrity.risk_level || 'Low';

riskEl.textContent = riskLevel;
if (riskLevel === 'Low') {
    riskEl.className = 'font-bold text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-500/30';
} else if (riskLevel === 'Medium') {
    riskEl.className = 'font-bold text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-900 border border-amber-500/30';
} else {
    riskEl.className = 'font-bold text-xs px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-900 border border-rose-500/30';
}

document.getElementById('integrityFlags').textContent = integrity.flags_count || 0;
document.getElementById('integrityNotes').textContent = integrity.notes || 'No issues detected during the session.';

// ── Observations ────────────────────────────────────────────────────────────
const observationsList = document.getElementById('observationsList');
observationsList.innerHTML = '';
(evalData.key_observations || []).forEach(obs => {
    const li = document.createElement('li');
    li.className = 'flex items-start gap-2.5 text-xs text-[#111114] leading-relaxed font-medium';
    li.innerHTML = `<span class="text-indigo-600 font-extrabold mt-0.5">•</span><span class="text-[#111114]">${obs}</span>`;
    observationsList.appendChild(li);
});

// ── Follow-up Topics ────────────────────────────────────────────────────────
const followUpContainer = document.getElementById('followUpTopics');
followUpContainer.innerHTML = '';
(evalData.suggested_follow_up_topics || []).forEach(topic => {
    const tag = document.createElement('span');
    tag.className = 'liquid-glass-subcard text-[#111114] font-bold text-xs px-3.5 py-1.5 rounded-full border border-black/10 shadow-sm';
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
        div.className = 'liquid-glass-subcard p-4 rounded-xl flex flex-col justify-between border border-black/10 shadow-sm';
        div.innerHTML = `
            <div>
                <span class="text-xs uppercase tracking-wider font-extrabold text-[#111114]">${item.skill_area || 'Focus Area'}</span>
                <p class="text-xs text-[#33333C] mt-1.5 mb-3 leading-relaxed font-medium">${item.action || ''}</p>
            </div>
            ${item.recommended_resource ? `
                <div class="pt-2.5 border-t border-black/[0.08] flex items-center gap-1.5 text-xs text-[#111114] font-medium">
                    <svg class="w-3.5 h-3.5 text-[#111114]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                    </svg>
                    <span class="text-[#666670]">Resource:</span>
                    <span class="font-extrabold text-[#111114]">${item.recommended_resource}</span>
                </div>
            ` : ''}
        `;
        coachingItemsList.appendChild(div);
    });
}

// ── Multimodal Confidence & Speech Fluency Rendering ────────────────────────
const deliveryData = evalData.sentiment_and_delivery || {};
let storedSentiment = {};
try {
    const rawSent = localStorage.getItem('interviewai_sentiment_metrics');
    if (rawSent) storedSentiment = JSON.parse(rawSent);
} catch (e) {}

const deliveryConfEl = document.getElementById('deliveryConfidence');
const deliveryPacingEl = document.getElementById('deliveryPacing');
const deliveryTipsEl = document.getElementById('deliveryTips');
const multimodalScorePctEl = document.getElementById('multimodalScorePct');
const deliveryAssertivenessTextEl = document.getElementById('deliveryAssertivenessText');
const assertiveScoreValEl = document.getElementById('assertiveScoreVal');
const assertiveScoreBarEl = document.getElementById('assertiveScoreBar');
const visualScoreValEl = document.getElementById('visualScoreVal');
const visualScoreBarEl = document.getElementById('visualScoreBar');
const fluencyScoreValEl = document.getElementById('fluencyScoreVal');
const fluencyScoreBarEl = document.getElementById('fluencyScoreBar');

// Confidence Level & Badge
if (deliveryConfEl) {
    const conf = deliveryData.confidence_level || storedSentiment.confidence_level || 'Moderate';
    deliveryConfEl.textContent = conf;
    if (conf.toLowerCase().includes('high')) {
        deliveryConfEl.className = 'font-extrabold text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200';
    } else if (conf.toLowerCase().includes('low')) {
        deliveryConfEl.className = 'font-extrabold text-xs px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200';
    } else {
        deliveryConfEl.className = 'font-extrabold text-xs px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200';
    }
}

// Multimodal composite score percentage header badge
const confPercent = storedSentiment.confidence_score != null
    ? storedSentiment.confidence_score
    : (deliveryData.confidence_score != null
        ? deliveryData.confidence_score
        : (evalData.confidence_score ? Math.round(evalData.confidence_score * 10) : 84));

if (multimodalScorePctEl) {
    multimodalScorePctEl.textContent = `${confPercent}% Composite`;
}

// Verbal assertiveness description
if (deliveryAssertivenessTextEl && deliveryData.verbal_assertiveness) {
    deliveryAssertivenessTextEl.textContent = deliveryData.verbal_assertiveness;
}

// Telemetry triad bars
const assertiveScore = storedSentiment.verbal_assertiveness_score || 82;
const visualScore = storedSentiment.visual_composure_score || storedSentiment.eye_contact_percentage || 88;
const fluencyScore = storedSentiment.speech_fluency_score || 85;

if (assertiveScoreValEl) assertiveScoreValEl.textContent = `${assertiveScore}%`;
if (assertiveScoreBarEl) assertiveScoreBarEl.style.width = `${assertiveScore}%`;

if (visualScoreValEl) visualScoreValEl.textContent = `${visualScore}%`;
if (visualScoreBarEl) visualScoreBarEl.style.width = `${visualScore}%`;

if (fluencyScoreValEl) fluencyScoreValEl.textContent = `${fluencyScore}%`;
if (fluencyScoreBarEl) fluencyScoreBarEl.style.width = `${fluencyScore}%`;

if (deliveryPacingEl) {
    deliveryPacingEl.textContent = deliveryData.pace_and_fluency || storedSentiment.pace_and_fluency || 'Even cadence with minimal filler pauses.';
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
        card.className = 'liquid-glass-subcard p-4 rounded-xl border border-black/10 shadow-sm';
        card.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <span class="font-extrabold text-xs text-[#111114]">${sub.problem_title || 'Coding Challenge'}</span>
                <span class="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold ${evalRes.status === 'Accepted' ? 'bg-emerald-500/15 text-emerald-800 border border-emerald-500/25' : 'bg-amber-500/15 text-amber-800 border border-amber-500/25'}">
                    ${evalRes.status || 'Evaluated'}
                </span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs text-[#666670] mb-2 font-mono">
                <div>Time: <span class="text-[#111114] font-extrabold">${evalRes.time_complexity || 'O(N)'}</span></div>
                <div>Space: <span class="text-[#111114] font-extrabold">${evalRes.space_complexity || 'O(1)'}</span></div>
            </div>
            <p class="text-xs text-[#33333C] leading-relaxed font-medium">${evalRes.feedback || 'Logic successfully submitted and analyzed.'}</p>
        `;
        codingList.appendChild(card);
    });
}

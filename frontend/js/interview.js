/**
 * interview.js — Core interview loop with voice STT/TTS and MediaPipe integrity monitoring
 */

const API_BASE = window.location.origin;

// ── Dynamic MediaPipe handles (non-blocking background load) ───────────────
let FaceLandmarker = null;
let FilesetResolver = null;
let DrawingUtils = null;

// ── Session data from localStorage ──────────────────────────────────────────
const sessionId = localStorage.getItem('interviewai_session_id');
const candidateName = localStorage.getItem('interviewai_candidate_name') || 'Candidate';
const role = localStorage.getItem('interviewai_role') || 'Software Engineer';

if (!sessionId) {
    alert('No interview session found. Please upload your resume first.');
    window.location.href = 'index.html';
}

// ── DOM Elements ────────────────────────────────────────────────────────────
const headerRole = document.getElementById('headerRole');
const questionCounter = document.getElementById('questionCounter');
const voiceRing = document.getElementById('voiceRing');
const soundBars = document.getElementById('soundBars');
const voiceStatus = document.getElementById('voiceStatus');
const voiceSubtext = document.getElementById('voiceSubtext');
const chatMessages = document.getElementById('chatMessages');
const chatContainer = document.getElementById('chatContainer');
const textAnswer = document.getElementById('textAnswer');
const sendTextBtn = document.getElementById('sendTextBtn');
const micBtn = document.getElementById('micBtn');
const micIconContainer = document.getElementById('micIconContainer');
const micBtnLabel = document.getElementById('micBtnLabel');
const speakerBtn = document.getElementById('speakerBtn');
const speakerIconContainer = document.getElementById('speakerIconContainer');
const inputMicBtn = document.getElementById('inputMicBtn');
const inputMicIcon = document.getElementById('inputMicIcon');
const endInterviewBtn = document.getElementById('endInterviewBtn');
const attentionAlert = document.getElementById('attentionAlert');
const conclusionBanner = document.getElementById('conclusionBanner');
const conclusionCountdown = document.getElementById('conclusionCountdown');
const goToReportBtn = document.getElementById('goToReportBtn');
const webcamVideo = document.getElementById('webcamVideo');
const infoCandidateName = document.getElementById('infoCandidateName');
const infoRole = document.getElementById('infoRole');
const infoDuration = document.getElementById('infoDuration');
const infoFlags = document.getElementById('infoFlags');
const webcamStatus = document.getElementById('webcamStatus');
const tabFocusDot = document.getElementById('tabFocusDot');
const facePresentDot = document.getElementById('facePresentDot');
const gazeDirectDot = document.getElementById('gazeDirectDot');
const eyeOpenDot = document.getElementById('eyeOpenDot');
const singleFaceDot = document.getElementById('singleFaceDot');

// ── State ───────────────────────────────────────────────────────────────────
let isListening = false;
let isSpeaking = false;
let isProcessing = false;
let isMicMuted = false;
let isSpeakerMuted = false;
let interviewActive = false;
let isConcluded = false;
let currentQuestion = 0;
let totalQuestions = 11;
let attentionFlags = [];
let interviewStartTime = Date.now();
let durationInterval = null;
let recognition = null;

// ── Icons (Lucide-style SVGs) ──────────────────────────────────────────────
const MIC_ON_SVG = `<svg class="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;

const MIC_OFF_SVG = `<svg class="w-5 h-5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;

const SPEAKER_ON_SVG = `<svg class="w-5 h-5 text-indigo-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;

const SPEAKER_OFF_SVG = `<svg class="w-5 h-5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`;

// ── Controls UI State Handler ───────────────────────────────────────────────
function updateControlsUI() {
    // 1. Microphone controls
    if (isMicMuted) {
        if (micIconContainer) micIconContainer.innerHTML = MIC_OFF_SVG;
        if (micBtnLabel) micBtnLabel.textContent = 'Unmute';
        if (micBtn) {
            micBtn.className = 'flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-medium text-sm transition-all shadow-sm';
            micBtn.title = 'Microphone is muted — Click to unmute';
        }
        if (inputMicIcon) inputMicIcon.innerHTML = MIC_OFF_SVG;
        if (inputMicBtn) {
            inputMicBtn.className = 'px-3.5 py-3 rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 transition-all flex items-center justify-center shrink-0 shadow-sm';
            inputMicBtn.title = 'Microphone is muted — Click to unmute';
        }
    } else {
        if (micIconContainer) micIconContainer.innerHTML = MIC_ON_SVG;
        if (micBtnLabel) micBtnLabel.textContent = 'Mute';
        if (inputMicIcon) inputMicIcon.innerHTML = MIC_ON_SVG;

        if (isListening) {
            if (micBtn) {
                micBtn.className = 'flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-emerald-500/50 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-medium text-sm transition-all shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse';
                micBtn.title = 'Listening to your voice — Click to mute';
            }
            if (inputMicBtn) {
                inputMicBtn.className = 'px-3.5 py-3 rounded-xl border border-emerald-500/50 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 transition-all flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.3)]';
                inputMicBtn.title = 'Listening to your voice — Click to mute';
            }
        } else {
            if (micBtn) {
                micBtn.className = 'flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/10 hover:bg-white/20 text-gray-200 font-medium text-sm transition-all shadow-sm';
                micBtn.title = 'Microphone active — Click to mute';
            }
            if (inputMicBtn) {
                inputMicBtn.className = 'px-3.5 py-3 rounded-xl border border-white/10 bg-white/10 hover:bg-white/20 text-gray-300 transition-all flex items-center justify-center shrink-0 shadow-sm';
                inputMicBtn.title = 'Click to mute microphone';
            }
        }
    }

    // 2. Speaker controls
    if (speakerBtn && speakerIconContainer) {
        if (isSpeakerMuted) {
            speakerIconContainer.innerHTML = SPEAKER_OFF_SVG;
            speakerBtn.className = 'flex items-center justify-center p-2.5 rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 transition-all shadow-sm';
            speakerBtn.title = 'AI voice audio is muted — Click to unmute speaker';
        } else {
            speakerIconContainer.innerHTML = SPEAKER_ON_SVG;
            speakerBtn.className = 'flex items-center justify-center p-2.5 rounded-xl border border-white/10 bg-white/10 hover:bg-white/20 text-gray-200 transition-all shadow-sm';
            speakerBtn.title = 'Click to mute AI voice audio';
        }
    }
}

function toggleMicMute() {
    isMicMuted = !isMicMuted;
    if (isMicMuted) {
        stopListening();
        setVoiceState('idle');
        textAnswer.placeholder = 'Mic is muted. Type your answer or click Unmute...';
    } else {
        updateControlsUI();
        if (interviewActive && !isSpeaking && !isProcessing) {
            startListening();
        } else {
            textAnswer.placeholder = 'Mic unmuted — ready for next question...';
        }
    }
    updateControlsUI();
}

function toggleSpeakerMute() {
    isSpeakerMuted = !isSpeakerMuted;
    if (isSpeakerMuted && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    updateControlsUI();
}

// ── Initialize ──────────────────────────────────────────────────────────────
headerRole.textContent = `Interview for ${role}`;
infoCandidateName.textContent = candidateName;
infoRole.textContent = role;

// Duration timer
durationInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - interviewStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    infoDuration.textContent = `${mins}:${secs}`;
}, 1000);


// ── Speech Recognition (STT) ───────────────────────────────────────────────
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn('Speech Recognition not supported. Text input only.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        setVoiceState('listening');
        textAnswer.placeholder = 'Listening... speak now';
        updateControlsUI();
    };

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        textAnswer.value = transcript;
        
        if (event.results[event.results.length - 1].isFinal) {
            // Final result — auto-send
            isListening = false;
            setVoiceState('processing');
            updateControlsUI();
            setTimeout(() => submitAnswer(transcript), 300);
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        isListening = false;
        if (event.error !== 'aborted') {
            setVoiceState('idle');
            textAnswer.placeholder = isMicMuted ? 'Mic is muted. Click Unmute or type below...' : 'Type your answer or click mic to speak...';
        }
        updateControlsUI();
    };

    recognition.onend = () => {
        isListening = false;
        if (interviewActive && !isProcessing && !isSpeaking) {
            setVoiceState('idle');
            textAnswer.placeholder = isMicMuted ? 'Mic is muted. Click Unmute or type below...' : 'Type your answer or speak...';
        }
        updateControlsUI();
    };

    updateControlsUI();
}

function startListening() {
    if (isMicMuted) return;
    if (recognition && !isListening && !isSpeaking && !isProcessing) {
        textAnswer.value = '';
        try {
            recognition.start();
        } catch (e) {
            // Already started
        }
    }
}

function stopListening() {
    if (recognition && isListening) {
        try {
            recognition.stop();
        } catch (e) {}
    }
}

// ── Speech Synthesis (TTS) ──────────────────────────────────────────────────
function speakText(text) {
    return new Promise((resolve) => {
        if (isSpeakerMuted || !window.speechSynthesis) {
            // AI audio is muted — visually display speaking state for readability without playing voice
            setVoiceState('speaking');
            setTimeout(() => {
                isSpeaking = false;
                if (interviewActive && !isProcessing) {
                    setTimeout(() => {
                        setVoiceState('idle');
                        if (!isMicMuted) {
                            voiceSubtext.textContent = 'Speak your answer or type below';
                            startListening();
                        } else {
                            voiceSubtext.textContent = 'Mic muted — Click Unmute or type below';
                        }
                    }, 400);
                }
                resolve();
            }, 1200);
            return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to pick a natural-sounding voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => 
            v.name.includes('Google') && v.lang.startsWith('en')
        ) || voices.find(v => v.lang.startsWith('en') && !v.name.includes('Zira'));
        if (preferred) utterance.voice = preferred;

        utterance.onstart = () => {
            isSpeaking = true;
            setVoiceState('speaking');
        };

        utterance.onend = () => {
            isSpeaking = false;
            resolve();
            // Auto-start listening after AI finishes speaking (only if not muted)
            if (interviewActive && !isProcessing) {
                setTimeout(() => {
                    setVoiceState('idle');
                    if (!isMicMuted) {
                        voiceSubtext.textContent = 'Speak your answer or type below';
                        startListening();
                    } else {
                        voiceSubtext.textContent = 'Mic is muted — Click Unmute or type below';
                    }
                }, 500);
            }
        };

        utterance.onerror = () => {
            isSpeaking = false;
            resolve();
        };

        window.speechSynthesis.speak(utterance);
    });
}

// Load voices
if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// ── Voice state UI ──────────────────────────────────────────────────────────
function setVoiceState(state) {
    voiceRing.className = 'voice-ring ' + state;
    soundBars.className = 'sound-bars ' + state;

    switch (state) {
        case 'speaking':
            voiceStatus.textContent = isSpeakerMuted ? 'AI Speaking (Sound Muted)' : 'AI Interviewer Speaking';
            voiceSubtext.textContent = 'Listen to the question...';
            break;
        case 'listening':
            voiceStatus.textContent = 'Listening...';
            voiceSubtext.textContent = 'Speak your answer clearly';
            break;
        case 'processing':
            voiceStatus.textContent = 'Processing...';
            voiceSubtext.textContent = 'Generating next question';
            break;
        case 'idle':
            if (isMicMuted) {
                voiceStatus.textContent = 'Mic Muted';
                voiceSubtext.textContent = 'Click "Unmute" to speak or type your answer';
            } else {
                voiceStatus.textContent = 'Your Turn';
                voiceSubtext.textContent = 'Speak or type your answer';
            }
            break;
    }
    updateControlsUI();
}

// ── Chat Messages ───────────────────────────────────────────────────────────
function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `p-4 rounded-xl fade-in ${role === 'interviewer' ? 'msg-interviewer' : 'msg-candidate'}`;
    
    const label = document.createElement('p');
    label.className = 'text-xs font-bold mb-1 ' + (role === 'interviewer' ? 'text-blue-400' : 'text-emerald-400');
    label.textContent = role === 'interviewer' ? 'AI Interviewer' : candidateName;
    
    const content = document.createElement('p');
    content.className = 'text-slate-200 text-sm leading-relaxed';
    content.textContent = text;
    
    div.appendChild(label);
    div.appendChild(content);
    chatMessages.appendChild(div);
    
    // Auto-scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ── API Calls ───────────────────────────────────────────────────────────────
async function startInterview() {
    setVoiceState('processing');
    voiceSubtext.textContent = 'Starting your interview...';

    try {
        const res = await fetch(`${API_BASE}/api/interview/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId }),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || 'Failed to start interview');
        }
        const data = await res.json();
        
        interviewActive = true;
        currentQuestion = data.question_number || 1;
        totalQuestions = data.total_questions || 11;
        questionCounter.textContent = `${currentQuestion}/${totalQuestions}`;

        // If session was resumed, restore past chat messages
        if (data.resumed && Array.isArray(data.history) && data.history.length > 0) {
            chatMessages.innerHTML = '';
            data.history.forEach(msg => {
                addMessage(msg.role, msg.content || msg.text || '');
            });
            setVoiceState('idle');
            voiceSubtext.textContent = 'Session resumed. Ready for your answer.';
        } else {
            // Show and speak the opening question
            addMessage('interviewer', data.question);
            await speakText(data.question);
        }

    } catch (err) {
        voiceStatus.textContent = 'Error';
        voiceSubtext.textContent = err.message;
    }
}

async function submitAnswer(answer) {
    if (!answer.trim() || isProcessing) return;
    
    isProcessing = true;
    setVoiceState('processing');
    
    // Analyze candidate speech for sentiment, confidence & filler words
    analyzeSpeechChunk(answer);

    // Show the candidate's answer
    addMessage('candidate', answer);
    const prevAnswer = answer;
    textAnswer.value = '';

    try {
        const res = await fetch(`${API_BASE}/api/interview/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, answer: answer }),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || 'Failed to get next question');
        }
        const data = await res.json();

        currentQuestion = data.question_number;
        totalQuestions = data.total_questions || totalQuestions;
        questionCounter.textContent = `${currentQuestion}/${totalQuestions}`;

        // Show the interviewer message (either next question or concluding remarks)
        addMessage('interviewer', data.question);
        isProcessing = false;

        // Auto-detect coding challenge suggestion in question
        checkIfQuestionSuggestsCoding(data.question);

        // ── Check if the interview has concluded ──
        if (data.concluded) {
            await handleInterviewConcluded(data.question);
            return;
        }

        await speakText(data.question);

        // If it's the final question, update manual end button to prominent state
        if (data.is_final) {
            endInterviewBtn.className = 'bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-sm animate-pulse';
            endInterviewBtn.textContent = 'Finish & Get Report';
        }

    } catch (err) {
        isProcessing = false;
        setVoiceState('idle');
        voiceSubtext.textContent = 'Error: ' + err.message + ' (Click mic or type to retry)';
        // Put text back in input so user doesn't lose their thought
        if (!textAnswer.value) {
            textAnswer.value = prevAnswer;
        }
    }
}

// ── Automatic Conclusion & Transition Handler ──────────────────────────────
let countdownInterval = null;

async function handleInterviewConcluded(closingText) {
    if (isConcluded) return;
    isConcluded = true;
    interviewActive = false;

    // 1. Stop active voice listener and disable inputs to prevent typing
    stopListening();
    if (textAnswer) {
        textAnswer.value = '';
        textAnswer.disabled = true;
        textAnswer.placeholder = 'Interview concluded. Preparing your evaluation report...';
    }
    if (sendTextBtn) sendTextBtn.disabled = true;
    if (inputMicBtn) inputMicBtn.disabled = true;
    if (micBtn) micBtn.disabled = true;

    // 2. Reveal in-app conclusion banner
    if (conclusionBanner) {
        conclusionBanner.classList.remove('hidden');
    }

    // 3. Update header button to green "View Report"
    if (endInterviewBtn) {
        endInterviewBtn.className = 'bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-sm animate-pulse';
        endInterviewBtn.textContent = 'View Report Now';
    }

    // 4. Update voice card state
    setVoiceState('idle');
    voiceStatus.textContent = 'Interview Concluded';
    voiceSubtext.textContent = 'Wrapping up your session...';

    // 5. Speak the interviewer's closing remark
    await speakText(closingText);

    // 6. Automatic countdown to evaluation report page (3 seconds)
    let secondsLeft = 3;
    if (conclusionCountdown) {
        conclusionCountdown.innerHTML = `All questions complete! Loading evaluation report in <strong class="text-emerald-300 font-bold">${secondsLeft}s</strong>...`;
    }

    countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
            if (conclusionCountdown) {
                conclusionCountdown.innerHTML = `All questions complete! Loading evaluation report in <strong class="text-emerald-300 font-bold">${secondsLeft}s</strong>...`;
            }
        } else {
            clearInterval(countdownInterval);
            if (conclusionCountdown) {
                conclusionCountdown.textContent = 'Generating comprehensive evaluation...';
            }
            endInterview();
        }
    }, 1000);

    // Manual click on "View Report Now" on the banner jumps straight to report
    if (goToReportBtn) {
        goToReportBtn.onclick = () => {
            clearInterval(countdownInterval);
            endInterview();
        };
    }
}

async function endInterview() {
    interviewActive = false;
    isConcluded = true;
    clearInterval(countdownInterval);
    stopListening();
    window.speechSynthesis?.cancel();
    clearInterval(durationInterval);

    setVoiceState('processing');
    voiceStatus.textContent = 'Generating Evaluation...';
    voiceSubtext.textContent = 'Analyzing your interview performance...';
    endInterviewBtn.disabled = true;
    if (goToReportBtn) goToReportBtn.disabled = true;

    try {
        // Save coding submissions to localStorage for report page
        localStorage.setItem('interviewai_coding_submissions', JSON.stringify(sessionCodingSubmissions));

        const res = await fetch(`${API_BASE}/api/interview/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                attention_flags: attentionFlags,
                sentiment_metrics: getAggregatedSentimentMetrics(),
                coding_submissions: sessionCodingSubmissions
            }),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || 'Failed to generate evaluation');
        }
        const data = await res.json();

        // Store evaluation and navigate to report
        localStorage.setItem('interviewai_evaluation', JSON.stringify(data.evaluation));
        window.location.href = 'report.html';

    } catch (err) {
        voiceStatus.textContent = 'Error';
        voiceSubtext.textContent = err.message;
        endInterviewBtn.disabled = false;
        if (goToReportBtn) goToReportBtn.disabled = false;
    }
}

// ── Manual End Interview Button Handler ────────────────────────────────────
function handleManualEnd() {
    // If the interview is already concluding or ended, proceed directly
    if (isConcluded) {
        endInterview();
        return;
    }

    // Check how many candidate answers have been given
    const candidateMessages = Array.from(chatMessages.querySelectorAll('.msg-candidate'));
    const answeredCount = candidateMessages.length;

    if (answeredCount < 3) {
        const confirmed = confirm(
            `You have answered ${answeredCount} question(s).\n\nA minimum of 3 substantive responses is recommended to generate an accurate evaluation.\n\nDo you still wish to end the interview now?`
        );
        if (!confirmed) return;
    } else {
        const confirmed = confirm(
            `You have answered ${answeredCount} questions.\n\nWould you like to conclude the interview and view your evaluation report now?`
        );
        if (!confirmed) return;
    }

    endInterview();
}

// ── Event Listeners ─────────────────────────────────────────────────────────
micBtn?.addEventListener('click', toggleMicMute);
inputMicBtn?.addEventListener('click', toggleMicMute);
speakerBtn?.addEventListener('click', toggleSpeakerMute);

// Keyboard shortcut: Press 'M' to toggle mic mute when not in input
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm' && document.activeElement !== textAnswer) {
        e.preventDefault();
        toggleMicMute();
    }
});

sendTextBtn.addEventListener('click', () => {
    const answer = textAnswer.value.trim();
    if (answer && !isProcessing && !isConcluded) {
        stopListening();
        setVoiceState('processing');
        submitAnswer(answer);
    }
});

textAnswer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextBtn.click();
    }
});

endInterviewBtn.addEventListener('click', handleManualEnd);
goToReportBtn?.addEventListener('click', () => {
    clearInterval(countdownInterval);
    endInterview();
});


// ── Webcam + Attention Monitoring ───────────────────────────────────────────
let lookAwayStart = null;
const LOOK_AWAY_THRESHOLD_MS = 2000; // 2 seconds before flagging

async function initWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 320, height: 240, facingMode: 'user' },
            audio: false 
        });
        webcamVideo.srcObject = stream;
        
        // Update webcam status
        if (webcamStatus) {
            webcamStatus.textContent = 'Active';
            webcamStatus.className = 'text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 font-medium';
        }
        
        // Start basic attention monitoring (tab focus)
        initTabFocusDetection();
        
        // Start face detection if available
        initFaceDetection();
        
    } catch (err) {
        console.warn('Webcam not available:', err);
        webcamStatus.textContent = 'Unavailable';
        webcamStatus.className = 'text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20';
    }
}

function initTabFocusDetection() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            updateIntegrityDot(tabFocusDot, 'red');
            showWarning('TAB_SWITCH', 'Candidate switched browser tabs or minimized the interview window.');
        } else {
            updateIntegrityDot(tabFocusDot, 'green');
        }
    });

    window.addEventListener('blur', () => {
        updateIntegrityDot(tabFocusDot, 'yellow');
    });

    window.addEventListener('focus', () => {
        updateIntegrityDot(tabFocusDot, 'green');
    });
}

function initFaceDetection() {
    // MediaPipe FaceLandmarker-based detection is initialized via initMediaPipeIntegrity()
}


// ============================================================================
// MEDIAPIPE FACE LANDMARKER — ADVANCED INTEGRITY MONITOR & PROCTOR
// ============================================================================

let faceLandmarker = null;
let mpDrawingUtils = null;
let mpLastVideoTime = -1;

// ── Settings & Thresholds (Calibrated from reliable proctor) ─────────────────
const DETECTION_TIME = 2000;      // 2 seconds sustained violation before flagging
const WARNING_COOLDOWN = 8000;    // 8 seconds cooldown per violation type
const EAR_THRESHOLD = 0.19;       // Eye aspect ratio threshold
const lastWarningByType = {};     // Separate cooldown tracker per violation type

let totalIntegrityFlags = 0;
let noFaceStart = null;
let multipleFaceStart = null;
let lookingAwayStart = null;
let eyesClosedStart = null;

// DOM references
const integrityWarning = document.getElementById('integrityWarning');
const integrityWarningText = document.getElementById('integrityWarningText');
let basicFaceInterval = null;

// ── Geometry Helpers ────────────────────────────────────────────────────────
function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeAspectRatio(landmarks, points) {
    const [p1, p2, p3, p4, p5, p6] = points.map(i => landmarks[i]);
    const vertical1 = distance(p2, p6);
    const vertical2 = distance(p3, p5);
    const horizontal = distance(p1, p4);
    if (horizontal === 0) return 0.3;
    return (vertical1 + vertical2) / (2 * horizontal);
}

function getHeadDirection(landmarks) {
    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    const eyeCenterX = (leftEye.x + rightEye.x) / 2;
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const faceWidth = distance(leftEye, rightEye);
    const faceHeight = distance(forehead, chin);

    if (faceWidth === 0 || faceHeight === 0) return 'CENTER';

    // Normalized horizontal yaw (corrected for user's perspective)
    const yawRatio = (nose.x - eyeCenterX) / faceWidth;
    if (yawRatio > 0.35) return 'LEFT';
    if (yawRatio < -0.35) return 'RIGHT';

    // Normalized vertical pitch (catches looking down at phone or notes)
    const pitchRatio = (nose.y - eyeCenterY) / faceHeight;
    if (pitchRatio > 0.36) return 'DOWN';
    if (pitchRatio < 0.14) return 'UP';

    return 'CENTER';
}

// ── Backend Proctor Sync ────────────────────────────────────────────────────
async function reportToBackend(reason) {
    if (!sessionId) return;
    try {
        await fetch(`${API_BASE}/api/proctor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                browser_event: reason
            })
        });
    } catch (err) {
        console.warn('[Proctor Sync]', err.message);
    }
}

// ── Instant Popup & Chat Interruption ───────────────────────────────────────
function addIntegrityAlertToChat(type, message) {
    if (!chatMessages) return;
    const alertEl = document.createElement('div');
    alertEl.className = 'p-3.5 rounded-xl border border-rose-500/50 bg-rose-500/10 text-rose-200 text-xs shadow-lg my-2 fade-in';
    const timeStr = new Date().toLocaleTimeString();

    alertEl.innerHTML = `
        <div class="flex items-start gap-2.5">
            <div class="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <div class="flex-1">
                <div class="flex items-center justify-between">
                    <span class="font-bold text-rose-400 uppercase tracking-wider text-[11px]">Proctor Interruption (Violation #${totalIntegrityFlags})</span>
                    <span class="text-[10px] text-rose-300 font-mono">${timeStr}</span>
                </div>
                <p class="text-rose-100 font-medium text-xs mt-1 leading-snug">⚠ ${message}</p>
                <p class="text-[10px] text-rose-300/80 mt-1 italic">Note: The AI interviewer pauses when candidate attention is diverted from the screen.</p>
            </div>
        </div>
    `;
    chatMessages.appendChild(alertEl);
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showWarning(type, message) {
    const now = Date.now();

    // Per-violation cooldown check
    if (lastWarningByType[type] && (now - lastWarningByType[type] < WARNING_COOLDOWN)) {
        return;
    }
    lastWarningByType[type] = now;

    totalIntegrityFlags++;
    const flagBadge = document.getElementById('flagBadge');
    if (flagBadge) flagBadge.innerText = `${totalIntegrityFlags} Flags`;
    if (infoFlags) infoFlags.innerText = totalIntegrityFlags;

    // 1. INSTANT POPUP NOTIFICATION (Top-right)
    if (integrityWarning && integrityWarningText) {
        integrityWarningText.innerText = message;
        integrityWarning.classList.add('show');
        clearTimeout(integrityWarning._hideTimer);
        integrityWarning._hideTimer = setTimeout(() => {
            integrityWarning.classList.remove('show');
        }, 4500);
    }

    // 2. IN-VIDEO BANNER ALERT
    if (attentionAlert) {
        attentionAlert.innerText = `⚠ ${message}`;
        attentionAlert.classList.add('show');
        clearTimeout(attentionAlert._timer);
        attentionAlert._timer = setTimeout(() => attentionAlert.classList.remove('show'), 3500);
    }

    // 3. CHAT TRANSCRIPT INTERRUPTION (Interviewer warns candidate in chat)
    addIntegrityAlertToChat(type, message);

    // 4. INTERVIEWER VERBAL INTERRUPTION
    if (window.speechSynthesis && !isSpeakerMuted) {
        window.speechSynthesis.cancel();
        const speech = new SpeechSynthesisUtterance('Interviewer note: ' + message);
        speech.rate = 1.05;
        window.speechSynthesis.speak(speech);
    }

    // 5. RECORD IN LOCAL FLAGS FOR REPORT
    flagAttention(type.toLowerCase(), message);

    // 6. SYNC TO BACKEND (/api/proctor)
    reportToBackend(message);
}

// ── Live Telemetry UI Updater ───────────────────────────────────────────────
function updateTelemetryUI(faces, direction, eyesClosed, ear, activeViolation) {
    const faceCountEl = document.getElementById('faceCountVal');
    const headPoseEl = document.getElementById('headPoseVal');
    const eyeStatusEl = document.getElementById('eyeStatusVal');
    const earValEl = document.getElementById('earVal');
    const statusBox = document.getElementById('integrityLiveStatus');
    const statusText = document.getElementById('integrityLiveStatusText');

    if (faceCountEl) {
        faceCountEl.innerText = faces > 1 ? 'Multiple' : faces;
        faceCountEl.className = faces > 1 ? 'font-bold text-rose-400' : 'font-bold text-slate-200';
    }
    if (headPoseEl) {
        headPoseEl.innerText = direction;
        headPoseEl.className = direction === 'CENTER' ? 'font-bold text-emerald-400' : 'font-bold text-amber-400';
    }
    if (eyeStatusEl) {
        eyeStatusEl.innerText = eyesClosed ? 'CLOSED' : 'OPEN';
        eyeStatusEl.className = eyesClosed ? 'font-bold text-rose-400' : 'font-bold text-emerald-400';
    }
    if (earValEl && typeof ear === 'number') {
        earValEl.innerText = ear.toFixed(3);
    }

    if (statusBox && statusText) {
        if (activeViolation) {
            statusText.innerText = activeViolation;
            statusBox.className = 'p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-semibold mb-3 flex items-center justify-between transition-all';
        } else {
            statusText.innerText = 'Candidate Monitored Normally';
            statusBox.className = 'p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-semibold mb-3 flex items-center justify-between transition-all';
        }
    }
}

// ── MediaPipe Model Initialization ──────────────────────────────────────────
async function initMediaPipeIntegrity() {
    initBasicFaceDetection();

    try {
        console.log('[MediaPipe] Initializing FaceLandmarker bundle (v0.10.14)...');
        const mp = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
        FaceLandmarker = mp.FaceLandmarker;
        FilesetResolver = mp.FilesetResolver;
        DrawingUtils = mp.DrawingUtils;

        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );

        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath:
                    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numFaces: 2
        });

        const faceCanvas = document.getElementById('faceCanvas');
        if (faceCanvas) {
            const fCtx = faceCanvas.getContext('2d');
            mpDrawingUtils = new DrawingUtils(fCtx);
        }

        console.log('[MediaPipe] Hardware-accelerated GPU 3D FaceLandmarker active');
        if (webcamStatus) {
            webcamStatus.textContent = 'AI Monitoring (GPU Active)';
            webcamStatus.className = 'text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium';
        }

        if (basicFaceInterval) {
            clearInterval(basicFaceInterval);
            basicFaceInterval = null;
        }

        requestAnimationFrame(mediaPipeDetectLoop);
    } catch (err) {
        console.warn('[MediaPipe] GPU delegate fallback, keeping active heuristic detector:', err);
    }
}

// ── Main Detection Loop ─────────────────────────────────────────────────────
function mediaPipeDetectLoop() {
    if (!faceLandmarker || !webcamVideo || webcamVideo.readyState < 2) {
        requestAnimationFrame(mediaPipeDetectLoop);
        return;
    }

    if (webcamVideo.currentTime !== mpLastVideoTime) {
        mpLastVideoTime = webcamVideo.currentTime;
        const now = performance.now();

        const results = faceLandmarker.detectForVideo(webcamVideo, now);
        const faceCanvas = document.getElementById('faceCanvas');
        
        if (faceCanvas) {
            const fCtx = faceCanvas.getContext('2d');
            
            if (faceCanvas.width !== webcamVideo.videoWidth || faceCanvas.height !== webcamVideo.videoHeight) {
                faceCanvas.width = webcamVideo.videoWidth || 800;
                faceCanvas.height = webcamVideo.videoHeight || 600;
            }
            
            fCtx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);

            const faces = results.faceLandmarks ? results.faceLandmarks.length : 0;

            // 1. NO FACE DETECTED
            if (faces === 0) {
                updateTelemetryUI(0, '-', false, '-', '⚠ Face Not Detected');
                updateIntegrityDot(facePresentDot, 'red');
                updateIntegrityDot(gazeDirectDot, 'yellow');

                multipleFaceStart = null;
                lookingAwayStart = null;
                eyesClosedStart = null;

                if (!noFaceStart) noFaceStart = now;
                if (now - noFaceStart >= DETECTION_TIME) {
                    showWarning('NO_FACE', 'Face not detected for more than 2 seconds.');
                    noFaceStart = now;
                }

                requestAnimationFrame(mediaPipeDetectLoop);
                return;
            }

            noFaceStart = null;
            updateIntegrityDot(facePresentDot, 'green');
            let activeViolationMsg = null;

            // 2. MULTIPLE FACES DETECTED
            if (faces > 1) {
                activeViolationMsg = '⚠ Multiple People Detected';
                updateIntegrityDot(singleFaceDot, 'red');

                if (!multipleFaceStart) multipleFaceStart = now;
                if (now - multipleFaceStart >= DETECTION_TIME) {
                    showWarning('MULTI_FACE', 'Multiple people detected in frame.');
                    multipleFaceStart = now;
                }
            } else {
                multipleFaceStart = null;
                updateIntegrityDot(singleFaceDot, 'green');
            }

            // 3. FIRST FACE LANDMARKS, POSE & EYE RATIO
            const landmarks = results.faceLandmarks[0];
            // Green face mesh overlay removed for clean, natural camera view

            const direction = getHeadDirection(landmarks);
            const leftEAR = eyeAspectRatio(landmarks, [33, 159, 145, 133, 153, 144]);
            const rightEAR = eyeAspectRatio(landmarks, [362, 386, 374, 263, 380, 373]);
            const ear = (leftEAR + rightEAR) / 2;
            const eyesClosed = ear < EAR_THRESHOLD;

            // 4. LOOKING AWAY / DOWN CHECK
            if (direction !== 'CENTER') {
                const lookingDesc = direction === 'DOWN' ? 'looking down (possible phone or notes)' : `looking ${direction.toLowerCase()}`;
                if (!activeViolationMsg) activeViolationMsg = `⚠ Looking ${direction}`;
                updateIntegrityDot(gazeDirectDot, 'yellow');

                if (!lookingAwayStart) lookingAwayStart = now;
                if (now - lookingAwayStart >= DETECTION_TIME) {
                    updateIntegrityDot(gazeDirectDot, 'red');
                    showWarning('LOOKING_AWAY', `Candidate ${lookingDesc} for more than 2 seconds.`);
                    lookingAwayStart = now;
                }
            } else {
                lookingAwayStart = null;
                updateIntegrityDot(gazeDirectDot, 'green');
            }

            // 5. EYES CLOSED CHECK (Only evaluated when facing center)
            if (eyesClosed && direction === 'CENTER') {
                if (!activeViolationMsg) activeViolationMsg = '⚠ Eyes Closed';
                updateIntegrityDot(eyeOpenDot, 'yellow');

                if (!eyesClosedStart) eyesClosedStart = now;
                if (now - eyesClosedStart >= DETECTION_TIME) {
                    updateIntegrityDot(eyeOpenDot, 'red');
                    showWarning('EYES_CLOSED', 'Eyes closed or shielded for more than 2 seconds.');
                    eyesClosedStart = now;
                }
            } else {
                eyesClosedStart = null;
                updateIntegrityDot(eyeOpenDot, 'green');
            }

            // 6. UPDATE TELEMETRY & STATUS
            updateTelemetryUI(faces, direction, eyesClosed, ear, activeViolationMsg);
        }
    }

    requestAnimationFrame(mediaPipeDetectLoop);
}


// ── Integrity Dot Updater ──
function updateIntegrityDot(dotEl, color) {
    if (!dotEl) return;
    const colorMap = {
        green: 'w-2 h-2 rounded-full bg-emerald-500',
        yellow: 'w-2 h-2 rounded-full bg-amber-400',
        red: 'w-2 h-2 rounded-full bg-red-500 animate-pulse'
    };
    dotEl.className = colorMap[color] || colorMap.green;
}

// ── Fallback: Basic skin-tone face detection (if MediaPipe fails to load) ──
function initBasicFaceDetection() {
    if (basicFaceInterval) return;
    console.log('[Integrity] Active basic skin-tone face detection started');
    const canvas = document.getElementById('faceCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Default all monitor dots to active / healthy state
    updateIntegrityDot(facePresentDot, 'green');
    updateIntegrityDot(gazeDirectDot, 'green');
    updateIntegrityDot(eyeOpenDot, 'green');
    updateIntegrityDot(singleFaceDot, 'green');
    updateTelemetryUI(1, 'CENTER', false, 0.284, null);

    basicFaceInterval = setInterval(() => {
        if (!interviewActive) return;
        
        try {
            canvas.width = webcamVideo.videoWidth || 320;
            canvas.height = webcamVideo.videoHeight || 240;
            ctx.drawImage(webcamVideo, 0, 0, canvas.width, canvas.height);
            
            const centerX = canvas.width * 0.3;
            const centerY = canvas.height * 0.2;
            const regionW = canvas.width * 0.4;
            const regionH = canvas.height * 0.5;
            
            const imageData = ctx.getImageData(centerX, centerY, regionW, regionH);
            const pixels = imageData.data;
            
            let skinPixels = 0;
            const totalPixels = pixels.length / 4;
            
            for (let i = 0; i < pixels.length; i += 16) {
                const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
                if (r > 60 && g > 40 && b > 20 && 
                    r > g && r > b && 
                    Math.abs(r - g) > 15 &&
                    r - b > 15) {
                    skinPixels++;
                }
            }
            
            const skinRatio = skinPixels / (totalPixels / 4);
            const facePresent = skinRatio > 0.05;
            
            if (facePresent) {
                updateIntegrityDot(facePresentDot, 'green');
                updateIntegrityDot(gazeDirectDot, 'green');
                attentionAlert.classList.remove('show');
                lookAwayStart = null;
            } else {
                updateIntegrityDot(facePresentDot, 'red');
                updateIntegrityDot(gazeDirectDot, 'yellow');
                
                if (!lookAwayStart) {
                    lookAwayStart = Date.now();
                } else if (Date.now() - lookAwayStart > LOOK_AWAY_THRESHOLD_MS) {
                    attentionAlert.classList.add('show');
                    flagAttention('looking_away', 'No face detected — candidate may be looking away');
                    lookAwayStart = null;
                    setTimeout(() => attentionAlert.classList.remove('show'), 3000);
                }
            }
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } catch (e) { /* Video not ready */ }
    }, 1000);
}

function flagAttention(type, description) {
    const flag = {
        timestamp: new Date().toISOString(),
        type: type,
        description: description,
        elapsed_seconds: Math.floor((Date.now() - interviewStartTime) / 1000),
    };
    attentionFlags.push(flag);
    infoFlags.textContent = attentionFlags.length;
    
    if (attentionFlags.length >= 3) {
        infoFlags.className = 'font-medium text-red-400';
    } else if (attentionFlags.length >= 1) {
        infoFlags.className = 'font-medium text-yellow-400';
    }
}


// ============================================================================
// NOVEL FEATURE 1: REAL-TIME VOICE SENTIMENT, HESITATION & FLUENCY TRACKER
// ============================================================================

let totalFillerCount = 0;
let totalWordsSpoken = 0;
let currentConfidence = 88;
const FILLER_REGEX = /\b(um|uh|uhh|er|like|actually|basically|literally|you know|sort of|kind of)\b/gi;

function analyzeSpeechChunk(text) {
    if (!text || typeof text !== 'string') return;
    
    // Count filler words
    const matches = text.match(FILLER_REGEX);
    const chunkFillerCount = matches ? matches.length : 0;
    totalFillerCount += chunkFillerCount;

    // Word count
    const words = text.trim().split(/\s+/).filter(Boolean);
    totalWordsSpoken += words.length;

    // Confidence heuristic:
    // Base 88, -2.5% per filler word, +1% for answers with substance (>25 words)
    let score = 88 - (totalFillerCount * 2.5);
    if (words.length > 25) score += 3;
    if (words.length > 50) score += 3;
    score = Math.max(45, Math.min(96, Math.round(score)));
    currentConfidence = score;

    // Update UI elements safely
    const confValEl = document.getElementById('liveConfidenceVal');
    const confBarEl = document.getElementById('liveConfidenceBar');
    const fillerEl = document.getElementById('liveFillerCount');
    const cadenceEl = document.getElementById('liveCadenceVal');

    if (confValEl) confValEl.textContent = `${currentConfidence}%`;
    if (confBarEl) {
        confBarEl.style.width = `${currentConfidence}%`;
        if (currentConfidence >= 80) {
            confBarEl.className = 'bg-emerald-500 h-1.5 rounded-full transition-all duration-300';
            confValEl.className = 'font-bold text-emerald-400';
        } else if (currentConfidence >= 65) {
            confBarEl.className = 'bg-yellow-500 h-1.5 rounded-full transition-all duration-300';
            confValEl.className = 'font-bold text-yellow-400';
        } else {
            confBarEl.className = 'bg-rose-500 h-1.5 rounded-full transition-all duration-300';
            confValEl.className = 'font-bold text-rose-400';
        }
    }
    if (fillerEl) fillerEl.textContent = totalFillerCount;
    if (cadenceEl) {
        if (totalFillerCount > 6) {
            cadenceEl.textContent = 'Frequent Pauses';
            cadenceEl.className = 'font-semibold text-yellow-300';
        } else if (words.length > 60) {
            cadenceEl.textContent = 'Articulate & Thorough';
            cadenceEl.className = 'font-semibold text-emerald-300';
        } else {
            cadenceEl.textContent = 'Steady & Clear';
            cadenceEl.className = 'font-semibold text-indigo-300';
        }
    }
}

function getAggregatedSentimentMetrics() {
    let confLabel = 'Moderate';
    if (currentConfidence >= 80) confLabel = 'High';
    else if (currentConfidence < 65) confLabel = 'Low';

    return {
        confidence_level: confLabel,
        confidence_score: currentConfidence,
        filler_words_count: totalFillerCount,
        total_words_spoken: totalWordsSpoken,
        pace_and_fluency: totalFillerCount < 4 
            ? 'Smooth and confident delivery with minimal hesitation markers.'
            : `Delivered with moderate hesitation (${totalFillerCount} filler markers recorded).`
    };
}

function checkIfQuestionSuggestsCoding(question) {
    if (!question) return;
    const lower = question.toLowerCase();
    const codingKeywords = ['code', 'function', 'algorithm', 'implement', 'write a program', 'coding problem', 'two sum', 'data structure', 'leetcode'];
    const matches = codingKeywords.some(kw => lower.includes(kw));
    
    const badge = document.getElementById('codingBadge');
    const btn = document.getElementById('toggleCodingBtn');
    if (matches) {
        if (badge) badge.classList.remove('hidden');
        if (btn) {
            btn.classList.add('animate-pulse', 'border-indigo-400', 'bg-indigo-600/40');
            btn.title = 'Coding question detected! Click to open Code Editor';
        }
    }
}


// ============================================================================
// NOVEL FEATURE 2: LEETCODE-STYLE MINI CODE WINDOW CONTROLLER
// ============================================================================

let sessionCodingSubmissions = [];
let currentCodingProblem = null;

function initCodingWindow() {
    const toggleBtn = document.getElementById('toggleCodingBtn');
    const closeBtn = document.getElementById('closeCodingModalBtn');
    const refreshBtn = document.getElementById('refreshProblemBtn');
    const runBtn = document.getElementById('runCodeBtn');
    const submitBtn = document.getElementById('submitCodeBtn');
    const editor = document.getElementById('codeEditorArea');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            openCodingModal();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeCodingModal();
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchCodingProblem(true);
        });
    }

    if (runBtn) {
        runBtn.addEventListener('click', () => {
            runAndEvaluateCode(false);
        });
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            runAndEvaluateCode(true);
        });
    }

    // Tab key support inside the code editor
    if (editor) {
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = editor.selectionStart;
                const end = editor.selectionEnd;
                editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
                editor.selectionStart = editor.selectionEnd = start + 4;
            }
        });
    }
}

function openCodingModal() {
    const modal = document.getElementById('codingModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
    const badge = document.getElementById('codingBadge');
    if (badge) badge.classList.add('hidden');

    if (!currentCodingProblem) {
        fetchCodingProblem(false);
    }
}

function closeCodingModal() {
    const modal = document.getElementById('codingModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function fetchCodingProblem(forceNew = false) {
    const titleEl = document.getElementById('codeProblemTitle');
    const descEl = document.getElementById('codeProblemDescription');
    const diffEl = document.getElementById('codeProblemDifficulty');
    const testCasesEl = document.getElementById('codeTestCases');
    const editor = document.getElementById('codeEditorArea');

    if (descEl) descEl.textContent = 'Generating tailored coding problem from candidate skills...';

    try {
        const res = await fetch(`${API_BASE}/api/coding/problem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        if (!res.ok) throw new Error('Failed to load coding challenge');
        const data = await res.json();
        currentCodingProblem = data.problem;

        if (titleEl) titleEl.textContent = currentCodingProblem.title || 'Coding Challenge';
        if (diffEl) diffEl.textContent = currentCodingProblem.difficulty || 'Easy';
        if (descEl) descEl.textContent = currentCodingProblem.description || 'Implement the solution.';
        
        if (editor && (!editor.value.trim() || forceNew)) {
            editor.value = currentCodingProblem.starter_code || '# Write solution here\n';
        }

        if (testCasesEl && currentCodingProblem.test_cases) {
            testCasesEl.innerHTML = '';
            currentCodingProblem.test_cases.forEach((tc, idx) => {
                const box = document.createElement('div');
                box.className = 'p-2.5 rounded-lg bg-black/40 border border-white/5 text-gray-300';
                box.innerHTML = `
                    <div class="text-indigo-300 mb-0.5">Test #${idx + 1}: ${tc.input}</div>
                    <div class="text-emerald-300">Expected: ${tc.expected_output}</div>
                    ${tc.explanation ? `<div class="text-gray-500 text-[11px] mt-0.5">${tc.explanation}</div>` : ''}
                `;
                testCasesEl.appendChild(box);
            });
        }
    } catch (err) {
        if (descEl) descEl.textContent = 'Could not load problem. Using standard algorithmic task.';
        if (editor && !editor.value.trim()) {
            editor.value = 'def two_sum(nums, target):\n    # Write your solution here\n    seen = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in seen:\n            return [seen[diff], i]\n        seen[num] = i\n    return []';
        }
    }
}

async function runAndEvaluateCode(isFinalSubmission = false) {
    const editor = document.getElementById('codeEditorArea');
    const langSelect = document.getElementById('codeLanguageSelect');
    const runBtn = document.getElementById('runCodeBtn');
    const submitBtn = document.getElementById('submitCodeBtn');
    const resultBox = document.getElementById('evalResultBox');
    const statusBadge = document.getElementById('evalStatusBadge');
    const scoreEl = document.getElementById('evalScore');
    const timeEl = document.getElementById('evalTime');
    const spaceEl = document.getElementById('evalSpace');
    const feedbackEl = document.getElementById('evalFeedbackText');
    const hintEl = document.getElementById('codeEditorHint');

    const code = editor ? editor.value : '';
    const language = langSelect ? langSelect.value : 'python';

    if (!code.trim()) {
        alert('Please write code before running or submitting.');
        return;
    }

    if (runBtn) runBtn.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
    if (hintEl) hintEl.textContent = 'AI Judge is evaluating test cases & complexity...';

    try {
        const res = await fetch(`${API_BASE}/api/coding/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                code: code,
                language: language,
                problem_title: currentCodingProblem ? currentCodingProblem.title : 'Live Coding Challenge',
                problem_description: currentCodingProblem ? currentCodingProblem.description : ''
            })
        });

        if (!res.ok) throw new Error('Evaluation failed');
        const data = await res.json();
        const evalResult = data.result;

        // Display results in UI
        if (resultBox) resultBox.classList.remove('hidden');
        if (statusBadge) {
            statusBadge.textContent = evalResult.status || 'Accepted';
            if (evalResult.status === 'Accepted') {
                statusBadge.className = 'text-xs px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300';
            } else {
                statusBadge.className = 'text-xs px-2 py-0.5 rounded font-mono font-bold bg-yellow-500/20 text-yellow-300';
            }
        }
        if (scoreEl) scoreEl.textContent = `${evalResult.score || 8}/10`;
        if (timeEl) timeEl.textContent = evalResult.time_complexity || 'O(N)';
        if (spaceEl) spaceEl.textContent = evalResult.space_complexity || 'O(1)';
        if (feedbackEl) feedbackEl.textContent = evalResult.feedback || 'Code analyzed.';
        if (hintEl) hintEl.textContent = 'Evaluation complete!';

        const subRecord = {
            problem_title: currentCodingProblem ? currentCodingProblem.title : 'Live Coding Challenge',
            language: language,
            code: code,
            evaluation: evalResult
        };
        sessionCodingSubmissions.push(subRecord);

        if (isFinalSubmission) {
            // Add confirmation into chat
            addMessage('candidate', `[Code Submitted for ${subRecord.problem_title} (${language}) — Score: ${evalResult.score}/10, Complexity: ${evalResult.time_complexity}]`);
            closeCodingModal();
        }
    } catch (err) {
        if (hintEl) hintEl.textContent = 'Evaluation error. Check your network connection.';
    } finally {
        if (runBtn) runBtn.disabled = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}


// ── Boot ────────────────────────────────────────────────────────────────────
async function boot() {
    updateControlsUI();
    initSpeechRecognition();
    initCodingWindow();

    // Kick off webcam and integrity monitoring in background without blocking interview
    initWebcam()
        .then(() => {
            initMediaPipeIntegrity();
        })
        .catch(err => {
            console.warn('Webcam initialization deferred:', err);
        });

    // Start interview IMMEDIATELY with AI
    await startInterview();
}

boot();

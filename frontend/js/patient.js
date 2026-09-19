const state = {
  recorder: null,
  chunks: [],
  recordingTarget: null,
  currentQuestion: "",
  answers: [],
  summary: null
};

const MAX_QUESTIONS = 5;

const els = {
  name: document.getElementById("name"),
  age: document.getElementById("age"),
  gender: document.getElementById("gender"),
  complaint: document.getElementById("complaint"),
  symptoms: document.getElementById("symptoms"),
  answerText: document.getElementById("answerText"),
  questionText: document.getElementById("questionText"),
  questionCounter: document.getElementById("questionCounter"),
  summaryBox: document.getElementById("summaryBox"),
  speechStatus: document.getElementById("speechStatus"),
  assistantStatus: document.getElementById("assistantStatus"),
  submitStatus: document.getElementById("submitStatus"),
  listenQuestion: document.getElementById("listenQuestion")
};

// Clamp age input in real-time — no value above 100 allowed
els.age.addEventListener("input", () => {
  let val = parseInt(els.age.value, 10);
  if (isNaN(val) || val < 1) {
    els.age.value = "";
  } else if (val > 100) {
    els.age.value = 100;
  }
});
els.age.addEventListener("keydown", (e) => {
  // Block typing a third digit if current value is already >= 10
  // and the resulting value would exceed 100
  const val = parseInt(els.age.value + e.key, 10);
  if (!isNaN(val) && val > 100 && e.key >= "0" && e.key <= "9") {
    e.preventDefault();
    els.age.value = 100;
  }
});

function setStatus(element, message, type = "") {
  if (!element) return;
  element.textContent = message;
  element.className = `status-line ${type}`.trim();
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function formatSymptoms(sym) {
  if (!sym) return "Not specified";
  if (typeof sym === "string") return sym;
  if (Array.isArray(sym)) {
    return sym
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null) {
          return item.name || item.symptom || item.description || Object.values(item).filter(v => typeof v === 'string' || typeof v === 'number').join(" - ") || JSON.stringify(item);
        }
        return String(item);
      })
      .join(", ");
  }
  if (typeof sym === "object" && sym !== null) {
    if (sym.description || sym.name || sym.symptom) {
      return sym.description || sym.name || sym.symptom;
    }
    return Object.entries(sym)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(", ");
  }
  return String(sym);
}

function renderSummary(summary) {
  const symptoms = formatSymptoms(summary.symptoms);
  const additionalInfo = typeof summary.additionalInformation === "string"
    ? summary.additionalInformation
    : Array.isArray(summary.additionalInformation)
      ? summary.additionalInformation.map((item) => typeof item === "string" ? item : `${item.question || ""}: ${item.answer || ""}`).join("\n")
      : summary.additionalInformation && typeof summary.additionalInformation === "object"
        ? Object.entries(summary.additionalInformation).map(([k, v]) => `${k}: ${v}`).join("\n")
        : "Not specified";
  els.summaryBox.classList.remove("empty");
  els.summaryBox.innerHTML = `
    <p><strong>Chief Complaint:</strong> ${summary.chiefComplaint || "Not specified"}</p>
    <p><strong>Duration:</strong> ${summary.duration || "Not specified"}</p>
    <p><strong>Symptoms:</strong> ${symptoms}</p>
    <p><strong>Additional Information:</strong> ${additionalInfo}</p>
    <p><strong>Important Information:</strong> ${summary.importantInformation || "History support only. No diagnosis generated."}</p>
  `;
}

async function triggerAutoSummary() {
  setStatus(els.assistantStatus, "Questions complete! Generating structured summary...", "loading");
  try {
    const compVal = els.complaint.value.trim() || els.symptoms.value.trim();
    const symVal = els.symptoms.value.trim() || els.complaint.value.trim();
    const data = await apiJson("/api/generate-summary", {
      method: "POST",
      body: JSON.stringify({
        complaint: compVal,
        symptoms: symVal,
        answers: state.answers
      })
    });
    state.summary = data.summary;
    renderSummary(data.summary);
    setStatus(els.assistantStatus, "Intake questioning complete! Structured summary generated below.", "success");
  } catch (error) {
    setStatus(els.assistantStatus, error.message, "error");
  }
}

async function convertSpeech(blob, target) {
  const formData = new FormData();
  formData.append("audio", blob, "recording.webm");
  const statusEl = target === "symptoms" ? els.speechStatus : els.assistantStatus;
  const targetEl = target === "symptoms" ? els.symptoms : els.answerText;
  setStatus(statusEl, "Transcribing speech with Whisper AI...", "loading");

  const response = await fetch("/api/speech-to-text", {
    method: "POST",
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Speech transcription failed.");

  if (data.text) {
    targetEl.value = [targetEl.value, data.text].filter(Boolean).join(" ").trim();
    if (target === "symptoms" && !els.complaint.value.trim()) {
      els.complaint.value = data.text.split(".")[0].slice(0, 60);
    }
    setStatus(statusEl, `Transcribed: "${data.text}"`, "success");
  } else {
    setStatus(statusEl, "No speech detected in recording. Please try speaking closer to the microphone.", "error");
  }
}

async function toggleRecording(target, button) {
  const statusEl = target === "symptoms" ? els.speechStatus : els.assistantStatus;
  const originalText = target === "symptoms" ? "Speak Symptoms" : "Speak Answer";

  if (state.recorder && state.recorder.state === "recording") {
    state.recorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.chunks = [];
    state.recordingTarget = target;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";

    state.recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    state.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) state.chunks.push(event.data);
    };

    state.recorder.onstop = async () => {
      button.textContent = originalText;
      stream.getTracks().forEach((track) => track.stop());
      state.recorder = null;

      if (!state.chunks.length) {
        setStatus(statusEl, "No audio recorded. Please try again.", "error");
        return;
      }

      try {
        await convertSpeech(new Blob(state.chunks, { type: "audio/webm" }), state.recordingTarget);
      } catch (error) {
        const message = /no deployments available|cooldown|try again in/i.test(error.message || "")
          ? "Speech model is temporarily unavailable. Please wait 5 seconds, then try again."
          : error.message;
        setStatus(statusEl, message || "Speech transcription failed. Please try again.", "error");
      }
    };

    state.recorder.start(200);
    button.textContent = "Stop Recording";
    setStatus(statusEl, "Recording audio... Speak your symptoms clearly and click 'Stop'.", "loading");
  } catch (err) {
    button.textContent = originalText;
    setStatus(statusEl, "Microphone access denied. Please allow microphone permissions in your browser.", "error");
  }
}

document.getElementById("recordSymptoms").addEventListener("click", (event) => {
  toggleRecording("symptoms", event.currentTarget);
});

document.getElementById("recordAnswer").addEventListener("click", (event) => {
  toggleRecording("answer", event.currentTarget);
});

document.getElementById("typeManually").addEventListener("click", () => {
  els.symptoms.focus();
  setStatus(els.speechStatus, "Manual typing is ready.", "success");
});

document.getElementById("askQuestion").addEventListener("click", async () => {
  if (state.answers.length >= MAX_QUESTIONS) {
    els.questionText.textContent = "Intake questioning complete! Maximum limit of 5 questions reached.";
    if (els.questionCounter) {
      els.questionCounter.style.display = "inline-block";
      els.questionCounter.textContent = "Completed (5/5)";
    }
    await triggerAutoSummary();
    return;
  }

  const compVal = els.complaint.value.trim() || els.symptoms.value.trim();
  const symVal = els.symptoms.value.trim() || els.complaint.value.trim();

  if (!compVal && !symVal) {
    setStatus(els.assistantStatus, "Please describe your symptoms first.", "error");
    return;
  }

  if (!els.complaint.value.trim() && compVal) {
    els.complaint.value = compVal.slice(0, 60);
  }

  setStatus(els.assistantStatus, "AI is formulating next question...", "loading");
  try {
    const data = await apiJson("/api/ask-question", {
      method: "POST",
      body: JSON.stringify({
        complaint: compVal,
        symptoms: symVal,
        answers: state.answers
      })
    });

    if (data.isDone || data.question === "DONE") {
      els.questionText.textContent = "Intake questioning complete! Auto-generating summary below...";
      if (els.questionCounter) {
        els.questionCounter.style.display = "inline-block";
        els.questionCounter.textContent = `Completed (${state.answers.length}/${MAX_QUESTIONS})`;
      }
      await triggerAutoSummary();
      return;
    }

    let q = (data.question || "").trim();
    q = q.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
    if (q.includes("Thinking Process:") || /^(?:Thinking Process|Thought|Reasoning)/i.test(q)) {
      const parts = q.split(/\r?\n/).map(l => l.trim()).filter(l => l.endsWith("?") && !l.includes("**"));
      if (parts.length > 0) q = parts[parts.length - 1];
      else q = "How many days have you been experiencing these symptoms?";
    }

    state.currentQuestion = q;
    els.questionText.textContent = q;
    els.listenQuestion.disabled = false;

    if (els.questionCounter) {
      els.questionCounter.style.display = "inline-block";
      els.questionCounter.textContent = `Question ${state.answers.length + 1} of ${MAX_QUESTIONS}`;
    }

    setStatus(els.assistantStatus, "Question ready.", "success");
  } catch (error) {
    setStatus(els.assistantStatus, error.message, "error");
  }
});

els.listenQuestion.addEventListener("click", async () => {
  if (!state.currentQuestion) return;
  setStatus(els.assistantStatus, "Generating speech with Kokoro TTS...", "loading");

  try {
    const response = await fetch("/api/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: state.currentQuestion })
    });
    if (response.ok) {
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => setStatus(els.assistantStatus, "Question ready.", "success");
      audio.play();
      setStatus(els.assistantStatus, "Playing Kokoro audio...", "success");
      return;
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "Audio generation failed.");
  } catch (err) {
    console.warn("Backend Kokoro TTS error:", err);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(state.currentQuestion);
      utterance.lang = "en-US";
      window.speechSynthesis.speak(utterance);
      setStatus(els.assistantStatus, "Playing question audio.", "success");
    } else {
      setStatus(els.assistantStatus, `${err.message}`, "error");
    }
  }
});

document.getElementById("nextQuestion").addEventListener("click", async () => {
  if (!state.currentQuestion) {
    setStatus(els.assistantStatus, "Ask an AI question first.", "error");
    return;
  }
  if (!els.answerText.value.trim()) {
    setStatus(els.assistantStatus, "Please answer the current question.", "error");
    return;
  }
  state.answers.push({ question: state.currentQuestion, answer: els.answerText.value.trim() });
  els.answerText.value = "";

  if (state.answers.length >= MAX_QUESTIONS) {
    els.questionText.textContent = "Intake questioning complete! Maximum limit of 5 questions reached.";
    if (els.questionCounter) {
      els.questionCounter.style.display = "inline-block";
      els.questionCounter.textContent = "Completed (5/5)";
    }
    await triggerAutoSummary();
  } else {
    document.getElementById("askQuestion").click();
  }
});

document.getElementById("generateSummary").addEventListener("click", async () => {
  const compVal = els.complaint.value.trim() || els.symptoms.value.trim();
  const symVal = els.symptoms.value.trim() || els.complaint.value.trim();
  setStatus(els.assistantStatus, "Generating summary...", "loading");
  try {
    const data = await apiJson("/api/generate-summary", {
      method: "POST",
      body: JSON.stringify({
        complaint: compVal,
        symptoms: symVal,
        answers: state.answers
      })
    });
    state.summary = data.summary;
    renderSummary(data.summary);
    setStatus(els.assistantStatus, "Summary generated.", "success");
  } catch (error) {
    setStatus(els.assistantStatus, error.message, "error");
  }
});

document.getElementById("submitCase").addEventListener("click", async () => {
  if (!els.name.value.trim() || !els.age.value || !els.gender.value || !els.complaint.value.trim()) {
    setStatus(els.submitStatus, "Please complete name, age, gender, and complaint.", "error");
    return;
  }

  setStatus(els.submitStatus, "Submitting case...", "loading");
  try {
    const data = await apiJson("/api/cases", {
      method: "POST",
      body: JSON.stringify({
        name: els.name.value,
        age: els.age.value,
        gender: els.gender.value,
        complaint: els.complaint.value,
        symptoms: els.symptoms.value,
        history: state.answers.map((item) => `${item.question}: ${item.answer}`).join("\n"),
        ai_summary: state.summary
      })
    });
    const warning = data.warning ? ` ${data.warning}` : "";
    setStatus(els.submitStatus, `Case submitted successfully.${warning}`, data.warning ? "error" : "success");
  } catch (error) {
    setStatus(els.submitStatus, error.message, "error");
  }
});

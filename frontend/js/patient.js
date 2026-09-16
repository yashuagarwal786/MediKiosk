const state = {
  recorder: null,
  recognition: null,
  chunks: [],
  recordingTarget: null,
  currentQuestion: "",
  answers: [],
  summary: null
};

const els = {
  name: document.getElementById("name"),
  age: document.getElementById("age"),
  gender: document.getElementById("gender"),
  complaint: document.getElementById("complaint"),
  symptoms: document.getElementById("symptoms"),
  answerText: document.getElementById("answerText"),
  questionText: document.getElementById("questionText"),
  summaryBox: document.getElementById("summaryBox"),
  speechStatus: document.getElementById("speechStatus"),
  assistantStatus: document.getElementById("assistantStatus"),
  submitStatus: document.getElementById("submitStatus"),
  listenQuestion: document.getElementById("listenQuestion")
};

function setStatus(element, message, type = "") {
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

function renderSummary(summary) {
  const symptoms = Array.isArray(summary.symptoms) ? summary.symptoms.join(", ") : summary.symptoms;
  els.summaryBox.classList.remove("empty");
  els.summaryBox.innerHTML = `
    <p><strong>Chief Complaint:</strong> ${summary.chiefComplaint || "Not specified"}</p>
    <p><strong>Duration:</strong> ${summary.duration || "Not specified"}</p>
    <p><strong>Symptoms:</strong> ${symptoms || "Not specified"}</p>
    <p><strong>Additional Information:</strong> ${summary.additionalInformation || "Not specified"}</p>
    <p><strong>Important Information:</strong> ${summary.importantInformation || "History support only. No diagnosis generated."}</p>
  `;
}

async function convertSpeech(blob, target) {
  const formData = new FormData();
  formData.append("audio", blob, "recording.webm");
  const statusEl = target === "symptoms" ? els.speechStatus : els.assistantStatus;
  setStatus(statusEl, "Converting speech...", "loading");

  const response = await fetch("/api/speech-to-text", {
    method: "POST",
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "AI service is temporarily unavailable. Please try again.");

  if (target === "symptoms") {
    els.symptoms.value = [els.symptoms.value, data.text].filter(Boolean).join(" ").trim();
  } else {
    els.answerText.value = [els.answerText.value, data.text].filter(Boolean).join(" ").trim();
  }
  setStatus(statusEl, "Speech converted successfully.", "success");
}

function startWebSpeech(target, button) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return false;

  const statusEl = target === "symptoms" ? els.speechStatus : els.assistantStatus;
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    state.recognition = recognition;
    button.textContent = "Stop Listening";
    setStatus(statusEl, "Listening... Speak now.", "loading");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0]?.[0]?.transcript?.trim();
    if (transcript) {
      if (target === "symptoms") {
        els.symptoms.value = [els.symptoms.value, transcript].filter(Boolean).join(" ").trim();
      } else {
        els.answerText.value = [els.answerText.value, transcript].filter(Boolean).join(" ").trim();
      }
      setStatus(statusEl, "Speech captured successfully.", "success");
    }
  };

  recognition.onerror = (event) => {
    console.warn("Web Speech API error:", event.error);
    if (event.error === "not-allowed") {
      setStatus(statusEl, "Microphone permission was denied. Please allow microphone access in browser settings.", "error");
    } else if (event.error === "no-speech") {
      setStatus(statusEl, "No speech was heard. Please click to try again.", "error");
    } else {
      // Fallback to media recorder upload if web speech network failed
      startMediaRecorder(target, button);
    }
  };

  recognition.onend = () => {
    button.textContent = target === "symptoms" ? "Speak Symptoms" : "Speak Answer";
    state.recognition = null;
  };

  try {
    recognition.start();
    return true;
  } catch (err) {
    console.warn("Could not start Web Speech Recognition:", err);
    return false;
  }
}

async function startMediaRecorder(target, button) {
  const statusEl = target === "symptoms" ? els.speechStatus : els.assistantStatus;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.chunks = [];
    state.recordingTarget = target;
    state.recorder = new MediaRecorder(stream);
    state.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) state.chunks.push(event.data);
    };
    state.recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      try {
        await convertSpeech(new Blob(state.chunks, { type: "audio/webm" }), state.recordingTarget);
      } catch (error) {
        setStatus(target === "symptoms" ? els.speechStatus : els.assistantStatus, `${error.message} Please retry.`, "error");
      }
    };
    state.recorder.start();
    button.textContent = "Stop Recording";
    setStatus(statusEl, "Recording audio...", "loading");
  } catch (err) {
    setStatus(statusEl, "Microphone access is required to record audio. Please check browser permissions.", "error");
  }
}

async function toggleRecording(target, button) {
  if (state.recognition) {
    state.recognition.stop();
    state.recognition = null;
    button.textContent = target === "symptoms" ? "Speak Symptoms" : "Speak Answer";
    return;
  }

  if (state.recorder?.state === "recording") {
    state.recorder.stop();
    button.textContent = target === "symptoms" ? "Speak Symptoms" : "Speak Answer";
    return;
  }

  const startedWebSpeech = startWebSpeech(target, button);
  if (!startedWebSpeech) {
    await startMediaRecorder(target, button);
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
  setStatus(els.assistantStatus, "AI is thinking...", "loading");
  try {
    const data = await apiJson("/api/ask-question", {
      method: "POST",
      body: JSON.stringify({
        complaint: els.complaint.value,
        symptoms: els.symptoms.value,
        answers: state.answers
      })
    });
    state.currentQuestion = data.question;
    els.questionText.textContent = data.question;
    els.listenQuestion.disabled = false;
    setStatus(els.assistantStatus, "Question ready.", "success");
  } catch (error) {
    setStatus(els.assistantStatus, error.message, "error");
  }
});

els.listenQuestion.addEventListener("click", async () => {
  if (!state.currentQuestion) return;
  setStatus(els.assistantStatus, "Preparing audio...", "loading");

  // Try backend TTS first
  try {
    const response = await fetch("/api/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: state.currentQuestion })
    });
    if (response.ok) {
      const audioUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(audioUrl);
      audio.play();
      setStatus(els.assistantStatus, "Playing question audio.", "success");
      return;
    }
  } catch (err) {
    console.warn("Backend TTS request error, using browser speech synthesis:", err);
  }

  // Fallback to browser built-in SpeechSynthesis
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(state.currentQuestion);
    utterance.lang = "en-US";
    utterance.onstart = () => setStatus(els.assistantStatus, "Playing question audio.", "success");
    utterance.onerror = () => setStatus(els.assistantStatus, "Unable to play audio.", "error");
    window.speechSynthesis.speak(utterance);
  } else {
    setStatus(els.assistantStatus, "Text-to-speech is not supported on this browser.", "error");
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
  document.getElementById("askQuestion").click();
});

document.getElementById("generateSummary").addEventListener("click", async () => {
  setStatus(els.assistantStatus, "Generating summary...", "loading");
  try {
    const data = await apiJson("/api/generate-summary", {
      method: "POST",
      body: JSON.stringify({
        complaint: els.complaint.value,
        symptoms: els.symptoms.value,
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

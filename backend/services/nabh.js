const fs = require("fs");

const CONFIG_ERROR =
  "AI service is not configured. Please add the required NABH.CLOUD API key.";
const SERVICE_ERROR = "AI service is temporarily unavailable. Please try again.";

function getConfig() {
  return {
    apiKey: process.env.NABH_API_KEY,
    baseUrl: process.env.NABH_BASE_URL || "https://api.nabh.cloud/v1",
    llmModel: process.env.NABH_LLM_MODEL || "qwen3-5-397b",
    embeddingModel: process.env.NABH_EMBEDDING_MODEL || "nomic-embed-text",
    imageModel: process.env.NABH_IMAGE_MODEL || "stable-diffusion-xl",
    sttModel: process.env.NABH_STT_MODEL || "whisper-large-v3-turbo",
    ttsModel: process.env.NABH_TTS_MODEL || "kokoro-tts",
    ttsVoice: process.env.NABH_TTS_VOICE || "af_sarah"
  };
}

function ensureConfigured() {
  if (!getConfig().apiKey) {
    const error = new Error(CONFIG_ERROR);
    error.status = 503;
    error.code = "AI_NOT_CONFIGURED";
    throw error;
  }
}

async function parseJsonResponse(response) {
  const body = await response.text();
  let json = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const errorMsg =
      json?.error?.message ||
      json?.message ||
      (typeof json?.error === "string" ? json.error : null) ||
      (body && body.length < 300 ? body : null) ||
      SERVICE_ERROR;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.code = json?.error?.code || json?.code || "NABH_ERROR";
    throw error;
  }

  if (!json) {
    const error = new Error(SERVICE_ERROR);
    error.status = 502;
    error.code = "INVALID_AI_RESPONSE";
    throw error;
  }

  return json;
}

async function nabhJson(path, payload) {
  ensureConfigured();
  const { apiKey, baseUrl } = getConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return parseJsonResponse(response);
}

function safeJsonParse(text, fallback) {
  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

async function askQuestion({ complaint, symptoms, answers = [] }) {
  const { llmModel } = getConfig();
  const answerText = answers
    .map((item, index) => `Q${index + 1}: ${item.question}\nA${index + 1}: ${item.answer}`)
    .join("\n");

  const json = await nabhJson("/chat/completions", {
    model: llmModel,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are a patient history assistant. Ask one concise follow-up question at a time. Do not diagnose, prescribe, or recommend treatment. If enough information is collected, return DONE."
      },
      {
        role: "user",
        content: `Complaint: ${complaint}\nSymptoms: ${symptoms || "Not provided"}\nPrevious answers:\n${answerText || "None"}\nAsk the next most useful history question.`
      }
    ]
  });

  const question = json.choices?.[0]?.message?.content?.trim();
  if (!question) throw new Error(SERVICE_ERROR);
  return { question };
}

async function generateSummary({ complaint, symptoms, answers = [] }) {
  const { llmModel } = getConfig();
  const json = await nabhJson("/chat/completions", {
    model: llmModel,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Create a structured patient history summary from provided facts only. Do not diagnose, prescribe, triage, or recommend treatment. Return JSON with chiefComplaint, duration, symptoms, additionalInformation, importantInformation."
      },
      {
        role: "user",
        content: JSON.stringify({ complaint, symptoms, answers })
      }
    ]
  });

  const text = json.choices?.[0]?.message?.content || "";
  return safeJsonParse(text, {
    chiefComplaint: complaint,
    duration: "Not specified",
    symptoms: symptoms || "Not specified",
    additionalInformation: answers.map((item) => `${item.question}: ${item.answer}`).join("\n"),
    importantInformation: "No diagnosis or treatment recommendation generated."
  });
}

async function generateEmbedding(input) {
  const { embeddingModel } = getConfig();
  const json = await nabhJson("/embeddings", {
    model: embeddingModel,
    input
  });

  const embedding = json.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error(SERVICE_ERROR);
  return embedding;
}

async function speechToText(file) {
  ensureConfigured();
  const { apiKey, baseUrl, sttModel } = getConfig();
  const form = new FormData();
  const fileBuffer = fs.readFileSync(file.path);

  let audioFile;
  if (typeof File !== "undefined") {
    audioFile = new File([fileBuffer], file.originalname || "recording.webm", {
      type: file.mimetype || "audio/webm"
    });
  } else {
    audioFile = new Blob([fileBuffer], {
      type: file.mimetype || "audio/webm"
    });
  }

  form.append("model", sttModel);
  form.append("file", audioFile, file.originalname || "recording.webm");

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey
    },
    body: form
  });
  const json = await parseJsonResponse(response);
  const text = json.text || json.transcription || json.data?.text;
  if (!text) {
    throw new Error(json.error?.message || json.message || "No speech could be recognized.");
  }
  return { text };
}

async function textToSpeech(text) {
  ensureConfigured();
  const { apiKey, baseUrl, ttsModel, ttsVoice } = getConfig();
  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ttsModel,
      input: text,
      voice: ttsVoice,
      response_format: "mp3"
    })
  });

  if (!response.ok) {
    let errorBody = null;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }
    const errorMsg = errorBody?.error?.message || errorBody?.message || SERVICE_ERROR;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.code = errorBody?.error?.code || errorBody?.code || "NABH_ERROR";
    throw error;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    contentType: response.headers.get("content-type") || "audio/mpeg",
    buffer
  };
}

async function generateImage(prompt) {
  const { imageModel } = getConfig();
  const json = await nabhJson("/images/generations", {
    model: imageModel,
    prompt,
    n: 1,
    size: "1024x1024",
    response_format: "b64_json"
  });

  const image = json.data?.[0];
  if (image?.b64_json) {
    return `data:image/png;base64,${image.b64_json}`;
  }
  if (image?.url) return image.url;
  throw new Error(SERVICE_ERROR);
}

module.exports = {
  CONFIG_ERROR,
  SERVICE_ERROR,
  askQuestion,
  generateSummary,
  generateEmbedding,
  speechToText,
  textToSpeech,
  generateImage
};

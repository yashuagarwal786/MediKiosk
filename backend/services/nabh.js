const fs = require("fs");

const CONFIG_ERROR =
  "AI service is not configured. Please add the required NABH.CLOUD API key.";
const SERVICE_ERROR = "AI service is temporarily unavailable. Please try again.";

function getConfig() {
  return {
    apiKey: process.env.NABH_API_KEY,
    baseUrl: process.env.NABH_BASE_URL || "https://api.nabh.cloud/v1",
    llmModel: process.env.NABH_LLM_MODEL || "mistral-small-24b",
    embeddingModel: process.env.NABH_EMBEDDING_MODEL || "nomic-embed-text",
    imageModel: process.env.NABH_IMAGE_MODEL || "stable-diffusion-xl",
    sttModel: process.env.NABH_STT_MODEL || "whisper-large-v3-turbo",
    ttsModel: process.env.NABH_TTS_MODEL || "kokoro-tts",
    ttsVoice: process.env.NABH_TTS_VOICE || "af_bella"
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

function cleanLLMText(rawText) {
  if (!rawText || typeof rawText !== "string") return "";

  let text = rawText.trim();

  // Strip <think>...</think> or unclosed <think>... tags
  text = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();

  // Strip "Thinking Process: ..." or "Thought: ..." or "Reasoning: ..."
  if (/^(?:Thinking Process|Thought|Reasoning|Analysis|1\.\s*\*\*Analyze)/i.test(text) || text.includes("Thinking Process:")) {
    // If there is an explicit question line or marker:
    const questionMatch = text.match(/(?:Question|Follow-up|Next Question|Patient Question|Single next question):\s*([^\n\r]+)/i);
    if (questionMatch && questionMatch[1]) {
      text = questionMatch[1].trim();
    } else {
      // Find the last non-empty line that ends with a question mark and isn't reasoning
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const questionLines = lines.filter(l => 
        l.endsWith("?") && 
        !l.includes("**") && 
        !/^(?:Role|Task|Goal|Constraints|Input|Current State|\d+\.)/i.test(l)
      );
      if (questionLines.length > 0) {
        text = questionLines[questionLines.length - 1];
      } else {
        // Find any sentence ending in ?
        const sentences = text.match(/[^.?!]+(?:\?)/g);
        if (sentences && sentences.length > 0) {
          const cleanSentences = sentences
            .map(s => s.trim())
            .filter(s => !/^(?:Role|Task|Goal|Constraints|Input|Current State|\d+\.)/i.test(s));
          if (cleanSentences.length > 0) {
            text = cleanSentences[cleanSentences.length - 1];
          } else {
            text = "";
          }
        } else {
          text = "";
        }
      }
    }
  }

  // Remove leading bullets, numbers, quotes, or labels
  text = text.replace(/^(?:Question|Next Question|Follow-up Question|AI):\s*/i, "");
  text = text.replace(/^["'“”‘’]|["'“”‘’]$/g, "").trim();

  return text;
}

function safeJsonParse(text, fallback) {
  if (!text) return fallback;
  const cleaned = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
  try {
    const jsonStr = cleaned.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(jsonStr);
    return parsed.patientHistory || parsed;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return parsed.patientHistory || parsed;
      } catch {}
    }
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
    temperature: 0.2,
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content:
          "You are a medical intake assistant at a clinic kiosk. You MUST respond with ONLY the single follow-up question to ask the patient. Do NOT write 'Thinking Process', do NOT write any chain-of-thought, do NOT analyze, do NOT output explanations. Output ONLY the question string directly, or 'DONE' if enough history is collected."
      },
      {
        role: "user",
        content: `Patient Chief Complaint: ${complaint}\nPatient Symptoms: ${symptoms || "None provided"}\nHistory gathered so far:\n${answerText || "None"}\n\nAsk the single next most relevant clinical history question (e.g. duration, severity, fever temperature, or triggers). Output only the question text directly:`
      }
    ]
  });

  const message = json.choices?.[0]?.message;
  let question = cleanLLMText(message?.content || message?.reasoning || "");

  if (!question || question.length < 5) {
    if (!answers || answers.length === 0) {
      question = "How many days have you been experiencing these symptoms, and how severe is the discomfort?";
    } else if (answers.length === 1) {
      question = "Have you taken any medications or treatments for this, and did they provide any relief?";
    } else {
      question = "Are you experiencing any other related symptoms such as nausea, dizziness, or shortness of breath?";
    }
  }
  return { question };
}

async function generateSummary({ complaint, symptoms, answers = [] }) {
  const { llmModel } = getConfig();
  const json = await nabhJson("/chat/completions", {
    model: llmModel,
    temperature: 0.2,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content:
          "You are a clinical assistant. Output a structured patient history summary in valid JSON format only, with keys: chiefComplaint, duration, symptoms, additionalInformation, importantInformation. Do not output any markdown formatting, preamble, or thinking process."
      },
      {
        role: "user",
        content: JSON.stringify({ complaint, symptoms, answers })
      }
    ]
  });

  const message = json.choices?.[0]?.message;
  const text = message?.content || message?.reasoning || "";

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
  const filename = file.originalname && file.originalname.includes(".") ? file.originalname : "recording.webm";
  const mimeType = file.mimetype || "audio/webm";

  if (typeof File !== "undefined") {
    audioFile = new File([fileBuffer], filename, { type: mimeType });
  } else {
    audioFile = new Blob([fileBuffer], { type: mimeType });
  }

  form.append("model", sttModel);
  form.append("file", audioFile, filename);

  const modelUrl = `${baseUrl}/models/${sttModel}/audio/transcriptions`;
  const fallbackUrl = `${baseUrl}/audio/transcriptions`;

  let response = await fetch(modelUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey
    },
    body: form
  });

  if (response.status === 404) {
    response = await fetch(fallbackUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey
      },
      body: form
    });
  }

  const json = await parseJsonResponse(response);
  const text = json.text || json.transcription || json.data?.text;
  if (!text) {
    throw new Error(json.error?.message || json.message || "No speech could be recognized. Please speak closer to the mic.");
  }
  return { text };
}

async function textToSpeech(text) {
  ensureConfigured();
  const { apiKey, baseUrl, ttsModel, ttsVoice } = getConfig();
  const modelUrl = `${baseUrl}/models/${ttsModel}/audio/speech`;
  const fallbackUrl = `${baseUrl}/audio/speech`;

  const payload = {
    model: ttsModel,
    input: text,
    voice: ttsVoice,
    response_format: "mp3"
  };

  let response = await fetch(modelUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 404) {
    response = await fetch(fallbackUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  }

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

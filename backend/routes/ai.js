const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const {
  askQuestion,
  generateSummary,
  generateEmbedding,
  speechToText,
  textToSpeech,
  generateImage,
  CONFIG_ERROR,
  SERVICE_ERROR
} = require("../services/nabh");
const { all, get } = require("../database");

const router = express.Router();
const upload = multer({
  dest: path.join(__dirname, "..", "..", "data", "uploads"),
  limits: { fileSize: 25 * 1024 * 1024 }
});

function sendAiError(res, error) {
  const configuredMessage = error.code === "AI_NOT_CONFIGURED" ? CONFIG_ERROR : SERVICE_ERROR;
  res.status(error.status || 503).json({
    error: configuredMessage,
    code: error.code || "AI_ERROR"
  });
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    magA += a[index] * a[index];
    magB += b[index] * b[index];
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

router.post("/speech-to-text", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Please record audio before converting speech." });
  }

  try {
    const result = await speechToText(req.file);
    res.json(result);
  } catch (error) {
    sendAiError(res, error);
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

router.post("/text-to-speech", async (req, res) => {
  const text = req.body.text?.trim();
  if (!text) return res.status(400).json({ error: "Text is required for speech playback." });

  try {
    const audio = await textToSpeech(text);
    res.setHeader("Content-Type", audio.contentType);
    res.send(audio.buffer);
  } catch (error) {
    sendAiError(res, error);
  }
});

router.post("/ask-question", async (req, res) => {
  const { complaint, symptoms, answers } = req.body;
  if (!complaint?.trim() && !symptoms?.trim()) {
    return res.status(400).json({ error: "Please describe the complaint before asking AI." });
  }

  try {
    const result = await askQuestion({ complaint, symptoms, answers });
    res.json(result);
  } catch (error) {
    sendAiError(res, error);
  }
});

router.post("/generate-summary", async (req, res) => {
  const { complaint, symptoms, answers } = req.body;
  if (!complaint?.trim() && !symptoms?.trim()) {
    return res.status(400).json({ error: "Please add case information before generating a summary." });
  }

  try {
    const summary = await generateSummary({ complaint, symptoms, answers });
    res.json({ summary });
  } catch (error) {
    sendAiError(res, error);
  }
});

router.post("/generate-embedding", async (req, res) => {
  const text = req.body.text?.trim();
  if (!text) return res.status(400).json({ error: "Text is required to generate an embedding." });

  try {
    const embedding = await generateEmbedding(text);
    res.json({ embedding });
  } catch (error) {
    sendAiError(res, error);
  }
});

router.post("/similar-cases", async (req, res) => {
  const caseId = Number(req.body.caseId);
  if (!Number.isInteger(caseId)) return res.status(400).json({ error: "A valid case ID is required." });

  try {
    const current = await get("SELECT * FROM cases WHERE id = ?", [caseId]);
    if (!current) return res.status(404).json({ error: "Case not found." });

    let currentEmbedding = current.embedding ? JSON.parse(current.embedding) : null;
    if (!currentEmbedding) {
      currentEmbedding = await generateEmbedding(
        `${current.complaint}\n${current.symptoms || ""}\n${current.history || ""}\n${current.ai_summary || ""}`
      );
    }

    const rows = await all(
      "SELECT id, name, age, complaint, ai_summary, embedding, created_at FROM cases WHERE id != ? AND embedding IS NOT NULL ORDER BY created_at DESC",
      [caseId]
    );

    const similarCases = rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        age: row.age,
        complaint: row.complaint,
        ai_summary: row.ai_summary,
        created_at: row.created_at,
        similarity: cosineSimilarity(currentEmbedding, JSON.parse(row.embedding))
      }))
      .filter((row) => row.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    res.json({ similarCases });
  } catch (error) {
    sendAiError(res, error);
  }
});

router.post("/generate-image", async (req, res) => {
  const complaint = req.body.complaint?.trim();
  if (!complaint) return res.status(400).json({ error: "Complaint is required to generate an illustration." });

  try {
    const imageUrl = await generateImage(
      `Simple educational healthcare illustration about ${complaint}. No diagnosis, no gore, clean clinical teaching style.`
    );
    res.json({ imageUrl });
  } catch (error) {
    sendAiError(res, error);
  }
});

module.exports = router;

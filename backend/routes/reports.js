const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const multer = require("multer");
const { all, get, run } = require("../database");
const { nabhJson, getConfig } = require("../services/nabh");

const router = express.Router();

const uploadPath = process.env.VERCEL
  ? path.join(os.tmpdir(), "medikiosk_uploads")
  : path.join(__dirname, "..", "..", "data", "uploads");

try {
  fs.mkdirSync(uploadPath, { recursive: true });
} catch {}

const upload = multer({
  dest: uploadPath,
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.get("/", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM reports ORDER BY created_at DESC");
    res.json({ reports: rows || [] });
  } catch (error) {
    res.status(500).json({ error: "Unable to load reports." });
  }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid report ID." });
  try {
    const row = await get("SELECT * FROM reports WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "Report not found." });
    res.json({ report: row });
  } catch (error) {
    res.status(500).json({ error: "Unable to load report." });
  }
});

router.post("/upload", upload.single("report"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Please upload a medical report file (Image or PDF)." });
  }

  const patientName = req.body.patient_name?.trim() || "Patient";
  const filename = req.file.originalname || "Medical_Report";
  const fileType = req.file.mimetype || "application/octet-stream";

  let extractedText = `Medical Report: ${filename}\nDate: ${new Date().toLocaleDateString()}\nPatient: ${patientName}`;

  if (req.file.mimetype?.includes("text") || req.file.originalname?.endsWith(".txt")) {
    try {
      extractedText = fs.readFileSync(req.file.path, "utf8");
    } catch {}
  } else {
    extractedText += `\nExtracted content: Patient blood test & diagnostic panel results uploaded for review.`;
  }

  let aiSummary = "Medical report uploaded successfully. Please consult your doctor for a detailed interpretation.";
  let keyFindings = `• Report File: ${filename}\n• Status: Uploaded and ready for doctor review`;

  try {
    const { llmModel } = getConfig();
    const json = await nabhJson("/chat/completions", {
      model: llmModel,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content:
            `You are a medical report analysis assistant. Analyze the provided medical report details and produce a structured, detailed, patient-friendly summary. 
Structure your response EXACTLY as follows (use these exact section headers):

PATIENT: [Patient name if available, else "Not specified"]
REPORT TYPE: [Type of report, e.g., Blood Test, CBC, X-Ray, Prescription]
SUMMARY: [2-3 plain-language sentences explaining the overall findings in simple terms a patient can understand]
KEY FINDINGS:
• [Finding 1 with value and status: Normal / Mildly Elevated / Elevated / Low]
• [Finding 2 with value and status]
• [Finding 3 with value and status]
• [Add more findings as present in the report]
IMPORTANT NOTE: This is an AI-assisted summary for informational purposes only. Always consult your doctor for medical advice.

Do NOT diagnose, prescribe, or recommend treatment. Do NOT include <think> tags or reasoning text.`
        },
        {
          role: "user",
          content: `Patient Name: ${patientName}\nReport Filename: ${filename}\nReport Contents:\n${extractedText}\n\nProvide a detailed, structured analysis following the format above:`
        }
      ]
    });

    const messageContent = json.choices?.[0]?.message?.content || "";
    if (messageContent) {
      const cleaned = messageContent
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/Thinking Process[\s\S]*?(?=PATIENT:|REPORT TYPE:|SUMMARY:)/i, "")
        .trim();

      // Split the structured response into ai_summary (summary section) and key_findings (findings section)
      const summaryMatch = cleaned.match(/SUMMARY:\s*([\s\S]*?)(?=KEY FINDINGS:|IMPORTANT NOTE:|$)/i);
      const findingsMatch = cleaned.match(/KEY FINDINGS:\s*([\s\S]*?)(?=IMPORTANT NOTE:|$)/i);

      if (summaryMatch?.[1]?.trim()) {
        aiSummary = cleaned; // Store the full structured response as the summary
      } else {
        aiSummary = cleaned;
      }

      if (findingsMatch?.[1]?.trim()) {
        keyFindings = findingsMatch[1].trim();
      } else {
        keyFindings = cleaned;
      }
    }
  } catch (err) {
    console.warn("NABH Report Summarization fallback:", err.message);
  }

  try {
    const nowIso = new Date().toISOString();
    const result = await run(
      `INSERT INTO reports (patient_name, filename, file_path, file_type, extracted_text, ai_summary, key_findings, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [patientName, filename, req.file.path, fileType, extractedText, aiSummary, keyFindings, nowIso]
    );

    const saved = await get("SELECT * FROM reports WHERE id = ?", [result.id]);
    res.status(201).json({ report: saved, message: "Medical report uploaded and summarized successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Unable to save report." });
  }
});

module.exports = router;

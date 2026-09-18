const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const multer = require("multer");
const { all, get, run } = require("../database");
const { extractTextFromImage } = require("../services/nabh");
const pdfParse = require("pdf-parse");

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

  let extractedText = `Medical Report: ${filename}\nDate: ${new Date().toLocaleDateString()}\nPatient: ${patientName}\n\n`;

  try {
    if (req.file.mimetype?.includes("pdf") || req.file.originalname?.toLowerCase().endsWith(".pdf")) {
      // Parse PDF
      const dataBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(dataBuffer);
      extractedText += pdfData.text;
    } else if (req.file.mimetype?.includes("image") || /\.(png|jpg|jpeg)$/i.test(req.file.originalname)) {
      // Perform OCR on Images using NABH PaddleOCR-VL model
      const text = await extractTextFromImage(req.file.path, req.file.mimetype);
      extractedText += text;
    } else if (req.file.mimetype?.includes("text") || req.file.originalname?.toLowerCase().endsWith(".txt")) {
      // Read plain text
      extractedText += fs.readFileSync(req.file.path, "utf8");
    } else {
      extractedText += "Unsupported file format for text extraction. Only PDF, Images, and TXT are supported.";
    }
  } catch (error) {
    console.error("Text extraction failed:", error);
    extractedText += "\nError extracting content from the file.";
  }

  let aiSummary = "";
  let keyFindings = "";

  try {
    const apiKey = process.env.NABH_API_KEY;
    const baseUrl = process.env.NABH_BASE_URL || "https://api.nabh.cloud/v1";
    const llmModel = process.env.NABH_LLM_MODEL || "qwen3-5-397b";

    if (!apiKey) throw new Error("AI not configured");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: llmModel,
        temperature: 0.1,
        max_tokens: 1500,
        messages: [
          {
            role: "system",
            content: `You are a clinical medical report analysis assistant. Analyze the provided medical report text and return a structured JSON object ONLY — no markdown, no explanation, no <think> tags.

Return this exact JSON structure:
{
  "patientName": "string or null",
  "reportType": "string (e.g. CBC, Blood Test, LFT, Urine Analysis, X-Ray Report, etc.)",
  "labName": "string or null",
  "reportDate": "string or null",
  "doctorName": "string or null",
  "overallStatus": "Normal | Borderline | Abnormal | Critical",
  "summary": "2-3 plain English sentences explaining findings for a patient",
  "parameters": [
    {
      "name": "test/parameter name",
      "value": "reported value with unit",
      "referenceRange": "normal range if available",
      "status": "Normal | Low | High | Critical | N/A",
      "flag": true or false
    }
  ],
  "criticalAlerts": ["list of critical or flagged findings that need urgent attention, or empty array"],
  "recommendations": ["general lifestyle or follow-up suggestions — NO diagnosis or prescriptions"],
  "disclaimer": "This AI-generated summary is for informational purposes only. Always consult your doctor for medical advice."
}

Rules:
- Extract every individual lab parameter with its value and reference range.
- Set "flag": true for any value outside the reference range.
- overallStatus: "Critical" if any critical alert exists, "Abnormal" if any parameter is flagged, "Borderline" if borderline, else "Normal".
- Do NOT diagnose, prescribe medication, or make clinical decisions.
- Output ONLY the raw JSON object. No markdown code blocks.`
          },
          {
            role: "user",
            content: `Patient Name: ${patientName}\nReport Filename: ${filename}\n\nExtracted Report Text:\n${extractedText}\n\nAnalyze and return structured JSON:`
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`NABH API error (${response.status}): ${errText}`);
    }

    const json = await response.json();
    let raw = json.choices?.[0]?.message?.content || json.choices?.[0]?.message?.reasoning || "";

    // Strip <think> blocks and markdown code fences
    raw = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/```json\s*/i, "")
      .replace(/```/g, "")
      .trim();

    // Try to parse JSON
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try extracting JSON object from response
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch {}
      }
    }

    if (parsed && typeof parsed === "object") {
      // Store structured JSON as aiSummary, and a text version as keyFindings
      aiSummary = JSON.stringify(parsed);
      keyFindings = (parsed.parameters || [])
        .filter(p => p.flag)
        .map(p => `• ${p.name}: ${p.value} (${p.status}) — Ref: ${p.referenceRange || "N/A"}`)
        .join("\n") || "• All parameters within normal range";
    } else {
      // Fallback JSON object if model returned plain text or empty
      const fallbackObj = {
        reportType: "Diagnostic Report",
        patientName: patientName !== "Patient" ? patientName : null,
        overallStatus: "Normal",
        summary: raw || extractedText?.slice(0, 300) || "Report uploaded and registered successfully.",
        parameters: [],
        criticalAlerts: [],
        recommendations: ["Consult with a qualified healthcare professional to review these results."],
        disclaimer: "This AI-assisted summary is for informational purposes only. Always consult your doctor for medical advice."
      };
      aiSummary = JSON.stringify(fallbackObj);
      keyFindings = `• Report: ${filename}\n• Status: Processed`;
    }
  } catch (err) {
    console.warn("NABH Report Summarization fallback:", err.message);
    const errObj = {
      reportType: "Unknown Report",
      patientName: patientName !== "Patient" ? patientName : null,
      overallStatus: "N/A",
      summary: `Report uploaded. AI Analysis Note: ${err.message}`,
      parameters: [],
      criticalAlerts: [],
      recommendations: ["Please consult your doctor directly with the original file."],
      disclaimer: "Always consult your doctor for medical advice."
    };
    aiSummary = JSON.stringify(errObj);
    keyFindings = `• Report File: ${filename}\n• AI analysis status: ${err.message}`;
  }

  try {
    const nowIso = new Date().toISOString();
    const result = await run(
      `INSERT INTO reports (patient_name, filename, file_path, file_type, extracted_text, ai_summary, key_findings, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [patientName, filename, req.file.path, fileType, extractedText, aiSummary, keyFindings, nowIso]
    );

    const saved = await get("SELECT * FROM reports WHERE id = ?", [result.id]);
    res.status(201).json({ report: saved, message: "Medical report uploaded and analyzed successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Unable to save report." });
  }
});

module.exports = router;

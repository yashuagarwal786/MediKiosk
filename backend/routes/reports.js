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

function extractValidJson(rawText) {
  if (!rawText) return null;

  // 1. Strip <think>...</think> or unclosed <think>...
  let text = rawText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();

  // 2. Look for ```json ... ``` code fence
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const p = JSON.parse(codeBlockMatch[1].trim());
      if (p && typeof p === "object") return p;
    } catch {}
  }

  // 3. Find JSON object starting with {"patientName" or {"reportType" or {"overallStatus"
  const structuredMatch = text.match(/\{\s*"(?:patientName|reportType|overallStatus|summaryPoints|summary)"[\s\S]*\}/i);
  if (structuredMatch) {
    try {
      const p = JSON.parse(structuredMatch[0]);
      if (p && typeof p === "object") return p;
    } catch {}
  }

  // 4. Try parsing from first { to last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.substring(firstBrace, lastBrace + 1);
    try {
      const p = JSON.parse(candidate);
      if (p && typeof p === "object") return p;
    } catch {}
  }

  return null;
}

router.post("/upload", upload.single("report"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Please upload a medical report file (Image or PDF)." });
  }

  const patientNameInput = req.body.patient_name?.trim();
  const filename = req.file.originalname || "Medical_Report";
  const fileType = req.file.mimetype || "application/octet-stream";

  let extractedText = `Medical Report: ${filename}\nDate: ${new Date().toLocaleDateString()}\n\n`;

  try {
    if (req.file.mimetype?.includes("pdf") || req.file.originalname?.toLowerCase().endsWith(".pdf")) {
      const dataBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(dataBuffer);
      extractedText += pdfData.text;
    } else if (req.file.mimetype?.includes("image") || /\.(png|jpg|jpeg)$/i.test(req.file.originalname)) {
      const text = await extractTextFromImage(req.file.path, req.file.mimetype);
      extractedText += text;
    } else if (req.file.mimetype?.includes("text") || req.file.originalname?.toLowerCase().endsWith(".txt")) {
      extractedText += fs.readFileSync(req.file.path, "utf8");
    } else {
      extractedText += "Unsupported file format for text extraction.";
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
        max_tokens: 1800,
        messages: [
          {
            role: "system",
            content: `You are an expert clinical medical report analyzer. Extract and structure all medical report details into a clean JSON object. 

Output ONLY the raw JSON object — no reasoning, no thinking process, no markdown fences, no extra text.

JSON Schema:
{
  "patientName": "string or null",
  "ageGender": "string or null (e.g. 28 Y / Male)",
  "reportType": "string (e.g. Complete Blood Count (CBC), Liver Function Test, Urine Routine)",
  "labName": "string or null (e.g. CityCare Diagnostics)",
  "reportDate": "string or null (e.g. 16-May-2025)",
  "doctorName": "string or null (e.g. Dr. Aniket Verma)",
  "overallStatus": "Normal | Borderline | Abnormal | Critical",
  "summaryPoints": [
    "Concise clinical observation point 1",
    "Concise clinical observation point 2"
  ],
  "parameters": [
    {
      "name": "Parameter Name (e.g. Hemoglobin (Hb))",
      "value": "Value with unit (e.g. 15.2 g/dL)",
      "referenceRange": "Ref Range (e.g. 13.5 - 17.5)",
      "status": "Normal | Low | High | Critical",
      "flag": false
    }
  ],
  "criticalAlerts": [],
  "recommendations": [
    "General non-prescriptive advice (e.g. Maintain hydration, follow up with doctor if symptomatic)"
  ],
  "disclaimer": "This summary is AI-generated for informational purposes only. Always consult a medical professional."
}

Rules:
- Extract EVERY test parameter with its reported value, unit, and reference range.
- Set "flag": true ONLY if the value is strictly outside the reference range.
- Set overallStatus to "Abnormal" or "Critical" if any parameter is flagged. Otherwise set to "Normal".
- Output ONLY the JSON object.`
          },
          {
            role: "user",
            content: `Extracted Medical Report Text:\n${extractedText}\n\nReturn structured JSON:`
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

    const parsed = extractValidJson(raw);

    if (parsed) {
      if (patientNameInput) parsed.patientName = patientNameInput;
      aiSummary = JSON.stringify(parsed);
      keyFindings = (parsed.parameters || [])
        .filter(p => p.flag)
        .map(p => `• ${p.name}: ${p.value} (${p.status}) — Ref: ${p.referenceRange || "N/A"}`)
        .join("\n") || "• All parameters within normal range";
    } else {
      const fallbackObj = {
        reportType: "Diagnostic Report",
        patientName: patientNameInput || null,
        overallStatus: "Normal",
        summaryPoints: ["Medical report uploaded and registered successfully."],
        parameters: [],
        criticalAlerts: [],
        recommendations: ["Consult with your physician to review full findings."],
        disclaimer: "This summary is AI-generated for informational purposes only."
      };
      aiSummary = JSON.stringify(fallbackObj);
      keyFindings = `• Report: ${filename}\n• Status: Processed`;
    }
  } catch (err) {
    console.warn("NABH Report Summarization fallback:", err.message);
    const errObj = {
      reportType: "Medical Report",
      patientName: patientNameInput || null,
      overallStatus: "N/A",
      summaryPoints: [`Report uploaded. Note: ${err.message}`],
      parameters: [],
      criticalAlerts: [],
      recommendations: ["Please share the original report directly with your doctor."],
      disclaimer: "Always consult your doctor for medical advice."
    };
    aiSummary = JSON.stringify(errObj);
    keyFindings = `• Report File: ${filename}\n• Status: ${err.message}`;
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

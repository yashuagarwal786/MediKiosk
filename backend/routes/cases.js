const express = require("express");
const { all, get, run, getAllCases } = require("../database");
const { generateEmbedding } = require("../services/nabh");

const router = express.Router();

function compactSummary(summary) {
  if (!summary) return "";
  if (typeof summary === "string") return summary;
  return [
    `Chief Complaint: ${summary.chiefComplaint || "Not specified"}`,
    `Duration: ${summary.duration || "Not specified"}`,
    `Symptoms: ${Array.isArray(summary.symptoms) ? summary.symptoms.join(", ") : summary.symptoms || "Not specified"}`,
    `Additional Information: ${summary.additionalInformation || "Not specified"}`,
    `Important Information: ${summary.importantInformation || "History assistant only. No diagnosis generated."}`
  ].join("\n");
}

router.get("/", async (req, res) => {
  const search = req.query.search?.trim();
  try {
    let rows;
    if (search) {
      rows = await all(
        `SELECT * FROM cases
         WHERE name LIKE ? OR complaint LIKE ? OR ai_summary LIKE ?
         ORDER BY created_at DESC`,
        [`%${search}%`, `%${search}%`, `%${search}%`]
      );
    } else {
      rows = await getAllCases();
    }
    res.json({ cases: rows || [] });
  } catch (error) {
    res.status(500).json({ error: "Unable to load cases." });
  }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid case ID." });

  try {
    const row = await get("SELECT * FROM cases WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "Case not found." });
    res.json({ case: row });
  } catch (error) {
    res.status(500).json({ error: "Unable to load case." });
  }
});

router.post("/", async (req, res) => {
  const { name, age, gender, complaint, symptoms, history, ai_summary } = req.body;
  if (!name?.trim() || !age || !gender?.trim() || !complaint?.trim()) {
    return res.status(400).json({ error: "Name, age, gender, and complaint are required." });
  }

  const summaryText = compactSummary(ai_summary);
  const caseText = `${complaint}\n${symptoms || ""}\n${history || ""}\n${summaryText}`;
  let embedding = null;
  let aiWarning = null;

  try {
    embedding = await generateEmbedding(caseText);
  } catch (error) {
    aiWarning =
      error.code === "AI_NOT_CONFIGURED"
        ? "AI service is not configured. Please add the required NABH.CLOUD API key."
        : "AI service is temporarily unavailable. Please try again.";
  }

  try {
    const result = await run(
      `INSERT INTO cases
       (name, age, gender, complaint, symptoms, history, ai_summary, embedding, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        Number(age),
        gender.trim(),
        complaint.trim(),
        symptoms?.trim() || "",
        history?.trim() || "",
        summaryText,
        embedding ? JSON.stringify(embedding) : null,
        "Pending"
      ]
    );
    const saved = await get("SELECT * FROM cases WHERE id = ?", [result.id]);
    res.status(201).json({ case: saved, warning: aiWarning });
  } catch (error) {
    res.status(500).json({ error: "Unable to save case." });
  }
});

router.patch("/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body.status?.trim();
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid case ID." });
  if (!["Pending", "Completed"].includes(status)) {
    return res.status(400).json({ error: "Status must be Pending or Completed." });
  }

  try {
    await run("UPDATE cases SET status = ? WHERE id = ?", [status, id]);
    const row = await get("SELECT * FROM cases WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "Case not found." });
    res.json({ case: row });
  } catch (error) {
    res.status(500).json({ error: "Unable to update case status." });
  }
});

module.exports = router;

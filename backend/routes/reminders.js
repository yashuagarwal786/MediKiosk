const express = require("express");
const { all, get, run } = require("../database");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM reminders ORDER BY status ASC, created_at DESC");
    res.json({ reminders: rows || [] });
  } catch (error) {
    res.status(500).json({ error: "Unable to load medicine reminders." });
  }
});

router.post("/", async (req, res) => {
  const { patient_name, medicine_name, dosage, time, frequency } = req.body;
  if (!medicine_name?.trim() || !dosage?.trim() || !time?.trim()) {
    return res.status(400).json({ error: "Medicine name, dosage, and time are required." });
  }

  try {
    const nowIso = new Date().toISOString();
    const result = await run(
      `INSERT INTO reminders (patient_name, medicine_name, dosage, time, frequency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        patient_name?.trim() || "Rahul Sharma",
        medicine_name.trim(),
        dosage.trim(),
        time.trim(),
        frequency?.trim() || "Daily",
        "Active",
        nowIso
      ]
    );

    const saved = await get("SELECT * FROM reminders WHERE id = ?", [result.id]);
    res.status(201).json({ reminder: saved, message: "Medicine reminder added successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Unable to save medicine reminder." });
  }
});

router.patch("/:id/toggle", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid reminder ID." });

  try {
    const existing = await get("SELECT * FROM reminders WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "Reminder not found." });

    const newStatus = existing.status === "Active" ? "Completed" : "Active";
    await run("UPDATE reminders SET status = ? WHERE id = ?", [newStatus, id]);

    const updated = await get("SELECT * FROM reminders WHERE id = ?", [id]);
    res.json({ reminder: updated, message: `Status updated to ${newStatus}.` });
  } catch (error) {
    res.status(500).json({ error: "Unable to update reminder status." });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid reminder ID." });

  try {
    await run("DELETE FROM reminders WHERE id = ?", [id]);
    res.json({ message: "Reminder deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: "Unable to delete reminder." });
  }
});

module.exports = router;

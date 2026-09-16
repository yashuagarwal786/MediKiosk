const path = require("path");
const fs = require("fs");
const os = require("os");
const sqlite3 = require("sqlite3").verbose();

function getDbPath() {
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "medikiosk_database.sqlite");
  }
  const defaultDir = path.join(__dirname, "..", "data");
  try {
    fs.mkdirSync(defaultDir, { recursive: true });
    return path.join(defaultDir, "database.sqlite");
  } catch {
    return path.join(os.tmpdir(), "medikiosk_database.sqlite");
  }
}

const dbPath = getDbPath();
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

async function seedDefaultCases() {
  const countRow = await get("SELECT COUNT(*) AS count FROM cases");
  if (!countRow || countRow.count === 0) {
    const nowIso = new Date().toISOString();
    await run(
      `INSERT INTO cases (name, age, gender, complaint, symptoms, history, ai_summary, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "Rahul Sharma",
        34,
        "Male",
        "High fever and dry cough",
        "Cold, dry cough, body aches, mild headache",
        "Q1: How long have you had fever?\nA1: 3 days\nQ2: Any difficulty breathing?\nA2: Mild shortness of breath when walking",
        "Chief Complaint: High fever and dry cough\nDuration: 3 days\nSymptoms: Cold, dry cough, body aches, mild headache, mild shortness of breath\nAdditional Information: Symptoms started 3 days ago, worsening slightly.\nImportant Information: History support only. No diagnosis generated.",
        "Pending",
        nowIso
      ]
    );
    await run(
      `INSERT INTO cases (name, age, gender, complaint, symptoms, history, ai_summary, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "Priya Patel",
        28,
        "Female",
        "Severe migraine and light sensitivity",
        "Throbbing headache on left side, nausea, photophobia",
        "Q1: When did the headache start?\nA1: Early this morning\nQ2: Have you taken any pain relief?\nA2: Paracetamol with no relief",
        "Chief Complaint: Severe migraine and light sensitivity\nDuration: 12 hours\nSymptoms: Left-sided throbbing headache, nausea, sensitivity to bright light\nAdditional Information: Paracetamol taken without significant relief.\nImportant Information: History support only. No diagnosis generated.",
        "Completed",
        nowIso
      ]
    );
  }

  const reminderCount = await get("SELECT COUNT(*) AS count FROM reminders");
  if (!reminderCount || reminderCount.count === 0) {
    const nowIso = new Date().toISOString();
    await run(
      `INSERT INTO reminders (patient_name, medicine_name, dosage, time, frequency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["Rahul Sharma", "Paracetamol 650mg", "1 Tablet", "08:00 AM", "After Breakfast", "Active", nowIso]
    );
    await run(
      `INSERT INTO reminders (patient_name, medicine_name, dosage, time, frequency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["Rahul Sharma", "Azithromycin 500mg", "1 Tablet", "02:00 PM", "Once Daily", "Active", nowIso]
    );
    await run(
      `INSERT INTO reminders (patient_name, medicine_name, dosage, time, frequency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["Rahul Sharma", "Vitamin C & Zinc", "1 Chewable", "09:00 PM", "After Dinner", "Completed", nowIso]
    );
  }

  const reportCount = await get("SELECT COUNT(*) AS count FROM reports");
  if (!reportCount || reportCount.count === 0) {
    const nowIso = new Date().toISOString();
    await run(
      `INSERT INTO reports (patient_name, filename, file_path, file_type, extracted_text, ai_summary, key_findings, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "Rahul Sharma",
        "Complete_Blood_Count_Report.pdf",
        "/data/uploads/sample_cbc.pdf",
        "application/pdf",
        "Hemoglobin: 13.5 g/dL. Total WBC Count: 11,200 /mcL (Elevated). Platelet Count: 240,000 /mcL.",
        "Patient exhibits mild leukocytosis (elevated WBC count) consistent with a viral or bacterial immune response. Red blood cell count and platelets are within normal ranges.",
        "• WBC Count: 11,200 /mcL (Mildly Elevated)\n• Hemoglobin: 13.5 g/dL (Normal)\n• Platelets: 240,000 /mcL (Normal)",
        nowIso
      ]
    );
  }
}

async function initDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      complaint TEXT NOT NULL,
      symptoms TEXT,
      history TEXT,
      ai_summary TEXT,
      embedding TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_name TEXT DEFAULT 'Patient',
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      extracted_text TEXT,
      ai_summary TEXT,
      key_findings TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_name TEXT DEFAULT 'Patient',
      medicine_name TEXT NOT NULL,
      dosage TEXT NOT NULL,
      time TEXT NOT NULL,
      frequency TEXT DEFAULT 'Daily',
      status TEXT DEFAULT 'Active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await seedDefaultCases();
}

async function ensureDatabaseSeeded() {
  await initDatabase();
  let rows = await all("SELECT * FROM cases ORDER BY created_at DESC");
  if (!rows || rows.length === 0) {
    await seedDefaultCases();
    rows = await all("SELECT * FROM cases ORDER BY created_at DESC");
  }
  return rows;
}

module.exports = {
  db,
  run,
  get,
  all,
  initDatabase,
  ensureDatabaseSeeded
};

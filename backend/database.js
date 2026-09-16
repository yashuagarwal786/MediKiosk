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

  const countRow = await get("SELECT COUNT(*) AS count FROM cases");
  if (countRow && countRow.count === 0) {
    await run(
      `INSERT INTO cases (name, age, gender, complaint, symptoms, history, ai_summary, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "Rahul Sharma",
        34,
        "Male",
        "High fever and dry cough",
        "Cold, dry cough, body aches, mild headache",
        "Q1: How long have you had fever?\nA1: 3 days\nQ2: Any difficulty breathing?\nA2: Mild shortness of breath when walking",
        "Chief Complaint: High fever and dry cough\nDuration: 3 days\nSymptoms: Cold, dry cough, body aches, mild headache, mild shortness of breath\nAdditional Information: Symptoms started 3 days ago, worsening slightly.\nImportant Information: History support only. No diagnosis generated.",
        "Pending"
      ]
    );
    await run(
      `INSERT INTO cases (name, age, gender, complaint, symptoms, history, ai_summary, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "Priya Patel",
        28,
        "Female",
        "Severe migraine and light sensitivity",
        "Throbbing headache on left side, nausea, photophobia",
        "Q1: When did the headache start?\nA1: Early this morning\nQ2: Have you taken any pain relief?\nA2: Paracetamol with no relief",
        "Chief Complaint: Severe migraine and light sensitivity\nDuration: 12 hours\nSymptoms: Left-sided throbbing headache, nausea, sensitivity to bright light\nAdditional Information: Paracetamol taken without significant relief.\nImportant Information: History support only. No diagnosis generated.",
        "Completed"
      ]
    );
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDatabase
};

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "..", "data", "database.sqlite");
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
}

module.exports = {
  db,
  run,
  get,
  all,
  initDatabase
};

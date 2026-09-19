const path = require("path");
const fs = require("fs");
const os = require("os");
const sqlite3 = require("sqlite3").verbose();
const { Pool } = require("pg");

const isPg = Boolean(process.env.DATABASE_URL);
let pgPool = null;
let sqliteDb = null;

console.log(`[DB] Using ${isPg ? 'PostgreSQL' : 'SQLite'} database`);
if (isPg) {
  console.log(`[DB] DATABASE_URL: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false }
  });
  
  pgPool.on('error', (err) => {
    console.error('[DB] Unexpected PostgreSQL pool error:', err);
  });
  
  // Test connection immediately
  pgPool.query('SELECT NOW()')
    .then(() => console.log('[DB] PostgreSQL connection verified'))
    .catch(err => console.error('[DB] PostgreSQL connection failed:', err.message));
} else {
  function getDbPath() {
    if (process.env.VERCEL) {
      return path.join(os.tmpdir(), "medikiosk_database.sqlite");
    }
    const defaultDir = path.join(__dirname, "..", "data");
    try {
      if (!fs.existsSync(defaultDir)) {
        fs.mkdirSync(defaultDir, { recursive: true });
      }
      return path.join(defaultDir, "database.sqlite");
    } catch (err) {
      return path.join(os.tmpdir(), "medikiosk_database.sqlite");
    }
  }
  sqliteDb = new sqlite3.Database(getDbPath());
}

function convertSql(sql) {
  if (!isPg) return sql;
  let index = 1;
  let converted = sql.replace(/\?/g, () => `$${index++}`);
  converted = converted.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY");
  converted = converted.replace(/CURRENT_TIMESTAMP/gi, "NOW()");
  return converted;
}

async function run(sql, params = []) {
  if (isPg) {
    let pgSql = convertSql(sql);
    if (/^\s*INSERT/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
      pgSql += " RETURNING id";
    }
    const res = await pgPool.query(pgSql, params);
    const lastID = res.rows[0]?.id;
    return { id: lastID, changes: res.rowCount };
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function onRun(error) {
        if (error) reject(error);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
}

async function get(sql, params = []) {
  if (isPg) {
    const res = await pgPool.query(convertSql(sql), params);
    return res.rows[0] || null;
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (error, row) => {
        if (error) reject(error);
        else resolve(row || null);
      });
    });
  }
}

async function all(sql, params = []) {
  if (isPg) {
    const res = await pgPool.query(convertSql(sql), params);
    return res.rows || [];
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (error, rows) => {
        if (error) reject(error);
        else resolve(rows || []);
      });
    });
  }
}

async function initDatabase() {
  console.log('[DB] Initializing database tables...');
  await run(`
    CREATE TABLE IF NOT EXISTS cases (
      id ${isPg ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      complaint TEXT NOT NULL,
      symptoms TEXT,
      history TEXT,
      ai_summary TEXT,
      embedding TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at ${isPg ? "TIMESTAMP NOT NULL DEFAULT NOW()" : "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"}
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reports (
      id ${isPg ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
      patient_name TEXT DEFAULT 'Patient',
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      extracted_text TEXT,
      ai_summary TEXT,
      key_findings TEXT,
      created_at ${isPg ? "TIMESTAMP NOT NULL DEFAULT NOW()" : "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"}
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id ${isPg ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
      patient_name TEXT DEFAULT 'Patient',
      medicine_name TEXT NOT NULL,
      dosage TEXT NOT NULL,
      time TEXT NOT NULL,
      frequency TEXT DEFAULT 'Daily',
      status TEXT DEFAULT 'Active',
      created_at ${isPg ? "TIMESTAMP NOT NULL DEFAULT NOW()" : "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"}
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id ${isPg ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('patient', 'doctor')),
      created_at ${isPg ? "TIMESTAMP NOT NULL DEFAULT NOW()" : "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"}
    )
  `);
  console.log('[DB] Database tables initialized successfully');
}

async function getAllCases() {
  await initDatabase();
  const rows = await all("SELECT * FROM cases ORDER BY created_at DESC");
  return rows || [];
}

module.exports = {
  db: sqliteDb,
  run,
  get,
  all,
  initDatabase,
  getAllCases
};

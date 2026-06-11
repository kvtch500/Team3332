// db/index.js — Database connection + initialization

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const schema   = require('./schema');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'team3332.db');

let db;

function getDb() {
  if (!db) {
    // Ensure the directory exists (e.g. /data on a Railway volume)
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    // Run schema (all CREATE IF NOT EXISTS — safe to run every boot)
    db.exec(schema);
    // Lightweight auto-migrations for existing databases (safe to run every boot)
    const addColumn = (sql) => {
      try { db.exec(sql); return true; }
      catch (e) { if (!/duplicate column/i.test(e.message)) throw e; return false; }
    };
    addColumn(`ALTER TABLE challenges ADD COLUMN sport TEXT NOT NULL DEFAULT 'Run' CHECK(sport IN ('Run', 'Walk', 'Any'))`);
    // June 2026: member location + clubs
    addColumn(`ALTER TABLE users ADD COLUMN country TEXT`);
    addColumn(`ALTER TABLE users ADD COLUMN state TEXT`);
    addColumn(`ALTER TABLE users ADD COLUMN city TEXT`);
    addColumn(`ALTER TABLE users ADD COLUMN club_id INTEGER REFERENCES clubs(id) ON DELETE SET NULL`);
    // Index must be created AFTER club_id exists (migration above)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_club ON users(club_id)`);
    // June 2026: admin approval for group runs — backfill pre-existing runs as approved
    // (backfill only fires the one time the column is actually added)
    if (addColumn(`ALTER TABLE group_runs ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending', 'approved', 'rejected'))`)) {
      db.exec(`UPDATE group_runs SET approval_status = 'approved'`);
    }
  }
  return db;
}

module.exports = { getDb };

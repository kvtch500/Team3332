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
    try {
      db.exec(`ALTER TABLE challenges ADD COLUMN sport TEXT NOT NULL DEFAULT 'Run' CHECK(sport IN ('Run', 'Walk', 'Any'))`);
    } catch (e) {
      if (!/duplicate column/i.test(e.message)) throw e;
    }
  }
  return db;
}

module.exports = { getDb };

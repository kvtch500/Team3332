// db/index.js — Database connection + initialization

const Database = require('better-sqlite3');
const path     = require('path');
const schema   = require('./schema');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'team3332.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    // Run schema (all CREATE IF NOT EXISTS — safe to run every boot)
    db.exec(schema);
  }
  return db;
}

module.exports = { getDb };

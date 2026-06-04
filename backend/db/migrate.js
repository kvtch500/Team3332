// db/migrate.js — Add new columns to existing database
// Run with: node db/migrate.js

require('dotenv').config();
const { getDb } = require('./index');

const db = getDb();

console.log('🔄 Running migrations...');

const migrations = [
  `ALTER TABLE users ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'active'`,
  `ALTER TABLE users ADD COLUMN subscription_expires_at TEXT`,
  `ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`,
];

for (const sql of migrations) {
  try {
    db.prepare(sql).run();
    console.log(`  ✓ ${sql.slice(0, 60)}...`);
  } catch(e) {
    if (e.message.includes('duplicate column')) {
      console.log(`  ⏭  Column already exists, skipping`);
    } else {
      console.error(`  ✗ ${e.message}`);
    }
  }
}

console.log('✅ Migration complete.');

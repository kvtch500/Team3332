// db/seed.js — Seed the database with demo data
// Run with: node db/seed.js

require('dotenv').config();
const bcrypt  = require('bcryptjs');
const { getDb } = require('./index');

const db = getDb();

console.log('🌱 Seeding TEAM 3332 database...');

// ── BADGES ──────────────────────────────────────────────────
const badges = [
  { name: 'Captain',          icon: '🎖️', description: 'Earned team captain status', type: 'role' },
  { name: 'Speed Demon',      icon: '⚡', description: 'Completed 3 runs under 9:00/mi', type: 'achievement' },
  { name: 'Early Bird',       icon: '🌅', description: 'Ran a 5K before 7AM for 5 days', type: 'achievement' },
  { name: '10 Run Streak',    icon: '🔥', description: 'Logged 10 runs in a row', type: 'streak' },
  { name: '100 Mile Club',    icon: '🏃', description: 'Logged 100 total miles', type: 'milestone' },
  { name: 'Marathon Badge',   icon: '🏅', description: 'Completed marathon month challenge', type: 'challenge' },
  { name: 'Consistency Crown',icon: '👑', description: 'Ran every day for 30 days', type: 'streak' },
  { name: 'Global Runner',    icon: '🌍', description: 'Ran in 3+ different locations', type: 'achievement' },
];

const insertBadge = db.prepare(`
  INSERT OR IGNORE INTO badges (name, icon, description, type)
  VALUES (@name, @icon, @description, @type)
`);

for (const b of badges) insertBadge.run(b);
console.log(`  ✓ ${badges.length} badges`);

// ── USERS ────────────────────────────────────────────────────
const users = [
  { name: 'Ernest Smith',  email: 'ernest@team3332.com', password: 'test123', tier: 'Elite',    pace_group: 'B', is_captain: 1 },
  { name: 'Marcus T.',     email: 'marcus@demo.com',     password: 'test123', tier: 'Elite',    pace_group: 'A', is_captain: 0 },
  { name: 'Jasmine R.',    email: 'jasmine@demo.com',    password: 'test123', tier: 'Elite',    pace_group: 'A', is_captain: 0 },
  { name: 'DeShawn K.',    email: 'deshawn@demo.com',    password: 'test123', tier: 'Standard', pace_group: 'B', is_captain: 0 },
  { name: 'Priya M.',      email: 'priya@demo.com',      password: 'test123', tier: 'Standard', pace_group: 'C', is_captain: 0 },
  { name: 'Carlos V.',     email: 'carlos@demo.com',     password: 'test123', tier: 'Standard', pace_group: 'C', is_captain: 0 },
  { name: 'Aisha B.',      email: 'aisha@demo.com',      password: 'test123', tier: 'Standard', pace_group: 'C', is_captain: 0 },
  { name: 'Tyler H.',      email: 'tyler@demo.com',      password: 'test123', tier: 'Standard', pace_group: 'D', is_captain: 0 },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password, tier, pace_group, is_captain)
  VALUES (@name, @email, @password, @tier, @pace_group, @is_captain)
`);

for (const u of users) {
  insertUser.run({ ...u, password: bcrypt.hashSync(u.password, 10) });
}
console.log(`  ✓ ${users.length} users`);

// ── ACTIVITIES ───────────────────────────────────────────────
const getUserId = db.prepare('SELECT id FROM users WHERE email = ?');
const ernestId  = getUserId.get('ernest@team3332.com')?.id;

if (ernestId) {
  const activities = [
    { name: 'Morning Easy Run',  distance: 5.2,  pace: '9:02', duration: '47:00',   calories: 412, days_ago: 0 },
    { name: 'Lunch Tempo Run',   distance: 4.0,  pace: '7:45', duration: '31:00',   calories: 320, days_ago: 1 },
    { name: 'Sunday Long Run',   distance: 10.5, pace: '8:48', duration: '1:32:24', calories: 870, days_ago: 2 },
    { name: 'Recovery Jog',      distance: 3.1,  pace: '10:05',duration: '31:15',   calories: 248, days_ago: 3 },
    { name: 'Track Tuesday',     distance: 6.0,  pace: '7:55', duration: '47:42',   calories: 504, days_ago: 5 },
    { name: 'Easy Wednesday',    distance: 4.5,  pace: '9:20', duration: '41:54',   calories: 374, days_ago: 6 },
    { name: 'Weekend Warrior',   distance: 13.1, pace: '8:35', duration: '1:52:28', calories: 1120, days_ago: 9 },
  ];

  const insertActivity = db.prepare(`
    INSERT OR IGNORE INTO activities (user_id, name, distance, pace, duration, calories, logged_at)
    VALUES (@user_id, @name, @distance, @pace, @duration, @calories, @logged_at)
  `);

  for (const a of activities) {
    const date = new Date();
    date.setDate(date.getDate() - a.days_ago);
    insertActivity.run({ user_id: ernestId, name: a.name, distance: a.distance, pace: a.pace, duration: a.duration, calories: a.calories, logged_at: date.toISOString() });
  }
  console.log(`  ✓ ${activities.length} activities for Ernest`);
}

// ── CHALLENGES ───────────────────────────────────────────────
const now   = new Date();
const end30 = new Date(now); end30.setDate(end30.getDate() + 27);
const end7  = new Date(now); end7.setDate(end7.getDate() + 4);
const end10 = new Date(now); end10.setDate(end10.getDate() + 10);
const end20 = new Date(now); end20.setDate(end20.getDate() + 20);

const challenges = [
  { title: 'June Marathon Month',      description: 'Log 26.2 miles total in June.',           icon: '🏅', type: 'distance',  goal_value: 26.2,  reward: 'Marathon Badge + 15% gear discount', tier_req: null,       starts_at: now.toISOString(), ends_at: end30.toISOString() },
  { title: 'Speed Week: Sub-9',        description: 'Complete 3 runs under 9:00/mi this week.',icon: '⚡', type: 'pace',      goal_value: 3,     reward: 'Speed Demon Badge',                  tier_req: null,       starts_at: now.toISOString(), ends_at: end7.toISOString()  },
  { title: 'Early Bird 5K Series',     description: 'Run a 5K before 7AM, 5 days in a row.',  icon: '🌅', type: 'frequency', goal_value: 5,     reward: 'Early Bird Badge + Captain consideration', tier_req: null, starts_at: now.toISOString(), ends_at: end10.toISOString() },
  { title: 'Consistency Crown',        description: 'Log at least one run every day for 30 days.', icon: '🏃', type: 'streak', goal_value: 30,  reward: 'Crown Badge + Elite upgrade offer',  tier_req: null,       starts_at: now.toISOString(), ends_at: end20.toISOString() },
];

const insertChallenge = db.prepare(`
  INSERT OR IGNORE INTO challenges (title, description, icon, type, goal_value, reward, tier_req, starts_at, ends_at)
  VALUES (@title, @description, @icon, @type, @goal_value, @reward, @tier_req, @starts_at, @ends_at)
`);

for (const c of challenges) insertChallenge.run(c);
console.log(`  ✓ ${challenges.length} challenges`);

// ── USER BADGES ──────────────────────────────────────────────
if (ernestId) {
  const earnedBadges = ['Captain', 'Speed Demon', 'Early Bird', '10 Run Streak', '100 Mile Club'];
  const getBadge = db.prepare('SELECT id FROM badges WHERE name = ?');
  const insertUserBadge = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)');

  for (const name of earnedBadges) {
    const badge = getBadge.get(name);
    if (badge) insertUserBadge.run(ernestId, badge.id);
  }
  console.log(`  ✓ ${earnedBadges.length} badges for Ernest`);
}

// ── GROUP RUNS ───────────────────────────────────────────────
if (ernestId) {
  const runs = [
    { title: 'Tuesday Morning Group Run', description: 'Easy pace, all levels welcome.', run_type: 'Virtual',   scheduled_at: new Date(Date.now() + 7*24*3600*1000).toISOString(),  status: 'upcoming' },
    { title: 'Saturday Long Run — City Park', description: 'Meet at the fountain. 8–10 miles.', run_type: 'In-Person', scheduled_at: new Date(Date.now() + 11*24*3600*1000).toISOString(), status: 'upcoming' },
    { title: 'Tempo Thursday', description: 'Sub-8:30 goal.', run_type: 'Virtual', scheduled_at: new Date(Date.now() - 5*24*3600*1000).toISOString(), status: 'completed' },
  ];

  const insertRun = db.prepare(`
    INSERT OR IGNORE INTO group_runs (captain_id, title, description, run_type, scheduled_at, status)
    VALUES (@captain_id, @title, @description, @run_type, @scheduled_at, @status)
  `);

  for (const r of runs) insertRun.run({ ...r, captain_id: ernestId });
  console.log(`  ✓ ${runs.length} group runs`);
}

console.log('\n✅ Seed complete! Demo login: ernest@team3332.com / test123');

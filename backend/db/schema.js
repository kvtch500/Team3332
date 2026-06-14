// db/schema.js — Database schema definitions

const schema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- ── CLUBS ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS clubs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    status      TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'verified')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ── USERS ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    tier        TEXT    NOT NULL DEFAULT 'Standard' CHECK(tier IN ('Standard', 'Elite')),
    pace_group  TEXT    NOT NULL DEFAULT 'C' CHECK(pace_group IN ('A', 'B', 'C', 'D')),
    is_captain  INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,
    bio                     TEXT,
    location                TEXT,
    country                 TEXT,
    state                   TEXT,
    city                    TEXT,
    club_id                 INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
    avatar_url              TEXT,
    subscription_status     TEXT    NOT NULL DEFAULT 'trial' CHECK(subscription_status IN ('trial', 'active', 'expired', 'cancelled')),
    subscription_expires_at TEXT,
    stripe_customer_id      TEXT,
    joined_at               TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ── ACTIVITIES ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS activities (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL DEFAULT 'My Run',
    type        TEXT    NOT NULL DEFAULT 'Run',
    distance    REAL    NOT NULL,
    pace        TEXT,
    duration    TEXT,
    calories    INTEGER,
    notes       TEXT,
    route_data  TEXT,
    strava_id   TEXT UNIQUE,
    logged_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ── CHALLENGES ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS challenges (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT    NOT NULL,
    description  TEXT,
    icon         TEXT    DEFAULT '🏅',
    type         TEXT    NOT NULL DEFAULT 'distance' CHECK(type IN ('distance', 'frequency', 'pace', 'streak')),
    sport        TEXT    NOT NULL DEFAULT 'Run' CHECK(sport IN ('Run', 'Walk', 'Any')),
    goal_value   REAL    NOT NULL,
    reward       TEXT,
    tier_req     TEXT    DEFAULT NULL CHECK(tier_req IN ('Standard', 'Elite', NULL)),
    starts_at    TEXT    NOT NULL,
    ends_at      TEXT    NOT NULL,
    created_by   INTEGER REFERENCES users(id),
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ── CHALLENGE MEMBERS ──────────────────────────────
  CREATE TABLE IF NOT EXISTS challenge_members (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    progress     REAL    NOT NULL DEFAULT 0,
    completed    INTEGER NOT NULL DEFAULT 0,
    joined_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(challenge_id, user_id)
  );

  -- ── BADGES ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS badges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    icon        TEXT    NOT NULL,
    description TEXT,
    type        TEXT    NOT NULL DEFAULT 'achievement'
  );

  -- ── USER BADGES ────────────────────────────────────
  CREATE TABLE IF NOT EXISTS user_badges (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id   INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    earned_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, badge_id)
  );

  -- ── GROUP RUNS ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS group_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    captain_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    description TEXT,
    run_type    TEXT    NOT NULL DEFAULT 'Virtual' CHECK(run_type IN ('Virtual', 'In-Person', 'Hybrid')),
    location    TEXT,
    scheduled_at TEXT   NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'active', 'completed', 'cancelled')),
    approval_status TEXT NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending', 'approved', 'rejected')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ── GROUP RUN MEMBERS ──────────────────────────────
  CREATE TABLE IF NOT EXISTS group_run_members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      INTEGER NOT NULL REFERENCES group_runs(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(run_id, user_id)
  );

  -- ── CAPTAIN APPLICATIONS ───────────────────────────
  CREATE TABLE IF NOT EXISTS captain_applications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    motivation  TEXT    NOT NULL,
    experience  TEXT,
    status      TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT
  );

  -- ── CAPTAIN QUESTIONS (member ↔ captain Q&A) ───────
  CREATE TABLE IF NOT EXISTS captain_questions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    captain_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question    TEXT    NOT NULL,
    answer      TEXT,
    status      TEXT    NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'answered')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    answered_at TEXT
  );

  -- ── TEAM ANNOUNCEMENTS (captain → all members) ─────
  CREATE TABLE IF NOT EXISTS announcements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    captain_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    body        TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ── MEMBER-OF-THE-MONTH NOMINATIONS (captain → member) ─
  CREATE TABLE IF NOT EXISTS nominations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    captain_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nominee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month       TEXT    NOT NULL,                              -- 'YYYY-MM'
    reason      TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(captain_id, nominee_id, month)
  );

  -- ── PASSWORD RESETS ────────────────────────────────
  CREATE TABLE IF NOT EXISTS password_resets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT    NOT NULL UNIQUE,
    expires_at  TEXT    NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ── INDEXES ────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
  CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id);
  CREATE INDEX IF NOT EXISTS idx_activities_logged ON activities(logged_at DESC);
  CREATE INDEX IF NOT EXISTS idx_challenge_members_challenge ON challenge_members(challenge_id);
  CREATE INDEX IF NOT EXISTS idx_challenge_members_user ON challenge_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_group_runs_captain ON group_runs(captain_id);
  CREATE INDEX IF NOT EXISTS idx_captain_apps_user ON captain_applications(user_id);
  CREATE INDEX IF NOT EXISTS idx_captain_apps_status ON captain_applications(status);
  CREATE INDEX IF NOT EXISTS idx_captain_questions_captain ON captain_questions(captain_id);
  CREATE INDEX IF NOT EXISTS idx_captain_questions_member ON captain_questions(member_id);
  CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_nominations_month ON nominations(month);
  CREATE INDEX IF NOT EXISTS idx_nominations_nominee ON nominations(nominee_id);
`;
// NOTE: idx_users_club is created in db/index.js AFTER the club_id auto-migration —
// putting it here breaks boot on existing databases that don't have the column yet.

module.exports = schema;

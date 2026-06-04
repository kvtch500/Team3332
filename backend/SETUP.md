# TEAM 3332 — Backend API Setup

## Quick Start

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```
Edit `.env` and set a strong `JWT_SECRET`.

### 3. Seed the database
```bash
npm run seed
```
This creates the SQLite database and loads demo data.
Demo login: **ernest@team3332.com / test123**

### 4. Start the server
```bash
npm run dev       # development (auto-restart on changes)
npm start         # production
```

Server runs at: `http://localhost:3001`

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in → returns JWT |
| GET  | `/api/auth/me` | Get current user |
| PATCH | `/api/auth/me` | Update profile |
| POST | `/api/auth/change-password` | Change password |

### Activities
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/activities` | My runs (paginated) |
| GET  | `/api/activities/stats` | Totals + streak |
| POST | `/api/activities` | Log a new run |
| PATCH | `/api/activities/:id` | Edit a run |
| DELETE | `/api/activities/:id` | Delete a run |

### Leaderboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/leaderboard?period=monthly&pace_group=B` | Rankings |

**Period options:** `weekly`, `monthly`, `alltime`
**Pace group options:** `A`, `B`, `C`, `D`, `all`

### Challenges
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/challenges` | All active challenges |
| GET  | `/api/challenges/:id` | Single challenge + leaderboard |
| POST | `/api/challenges/:id/join` | Join a challenge |
| DELETE | `/api/challenges/:id/join` | Leave a challenge |
| POST | `/api/challenges` | Create challenge (Captain only) |

### Captain Panel
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/captain/runs` | My group runs |
| POST | `/api/captain/runs` | Create group run |
| PATCH | `/api/captain/runs/:id` | Update run |
| DELETE | `/api/captain/runs/:id` | Cancel run |
| GET  | `/api/captain/runs/:id/members` | Who joined |
| POST | `/api/captain/runs/:id/join` | Member joins a run |
| GET  | `/api/captain/stats` | Captain summary stats |
| POST | `/api/captain/apply` | Apply to become captain |

### Users
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | Browse members |
| GET | `/api/users/:id` | Public profile |
| GET | `/api/users/:id/badges` | All badges (earned + locked) |

---

## Authentication

All routes (except register/login) require a Bearer token:
```
Authorization: Bearer <your_jwt_token>
```

---

## Database

SQLite file is created at `db/team3332.db` on first run.
No external database needed — runs completely locally.

---

## Project Structure

```
backend/
  server.js          ← Express app entry point
  .env               ← Your environment config (gitignored)
  .env.example       ← Template
  package.json
  db/
    index.js         ← DB connection
    schema.js        ← All CREATE TABLE statements
    seed.js          ← Demo data
    team3332.db      ← SQLite file (created on first run)
  middleware/
    auth.js          ← JWT verification
  routes/
    auth.js          ← Register, login, me
    activities.js    ← Run logging
    leaderboard.js   ← Rankings
    challenges.js    ← Challenges + join/leave
    captain.js       ← Captain panel
    users.js         ← Member profiles
```

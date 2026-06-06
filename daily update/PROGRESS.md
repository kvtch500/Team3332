# TEAM 3332 — Progress & Updates Log

---

## Session Log

### June 5, 2026
**Summary:** Domain + monitoring done by Ernest; built the email system (Resend).

**Done by Ernest since last session:**
- Connected team3332.com domain to Railway ✅
- UptimeRobot monitoring set up ✅

**Built this session — Email system (Resend):**
- `backend/lib/mailer.js` — Resend integration via REST API (no SDK dependency; uses Node 18+ fetch). Welcome + password-reset HTML templates, branded, with HTML escaping. Fails soft — never blocks signup/login if email is misconfigured.
- `backend/db/schema.js` — added `password_resets` table (token, user_id, expires_at, used) + index.
- `backend/routes/auth.js` — welcome email fires on register; new `POST /api/auth/forgot-password` (1-hour tokens, doesn't reveal if email exists) and `POST /api/auth/reset-password` (consumes token, rejects reused/expired).
- `backend/.env` + `.env.example` — added RESEND_API_KEY (blank), EMAIL_FROM (test sender), CLIENT_URL.
- Tested: mailer logic (mocked fetch) and all SQL/token flows (valid/reused/expired/superseded) — all pass.

**Ernest's TODO to go live with email:**
1. Create Resend account → grab API key → paste into `RESEND_API_KEY` in Railway env (and local `.env`).
2. Test immediately using the default `onboarding@resend.dev` sender.
3. Verify team3332.com in Resend (add DNS records at GoDaddy), then change `EMAIL_FROM` to `TEAM 3332 <noreply@team3332.com>`.
4. Build the frontend `/app/reset-password` page that reads `?token=` and POSTs to `/api/auth/reset-password` (backend is ready; UI not built yet).

---

### June 4, 2026 (Updated — End of Day)
**Summary:** Full build from scratch to investor-ready demo + live deployment in one session.

**Additional work completed after initial log:**
- Fixed Railway deployment (port config, env variables, build config)
- Backend confirmed live at team3332-production-ba53.up.railway.app/api/health
- App confirmed working at live URL — login, dashboard, all features functional
- Stripe checkout confirmed working end-to-end in test mode
- Project folder structure created in `3332/daily update/`
- PROGRESS.md and 3332 Overview.md created for session memory
- CLAUDE.md updated with project context for future sessions
- Color scheme updated on both app and landing page (blue/green/gold)
- Strava competitive threat analysis + acquisition scenario added to MARKET_RESEARCH.md
- Strategic 3-month roadmap saved to ROADMAP.md
- GitHub repo fully updated with all latest code

**Completed:**
- Landing page built and deployed to GitHub Pages (kvtch500.github.io/team3332)
- React app MVP — dashboard, activity log, leaderboard, challenges, captain panel, profile
- Node.js + Express backend with SQLite database
- JWT authentication (login, register, session restore)
- Frontend connected to backend API
- Stripe payments integrated ($199 Standard / $249 Elite) — test mode working
- Admin panel built with member management, stats, activity feed
- Mobile responsiveness — bottom nav, slide-out sidebar, responsive grids
- Onboarding flow — 4-step quiz for new signups
- New color scheme — blue (#0EA5E9), emerald green (#10B981), gold (#F59E0B)
- Landing page statistics corrected with verified data
- Market research landscape document created
- 3-month launch roadmap created
- Backend deployed to Railway (team3332-production-ba53.up.railway.app)
- App accessible at live URL — login confirmed working
- Domain registered: team3332.com (GoDaddy)
- Email set up: ernest@team3332.com
- GitHub repo: github.com/kvtch500/team3332

**Pending from this session:**
- Connect team3332.com domain to Railway
- UptimeRobot monitoring setup
- Email system (Resend/SendGrid)
- Terms of Service + Privacy Policy pages
- Persistent database (switch SQLite → PostgreSQL on Railway)
- Stripe live keys (currently test mode)
- GPX/Strava activity import
- Public member profile pages
- Referral system

---

## Decisions Made

| Decision | Rationale |
|---|---|
| Blue/green/gold color scheme | Differentiate from Strava's orange; more premium feel |
| $199 Standard / $249 Elite annual pricing | Comparable to one race entry; annual = committed members |
| SQLite for MVP | No external DB needed; fast to build; migrate to PostgreSQL before scale |
| Railway for hosting | $5/month, auto-deploys from GitHub, simple setup |
| No LLC yet | Can operate as sole proprietor for first members; file when revenue justifies it |
| Annual billing only | Lower churn (3-5%/year vs 5-7%/month), more committed members |

---

## Key Credentials & Links

| Item | Value |
|---|---|
| Live app | https://team3332-production-ba53.up.railway.app/app |
| Admin panel | https://team3332-production-ba53.up.railway.app/admin |
| Admin key | 092025 |
| Demo login | ernest@team3332.com / test123 |
| GitHub | https://github.com/kvtch500/team3332 |
| Landing page | https://kvtch500.github.io/team3332 |
| Railway URL | team3332-production-ba53.up.railway.app |
| Domain | team3332.com (GoDaddy) |
| Email | ernest@team3332.com (GoDaddy Microsoft 365) |
| Stripe | Test mode — sandbox |

---

## Next Session Priorities

1. Connect team3332.com to Railway backend
2. Set up UptimeRobot monitoring
3. Build email system (welcome + password reset)
4. Add Terms of Service + Privacy Policy
5. Migrate database to PostgreSQL for persistence

---

## Notes

- Railway SQLite resets on every redeploy — run `node db/seed.js` in Railway console after each deploy until PostgreSQL is set up
- Stripe is in test mode — switch to live keys when ready to charge real members
- GitHub token (used for push): rotate periodically for security
- Stripe test card: 4242 4242 4242 4242, any future date, any CVC

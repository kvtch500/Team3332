# TEAM 3332 — Progress & Updates Log

---

## Session Log

### June 7, 2026 (late session)
**Summary:** Recorder phone-tested ✅. Walkers see mph; share button built. Walks-vs-runs policy decided + shipped.

**Decision — walks count toward total distance, never toward run challenges/pace** (informed by Strava: they separate per-sport and got complaints from both sides; we split the difference):
- Total Miles, weekly miles, monthly leaderboard, streaks: runs + walks (was already the behavior — kept).
- Challenges: new `sport` column (`Run`/`Walk`/`Any`), **default Run** — walks no longer bump run-challenge progress (bug-level behavior before: they did). Pace challenges runs-only by default.
- Auto-migration added to `db/index.js` (boot-time ALTER, idempotent) — prod volume DB upgrades itself on next deploy, legacy challenges backfill to runs-only.
- `POST /challenges` accepts `sport`; challenge cards show 🏃/🚶 eligibility tag; dashboard "Total Runs" → "Activities (runs + walks)".
- 11 backend tests pass (node:sqlite adapter — Mac better-sqlite3 binary won't load in sandbox). **UNCOMMITTED** — run from Mac:
  `cd ~/Desktop/claude\ ai/3332 && rm -f .git/index.lock && git add backend app && git commit -m "Walks count toward totals, not run challenges (challenges.sport)" && git push origin main`

**Done:**
- **Recorder verified on phone** — Ernest did a test walk; distance/route showed correctly in the app. "accurate-solace" Railway project confirmed deleted.
- **Walker speed display** (`4c3c579`, local — **needs `git push origin main` from Mac**): Walk activities show mph (recorder live + review, dashboard, activity log); runs keep min/mi pace. Helpers `fmtSpeed`/`durSecs`/`activityStat`, 20 unit tests pass.
- **Share button**: canvas 1080×1080 branded stat card (wordmark, name, gold route map, distance/time/pace-or-speed, team3332.com footer) → native share sheet; falls back to text share → PNG download. On recorder review screen + every activity card (📤). $0, all client-side.
- ⚠️ **Gotcha:** git run from Claude's sandbox leaves a stale `.git/index.lock` (can't delete files in the mounted folder). Before any git command on the Mac: `rm -f .git/index.lock`. Future sessions: Claude edits files, Ernest commits/pushes.

---

### June 7, 2026 (evening session)
**Summary:** GPX import built + tested. Launch checklist closed earlier today (apex live).

**Done:**
- **GPX import feature** (`ae36ccc`, local — **needs `git push origin main` from Mac to deploy**):
  - `backend/lib/gpx.js` — dependency-free parser: distance (haversine), duration/pace from timestamps, elevation gain, route downsampled to ≤200 pts. Handles Strava/Garmin/Apple Watch exports, multi-segment (paused) tracks, route files, files without timestamps.
  - `POST /api/activities/parse-gpx` — parses + returns fields for review (auth required, 15 MB limit); save uses existing POST /activities.
  - Activity log modal: "⌚ Import from GPS file (.gpx)" button pre-fills the form (name, distance, pace, duration, elevation in notes); user reviews then saves.
  - SVGMap upgraded: renders the **real GPS route** (north-up, latitude-corrected) for imported runs; placeholder kept for manual logs.
  - Tested: 20 parser unit tests + 7 route integration tests, all pass (incl. 26.2 mi / 40k-point file in ~0.6s, auth + bad-file rejection).
- **Strava API decision:** direct Strava sync deferred — as of June 30 2026 Standard Tier requires a paid Strava subscription, starts at a 10-athlete cap, and Strava's terms restrict use in competing leaderboards. GPX covers Strava users via export at $0 risk.
- **One-touch GPS Record + Walk type** (`90e4c2c`, local — **needs push**): full-screen recorder (START → live distance/time/pace → END → review → save), Strava-style. GPS quality filtering (accuracy/jitter/jump rejection), screen wake lock, route saved. Run/Walk toggle in recorder + manual log; walk icons in lists. 10 unit tests pass. **Known limit:** tracking pauses if phone locks — fixed later by the native (Capacitor) wrapper, which reuses all of this.
- **Decision — native app path:** MVP should record like Strava (lock phone, keep tracking) → Capacitor wrapper around the existing web app + native background-GPS module. ~$124 in store fees ($99/yr Apple + $25 Google), optional ~$349 premium GPS plugin. 3-5 sessions when we start. Web recorder built first because the wrapper reuses it all.
- **Decision — activity types:** Run + Walk only (run/walk method, recovery, injury comebacks — matches "every runner welcome"). No other sports. Open question: should walks count toward distance leaderboards or be filtered? Decide before founding members arrive.

---

### June 7, 2026
**Summary:** Cloudflare DNS migration DONE — team3332.com zone active. www live with SSL; apex validating. Gold/purple rebrand shipped.

**Done:**
- June 6's GitHub push confirmed — landing page live at domain root, ToS/Privacy links working.
- Cloudflare zone activated: 17 records imported + 4 added (root CNAME `@ → k5efsvxc.up.railway.app`, TXT `_railway-verify`, TXT `dc-fd741b8612._spfm.send`, TXT `_railway-verify.www`), all set to **DNS only** (grey cloud — Railway issues its own SSL). Nameservers flipped at GoDaddy → felipe/vera.ns.cloudflare.com.
- Gotcha: root CNAME had a stray trailing comma — fixed, then resolved correctly.
- **www.team3332.com fully live with SSL** (API verified over HTTPS). M365 + Resend email records confirmed intact post-migration.
- **Email branding confirmed working** — password reset arrives from noreply@team3332.com. ✅ Launch priority #6 done.
- **Rebrand** (`283f8de`): blue → metallic gold #D4AF37 (esp. "3332" logos), green → matte purple #6B5B95, across app/landing/admin/legal pages/emails. CSS-variable swap only.
- Deleted stale duplicate Railway project "accurate-solace" (failed builds on every push; held nothing).

**Resolved (later same day):** apex validation self-cleared as expected. **https://team3332.com live with SSL** — final sweep passed: apex + www landing page, `/api/health` OK, `/app` loads, ToS/Privacy live. ✅ Launch priority #7 done — **launch checklist fully closed.**

---

### June 6, 2026
**Summary:** Database persistence SOLVED — Railway volume + SQLite. No more reseeding after deploys.

**Decision:** With launch (live Stripe / paying members) 7–8 months out, full PostgreSQL migration was deferred. A Railway persistent volume keeps SQLite data across deploys — same fix, ~5 minutes, zero risk to the live app. **Revisit Postgres ~2 months before launch.**

**Done:**
- `backend/db/index.js` — creates DB directory if missing (volume-safe). Committed locally (`917863f`) — **not yet pushed to GitHub** (push from Mac when convenient; not urgent, Railway works without it).
- Ernest attached `team3332-volume` to the Railway service, mounted at `/data`, set `DB_PATH=/data/team3332.db`, ran the final seed.
- **Verified:** redeployed the service, logged in at team3332.com with no reseed — all data intact. ✅

**The reseed-after-every-deploy era is over.**

**Also built — Terms of Service + Privacy Policy (launch priority #5):**
- `app/terms.html` — branded ToS: $199/$249 annual billing, auto-renewal, **14-day money-back refund** (matches Strava), health/safety disclaimer + assumption of risk (incl. in-person group runs), 18+ eligibility, **Louisiana governing law**.
- `app/privacy.html` — branded privacy policy: data collected, Stripe/Railway/Resend as processors, member visibility, deletion rights, no data selling.
- Signup form (`app/index.html`) now shows "By creating an account you agree to…" with links; landing page footer has Terms/Privacy links.
- Committed (`e41b94d`). Pages should be reviewed by a lawyer before live Stripe keys — these are solid templates, not legal advice.

**Also fixed — bare domain 404:**
- team3332.com root used to return a JSON 404; `server.js` now serves the landing page at `/` (`7973bcb`). Landing's fake email-capture form replaced with a real "Claim Your Spot →" button into the app signup.
- Email branding flipped by Ernest: Resend domain **Verified**, `EMAIL_FROM` → noreply@team3332.com, `CLIENT_URL` → https://team3332.com.
- **3 commits local, unpushed** (917863f, e41b94d, 7973bcb) — everything deploys on next `git push origin main`.

**Discovered + in progress — root domain DNS (team3332.com):**
- team3332.com was stuck "Waiting for DNS update" in Railway since June 5 — root cause: Railway needs a CNAME on the root (`@ → k5efsvxc.up.railway.app`) and **GoDaddy doesn't support root CNAMEs**. The bare domain has never actually resolved.
- www.team3332.com added in Railway (port 8080) + CNAME fixed at GoDaddy (`www → jinxbgrf.up.railway.app`).
- **Decision: migrate DNS hosting to Cloudflare (free)** for root-CNAME support. Full GoDaddy record snapshot saved to `DNS-INVENTORY.md` (same folder). Session ended at Cloudflare signup; see daily log `[C] 2026-06-06.md` for exact resume point.

---

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

**Resend API key added to Railway (RESEND_API_KEY, EMAIL_FROM) by Ernest. ✅**

**Built + shipped — frontend reset flow:**
- `app/reset-password.html` — standalone branded page; reads `?token=`, validates new password, POSTs to `/api/auth/reset-password`, success state. Mailer link updated to `/app/reset-password.html?token=`.
- `app/index.html` — **fixed the dead "Forgot password?" link** (was decorative text with no handler — the real reason no emails were sending). Now calls `/auth/forgot-password` with the entered email + shows confirmation notice.

**✅ STATUS: Password reset works end-to-end, confirmed live by Ernest (June 5).**
- Pushed 3 commits: email system, reset page, forgot-password button fix.

**Email — remaining to fully finish:**
1. **Verify team3332.com in Resend** (DNS at GoDaddy — won't break M365 inbox, adds records on a `send.` subdomain). Then change `EMAIL_FROM` → `TEAM 3332 <noreply@team3332.com>`.
   - Until verified: `onboarding@resend.dev` test sender only delivers to esyrs500@gmail.com (the Resend account email).
2. Optional: set Railway `CLIENT_URL` → `https://team3332.com` so email links/buttons use the branded domain instead of the railway.app URL.

**Reminder:** Railway SQLite still resets on every redeploy — reseed with `node db/seed.js` after each deploy until PostgreSQL migration is done.

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
| Domain | team3332.com (registered GoDaddy; DNS hosted on Cloudflare — Esyrs500@gmail.com acct, Free plan) |
| Email | ernest@team3332.com (GoDaddy Microsoft 365) |
| Stripe | Test mode — sandbox |

---

## Next Session Priorities

1. ~~Connect team3332.com to Railway backend~~ ✅ June 5
2. ~~Set up UptimeRobot monitoring~~ ✅ June 5
3. ~~Build email system (welcome + password reset)~~ ✅ June 5 — working end-to-end
4. ~~Persistent database~~ ✅ June 6 — Railway volume + SQLite, verified across redeploy. (PostgreSQL migration deferred to ~2 months pre-launch; launch is 7–8 months out.)
5. ~~Add Terms of Service + Privacy Policy~~ ✅ June 6 — built + linked; goes live on next GitHub push. (Lawyer review before live Stripe keys.)
6. ~~Finish email branding~~ ✅ June 7 — emails confirmed arriving from noreply@team3332.com
7. ~~Confirm apex team3332.com + final test sweep~~ ✅ June 7 — apex live with SSL, all endpoints verified. **Launch checklist complete.**

**Next phase (pre-launch, ~7 months out):** lawyer review ToS/Privacy → Stripe live keys; PostgreSQL migration ~2 months pre-launch; ~~GPX import~~ ✅ June 7 (built + tested; push to deploy); public member profiles; referral system; gold shade tuning if needed. Strava OAuth sync deferred (paid tier + competing-leaderboard terms risk).

---

## Notes

- ~~Railway SQLite resets on every redeploy~~ ✅ Fixed June 6 — data lives on `team3332-volume` (`/data/team3332.db`), survives all deploys. No more reseeding.
- Stripe is in test mode — switch to live keys when ready to charge real members
- GitHub token (used for push): rotate periodically for security
- Stripe test card: 4242 4242 4242 4242, any future date, any CVC

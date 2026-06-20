# TEAM 3332 — 3-Month Launch Roadmap
*Starting June 2026 → Target Launch: September 2026 | Contact: ernest@team3332.com*

---

## Cost Breakdown (Out of Pocket)

### One-Time Costs
| Item | Cost | Notes |
|---|---|---|
| Domain (team3332.com) | ~$15/year | Namecheap or Google Domains |
| LLC filing (optional but recommended) | $50–$500 | Varies by state |
| **One-time total** | **~$15–$515** | |

### Monthly Recurring Costs
| Service | Cost/Month | What It Does |
|---|---|---|
| Railway (backend hosting) | $5 | Runs your Node.js API + database 24/7 |
| Vercel (frontend hosting) | Free | Hosts the React app |
| Resend (email) | Free → $20 | Transactional emails (welcome, reset, alerts) — free up to 3,000/mo |
| Stripe (payments) | 2.9% + $0.30/transaction | No monthly fee — pay per sale only |
| **Monthly total** | **~$5–$25/mo** | Until you hit scale |

### Stripe Transaction Fees (per member signup)
| Tier | Member Pays | Stripe Takes | You Keep |
|---|---|---|---|
| Standard | $199 | ~$6.07 | **$192.93** |
| Elite | $249 | ~$7.52 | **$241.48** |

### Revenue Milestones
| Members | Avg. Price | Gross ARR | After Stripe Fees | Monthly Costs | **Net Year 1** |
|---|---|---|---|---|---|
| 100 | $210 | $21,000 | ~$20,380 | ~$300 | **~$20,080** |
| 250 | $210 | $52,500 | ~$50,950 | ~$300 | **~$50,650** |
| 500 | $215 | $107,500 | ~$104,350 | ~$600 | **~$103,750** |

**Bottom line: You can launch and run this for under $25/month. The business is profitable from member #1.**

---

## Month 1 — Foundation (June 2026)
*Goal: Make the product chargeable and publicly accessible*

### Week 1–2: Stripe Payment Integration
- [ ] Create Stripe account and get API keys
- [ ] Add Stripe checkout to the app (Standard $199 / Elite $249)
- [ ] Build subscription management in backend (store `stripe_customer_id`, `subscription_status`)
- [ ] Add membership gate — unpaid users can browse but not access full dashboard
- [ ] Test checkout flow end-to-end with Stripe test cards

### Week 3: Deployment
- [ ] Register domain (team3332.com or team3332.app)
- [ ] Deploy backend to Railway (Node.js + SQLite → PostgreSQL migration recommended)
- [ ] Deploy frontend to Vercel
- [ ] Connect domain to frontend
- [ ] Set up environment variables in production
- [ ] Smoke test all API endpoints in production

### Week 4: Email + Legal
- [ ] Set up Resend (or SendGrid) for transactional email
- [ ] Build welcome email (fires on successful registration + payment)
- [ ] Build password reset email flow
- [ ] Write Terms of Service page (can use a generator like Termly — ~$0)
- [ ] Write Privacy Policy page
- [ ] Add both to landing page footer and signup flow

**Month 1 Milestone: Someone in another country can sign up, pay, and use the app.**

---

## Month 2 — Product Polish (July 2026)
*Goal: Make the product feel professional and retain members*

### Week 1–2: Mobile Responsiveness
- [ ] Audit app on iPhone and Android screen sizes
- [ ] Fix navigation (hamburger menu or bottom nav for mobile)
- [ ] Fix dashboard cards, leaderboard table, and activity log for small screens
- [ ] Test on at least 3 screen sizes (375px, 414px, 768px)

### Week 3: Onboarding Flow
- [ ] Build post-signup quiz: pace group, weekly mileage goal, race goal, experience level
- [ ] Store answers to user profile
- [ ] Show personalized welcome screen after onboarding
- [ ] Auto-assign pace group based on quiz answers

### Week 4: Admin Panel
- [ ] Build password-protected admin dashboard (separate from member app)
- [ ] Member list with search, filter by tier/pace group
- [ ] Ability to promote/demote captains
- [ ] Platform-wide stats: total members, total miles logged, active challenges
- [ ] Manual override for subscription status (for comps, refunds)

**Month 2 Milestone: The product is polished enough to show investors or press.**

---

## Month 3 — Growth Ready (August 2026)
*Goal: Build the systems that drive organic growth*

### Week 1–2: Activity Import
- [ ] GPX file upload (runners export from Garmin/Apple Watch and upload)
- [ ] Parse GPX to auto-fill distance, pace, and duration
- [ ] Optional: Strava API read integration (import last 10 runs on connect)
- [ ] Show imported activity preview before saving

### Week 3: Public Profiles + Referral System
- [ ] Build public member profile URL: team3332.com/runners/[username]
- [ ] Show stats, badges, pace group, and recent runs publicly
- [ ] Build referral system: unique referral link per member
- [ ] Reward: 1 month free added to account when referral converts to paid
- [ ] Track referrals in backend and admin panel

### Week 4: Launch Prep
- [ ] Recruit 10–20 beta members (friends, local runners, social media)
- [ ] Fix all bugs found in beta
- [ ] Set up Instagram and TikTok accounts for TEAM 3332
- [ ] Post first content: team story, founding member offer
- [ ] Activate "First 250 Founding Members" campaign on landing page
- [ ] Email everyone on the landing page waitlist

**Month 3 Milestone: Public launch. First 50 paying members.**

---

## Summary: What This Costs to Launch

| Phase | Duration | Out-of-Pocket Cost |
|---|---|---|
| Month 1 (Foundation) | June 2026 | ~$15 (domain) + $5 hosting |
| Month 2 (Polish) | July 2026 | ~$5–$25/mo |
| Month 3 (Growth) | August 2026 | ~$5–$25/mo |
| **3-Month Total** | | **~$50–$90** |

You do not need to spend money on ads, designers, or infrastructure to get to your first 250 members. The product, the captain system, and the founding member offer are enough — if you work the community channels (Reddit, running Facebook groups, Strava clubs) consistently.

---

## Post-MVP / Native Polish (backlog)

Features that aren't launch-blockers but raise the product to "real running app" quality.

### Reliability ✅ in progress
- [x] **Surface GPS errors during recording** (June 2026, 618f): GPS failures arrive on async
      watch callbacks that React's ErrorBoundary can't catch, so a mid-run signal loss or
      permission revocation used to be silent (timer kept ticking, distance frozen). The recorder
      now shows a persistent red banner over the recording screen — "GPS signal lost" or "Location
      access turned off" — and clears it automatically when fixes resume. `denied` still also
      fires the existing toast. Pure `recGpsAlert(kind)` helper; works native + web.
- [ ] **Auto-pause (opt-in member setting):** automatically pause the timer + distance when the
      runner stops moving (waiting at a crosswalk, traffic light, water break) and resume when they
      start again — like Strava/Nike auto-pause. Make it a per-member toggle in settings (default
      off, members opt in) so anyone who'd rather keep the clock running can. Implementation notes:
      we already thread the Doppler **`speed`** field into the recorder (619), so the pause trigger
      can reuse it — e.g. pause after speed stays below a walk threshold for ~N seconds, resume when
      it rises again — with a position-fallback when speed is unavailable. While paused, freeze
      `elapsed`/distance, show a "Paused" state on the record screen + the Live Activity, and don't
      accumulate points. Persist the toggle on the user profile so it applies on every device.

### Lock-screen Live Activity (iOS) — runner-facing ✅ in progress
*Goal: a Strava/Nike-style live card on the lock screen + Dynamic Island during a run.*

- [x] Build an **ActivityKit Live Activity** widget extension in the iOS project (iOS 16.1+)
      (June 2026, 618g): live **distance, elapsed time, and pace/mph** on the lock-screen banner
      and the Dynamic Island (compact + expanded + minimal). Swift source written
      (`RunActivityAttributes.swift`, `RunLiveActivity.swift`, `Team3332WidgetBundle.swift`);
      **Xcode target still needs to be created on the Mac — see `mobile/LIVE-ACTIVITY-SETUP.md`.**
- [x] Bridge the JS recorder → native (June 2026, 618g): a custom Capacitor plugin
      (`LiveActivityPlugin.swift` + `.m`, exposed to JS as `LiveActivity`) with a guarded JS
      helper in `app.jsx` that **starts** the activity on record, **updates** distance/time/pace
      once a second, and **ends** it when the run stops or the screen is left. No-op on web,
      Android, and pre-16.1 (mirrors the GeoTracker registerPlugin guard).
- [x] Accent styling to match the gold/dark TEAM 3332 brand (gold `#D4AF37` on dark `#0B0F14`).
- [ ] **Remaining (Mac/Xcode):** create the Widget Extension target, set `NSSupportsLiveActivities`,
      add the shared attributes file to both targets, then build + on-device check. See the setup doc.
- [ ] Android equivalent later: a foreground-service **ongoing notification** with live stats
      (Android has no Live Activities; the persistent notification is the analog).
- Note: today the app already shows a **persistent "TEAM 3332 — run in progress" notification**
      on the lock screen and keeps tracking while locked (verified on device, 618b). The Live
      Activity is the *richer* upgrade — live stats, not just a static notification.

### Progress tab (under "Me") — Strava-style ✅ built (June 2026)
- [x] Streak, total runs/miles/time, active-day **calendar with gold stars**.
- [x] **Best efforts** (½ mi → 100 miler) and **race-time predictions** (Riegel).
- [x] **6-month** distance + active-time trend chart (vs prior months).
- [x] **Timestamped GPS tracks → true fastest-segment best efforts** (June 2026, 618e): recorded
      points now store `[lat,lon,t]` (t = secs since start) in `GeoTracker`, and the GPX parser
      emits per-point timestamps when the file has them. The progress route computes real
      fastest-segment splits via an O(n) sliding window with interpolation; runs without
      timestamps (legacy or time-less GPX) fall back to the even-pace projection, tagged "est."
      Backwards-compatible — old `[lat,lon]` tracks still render and still estimate.

---

## What Claude Can Build With You

Every item on this roadmap can be built in Cowork. Bring each week's task when you're ready and we'll knock them out one by one.

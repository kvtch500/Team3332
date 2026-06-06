---
type: problems
date: 2026-06-04
project: 3332
---

## Goal
Build and launch a membership-based virtual running team platform.

## Why
It gives runners a real community and identity — something no existing platform provides.

## Tangible Outcomes
- Investor-ready product
- Live on team3332.com with paying members
- Full stack deployed and running in production

## Open Problems
1. (to be defined — we'll figure these out as we go)

## What's Been Built
- Landing page (live at kvtch500.github.io/team3332)
- React app MVP with full dashboard, activity log, leaderboard, challenges, captain panel
- Node.js + SQLite backend with JWT auth
- Stripe payments ($199 Standard / $249 Elite)
- Admin panel (password protected)
- Mobile responsive UI
- Blue/green/gold color scheme
- Onboarding flow for new signups
- Backend deployed on Railway (team3332-production-ba53.up.railway.app)
- Domain: team3332.com (registered via GoDaddy)
- Email: ernest@team3332.com

## What's Left (Roadmap)
- Connect team3332.com to Railway
- UptimeRobot monitoring
- Email system (welcome emails, notifications)
- Terms of Service + Privacy Policy
- Persistent database (PostgreSQL on Railway)
- GPX/Strava activity import
- Public member profiles
- Referral system

## Key Links
- App: https://team3332-production-ba53.up.railway.app/app
- Admin: https://team3332-production-ba53.up.railway.app/admin
- GitHub: https://github.com/kvtch500/team3332
- Landing page: https://kvtch500.github.io/team3332
- Stripe: test mode (sandbox)
- Railway: team3332-production-ba53.up.railway.app

## Local Dev
- Backend: cd "/Users/ernestsmith/Desktop/claude ai/3332/backend" && npm run dev
- App: http://localhost:3001/app
- Demo login: ernest@team3332.com / test123
- Admin key: 092025

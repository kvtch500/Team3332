// server.js — TEAM 3332 API Entry Point

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://team3332.com', 'https://app.team3332.com']
    : '*',
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString().slice(11,19)} ${req.method} ${req.path}`);
    next();
  });
}

// ── ROUTES ───────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/activities',  require('./routes/activities'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/challenges',  require('./routes/challenges'));
app.use('/api/captain',     require('./routes/captain'));
app.use('/api/admin',       require('./routes/admin'));
app.use('/api/stripe',      require('./routes/stripe'));

// ── STATIC FILES ─────────────────────────────────────
app.use('/app',   express.static(path.join(__dirname, '../app')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// ── HEALTH CHECK ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'TEAM 3332 API', version: '1.0.0', time: new Date().toISOString() });
});

// ── CATCH-ALL ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── ERROR HANDLER ────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏃 TEAM 3332 API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Env:    ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;

// lib/mailer.js — Email sending via Resend REST API (no SDK dependency)
//
// Uses Node 18+ global fetch to call https://api.resend.com/emails directly.
// Set these env vars:
//   RESEND_API_KEY   your Resend API key (re_...)
//   EMAIL_FROM       sender address. While your domain is unverified, use
//                    "TEAM 3332 <onboarding@resend.dev>". Once team3332.com is
//                    verified in Resend, switch to "TEAM 3332 <noreply@team3332.com>".
//   CLIENT_URL       base URL used to build links (e.g. https://team3332.com)

const RESEND_API = 'https://api.resend.com/emails';

const FROM = process.env.EMAIL_FROM || 'TEAM 3332 <onboarding@resend.dev>';
const CLIENT_URL = (process.env.CLIENT_URL || 'https://team3332.com').replace(/\/$/, '');

// ── Core sender ──────────────────────────────────────────────
async function send({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;

  // Fail soft: never block signup/login if email isn't configured or fails.
  if (!apiKey) {
    console.warn('[mailer] RESEND_API_KEY not set — skipping email to', to);
    return { skipped: true };
  }

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[mailer] Resend error', res.status, data);
      return { error: data, status: res.status };
    }
    console.log('[mailer] sent', subject, '->', to, '(id:', data.id + ')');
    return { id: data.id };
  } catch (err) {
    console.error('[mailer] send failed:', err.message);
    return { error: err.message };
  }
}

// ── Shared HTML wrapper ──────────────────────────────────────
function layout(inner) {
  return `<!doctype html><html><body style="margin:0;background:#0f172a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:24px;font-weight:800;letter-spacing:1px;color:#D4AF37;">TEAM 3332</span>
    </div>
    <div style="background:#ffffff;border-radius:14px;padding:32px;color:#0f172a;line-height:1.6;">
      ${inner}
    </div>
    <p style="text-align:center;color:#64748b;font-size:12px;margin-top:24px;">
      TEAM 3332 — your virtual running team.<br>
      <a href="${CLIENT_URL}" style="color:#6B5B95;text-decoration:none;">team3332.com</a>
    </p>
  </div></body></html>`;
}

function button(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#D4AF37;color:#fff;font-weight:700;
    padding:13px 26px;border-radius:10px;text-decoration:none;">${label}</a>`;
}

// ── Templates ────────────────────────────────────────────────
function sendWelcomeEmail(user) {
  const html = layout(`
    <h1 style="margin:0 0 12px;font-size:22px;">Welcome to the team, ${escape(user.name)}! 🏃</h1>
    <p style="margin:0 0 16px;color:#334155;">
      You're officially a <strong>${escape(user.tier || 'Standard')}</strong> member of TEAM 3332.
      Log your first run, climb the leaderboard, and jump into a challenge.
    </p>
    <p style="margin:0 0 24px;color:#334155;">Your pace group: <strong>${escape(user.pace_group || 'C')}</strong></p>
    <p style="text-align:center;margin:0 0 8px;">${button(CLIENT_URL + '/app', 'Open the app')}</p>
  `);
  return send({ to: user.email, subject: 'Welcome to TEAM 3332 🏃', html });
}

function sendPasswordResetEmail(user, token) {
  const link = `${CLIENT_URL}/app/reset-password.html?token=${token}`;
  const html = layout(`
    <h1 style="margin:0 0 12px;font-size:22px;">Reset your password</h1>
    <p style="margin:0 0 16px;color:#334155;">
      Hi ${escape(user.name)}, we got a request to reset your TEAM 3332 password.
      This link expires in 1 hour.
    </p>
    <p style="text-align:center;margin:0 0 20px;">${button(link, 'Reset password')}</p>
    <p style="margin:0;color:#64748b;font-size:13px;">
      If you didn't request this, you can safely ignore this email — your password won't change.
    </p>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;word-break:break-all;">${link}</p>
  `);
  return send({ to: user.email, subject: 'Reset your TEAM 3332 password', html });
}

// Minimal HTML escaper for interpolated user values
function escape(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

module.exports = { send, sendWelcomeEmail, sendPasswordResetEmail };

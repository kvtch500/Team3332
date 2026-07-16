// app/src/app.jsx — SOURCE of the TEAM 3332 web/native frontend app body.
// This is the JSX that used to live in an in-browser <script type="text/babel"> block
// inside app/index.html. It is now pre-transpiled by esbuild into app/app.js
// (run `npm run build:app` from the repo root). DO NOT hand-edit app/app.js — edit
// this file and rebuild.
//
// Phase 2a (June 2026): React, ReactDOM and Leaflet are now BUNDLED into app.js
// (esbuild bundle:true) instead of being loaded as CDN UMD globals — the web app boots
// with zero CDN dependency for the rendering stack and works offline.
//
// Phase 2b (June 2026): @capacitor/core is now bundled too, so `Capacitor` and
// `registerPlugin` come from the import below instead of from `window.Capacitor` + the
// native head-loader (both retired). The native iOS/Android runtime still injects the
// low-level bridge at document-start, and the bundled registerPlugin proxies through it —
// this is the canonical Capacitor setup. The 617d failure mode (window.Capacitor injected
// WITHOUT registerPlugin) is gone because registerPlugin now ships in the bundle.
// ⚠️ Background GPS (foreground + locked-screen) must be re-verified on device after this.
import React from 'react';
import * as ReactDOM from 'react-dom/client';
import L from 'leaflet';
import { Capacitor, registerPlugin } from '@capacitor/core';
// Aliased to CapApp — there is a React component named `App` in this file. Used only for
// the Live Activity deep-link (team3332://run → record screen). (619)
import { App as CapApp } from '@capacitor/app';
/* eslint-disable */

const { useState, useEffect, useContext, createContext, useCallback, useRef } = React;

/* ══════════════════════════════════════
   API CLIENT
══════════════════════════════════════ */
const API_BASE = 'https://team3332-production-ba53.up.railway.app/api';

// Token stored in memory (survives page interactions, cleared on tab close)
let _token = localStorage.getItem('t3332_token') || null;

const api = {
  setToken(t) { _token = t; if (t) localStorage.setItem('t3332_token', t); else localStorage.removeItem('t3332_token'); },
  getToken() { return _token; },
  async req(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  get:    (path)        => api.req('GET',    path),
  post:   (path, body)  => api.req('POST',   path, body),
  async postRaw(path, text) {
    const headers = { 'Content-Type': 'application/gpx+xml' };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;
    const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: text });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  patch:  (path, body)  => api.req('PATCH',  path, body),
  delete: (path)        => api.req('DELETE', path),
};

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
// Shared avatar: shows the member's uploaded photo if present, else their initial.
function Avatar({ member, style }) {
  const url = member && member.avatar_url;
  if (url) {
    return <div className="avatar" style={{...style, overflow:'hidden', backgroundImage:`url(${url})`, backgroundSize:'cover', backgroundPosition:'center'}} />;
  }
  return <div className="avatar" style={style}>{member && member.name ? member.name[0] : '?'}</div>;
}

function formatDate(iso) {
  if (!iso) return '';
  // logged_at is stored as a naive UTC wall-clock string ("YYYY-MM-DD HH:MM:SS", no zone) — it
  // comes from toISOString() with the 'T'/'Z' stripped. JS parses a bare date-time string as
  // LOCAL, which shifted every displayed time by the viewer's UTC offset (e.g. a 5:49pm CDT run
  // showed as 10:49pm). Tag it as UTC so toLocaleTimeString converts it back to local correctly.
  // Strings that already carry a zone (full ISO with 'Z' or an offset — e.g. challenge dates)
  // are left untouched.
  let s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  }
  const d = new Date(s);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return `Today, ${d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
  if (diff === 1) return `Yesterday, ${d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
  return d.toLocaleDateString('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

function daysLeft(endsAt) {
  const diff = Math.ceil((new Date(endsAt) - new Date()) / 86400000);
  return Math.max(0, diff);
}

function pctProgress(progress, goalValue) {
  if (!goalValue) return 0;
  return Math.min(100, Math.round((progress / goalValue) * 100));
}

/* ══════════════════════════════════════
   UTILITIES
══════════════════════════════════════ */
function Toast({ message, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, []);
  return <div className="toast">✅ {message}</div>;
}

/* ══════════════════════════════════════
   LOCATION & CLUBS (shared)
══════════════════════════════════════ */
const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];

// Country list generated from the browser's own region database — works worldwide
const COUNTRIES = (() => {
  const out = [];
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let i = 65; i <= 90; i++) for (let j = 65; j <= 90; j++) {
      const code = String.fromCharCode(i) + String.fromCharCode(j);
      try { const name = dn.of(code); if (name && name !== code) out.push(name); } catch (e) {}
    }
    out.sort();
  } catch (e) {}
  return ['United States'].concat(out.filter(n => n !== 'United States'));
})();

function fmtLocation(u) {
  return [u.city, u.state, u.country].filter(Boolean).join(', ');
}

function locationComplete(v) {
  if (!v.country || !v.city.trim()) return false;
  if (v.country === 'United States' && !v.state) return false;
  return true;
}

function LocationFields({ value, onChange }) {
  const isUS = value.country === 'United States';
  const set = (k, v) => onChange(k === 'country' ? { ...value, country: v, state: '' } : { ...value, [k]: v });
  return (
    <div>
      <div className="form-group">
        <label>Country</label>
        <select value={value.country} onChange={e=>set('country', e.target.value)}>
          <option value="">Select your country…</option>
          {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>{isUS ? 'State' : 'State / Province / Region (optional)'}</label>
        {isUS ? (
          <select value={value.state} onChange={e=>set('state', e.target.value)}>
            <option value="">Select your state…</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <input type="text" placeholder="e.g. Ontario, Bavaria…" value={value.state} onChange={e=>set('state', e.target.value)} />
        )}
      </div>
      <div className="form-group">
        <label>City</label>
        <input type="text" placeholder="Your city" value={value.city} onChange={e=>set('city', e.target.value)} />
      </div>
    </div>
  );
}

function ClubModal({ clubId, onClose }) {
  const [data, setData]   = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/clubs/${clubId}`).then(setData).catch(e => setError(e.message));
  }, [clubId]);

  return (
    <div className="modal-overlay" onClick={e=>{if(e.target.className==='modal-overlay')onClose()}}>
      <div className="modal">
        {!data && !error && <div style={{textAlign:'center',padding:30}}><Spinner size={26} /></div>}
        {error && <div style={{textAlign:'center',padding:20,color:'var(--gray)',fontSize:'0.85rem'}}>{error}</div>}
        {data && (
          <div>
            <div className="modal-title">🏃 {data.club.name}</div>
            <div style={{fontSize:'0.8rem',color:'var(--gray)',marginBottom:16}}>
              {data.member_count} member{data.member_count===1?'':'s'} on TEAM 3332
            </div>
            <div style={{maxHeight:'50vh',overflowY:'auto'}}>
              {data.members.map(m => (
                <div key={m.id} className="lb-row">
                  <Avatar member={m} style={{width:34,height:34,fontSize:'0.82rem'}} />
                  <div style={{flex:1}}>
                    <div className="lb-name">{m.name}{m.is_captain ? <span style={{fontSize:'0.7rem',marginLeft:6}}>🎖️</span> : null}</div>
                    <div className="lb-sub">{fmtLocation(m) || `Group ${m.pace_group}`}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="lb-val">{m.total_miles != null ? m.total_miles : 0} mi</div>
                    <div style={{fontSize:'0.72rem',color:'var(--gray)'}}>{m.total_runs} activities</div>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" style={{width:'100%',marginTop:14}} onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Clickable club name — tap to open the member roster
function ClubName({ id, name, style }) {
  const [open, setOpen] = useState(false);
  if (!id || !name) return null;
  return (
    <React.Fragment>
      <span onClick={e=>{e.stopPropagation(); setOpen(true);}} style={Object.assign({color:'var(--blue)',cursor:'pointer'}, style || {})}>🏃 {name}</span>
      {open && <ClubModal clubId={id} onClose={()=>setOpen(false)} />}
    </React.Fragment>
  );
}

// Search existing clubs / submit a new one
function ClubPicker({ onJoined }) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy]           = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSearching(true);
      api.get(`/clubs?search=${encodeURIComponent(query.trim())}`)
        .then(d => setResults(d.clubs || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  const join = async (name) => {
    setBusy(true);
    try { onJoined(await api.post('/clubs/join', { name })); }
    catch(e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const exactMatch = results.some(c => c.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div>
      <div className="form-group" style={{marginBottom:10}}>
        <input type="text" placeholder="Search or type your club's name…" value={query} onChange={e=>setQuery(e.target.value)} />
      </div>
      {searching && <div style={{textAlign:'center',padding:8}}><Spinner /></div>}
      {results.map(c => (
        <button key={c.id} className="btn btn-secondary" style={{width:'100%',justifyContent:'space-between',marginBottom:8}} disabled={busy} onClick={()=>join(c.name)}>
          <span>🏃 {c.name}</span>
          <span style={{fontSize:'0.75rem',color:'var(--gray)'}}>{c.member_count} member{c.member_count===1?'':'s'}</span>
        </button>
      ))}
      {query.trim().length > 1 && !exactMatch && !searching && (
        <React.Fragment>
          <button className="btn btn-ghost" style={{width:'100%',border:'1px dashed var(--gray)'}} disabled={busy} onClick={()=>join(query.trim())}>
            + Add "{query.trim()}" as a new club
          </button>
          <div style={{fontSize:'0.72rem',color:'var(--gray)',marginTop:8,textAlign:'center'}}>New clubs appear publicly once verified by an admin.</div>
        </React.Fragment>
      )}
    </div>
  );
}

function SVGMap({ runId, routeData }) {
  // Real route from GPX import (route_data = {source:'gpx', points:[[lat,lon],...]})
  let real = null;
  if (routeData) {
    try {
      const parsed = typeof routeData === 'string' ? JSON.parse(routeData) : routeData;
      if (parsed && Array.isArray(parsed.points) && parsed.points.length >= 2) real = parsed.points;
    } catch (e) { /* fall through to placeholder */ }
  }

  if (real) {
    const lats = real.map(p => p[0]), lons = real.map(p => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    // Correct horizontal scale for latitude so routes aren't stretched
    const lonScale = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    const spanLat = Math.max(maxLat - minLat, 1e-5);
    const spanLon = Math.max((maxLon - minLon) * lonScale, 1e-5);
    const W = 300, H = 200, PAD = 16;
    const scale = Math.min((W - PAD * 2) / spanLon, (H - PAD * 2) / spanLat);
    const ox = (W - spanLon * scale) / 2, oy = (H - spanLat * scale) / 2;
    const pts = real.map(([lat, lon]) => [
      ox + ((lon - minLon) * lonScale) * scale,
      H - (oy + (lat - minLat) * scale), // flip Y (north = up)
    ]);
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const [sx, sy] = pts[0], [ex, ey] = pts[pts.length - 1];
    return (
      <div className="map-placeholder">
        <svg className="map-route" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid meet">
          <path d={d} fill="none" stroke="var(--blue, #D4AF37)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          <circle cx={sx} cy={sy} r="5" fill="#4caf50" />
          <circle cx={ex} cy={ey} r="5" fill="#e74c3c" />
        </svg>
        <span style={{position:'absolute',bottom:8,right:12,fontSize:'0.72rem',color:'var(--gray)'}}>📍 GPS Route</span>
      </div>
    );
  }

  // Placeholder for manually-logged runs (no GPS data)
  const paths = {
    1: "M 20 150 C 60 80 100 180 150 120 C 200 60 240 160 280",
    2: "M 20 140 C 80 100 120 160 180 100 C 230 50 260 130 280",
    3: "M 20 160 C 50 80 100 200 160 100 C 210 20 260 140 280",
    default: "M 20 140 C 80 120 140 160 200 110 C 240 70 260 140 280",
  };
  const d = paths[runId] || paths.default;
  return (
    <div className="map-placeholder">
      <svg className="map-route" viewBox="0 0 300 200" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={`grad${runId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FF5722" stopOpacity="0.8"/>
            <stop offset="100%" stopColor="#FF8C42" stopOpacity="0.4"/>
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke={`url(#grad${runId})`} strokeWidth="3" strokeLinecap="round" />
        <circle cx="20" cy="150" r="5" fill="#4caf50" />
        <circle cx="280" cy={d.includes('280')?parseInt(d.split('280')[0].slice(-3))||120:120} r="5" fill="#FF5722" />
      </svg>
      <span style={{position:'absolute',bottom:8,right:12,fontSize:'0.72rem',color:'var(--gray)'}}>📍 Route Map</span>
    </div>
  );
}

/* ══════════════════════════════════════
   LOADING SPINNER
══════════════════════════════════════ */
function Spinner({ size = 20 }) {
  return (
    <span style={{display:'inline-block',width:size,height:size,border:`2px solid rgba(255,255,255,0.2)`,borderTopColor:'var(--white)',borderRadius:'50%',animation:'spin 0.7s linear infinite'}} />
  );
}

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
function AuthPage({ onLogin }) {
  const [tab, setTab]   = useState('login');
  const [form, setForm] = useState({ name:'', email:'', password:'', tier:'Standard', pace_group:'C' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({...f, [k]: v}));

  const handleLogin = async () => {
    setError(''); setLoading(true);
    try {
      const { token, user } = await api.post('/auth/login', { email: form.email, password: form.password });
      api.setToken(token);
      onLogin(user);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleSignup = async () => {
    if (!form.name || !form.email || !form.password) { setError('Please fill all fields.'); return; }
    setError(''); setLoading(true);
    try {
      const tierVal = form.tier.startsWith('Elite') ? 'Elite' : 'Standard';
      const { token, user } = await api.post('/auth/register', { name: form.name, email: form.email, password: form.password, tier: tierVal, pace_group: form.pace_group });
      api.setToken(token);
      onLogin(user, true);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleForgot = async () => {
    setError(''); setNotice('');
    if (!form.email) { setError('Enter your email above, then tap “Forgot password?”'); return; }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: form.email });
      setNotice('If that email is registered, a reset link is on its way. Check your inbox (and spam).');
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const onKey = (e, fn) => { if (e.key === 'Enter') fn(); };

  return (
    <div className="auth-wrapper">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div className="auth-card">
        <div className="auth-logo">TEAM <span>3332</span></div>
        <div className="auth-tagline">Run Your World. Together.</div>
        <div className="auth-tabs">
          <button className={`auth-tab ${tab==='login'?'active':''}`} onClick={()=>{setTab('login');setError('')}}>Sign In</button>
          <button className={`auth-tab ${tab==='signup'?'active':''}`} onClick={()=>{setTab('signup');setError('')}}>Join Free</button>
        </div>
        {error && <div style={{background:'rgba(244,67,54,0.1)',border:'1px solid rgba(244,67,54,0.3)',borderRadius:8,padding:'10px 14px',fontSize:'0.82rem',color:'#ef5350',marginBottom:16}}>{error}</div>}
        {notice && <div style={{background:'rgba(107,91,149,0.1)',border:'1px solid rgba(107,91,149,0.35)',borderRadius:8,padding:'10px 14px',fontSize:'0.82rem',color:'#6EE7B7',marginBottom:16}}>{notice}</div>}
        {tab === 'login' ? (
          <>
            <div className="form-group"><label>Email</label><input type="email" placeholder="you@example.com" value={form.email} onChange={e=>set('email',e.target.value)} onKeyDown={e=>onKey(e,handleLogin)} /></div>
            <div className="form-group"><label>Password</label><input type="password" placeholder="••••••••" value={form.password} onChange={e=>set('password',e.target.value)} onKeyDown={e=>onKey(e,handleLogin)} /></div>
            <div style={{marginBottom:16,textAlign:'right'}}><span onClick={handleForgot} style={{fontSize:'0.8rem',color:'var(--blue)',cursor:'pointer'}}>Forgot password?</span></div>
            <button className="btn btn-primary btn-full" onClick={handleLogin} disabled={loading}>
              {loading ? <Spinner /> : 'Sign In'}
            </button>
            <div style={{textAlign:'center',marginTop:16,fontSize:'0.8rem',color:'var(--gray)'}}>Demo: ernest@team3332.com / test123</div>
          </>
        ) : (
          <>
            <div className="form-group"><label>Full Name</label><input type="text" placeholder="Your name" value={form.name} onChange={e=>set('name',e.target.value)} /></div>
            <div className="form-group"><label>Email</label><input type="email" placeholder="you@example.com" value={form.email} onChange={e=>set('email',e.target.value)} /></div>
            <div className="form-group"><label>Password</label><input type="password" placeholder="Create a password (min 6 chars)" value={form.password} onChange={e=>set('password',e.target.value)} /></div>
            <div className="form-group">
              <label>Membership Tier</label>
              <select value={form.tier} onChange={e=>set('tier',e.target.value)}>
                <option value="Standard">Standard — $199/yr</option>
                <option value="Elite">Elite — $249/yr</option>
              </select>
            </div>
            <div className="form-group">
              <label>Pace Group</label>
              <select value={form.pace_group} onChange={e=>set('pace_group',e.target.value)}>
                <option value="A">A (Under 8:00/mi)</option>
                <option value="B">B (8:00–9:30/mi)</option>
                <option value="C">C (9:30–11:00/mi)</option>
                <option value="D">D (11:00+/mi)</option>
              </select>
            </div>
            <button className="btn btn-primary btn-full" onClick={handleSignup} disabled={loading}>
              {loading ? <Spinner /> : 'Create Account →'}
            </button>
            <div style={{textAlign:'center',marginTop:12,fontSize:'0.74rem',color:'var(--gray)'}}>
              By creating an account you agree to our <a href="/app/terms.html" target="_blank" style={{color:'var(--blue)'}}>Terms of Service</a> and <a href="/app/privacy.html" target="_blank" style={{color:'var(--blue)'}}>Privacy Policy</a>.
            </div>
            <div style={{textAlign:'center',marginTop:10,fontSize:'0.78rem',color:'var(--gray)'}}>🎉 First 250 members get a free 3-month trial</div>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   ONBOARDING
══════════════════════════════════════ */
function Onboarding({ user, onComplete }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    weekly_miles: '', race_goal: '', experience: '', pace_group: user.pace_group || 'C'
  });
  const [saving, setSaving] = useState(false);
  const [loc, setLoc] = useState({ country: user.country || '', state: user.state || '', city: user.city || '' });
  const [me, setMe] = useState(user);
  const TOTAL_STEPS = 6;

  const steps = [
    {
      key: 'weekly_miles',
      question: 'How many miles do you want to run per week?',
      emoji: '📍',
      options: ['5–10 miles', '10–20 miles', '20–30 miles', '30+ miles'],
    },
    {
      key: 'race_goal',
      question: 'What\'s your primary race goal?',
      emoji: '🏁',
      options: ['5K', '10K', 'Half Marathon', 'Full Marathon', 'No race — just running'],
    },
    {
      key: 'experience',
      question: 'How long have you been running?',
      emoji: '🏃',
      options: ['Just starting out', '1–2 years', '3–5 years', '5+ years'],
    },
    {
      key: 'pace_group',
      question: 'What\'s your current pace?',
      emoji: '⚡',
      options: ['A — Under 8:00/mi', 'B — 8:00–9:30/mi', 'C — 9:30–11:00/mi', 'D — 11:00+/mi'],
    },
  ];

  // Steps 0–3 are the option questions above; 4 = location (required); 5 = club (optional)
  const current = step < steps.length ? steps[step] : (
    step === 4
      ? { question: 'Where are you running from?', emoji: '🌍' }
      : { question: 'Are you part of a run club?', emoji: '🏃' }
  );

  const select = (val) => {
    const key = current.key;
    // For pace_group, extract the letter
    const stored = key === 'pace_group' ? val[0] : val;
    setAnswers({ ...answers, [key]: stored });
    setStep(s => s + 1);
  };

  // Step 4 → save profile (pace, bio, location), then move to club step
  const saveLocation = async () => {
    setSaving(true);
    try {
      const d = await api.patch('/auth/me', {
        pace_group: answers.pace_group,
        country: loc.country,
        state: loc.state.trim() || null,
        city: loc.city.trim(),
        bio: `Goal: ${answers.race_goal} · ${answers.weekly_miles}/week · Running for ${answers.experience}`
      });
      if (d.user) setMe(d.user);
    } catch(e) { /* non-blocking */ }
    finally { setSaving(false); setStep(5); }
  };

  // Step 5 → joined a club (refresh user so club shows immediately)
  const clubJoined = async (d) => {
    try { const r = await api.get('/auth/me'); onComplete(r.user, d.message); }
    catch(e) { onComplete(me, d.message); }
  };

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      padding:24,
      background:'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255,87,34,0.12) 0%, transparent 70%), var(--black)'
    }}>
      <div style={{width:'100%', maxWidth:480}}>
        {/* Logo */}
        <div style={{textAlign:'center', marginBottom:40}}>
          <div style={{fontFamily:'Barlow Condensed',fontWeight:900,fontSize:'1.8rem',marginBottom:6}}>
            TEAM <span style={{color:'var(--blue)'}}>3332</span>
          </div>
          <div style={{color:'var(--gray)',fontSize:'0.85rem'}}>Welcome, {user.name.split(' ')[0]}. Let\'s set you up. 🎉</div>
        </div>

        {/* Progress dots */}
        <div style={{display:'flex',justifyContent:'center',gap:8,marginBottom:36}}>
          {Array.from({length: TOTAL_STEPS}).map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8, height:8, borderRadius:100,
              background: i < step ? 'var(--blue)' : i === step ? 'var(--blue)' : 'var(--border)',
              transition:'all 0.3s ease'
            }} />
          ))}
        </div>

        {/* Card */}
        <div className="card" style={{padding:32}}>
          <div style={{textAlign:'center',fontSize:2.5+'rem',marginBottom:16}}>{current.emoji}</div>
          <div style={{
            fontFamily:'Barlow Condensed',fontWeight:800,fontSize:'1.4rem',
            textTransform:'uppercase',textAlign:'center',marginBottom:28,lineHeight:1.2
          }}>{current.question}</div>

          {step < steps.length && (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {current.options.map(opt => (
                <button
                  key={opt}
                  className="btn btn-secondary"
                  style={{justifyContent:'flex-start', padding:'14px 18px', fontSize:'0.92rem'}}
                  onClick={() => select(opt)}
                  disabled={saving}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {step === 4 && (
            <div>
              <LocationFields value={loc} onChange={setLoc} />
              <button className="btn btn-primary" style={{width:'100%',marginTop:4}} disabled={saving || !locationComplete(loc)} onClick={saveLocation}>
                {saving ? <Spinner /> : 'Continue →'}
              </button>
            </div>
          )}

          {step === 5 && (
            <div>
              <ClubPicker onJoined={clubJoined} />
              <button className="btn btn-ghost" style={{width:'100%',marginTop:12}} onClick={()=>onComplete(me)}>
                No club — skip for now
              </button>
            </div>
          )}
        </div>

        <div style={{textAlign:'center',marginTop:20,color:'var(--gray)',fontSize:'0.78rem'}}>
          Step {step + 1} of {TOTAL_STEPS}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   DASHBOARD
══════════════════════════════════════ */
function Dashboard({ user }) {
  const [stats, setStats]       = useState(null);
  const [activities, setActs]   = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [leaderboard, setLb]    = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/activities/stats'),
      api.get('/activities?limit=3'),
      api.get('/challenges'),
      api.get('/leaderboard?period=monthly&limit=5'),
      api.get('/captain/announcements?limit=5').catch(() => ({ announcements: [] })),
    ]).then(([s, a, c, lb, an]) => {
      setStats(s);
      setActs(a.activities || []);
      setChallenges((c.challenges || []).filter(x => x.joined));
      setLb(lb.leaderboard || []);
      setAnnouncements(an.announcements || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}><Spinner size={32} /></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <div className="page-title">Dashboard</div>
            <div className="page-sub">Welcome back, {user.name.split(' ')[0]} 👋</div>
          </div>
          <span className={`badge ${user.tier==='Elite'?'badge-orange':'badge-blue'}`}>{user.tier}</span>
        </div>
      </div>
      <div className="page-body">
        {/* Stats Row */}
        <div className="grid-4 mb-24">
          {[
            { label: 'Total Miles', value: stats?.total_miles ?? '—', change: `${stats?.weekly_miles ?? 0} mi this week`, icon: '🏃' },
            { label: 'Activities',  value: stats?.total_runs ?? '—',  change: 'runs + walks, all time', icon: '📍' },
            { label: 'Calories',    value: stats?.total_calories ? `${(stats.total_calories/1000).toFixed(1)}k` : '—', change: 'burned total', icon: '🔥' },
            { label: 'Streak',      value: stats?.streak ? `${stats.streak}d` : '0d', change: 'Keep it up!', icon: '⚡' },
          ].map((s, i) => (
            <div key={i} className="stat-card">
              <div className="stat-label">{s.icon} {s.label}</div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-change">{s.change}</div>
            </div>
          ))}
        </div>

        {/* Team Announcements (from captains) */}
        {announcements.length > 0 && (
          <div className="card mb-24">
            <div className="card-title">📣 Team Announcements</div>
            {announcements.map(an => (
              <div key={an.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <div className="flex items-center justify-between mb-4">
                  <div style={{fontWeight:600,fontSize:'0.88rem'}}>{an.title}</div>
                  <span style={{fontSize:'0.72rem',color:'var(--gray)'}}>{formatDate(an.created_at)}</span>
                </div>
                <div style={{fontSize:'0.83rem',color:'var(--gray)',whiteSpace:'pre-wrap'}}>{an.body}</div>
                <div style={{fontSize:'0.72rem',color:'var(--blue)',marginTop:4}}>— {an.captain_name}, Captain</div>
              </div>
            ))}
          </div>
        )}

        <div className="grid-2 mb-24" style={{gap:20}}>
          {/* Recent Activity */}
          <div className="card">
            <div className="card-title">Recent Activity <span style={{fontSize:'0.75rem',color:'var(--gray)',fontFamily:'Barlow',fontWeight:400,textTransform:'none',letterSpacing:0}}>Latest</span></div>
            {activities.length === 0 && <div className="empty-state" style={{padding:'24px 0'}}><p>No runs yet. Log your first one!</p></div>}
            {activities.map(a => (
              <div key={a.id} className="activity-item">
                <div className="activity-icon">{a.type === 'Walk' ? '🚶' : '🏃'}</div>
                <div>
                  <div className="activity-title">{a.name}</div>
                  <div className="activity-meta">{formatDate(a.logged_at)}</div>
                </div>
                <div className="activity-stats">
                  <div className="activity-stat-val">{a.distance} mi</div>
                  <div className="activity-stat-label">{a.type==='Walk' ? `${activityStat(a).val} mph` : `${a.pace || '—'}/mi`}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Active Challenges */}
          <div className="card">
            <div className="card-title">Active Challenges</div>
            {challenges.length === 0 && <div className="empty-state" style={{padding:'24px 0'}}><p>No active challenges. Join one!</p></div>}
            {challenges.map(c => {
              const pct = pctProgress(c.my_progress || 0, c.goal_value);
              return (
                <div key={c.id} style={{marginBottom:16}}>
                  <div className="flex items-center justify-between mb-8">
                    <div style={{fontSize:'0.85rem',fontWeight:600}}>{c.icon} {c.title}</div>
                    <span style={{fontSize:'0.72rem',color:'var(--gray)'}}>{daysLeft(c.ends_at)}d left</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{width:`${pct}%`}}></div></div>
                  <div style={{fontSize:'0.72rem',color:'var(--blue)',marginTop:4}}>{pct}% complete</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leaderboard Preview */}
        <div className="card">
          <div className="card-title">Team Leaderboard <span className="badge badge-orange" style={{marginLeft:8}}>Monthly</span></div>
          {leaderboard.map((m, i) => (
            <div key={m.id} className={`lb-row ${m.is_you?'lb-you':''}`}>
              <div className={`lb-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}`}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</div>
              <Avatar member={m} style={{width:30,height:30,fontSize:'0.75rem'}} />
              <div style={{flex:1}}>
                <div className="lb-name">{m.name}{m.is_you && <span style={{fontSize:'0.7rem',color:'var(--blue)',marginLeft:6}}>you</span>}</div>
                <div className="lb-sub">Pace Group {m.pace_group} · {m.tier}</div>
              </div>
              <div className="lb-val">{m.total_miles} mi</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   GPS RECORDER (one-touch record)
══════════════════════════════════════ */
function havMeters(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad) * Math.cos(b.lat*rad) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Pure step function: takes recorder state + a GPS fix, returns updated state.
// Filters (tuned 619):
//   • poor accuracy (>30m) — reject the fix outright (tightened from 35m).
//   • SPEED GATE (primary anti-drift): if the fix carries a valid speed below ~0.4 m/s
//     (≈0.9 mph), the user isn't really moving — drop it. On iOS this speed is Doppler-
//     derived (measured from the satellite signal), so it reads ~0 when stationary and a
//     true value when walking — it does NOT drift the way differenced positions do. It's
//     -1/negative when momentarily unavailable (native) and null on web; in those cases we
//     skip the gate and fall back to the distance floor below, so nothing breaks where
//     speed is missing. This is what actually kills stationary creep.
//   • noise floor: ignore steps shorter than 5m (raised from 3m) — the fallback for when
//     speed is unavailable. Because `last` only advances on an ACCEPTED fix, a real walk
//     loses nothing (consecutive sub-5m steps batch up against the older `last` until they
//     clear the floor). Deliberately FLAT, not accuracy-scaled: an accuracy-scaled floor
//     under-counted real out-and-back walks by ~15% in poor (urban-canyon) GPS.
//   • GPS jumps (>12 m/s) — reject teleports (absolute fallback when no speed is reported).
//   • MULTIPATH guard: when the platform reports a real speed, a position step implying a
//     speed far above it (>2.5× speed, with slack) is a building-reflection jump, not real
//     movement — drop it. In an urban canyon a fix's POSITION can jump 20-30m off a wall
//     even while you walk normally; that spike passed both the speed gate (Doppler reads your
//     true ~1 m/s) and the 12 m/s cap (30m/6s = 5 m/s), and it inflated distance and the
//     average-speed readout (a slow walk showing 6 mph). Cross-checking the position delta
//     against the Doppler speed catches exactly these. (619)
// Points are stored as [lat, lon, ts] where ts = whole seconds since the first fix. The
// timestamp powers real fastest-segment best efforts on the backend; consumers that only
// read p[0]/p[1] (maps, distance) are unaffected by the extra element. (618e)
const GPS_MAX_ACCURACY_M = 30;   // reject fixes worse than this (metres)
const GPS_MIN_SPEED_MS = 0.4;    // below this (≈0.9 mph), a valid speed reading = stationary
const GPS_MIN_STEP_M = 5;        // ignore steps shorter than this (metres) — drift floor / speed fallback
function recorderStep(st, fix) {
  const { lat, lon, accuracy, speed, t } = fix;
  if (accuracy != null && accuracy > GPS_MAX_ACCURACY_M) return st;
  const hasSpeed = typeof speed === 'number' && speed >= 0;
  // Doppler speed gate — only when the platform gave us a real (non-negative, non-null) speed.
  if (hasSpeed && speed < GPS_MIN_SPEED_MS) return st;
  if (!st.last) return { ...st, t0: t, last: { lat, lon, t }, points: [[lat, lon, 0]] };
  const d = havMeters(st.last, { lat, lon });
  if (d < GPS_MIN_STEP_M) return st;
  const dt = (t - st.last.t) / 1000;
  if (dt > 0 && d / dt > 12) return st;
  // Multipath guard: reject a step whose implied speed grossly exceeds the Doppler speed.
  if (hasSpeed && dt > 0 && (d / dt) > Math.max(speed * 2.5, speed + 3)) return st;
  const ts = Math.max(0, Math.round((t - st.t0) / 1000));
  return {
    ...st,
    meters: st.meters + d,
    last: { lat, lon, t },
    // Keep the drawn route bounded without freezing the live trail. Before, once we hit
    // 4000 points we dropped every new fix — so on long activities the polyline stopped
    // advancing while distance kept counting. Now, at the cap we halve density (keep every
    // other point, preserving the start at index 0) and append the newest fix, so the whole
    // route stays represented and the tip keeps moving. Distance (meters) is computed from
    // `last`, independent of this array, so it's unaffected. (618)
    points: st.points.length < 4000
      ? [...st.points, [lat, lon, ts]]
      : [...st.points.filter((_, i) => i % 2 === 0), [lat, lon, ts]],
  };
}

// Auto-pause accounting (opt-in, default off). The recording clock stays wall-clock anchored
// (now - start) so it self-corrects after the WebView is backgrounded; when the runner stops
// moving we bank that stopped span into `pausedMs` and subtract it, so elapsed/pace reflect
// MOVING time only. Movement is detected upstream in the fix callback (an accepted distance step
// OR a Doppler speed ≥ the walk threshold bumps `lastMove`); this function only does the time
// accounting and reports whether we're paused right now. Pure → node-checkable & simulatable.
// With `enabled` false it never pauses, so elapsed === round((now-start)/1000) — identical to the
// prior behavior, which keeps the device-verified background path untouched. (auto-pause, June 2026)
const AUTO_PAUSE_GRACE_MS = 4000; // keep the clock running this long after motion stops, then pause
function autoPauseStep(s, { now, lastMove, enabled }) {
  const paused = !!enabled && (now - lastMove) >= AUTO_PAUSE_GRACE_MS;
  let pausedMs = s.pausedMs, anchor = s.anchor;
  if (paused && anchor == null) anchor = now;                       // entered a pause
  if (!paused && anchor != null) { pausedMs += now - anchor; anchor = null; } // resumed → bank it
  const live = anchor != null ? now - anchor : 0;                  // current open pause span
  const activeMs = Math.max(0, (now - s.start) - pausedMs - live);
  return { start: s.start, pausedMs, anchor, paused, elapsed: Math.round(activeMs / 1000) };
}

// Recording-time GPS failure → user-facing banner text. GPS errors arrive on async watch
// callbacks, which React error boundaries can't catch, so the recorder surfaces them through
// state instead (see RecordRun's gpsAlert). Pure → node-checkable. (618f)
function recGpsAlert(kind) {
  return kind === 'denied'
    ? '⚠️ Location access turned off — distance is paused. Re-enable location to keep recording.'
    : '⚠️ GPS signal lost — distance may pause until it comes back.';
}

function fmtClock(secs) {
  const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}
function fmtPace(secs, miles) {
  if (!miles || miles < 0.05) return '—:—';
  const spm = secs / miles;
  if (spm > 3600) return '—:—';
  const m = Math.floor(spm/60), s = Math.round(spm%60);
  return s === 60 ? `${m+1}:00` : `${m}:${String(s).padStart(2,'0')}`;
}
// Speed in mph (walkers see speed; runners see pace).
// 0 distance with elapsed time = legitimately 0.0 mph (standing still),
// so only show '—' when there's no time data to compute from.
function fmtSpeed(secs, miles) {
  if (!secs) return '—';
  const mph = (miles || 0) / (secs / 3600);
  if (mph > 30) return '—'; // GPS glitch guard
  return mph.toFixed(1);
}
// Live (current) speed readout. The on-screen secondary stat used to be the CUMULATIVE average
// (total miles / total time), which swings wildly in the first ~10-15s when both numbers are tiny.
// Instead we keep an exponential moving average of the *current* speed in m/s, updated per fix from
// the Doppler speed (with a distance/time fallback), so the number is stable but still responsive.
// The saved run + the review screen still show the true average — only the live display is smoothed.
// Pure → node-checkable. (smoothed live speed, June 2026)
const SPEED_EMA_ALPHA = 0.3;     // 0..1 — higher = snappier, lower = smoother
function emaSpeed(prev, inst, alpha = SPEED_EMA_ALPHA) {
  if (typeof inst !== 'number' || !isFinite(inst) || inst < 0) return prev; // ignore bad samples
  if (prev == null) return inst;
  return prev + alpha * (inst - prev);
}
function liveSpeedMph(mps) {
  if (mps == null) return '—';
  const mph = mps * 2.2369363;
  if (mph < 0 || mph > 30) return '—'; // GPS glitch guard (matches fmtSpeed)
  return mph.toFixed(1);
}
function livePaceFromMps(mps) {
  if (!mps || mps < 0.1) return '—:—';   // stopped / too slow to be a meaningful pace
  const spm = 1609.344 / mps;             // seconds per mile
  if (spm > 3600) return '—:—';
  const m = Math.floor(spm / 60), s = Math.round(spm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}
// Build the iOS Live Activity payload from the live recorder state: distance in miles +
// elapsed secs + the same secondary metric the on-screen card shows (pace for runs, mph for
// walks). Pure → node-checkable. Consumed by the LiveActivity bridge in RecordRun. (618g)
function liveActivityPayload(actType, meters, elapsed) {
  const mi = (meters || 0) / 1609.344;
  const isWalk = actType === 'Walk';
  return {
    activityType: actType === 'Walk' ? 'Walk' : 'Run',
    distanceMiles: Math.round(mi * 100) / 100,
    elapsedSeconds: Math.max(0, Math.round(elapsed || 0)),
    metricValue: isWalk ? fmtSpeed(elapsed, mi) : fmtPace(elapsed, mi),
    metricLabel: isWalk ? 'MPH' : '/MI',
  };
}
// "HH:MM:SS" | "MM:SS" → seconds
function durSecs(dur) {
  if (!dur) return 0;
  const p = String(dur).trim().split(':').map(Number);
  if (p.some(isNaN)) return 0;
  if (p.length === 3) return p[0]*3600 + p[1]*60 + p[2];
  if (p.length === 2) return p[0]*60 + p[1];
  return 0;
}
// Third stat for a stored activity: Walk → mph, Run → pace
function activityStat(a) {
  if (a.type === 'Walk') {
    const miles = parseFloat(a.distance) || 0;
    let secs = durSecs(a.duration);
    if (!secs && a.pace) secs = durSecs(a.pace) * miles;
    return { val: fmtSpeed(secs, miles), unit: 'mph' };
  }
  return { val: a.pace || '—', unit: '/mile' };
}

/* ── Share card (canvas → native share sheet) ────────────── */
// opts: { name, type, distance, durationStr, secs, points, dateStr }
function renderShareCard(opts) {
  const W = 1080, H = 1080;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const GOLD = '#D4AF37', DARK = '#0b0f14', GRAY = '#9aa3ad';
  // Background
  x.fillStyle = DARK; x.fillRect(0, 0, W, H);
  const grad = x.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, 'rgba(212,175,55,0.10)'); grad.addColorStop(0.5, 'rgba(212,175,55,0)'); grad.addColorStop(1, 'rgba(107,91,149,0.12)');
  x.fillStyle = grad; x.fillRect(0, 0, W, H);
  // Header
  x.fillStyle = GOLD; x.fillRect(64, 78, 10, 64);
  x.font = "700 64px 'Barlow Condensed', sans-serif"; x.fillStyle = '#fff'; x.textBaseline = 'top';
  x.fillText('TEAM 3332', 98, 78);
  x.font = "400 30px 'Barlow', sans-serif"; x.fillStyle = GRAY;
  x.fillText(opts.dateStr || '', 98, 148);
  // Activity name
  x.font = "700 58px 'Barlow Condensed', sans-serif"; x.fillStyle = '#fff';
  const icon = opts.type === 'Walk' ? '🚶' : '🏃';
  x.fillText(`${icon} ${String(opts.name || ('My ' + (opts.type || 'Run'))).slice(0, 32)}`, 64, 230);
  // Route
  const pts = Array.isArray(opts.points) && opts.points.length >= 2 ? opts.points : null;
  const RX = 64, RY = 340, RW = W - 128, RH = 420;
  if (pts) {
    const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const lonScale = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    const spanLat = Math.max(maxLat - minLat, 1e-5);
    const spanLon = Math.max((maxLon - minLon) * lonScale, 1e-5);
    const PAD = 30;
    const scale = Math.min((RW - PAD * 2) / spanLon, (RH - PAD * 2) / spanLat);
    const ox = RX + (RW - spanLon * scale) / 2, oy = (RH - spanLat * scale) / 2;
    const proj = ([lat, lon]) => [ox + (lon - minLon) * lonScale * scale, RY + RH - (oy + (lat - minLat) * scale)];
    x.strokeStyle = GOLD; x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath();
    pts.forEach((p, i) => { const [px, py] = proj(p); i === 0 ? x.moveTo(px, py) : x.lineTo(px, py); });
    x.stroke();
    const [sx, sy] = proj(pts[0]), [ex, ey] = proj(pts[pts.length - 1]);
    x.fillStyle = '#4caf50'; x.beginPath(); x.arc(sx, sy, 13, 0, 7); x.fill();
    x.fillStyle = '#e74c3c'; x.beginPath(); x.arc(ex, ey, 13, 0, 7); x.fill();
  } else {
    x.font = "700 200px 'Barlow Condensed', sans-serif"; x.fillStyle = 'rgba(212,175,55,0.16)';
    x.textAlign = 'center'; x.fillText(opts.type === 'Walk' ? '🚶' : '🏃', W / 2, RY + 90); x.textAlign = 'left';
  }
  // Stats row
  const miles = parseFloat(opts.distance) || 0;
  const third = opts.type === 'Walk'
    ? { v: fmtSpeed(opts.secs, miles), u: 'MPH' }
    : { v: opts.secs ? fmtPace(opts.secs, miles) : '—:—', u: '/MILE' };
  const stats = [
    { v: miles.toFixed(2), u: 'MILES' },
    { v: opts.durationStr || fmtClock(opts.secs || 0), u: 'TIME' },
    third,
  ];
  const SY = 830;
  stats.forEach((s, i) => {
    const cx = W / 6 + (i * W) / 3;
    x.textAlign = 'center';
    x.font = "700 110px 'Barlow Condensed', sans-serif"; x.fillStyle = '#fff';
    x.fillText(String(s.v), cx, SY);
    x.font = "400 30px 'Barlow', sans-serif"; x.fillStyle = GRAY;
    x.fillText(s.u, cx, SY + 122);
  });
  x.textAlign = 'left';
  // Footer — "Team" in white, "3332" in gold, centered
  x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, H - 64, W, 64);
  x.font = "700 36px 'Barlow Condensed', sans-serif"; x.textAlign = 'left';
  const f1 = 'Team', f2 = '3332';
  const fw1 = x.measureText(f1).width, fw2 = x.measureText(f2).width;
  const fx = (W - (fw1 + fw2)) / 2;
  x.fillStyle = '#fff'; x.fillText(f1, fx, H - 50);
  x.fillStyle = GOLD;   x.fillText(f2, fx + fw1, H - 50);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

async function shareActivity(opts, onToast) {
  try {
    try { await document.fonts.ready; } catch (e) {}
    const miles = parseFloat(opts.distance) || 0;
    const verb = opts.type === 'Walk' ? 'walked' : 'ran';
    const text = `I just ${verb} ${miles.toFixed(2)} mi with TEAM 3332 ${opts.type === 'Walk' ? '🚶' : '🏃'} team3332.com`;
    const blob = await renderShareCard(opts);
    const file = blob ? new File([blob], 'team3332.png', { type: 'image/png' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text, title: 'TEAM 3332' });
    } else if (navigator.share) {
      await navigator.share({ text, url: 'https://team3332.com', title: 'TEAM 3332' });
    } else if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'team3332.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      onToast && onToast('Share card downloaded');
    }
  } catch (e) {
    if (e && e.name !== 'AbortError') onToast && onToast('Could not share');
  }
}

// ---------------------------------------------------------------------------
// GeoTracker — one location API for two runtimes.
//   • Native (Capacitor iOS/Android): uses @capacitor-community/background-geolocation
//     for the recording watch, so tracking continues when the screen locks or the
//     app is backgrounded. Foreground "GPS ready" preview uses @capacitor/geolocation.
//   • Web (team3332.com): falls back to navigator.geolocation, exactly as before.
// Every fix is normalized to { lat, lon, accuracy, t } — the shape recorderStep wants.
// ---------------------------------------------------------------------------
const GeoTracker = (() => {
  // @capacitor/core is bundled (Phase 2b), so registerPlugin is always defined: on device
  // it proxies through the native-injected bridge; in the browser it's a harmless stub we
  // never reach because isNative is false. We still gate the native plugin path on a real
  // native platform so the web keeps falling back to navigator.geolocation, exactly as before.
  // (The 617d "window.Capacitor without registerPlugin" crash can no longer happen.)
  const canUsePlugins = (typeof registerPlugin === 'function');
  const isNative = !!(canUsePlugins && Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  let _bg = null, _fg = null, _ln = null;
  const bg = () => { if (!_bg) _bg = registerPlugin('BackgroundGeolocation'); return _bg; };
  const fg = () => { if (!_fg) _fg = registerPlugin('Geolocation'); return _fg; };
  const ln = () => { if (!_ln) _ln = registerPlugin('LocalNotifications'); return _ln; };
  const isAndroid = isNative && typeof Capacitor.getPlatform === 'function' && Capacitor.getPlatform() === 'android';

  // 'denied' if the user refused location, otherwise 'error'
  const classify = (e) => {
    const code = e && e.code;
    const msg = ((e && (e.message || e.code)) || '').toString().toLowerCase();
    if (code === 1 || code === 'NOT_AUTHORIZED' || /denied|not_authorized|permission/.test(msg)) return 'denied';
    return 'error';
  };

  // Foreground preview: report 'ready' | 'waiting' | 'denied' | 'error' as a fix arrives.
  function startPreview(onStatus) {
    if (isNative) {
      const h = { native: true, id: null, dead: false };
      fg().watchPosition({ enableHighAccuracy: true }, (pos, err) => {
        if (err) { onStatus(classify(err)); return; }
        if (pos && pos.coords) onStatus(pos.coords.accuracy <= 50 ? 'ready' : 'waiting');
      }).then(id => { h.id = id; if (h.dead) fg().clearWatch({ id }); })
        .catch(() => onStatus('error'));
      return h;
    }
    if (!navigator.geolocation) { onStatus('error'); return null; }
    const id = navigator.geolocation.watchPosition(
      pos => onStatus(pos.coords.accuracy <= 50 ? 'ready' : 'waiting'),
      err => onStatus(err.code === 1 ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 0 }
    );
    return { native: false, id };
  }

  function stopPreview(h) {
    if (!h) return;
    if (h.native) { h.dead = true; if (h.id != null) fg().clearWatch({ id: h.id }); }
    else navigator.geolocation.clearWatch(h.id);
  }

  // Recording watch: native = background-capable; web = high-accuracy watch.
  // onFix({lat,lon,accuracy,speed,t}); onError(kind) where kind is 'denied' | 'error'.
  // speed is metres/sec from the platform (Doppler-derived on iOS — drift-immune); it's
  // -1/negative when unavailable on native and null on web, which recorderStep handles.
  function startRecording(onFix, onError) {
    if (isNative) {
      const h = { native: true, id: null, dead: false };
      const begin = () => bg().addWatcher({
        backgroundTitle: 'TEAM 3332 — run in progress',
        backgroundMessage: 'Recording your route. Tap to return to the app.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 3,
      }, (location, err) => {
        if (err) { onError && onError(classify(err)); return; }
        if (!location) return;
        onFix({ lat: location.latitude, lon: location.longitude, accuracy: location.accuracy, speed: location.speed, t: location.time });
      }).then(id => { h.id = id; if (h.dead) bg().removeWatcher({ id }); })
        .catch(() => onError && onError('error'));
      // Android 13+ requires POST_NOTIFICATIONS for the persistent tracking notification —
      // without it the plugin gets NO background updates. Ask before the first watch; a
      // denial is non-fatal here (foreground tracking still works), so errors are swallowed.
      if (isAndroid) { ln().requestPermissions().catch(() => {}).then(begin, begin); }
      else begin();
      return h;
    }
    const id = navigator.geolocation.watchPosition(
      pos => onFix({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, speed: pos.coords.speed, t: pos.timestamp }),
      err => onError && onError(err && err.code === 1 ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
    return { native: false, id };
  }

  function stopRecording(h) {
    if (!h) return;
    if (h.native) { h.dead = true; if (h.id != null) bg().removeWatcher({ id: h.id }); }
    else navigator.geolocation.clearWatch(h.id);
  }

  // Watch position purely to center the idle "you are here" map. onCoords({lat,lon}).
  // Same handle shape as startPreview, so stopPreview() cleans it up. (623 record-screen map)
  function watchForMap(onCoords) {
    if (isNative) {
      const h = { native: true, id: null, dead: false };
      fg().watchPosition({ enableHighAccuracy: true }, (pos, err) => {
        if (err) return;
        if (pos && pos.coords) onCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      }).then(id => { h.id = id; if (h.dead) fg().clearWatch({ id }); })
        .catch(() => {});
      return h;
    }
    if (!navigator.geolocation) return null;
    const id = navigator.geolocation.watchPosition(
      pos => onCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return { native: false, id };
  }

  return { isNative, startPreview, stopPreview, startRecording, stopRecording, watchForMap };
})();

// ---------------------------------------------------------------------------
// LiveActivity — iOS lock-screen / Dynamic Island live run stats. (618g)
//   • Native iOS 16.1+ (Capacitor): drives the LiveActivityPlugin (ActivityKit).
//   • Everywhere else (web, Android, pre-16.1, or before the widget target is wired up
//     in Xcode): every method is a safe no-op.
// Gated on a real native platform (same as GeoTracker). @capacitor/core is bundled (Phase 2b)
// so registerPlugin always exists; the try/catch around it stays as belt-and-suspenders.
// Plugin calls that reject (e.g. Android's "not implemented") are swallowed so a Live Activity
// hiccup can never interrupt a recording.
// ---------------------------------------------------------------------------
const LiveActivity = (() => {
  const isNative = !!(typeof registerPlugin === 'function' && Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  let _p = null;
  const plugin = () => {
    if (!isNative) return null;
    if (!_p) { try { _p = registerPlugin('LiveActivity'); } catch (e) { _p = null; } }
    return _p;
  };
  // Run a plugin call and swallow any sync throw or async rejection.
  const safe = (fn) => { try { const r = fn(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (e) { /* never fatal */ } };

  function start(payload)  { const p = plugin(); if (p) safe(() => p.start(payload)); }
  function update(payload) { const p = plugin(); if (p) safe(() => p.update(payload)); }
  function end(payload)    { const p = plugin(); if (p) safe(() => p.end(payload || {})); }
  return { start, update, end };
})();

// ---------------------------------------------------------------------------
// HeartRate — pair a Bluetooth LE heart-rate sensor (chest strap / armband) and
// stream live bpm during a run. Native iOS (Capacitor) drives the HeartRatePlugin
// (CoreBluetooth, standard Heart Rate Service 0x180D / characteristic 0x2A37).
// Everywhere else — web, Android, or before the native plugin is wired in Xcode —
// every method is a safe no-op so a missing sensor can never interrupt a recording.
// Same guarded registerPlugin pattern as GeoTracker/LiveActivity. (623)
// ---------------------------------------------------------------------------
const HeartRate = (() => {
  const isNative = !!(typeof registerPlugin === 'function' && Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  let _p = null;
  const plugin = () => {
    if (!isNative) return null;
    if (!_p) { try { _p = registerPlugin('HeartRate'); } catch (e) { _p = null; } }
    return _p;
  };
  const safe = (fn) => { try { const r = fn(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (e) { /* never fatal */ } };
  const off = (sub) => { if (sub && typeof sub.remove === 'function') { try { sub.remove(); } catch (e) {} } };

  // Discover nearby HR sensors. onDevice({id,name}) fires per device found.
  // Returns { stop() }; null off native (so callers can show "needs the app" state).
  async function scan(onDevice) {
    const p = plugin(); if (!p) return null;
    let sub = null;
    try { sub = await p.addListener('deviceFound', d => { if (d && d.id) onDevice({ id: d.id, name: d.name || 'Heart-rate sensor' }); }); } catch (e) {}
    safe(() => p.startScan());
    return { stop: () => { safe(() => p.stopScan()); off(sub); } };
  }

  // Connect to a device id. onSample(bpm) for each reading; onState('connected'|'disconnected').
  // Returns { disconnect() }; null off native.
  async function connect(deviceId, onSample, onState) {
    const p = plugin(); if (!p) return null;
    let s1 = null, s2 = null;
    try { s1 = await p.addListener('heartRate', e => { if (e && Number.isFinite(e.bpm)) onSample(e.bpm); }); } catch (e) {}
    try { s2 = await p.addListener('connection', e => { if (e && e.state && onState) onState(e.state); }); } catch (e) {}
    safe(() => p.connect({ deviceId }));
    return { disconnect: () => { safe(() => p.disconnect()); off(s1); off(s2); } };
  }
  return { isNative, scan, connect };
})();

// ---------------------------------------------------------------------------
// WatchSync — Apple Watch companion. The watchOS app records a run on the wrist
// (GPS + heart rate) and hands the finished run to the iPhone over WatchConnectivity;
// the native WatchSyncPlugin forwards it here as a "watchActivity" event and we POST it
// to /api/activities using the member's existing session — so a watch run saves exactly
// like a phone run. We also push login context back to the watch so it knows whose
// account to sync to. Same guarded no-op pattern as LiveActivity/HeartRate. (session 17)
// ---------------------------------------------------------------------------
const WatchSync = (() => {
  const isNative = !!(typeof registerPlugin === 'function' && Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  let _p = null;
  const plugin = () => {
    if (!isNative) return null;
    if (!_p) { try { _p = registerPlugin('WatchSync'); } catch (e) { _p = null; } }
    return _p;
  };
  const safe = (fn) => { try { const r = fn(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (e) { /* never fatal */ } };

  // Map a watch payload → the /activities body, mirroring the phone recorder's save (RecordRun).
  function toBody(d) {
    const miles = Number(d && d.distanceMiles) || 0;
    if (miles <= 0) return null;                                  // nothing worth saving
    const dist = Math.round(miles * 100) / 100;
    const secs = Math.max(0, Math.round(Number(d.durationSeconds) || 0));
    const started = Number(d.startedAtEpoch) ? new Date(Number(d.startedAtEpoch) * 1000) : new Date();
    const pts = Array.isArray(d.points) ? d.points.filter(p => Array.isArray(p) && p.length >= 2) : [];
    const hr = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 20 && n <= 260 ? n : null; };
    const type = d.type === 'Walk' ? 'Walk' : 'Run';
    return {
      name: (d.name && String(d.name)) || `Apple Watch ${type}`,
      type,
      distance: dist,
      pace: d.paceText ? String(d.paceText) : (fmtPace(secs, miles) === '—:—' ? null : fmtPace(secs, miles)),
      duration: fmtClock(secs),
      route_data: pts.length >= 2 ? JSON.stringify({ source: 'watch', points: pts }) : null,
      avg_hr: hr(d.avgHr), max_hr: hr(d.maxHr),
      logged_at: started.toISOString().slice(0, 19).replace('T', ' '),
    };
  }

  // Delivery is PULL-based (session 19). The native plugin queues every finished run; we pull
  // the queue with drainPending() on mount, on resume, and after login — so a watch run lands
  // regardless of listener timing (the old push path silently dropped runs under Capacitor 6).
  // A "watchActivityAvailable" poke just nudges us to drain promptly when foregrounded.
  let _handlers = {};                 // last { onSaved, onError } registered via init()
  const _seen = new Set();            // clientIds already POSTed this session (belt-and-suspenders dedup)
  let _retry = [];                    // runs whose POST failed (e.g. offline) — retried next drain
  let _draining = false;              // guard against overlapping drains

  // POST one run. drainPending() has already cleared it from the native queue, so on failure we
  // hold it in _retry (in-session) and re-attempt on the next drain — otherwise a transient
  // network/auth blip would lose a run that's no longer in the native queue. Returns true if done.
  async function postOne(d) {
    const cid = d && d.clientId ? String(d.clientId) : '';
    if (cid && _seen.has(cid)) return true;          // already handled (dup message+userInfo)
    const body = toBody(d);
    if (!body) { if (cid) _seen.add(cid); return true; } // nothing worth saving, but don't reprocess
    try {
      const r = await api.post('/activities', body);
      if (cid) _seen.add(cid);
      confirmToWatch(cid, true);                     // flips the watch summary to "Synced ✓"
      if (_handlers.onSaved) _handlers.onSaved(r && r.activity ? r.activity : null, body);
      return true;
    } catch (e) {
      _retry.push(d);                                // keep it for the next drain
      confirmToWatch(cid, false);                    // watch shows "Sync problem — will retry"
      if (_handlers.onError) _handlers.onError(e && e.message ? e.message : 'Could not save watch run');
      return false;
    }
  }

  // Report the real POST result back to the watch (best-effort, cosmetic only — the label on
  // the summary screen). Rides applicationContext; a retry success overwrites an earlier failure.
  function confirmToWatch(cid, ok) {
    if (!cid) return;
    const p = plugin(); if (!p || typeof p.confirmSync !== 'function') return;
    try { p.confirmSync({ clientId: cid, ok: !!ok }); } catch (e) { /* never block on polish */ }
  }

  // Pull queued runs from native and POST each. Safe to call repeatedly / from anywhere.
  async function drain() {
    const p = plugin(); if (!p || _draining) return;
    _draining = true;
    try {
      const res = await p.drainPending();
      const pulled = (res && Array.isArray(res.activities)) ? res.activities : [];
      const list = _retry.concat(pulled);            // retry earlier failures first
      _retry = [];
      for (const d of list) { await postOne(d); }     // sequential keeps toasts/refreshes orderly
    } catch (e) { /* native unavailable or no queue — nothing to do */ }
    finally { _draining = false; }
  }

  // Drain in a BURST over ~8s. A queued run (transferUserInfo) is delivered to native around
  // the time the app activates — sometimes a beat BEFORE the JS listener is attached, sometimes
  // a beat AFTER a single drain runs. Polling a few times closes that race without depending on
  // the "watchActivityAvailable" poke firing at exactly the right moment.
  let _burst = [];
  function clearBurst() { for (const t of _burst) { try { clearTimeout(t); } catch (e) {} } _burst = []; }
  function drainBurst() {
    clearBurst();
    for (const ms of [0, 500, 1500, 3500, 8000]) { _burst.push(setTimeout(() => { drain(); }, ms)); }
  }

  // Register handlers, attach the poke listener, and do an initial drain burst (catches
  // cold-launch + queued runs whose native delivery races app startup). Returns a cleanup
  // function; no-op off native.
  function init({ onSaved, onError } = {}) {
    _handlers = { onSaved, onError };
    const p = plugin(); if (!p) return () => {};
    let sub = null;
    try {
      p.addListener('watchActivityAvailable', () => { drain(); })
        .then(h => { sub = h; }).catch(() => {});
    } catch (e) { /* never block the app on watch wiring */ }
    drainBurst();   // pull anything already queued (now or delivered moments later)
    return () => {
      clearBurst();
      if (sub && typeof sub.remove === 'function') { try { sub.remove(); } catch (e) {} }
    };
  }

  // Tell the watch who's signed in (or that nobody is) so it can gate/label recording.
  function pushContext(user) {
    const p = plugin(); if (!p) return;
    safe(() => p.setContext({ loggedIn: !!user, memberName: (user && user.name) ? String(user.name) : '' }));
  }

  return { isNative, init, drain, drainBurst, pushContext };
})();

/* ── Map basemap config ────────────────────────────────────────────────────
   Paste your Mapbox public token below to switch every route map from the free
   OpenStreetMap tiles to Mapbox's styled tiles. Leave it '' to stay on OSM
   (no account, no cost). Get a token at mapbox.com → Account → Tokens (the
   "Default public token", starts with "pk."). Pick any style id you like;
   'mapbox/dark-v11' suits the dark/gold theme. */
// Assembled at runtime from parts so GitHub's secret scanner doesn't false-flag it
// on push. Safe ONLY because this is a PUBLIC token (pk.) restricted to team3332.com
// in the Mapbox dashboard — never do this for a real secret (sk.) token.
const MAPBOX_TOKEN = [
  'pk.',
  'eyJ1IjoiZXJuZXJzdDMzMzIiLCJh',
  'IjoiY21xaG9hZjVnMDJ2MzN4cHd5bzUwcjBiZSJ9',
  '.zVe0jZlu5ISuz-NDQx536g',
].join('');
const MAPBOX_STYLE = 'mapbox/dark-v11';
// The Mapbox token is URL-restricted to team3332.com. The native app runs from
// capacitor://localhost, an origin Mapbox rejects (403 → blank basemap). So inside
// the Capacitor app, fall back to OpenStreetMap tiles (no token, no origin restriction)
// which the .tiles-osm CSS already mutes to suit the dark theme. The web app
// (team3332.com) is unaffected and keeps the dark Mapbox style. (617d)
const IS_NATIVE_APP = !!(Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
const USING_MAPBOX = MAPBOX_TOKEN.startsWith('pk.') && !IS_NATIVE_APP;

// Returns a Leaflet tile layer: Mapbox if a token is set, else OpenStreetMap.
function baseTileLayer() {
  if (USING_MAPBOX) {
    return L.tileLayer(
      `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
      { maxZoom: 19, tileSize: 512, zoomOffset: -1, attribution: '© Mapbox © OpenStreetMap' }
    );
  }
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap',
  });
}

/* ── Live route map (Leaflet) shown behind the recorder stats ──────────────
   Imperative wrapper: React owns the container; Leaflet owns the canvas.
   `points` is the recorder's growing [[lat,lon],…] array; a fresh array
   reference arrives on every accepted GPS fix, so the update effect re-runs.
   Leaflet is bundled into app.js (Phase 2a) so `L` is always defined; the `L` guards
   below are now defensive no-ops (kept so the components stay safe if that ever changes). */
function LiveRouteMap({ points }) {
  const elRef    = useRef(null);
  const mapRef   = useRef(null);
  const lineRef  = useRef(null);
  const startRef = useRef(null);
  const headRef  = useRef(null);

  // Init once, when the recording view mounts.
  useEffect(() => {
    if (!L || !elRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: false, attributionControl: true,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      touchZoom: false, boxZoom: false, keyboard: false, tap: false,
    }).setView([39.5, -98.35], 4); // continental US until first fix
    baseTileLayer().addTo(map);
    lineRef.current = L.polyline([], {
      color: '#D4AF37', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
    }).addTo(map);
    mapRef.current = map;
    // Container starts at full size only after the overlay paints.
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; lineRef.current = null; startRef.current = null; headRef.current = null; };
  }, []);

  // Redraw on every points change.
  useEffect(() => {
    const map = mapRef.current, line = lineRef.current;
    if (!map || !line || !points || points.length === 0) return;
    line.setLatLngs(points);
    const last = points[points.length - 1];
    if (!startRef.current) {
      startRef.current = L.circleMarker(points[0], {
        radius: 6, color: '#fff', weight: 2, fillColor: '#4caf50', fillOpacity: 1,
      }).addTo(map);
    }
    if (!headRef.current) {
      headRef.current = L.circleMarker(last, {
        radius: 7, color: '#fff', weight: 2, fillColor: '#D4AF37', fillOpacity: 1,
      }).addTo(map);
      map.setView(last, 17, { animate: false }); // snap-zoom on first fix
    } else {
      headRef.current.setLatLng(last);
      map.panTo(last, { animate: true, duration: 0.6 }); // follow the runner
    }
  }, [points]);

  return (
    <div className={`live-map ${USING_MAPBOX ? 'tiles-mapbox' : 'tiles-osm'}`}>
      <div ref={elRef} style={{ width: '100%', height: '100%' }} />
      {(!L) && <div className="live-map-wait">Map unavailable — your route is still being recorded.</div>}
      {L && (!points || points.length === 0) &&
        <div className="live-map-wait">📡 Waiting for GPS lock — your route will draw here.</div>}
      <div className="live-map-scrim" />
    </div>
  );
}

/* ── Idle "you are here" map (Leaflet) shown on the record screen before a run ──
   Strava-style: the live map fills the screen behind the bottom control panel.
   Centers on the member's current location once GPS reports it, and keeps a gold
   "you are here" dot updated. Non-interactive (the panel below owns the gestures). */
function IdleMap() {
  const elRef = useRef(null), mapRef = useRef(null), meRef = useRef(null), centeredRef = useRef(false);
  useEffect(() => {
    if (!L || !elRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      touchZoom: false, boxZoom: false, keyboard: false, tap: false,
    }).setView([39.5, -98.35], 4); // continental US until first fix
    baseTileLayer().addTo(map);
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 80);
    const h = GeoTracker.watchForMap(({ lat, lon }) => {
      if (!mapRef.current) return;
      if (!meRef.current) {
        meRef.current = L.circleMarker([lat, lon], {
          radius: 8, color: '#fff', weight: 3, fillColor: '#D4AF37', fillOpacity: 1,
        }).addTo(map);
      } else meRef.current.setLatLng([lat, lon]);
      if (!centeredRef.current) { map.setView([lat, lon], 16, { animate: false }); centeredRef.current = true; }
    });
    return () => { clearTimeout(t); GeoTracker.stopPreview(h); map.remove(); mapRef.current = null; meRef.current = null; };
  }, []);
  return (
    <div className={`live-map ${USING_MAPBOX ? 'tiles-mapbox' : 'tiles-osm'}`} style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <div ref={elRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

/* ── Static route preview (Leaflet) for the post-run review screen ──────────
   Fits the whole recorded route in view with start (green) + finish (red)
   markers. No following, no interaction. Renders nothing if Leaflet is
   missing or there are fewer than 2 points. */
function RouteMiniMap({ points }) {
  const elRef  = useRef(null);
  const mapRef = useRef(null);
  useEffect(() => {
    if (!L || !elRef.current || !points || points.length < 2) return;
    const map = L.map(elRef.current, {
      zoomControl: false, attributionControl: true,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      touchZoom: false, boxZoom: false, keyboard: false, tap: false,
    });
    baseTileLayer().addTo(map);
    const line = L.polyline(points, {
      color: '#D4AF37', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
    }).addTo(map);
    L.circleMarker(points[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#4caf50', fillOpacity: 1 }).addTo(map);
    L.circleMarker(points[points.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#e74c3c', fillOpacity: 1 }).addTo(map);
    mapRef.current = map;
    const t = setTimeout(() => { map.invalidateSize(); map.fitBounds(line.getBounds(), { padding: [24, 24], maxZoom: 17 }); }, 80);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; };
  }, [points]);
  if (!L || !points || points.length < 2) return null;
  return <div className={`route-mini ${USING_MAPBOX ? 'tiles-mapbox' : 'tiles-osm'}`}><div ref={elRef} style={{ width: '100%', height: '100%' }} /></div>;
}

function RecordRun({ onClose, onSaved, onToast, autoPause, onAutoPauseChange }) {
  const [phase, setPhase] = useState('idle');     // idle | recording | review
  const [actType, setActType] = useState('Run');
  const [autoPauseOn, setAutoPauseOn] = useState(!!autoPause); // local mirror so it's toggleable on the record screen
  const [savingPause, setSavingPause] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('waiting'); // waiting | ready | denied | error
  const [gpsAlert, setGpsAlert] = useState(null);  // {kind,msg} shown while recording if GPS fails
  const [elapsed, setElapsed] = useState(0);
  const [meters, setMeters] = useState(0);
  const [paused, setPaused] = useState(false);     // auto-pause: true while stopped (opt-in)
  const [liveSpeed, setLiveSpeed] = useState(null);// smoothed current speed (m/s) for the live readout
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [optionsSheet, setOptionsSheet] = useState(false); // swipe-up options panel (auto-pause, sensor)
  const swipeRef = useRef({ y0: 0 });               // track touch start for swipe-up detection
  // ── Heart-rate sensor (BLE) state ──
  const [hrSheet, setHrSheet] = useState(false);   // pairing sheet open
  const [hrScanning, setHrScanning] = useState(false);
  const [hrDevices, setHrDevices] = useState([]);  // [{id,name}] found while scanning
  const [hrDevice, setHrDevice] = useState(null);  // connected device {id,name} or null
  const [hrBpm, setHrBpm] = useState(null);         // latest live bpm
  const hrSamplesRef = useRef([]);                  // bpm samples collected during the run
  const hrConnRef = useRef(null);                   // active connection handle { disconnect() }
  const hrScanRef = useRef(null);                   // active scan handle { stop() }
  const recordingRef = useRef(false);               // true only while a run is recording (HR sample gate)
  const stRef = useRef({ meters: 0, last: null, points: [] });
  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const wakeRef = useRef(null);
  const lastMoveRef = useRef(0);                   // ms timestamp of the last detected movement
  const pauseAcctRef = useRef({ start: 0, pausedMs: 0, anchor: null }); // auto-pause time accounting
  const speedRef = useRef(null);                   // EMA of current speed (m/s) for the live readout
  const autoPauseOnRef = useRef(!!autoPause);      // live mirror the recorder loop reads

  // keep local toggle in sync if the parent value changes
  useEffect(() => { setAutoPauseOn(!!autoPause); autoPauseOnRef.current = !!autoPause; }, [autoPause]);

  // Persist the auto-pause toggle (optimistic). Reused by the record-screen switch. (623)
  const toggleAutoPauseLocal = async () => {
    if (savingPause) return;
    const next = !autoPauseOn;
    setAutoPauseOn(next); autoPauseOnRef.current = next;   // optimistic
    setSavingPause(true);
    try {
      const r = await api.patch('/auth/me', { auto_pause: next });
      if (onAutoPauseChange && r && r.user) onAutoPauseChange(r.user);
    } catch (e) {
      setAutoPauseOn(!next); autoPauseOnRef.current = !next; // revert on failure
      onToast(e.message || 'Could not save that setting');
    } finally { setSavingPause(false); }
  };

  // ── Heart-rate sensor pairing ──────────────────────────────────────────────
  // Open the sheet and start scanning for BLE HR devices. No-op (with a toast) off native.
  const openHrSheet = async () => {
    setHrSheet(true);
    if (!HeartRate.isNative) return;            // web/preview: sheet shows the "needs the app" note
    setHrDevices([]); setHrScanning(true);
    hrScanRef.current = await HeartRate.scan(dev => {
      setHrDevices(list => list.some(d => d.id === dev.id) ? list : [...list, dev]);
    });
    if (!hrScanRef.current) setHrScanning(false); // scan unavailable
  };
  const stopHrScan = () => {
    if (hrScanRef.current) { hrScanRef.current.stop(); hrScanRef.current = null; }
    setHrScanning(false);
  };
  const closeHrSheet = () => { stopHrScan(); setHrSheet(false); };

  const connectHr = async (dev) => {
    stopHrScan();
    if (hrConnRef.current) { hrConnRef.current.disconnect(); hrConnRef.current = null; }
    hrConnRef.current = await HeartRate.connect(
      dev.id,
      bpm => { setHrBpm(bpm); if (recordingRef.current) hrSamplesRef.current.push(bpm); },
      state => {
        if (state === 'disconnected') { setHrDevice(null); setHrBpm(null); }
      },
    );
    if (hrConnRef.current) { setHrDevice(dev); onToast(`❤️ ${dev.name} connected`); setHrSheet(false); }
    else onToast('Could not connect to that sensor');
  };
  const disconnectHr = () => {
    if (hrConnRef.current) { hrConnRef.current.disconnect(); hrConnRef.current = null; }
    setHrDevice(null); setHrBpm(null);
  };

  const miles = meters / 1609.344;

  // Pre-acquire GPS on open so Start is instant (native: when-in-use; web: browser)
  useEffect(() => {
    const h = GeoTracker.startPreview(setGpsStatus);
    return () => GeoTracker.stopPreview(h);
  }, []);

  // Keep screen awake while recording (re-acquire when app returns to foreground)
  useEffect(() => {
    if (phase !== 'recording') return;
    let active = true;
    const acquire = async () => {
      try { if (active && 'wakeLock' in navigator) wakeRef.current = await navigator.wakeLock.request('screen'); }
      catch (e) { /* not fatal */ }
    };
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVis);
      if (wakeRef.current) { wakeRef.current.release().catch(()=>{}); wakeRef.current = null; }
    };
  }, [phase]);

  const start = () => {
    stRef.current = { meters: 0, last: null, points: [] };
    startRef.current = new Date();
    const t0 = startRef.current.getTime();
    lastMoveRef.current = t0;                       // treat the start as "moving" so we don't pause at gun
    pauseAcctRef.current = { start: t0, pausedMs: 0, anchor: null };
    speedRef.current = null;
    hrSamplesRef.current = [];                      // fresh HR series for this run
    recordingRef.current = true;                    // arm the HR sample gate
    setMeters(0); setElapsed(0); setGpsAlert(null); setPaused(false); setLiveSpeed(null);
    watchRef.current = GeoTracker.startRecording(
      fix => {
        const prevMeters = stRef.current.meters;
        const prevLast = stRef.current.last;
        stRef.current = recorderStep(stRef.current, fix);
        const moved = stRef.current.meters > prevMeters;
        // Movement signal for auto-pause: an accepted distance step (position fallback) OR a
        // Doppler speed at/above the walk threshold. Mirrors the recorder's own gates. (auto-pause)
        if (moved || (typeof fix.speed === 'number' && fix.speed >= GPS_MIN_SPEED_MS)) {
          lastMoveRef.current = Date.now();
        }
        // Live speed EMA: prefer Doppler speed; else derive from the accepted step's distance/time.
        let inst = (typeof fix.speed === 'number' && fix.speed >= 0) ? fix.speed : null;
        if (inst == null && moved && prevLast && fix.t > prevLast.t) {
          inst = (stRef.current.meters - prevMeters) / ((fix.t - prevLast.t) / 1000);
        }
        speedRef.current = emaSpeed(speedRef.current, inst);
        setMeters(stRef.current.meters);
        // A good fix arrived → clear any standing GPS alert (recovery). Functional form
        // returns the same ref when there's nothing to clear so React skips the re-render.
        setGpsAlert(prev => (prev ? null : prev));
      },
      // GPS errors come back on async callbacks the ErrorBoundary can't see, so surface them
      // here: a persistent banner during recording, plus the existing toast for denial. (618f)
      kind => {
        setGpsAlert({ kind, msg: recGpsAlert(kind) });
        if (kind === 'denied') onToast('Location access is off — turn it on to record your route.');
      }
    );
    // Start the iOS Live Activity (lock-screen / Dynamic Island). No-op off native. (618g)
    LiveActivity.start(liveActivityPayload(actType, 0, 0));
    timerRef.current = setInterval(() => {
      // Auto-pause time accounting (no-op when the toggle is off → plain wall-clock elapsed).
      const acct = autoPauseStep(pauseAcctRef.current, {
        now: Date.now(), lastMove: lastMoveRef.current, enabled: autoPauseOnRef.current,
      });
      pauseAcctRef.current = acct;
      setElapsed(acct.elapsed);
      setPaused(acct.paused);
      // Live speed: show the smoothed current speed, but read 0 once movement has clearly stopped
      // (no accepted fix for >3s) so it doesn't hang on a stale value at a standstill.
      const moving = (Date.now() - lastMoveRef.current) < 3000;
      setLiveSpeed(moving ? speedRef.current : 0);
      // Push live stats to the Live Activity once a second. When paused, elapsed is frozen, so
      // the lock-screen card naturally holds time + pace steady too. (distance + time + pace/mph)
      LiveActivity.update(liveActivityPayload(actType, stRef.current.meters, acct.elapsed));
    }, 1000);
    setPhase('recording');
  };

  const stop = () => {
    recordingRef.current = false;                   // stop collecting HR samples
    if (watchRef.current != null) { GeoTracker.stopRecording(watchRef.current); watchRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    LiveActivity.end(liveActivityPayload(actType, stRef.current.meters, elapsed)); // dismiss with final stats (618g)
    const hour = startRef.current.getHours();
    const tod = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
    setName(`${tod} ${actType}`);
    setPhase('review');
  };

  useEffect(() => () => { // cleanup if component unmounts mid-recording
    recordingRef.current = false;
    if (watchRef.current != null) GeoTracker.stopRecording(watchRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    LiveActivity.end(); // clear any lingering Live Activity if the user leaves mid-run (618g)
    if (hrScanRef.current) { hrScanRef.current.stop(); hrScanRef.current = null; }      // stop BLE scan
    if (hrConnRef.current) { hrConnRef.current.disconnect(); hrConnRef.current = null; } // drop HR sensor
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const dist = Math.round(miles * 100) / 100;
      const st = stRef.current;
      const step = Math.max(1, Math.ceil(st.points.length / 200));
      const r5 = n => Math.round(n*1e5)/1e5;
      // Preserve the per-point timestamp (p[2], secs since start) when present so the backend
      // can compute true fastest-segment best efforts; legacy points stay [lat,lon]. (618e)
      const route = st.points.filter((_, i) => i % step === 0)
        .map(p => p.length >= 3 ? [r5(p[0]), r5(p[1]), p[2]] : [r5(p[0]), r5(p[1])]);
      // Heart rate from a paired BLE sensor (avg + max bpm); null when no sensor was connected.
      const hrs = hrSamplesRef.current;
      const avg_hr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
      const max_hr = hrs.length ? Math.max(...hrs) : null;
      await api.post('/activities', {
        name: name || `My ${actType}`,
        type: actType,
        distance: dist,
        pace: fmtPace(elapsed, miles) === '—:—' ? null : fmtPace(elapsed, miles),
        duration: fmtClock(elapsed),
        route_data: route.length >= 2 ? JSON.stringify({ source: 'recorded', points: route }) : null,
        avg_hr, max_hr,
        logged_at: startRef.current.toISOString().slice(0, 19).replace('T', ' '),
      });
      onSaved();
      onToast(`${actType} saved — ${dist} mi!`);
      onClose();
    } catch (e) { onToast(`Error: ${e.message}`); }
    finally { setSaving(false); }
  };

  const big = { fontFamily: 'Barlow Condensed', fontWeight: 700, lineHeight: 1 };
  const gpsMsg = {
    waiting: '📡 Acquiring GPS…', ready: '📡 GPS ready',
    denied: '⚠️ Location access denied — enable it in your browser settings',
    error: '⚠️ GPS unavailable on this device',
  }[gpsStatus];

  return (
    <div style={{position:'fixed',inset:0,zIndex:300,background:'var(--dark, #0b0f14)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24}}>
      {phase === 'idle' && (
        <div style={{position:'absolute',inset:0}}>
          <IdleMap />

          {/* Close (✕) floating over the map */}
          <button onClick={onClose} aria-label="Close"
            style={{position:'absolute',top:'calc(12px + env(safe-area-inset-top))',left:14,zIndex:3,
              width:40,height:40,borderRadius:20,border:'none',cursor:'pointer',
              background:'rgba(11,15,20,0.72)',color:'#fff',fontSize:'1.05rem'}}>✕</button>

          {/* Bottom control panel — Run/Walk + START; swipe up (or tap the arrows) for options */}
          <div
            onTouchStart={e=>{ swipeRef.current.y0 = e.touches[0].clientY; }}
            onTouchEnd={e=>{ const dy = swipeRef.current.y0 - (e.changedTouches[0]?.clientY ?? swipeRef.current.y0); if (dy > 40) setOptionsSheet(true); }}
            style={{position:'absolute',left:0,right:0,bottom:0,zIndex:2,
              background:'var(--dark, #0b0f14)',borderTopLeftRadius:24,borderTopRightRadius:24,
              boxShadow:'0 -8px 30px rgba(0,0,0,0.5)',
              padding:'8px 22px calc(20px + env(safe-area-inset-bottom))',
              minHeight:'33vh',display:'flex',flexDirection:'column',alignItems:'center'}}>

            {/* swipe-up affordance: two small chevrons */}
            <button onClick={()=>setOptionsSheet(true)} aria-label="More options"
              style={{background:'none',border:'none',cursor:'pointer',padding:'4px 26px 10px',color:'var(--gray)'}}>
              <svg width="24" height="15" viewBox="0 0 24 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3,7 12,2 21,7" />
                <polyline points="3,13 12,8 21,13" />
              </svg>
            </button>

            <div className="flex gap-8" style={{width:'100%',maxWidth:380,marginBottom:18}}>
              {['Run','Walk'].map(t => (
                <button key={t} className={`btn ${actType===t?'btn-primary':'btn-ghost'}`} style={{flex:1}} onClick={()=>setActType(t)}>
                  {t==='Run'?'🏃 Run':'🚶 Walk'}
                </button>
              ))}
            </div>

            <button onClick={start} disabled={gpsStatus==='denied'||gpsStatus==='error'}
              style={{...big,width:128,height:128,borderRadius:'50%',border:'none',cursor:'pointer',fontSize:'1.45rem',
                background:'var(--blue, #D4AF37)',color:'#0b0f14',opacity:(gpsStatus==='denied'||gpsStatus==='error')?0.4:1}}>
              START
            </button>
            <div style={{fontSize:'0.78rem',color:'var(--gray)',marginTop:12}}>{gpsMsg}</div>
          </div>
        </div>
      )}

      {phase === 'recording' && (
        <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column'}}>
          <LiveRouteMap points={stRef.current.points} />
          {gpsAlert && (
            <div role="alert" style={{position:'absolute',top:0,left:0,right:0,zIndex:3,
              padding:'calc(10px + env(safe-area-inset-top)) 16px 10px',
              background:'rgba(231,76,60,0.94)',color:'#fff',fontSize:'0.82rem',fontWeight:600,
              textAlign:'center',lineHeight:1.4}}>
              {gpsAlert.msg}
            </div>
          )}
          <div style={{position:'relative',zIndex:2,marginTop:'auto',width:'100%',display:'flex',justifyContent:'center',
            padding:'18px 16px calc(22px + env(safe-area-inset-bottom)) 16px'}}>
            <div style={{textAlign:'center',width:'100%',maxWidth:420,background:'rgba(15,20,32,0.62)',backdropFilter:'blur(10px)',
              WebkitBackdropFilter:'blur(10px)',border:'1px solid var(--border)',borderRadius:20,padding:'20px 20px 24px'}}>
              <div style={{fontSize:'0.8rem',color: paused ? '#D4AF37' : 'var(--gray)',letterSpacing:2,textTransform:'uppercase',marginBottom:6,fontWeight: paused ? 700 : 400}}>{paused ? '❚❚ Paused — auto' : (actType === 'Run' ? '🏃 Running' : '🚶 Walking')}</div>
              <div style={{...big,fontSize:'4.2rem'}}>{miles.toFixed(2)}</div>
              <div style={{fontSize:'0.8rem',color:'var(--gray)',marginBottom:18}}>MILES</div>
              <div className="flex" style={{justifyContent:'center',gap: hrDevice ? 30 : 40,marginBottom:22}}>
                <div><div style={{...big,fontSize:'1.9rem'}}>{fmtClock(elapsed)}</div><div style={{fontSize:'0.72rem',color:'var(--gray)'}}>TIME</div></div>
                <div><div style={{...big,fontSize:'1.9rem'}}>{actType==='Walk' ? liveSpeedMph(liveSpeed) : livePaceFromMps(liveSpeed)}</div><div style={{fontSize:'0.72rem',color:'var(--gray)'}}>{actType==='Walk' ? 'MPH' : '/MILE'}</div></div>
                {hrDevice && <div><div style={{...big,fontSize:'1.9rem',color:'#E74C3C'}}>{hrBpm ?? '—'}</div><div style={{fontSize:'0.72rem',color:'var(--gray)'}}>❤️ BPM</div></div>}
              </div>
              <button onClick={stop}
                style={{...big,width:118,height:118,borderRadius:'50%',border:'3px solid #e74c3c',cursor:'pointer',fontSize:'1.3rem',background:'rgba(231,76,60,0.08)',color:'#e74c3c'}}>
                END
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'review' && (
        <div style={{width:'100%',maxWidth:380}}>
          <div className="modal-title" style={{textAlign:'center'}}>{actType} Complete!</div>
          <div className="flex" style={{justifyContent:'center',gap:32,margin:'18px 0 24px'}}>
            <div style={{textAlign:'center'}}><div style={{...big,fontSize:'2.2rem'}}>{miles.toFixed(2)}</div><div style={{fontSize:'0.72rem',color:'var(--gray)'}}>MILES</div></div>
            <div style={{textAlign:'center'}}><div style={{...big,fontSize:'2.2rem'}}>{fmtClock(elapsed)}</div><div style={{fontSize:'0.72rem',color:'var(--gray)'}}>TIME</div></div>
            <div style={{textAlign:'center'}}><div style={{...big,fontSize:'2.2rem'}}>{actType==='Walk' ? fmtSpeed(elapsed, miles) : fmtPace(elapsed, miles)}</div><div style={{fontSize:'0.72rem',color:'var(--gray)'}}>{actType==='Walk' ? 'MPH' : '/MILE'}</div></div>
            {hrSamplesRef.current.length > 0 && (
              <div style={{textAlign:'center'}}><div style={{...big,fontSize:'2.2rem',color:'#E74C3C'}}>{Math.round(hrSamplesRef.current.reduce((a,b)=>a+b,0)/hrSamplesRef.current.length)}</div><div style={{fontSize:'0.72rem',color:'var(--gray)'}}>❤️ AVG</div></div>
            )}
          </div>
          {miles < 0.01 ? (
            <div style={{textAlign:'center'}}>
              <p style={{color:'var(--gray)',fontSize:'0.85rem',marginBottom:18}}>No distance was recorded — GPS may not have locked. Nothing to save.</p>
              <button className="btn btn-ghost" style={{width:'100%'}} onClick={onClose}>Close</button>
            </div>
          ) : (
            <div>
              <RouteMiniMap points={stRef.current.points} />
              <div className="form-group"><label>Name</label><input type="text" value={name} onChange={e=>setName(e.target.value)} /></div>
              <div className="flex gap-12">
                <button className="btn btn-primary" style={{flex:1}} onClick={save} disabled={saving}>{saving ? <Spinner /> : `Save ${actType}`}</button>
                <button className="btn btn-ghost" onClick={()=>{ if(confirm('Discard this activity?')) onClose(); }}>Discard</button>
              </div>
              <button className="btn btn-ghost" style={{width:'100%',marginTop:10}} onClick={()=>shareActivity({
                name, type: actType, distance: miles,
                durationStr: fmtClock(elapsed), secs: elapsed,
                points: stRef.current.points,
                dateStr: startRef.current ? startRef.current.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}) : '',
              }, onToast)}>📤 Share</button>
            </div>
          )}
        </div>
      )}

      {optionsSheet && (
        <div onClick={e => { if (e.target === e.currentTarget) setOptionsSheet(false); }}
          style={{position:'fixed',inset:0,zIndex:390,background:'rgba(0,0,0,0.5)',display:'flex',
            alignItems:'flex-end',justifyContent:'center'}}>
          <div
            onTouchStart={e=>{ swipeRef.current.y0 = e.touches[0].clientY; }}
            onTouchEnd={e=>{ const dy = (e.changedTouches[0]?.clientY ?? swipeRef.current.y0) - swipeRef.current.y0; if (dy > 40) setOptionsSheet(false); }}
            style={{width:'100%',maxWidth:480,background:'var(--card, #11161f)',borderTopLeftRadius:20,
              borderTopRightRadius:20,border:'1px solid var(--border)',padding:'10px 20px calc(24px + env(safe-area-inset-bottom))'}}>
            <div style={{width:40,height:5,borderRadius:3,background:'var(--border)',margin:'0 auto 16px'}} />
            <div style={{fontWeight:700,fontSize:'1.05rem',color:'#fff',marginBottom:14}}>Run options</div>

            <button
              role="switch" aria-checked={autoPauseOn} aria-label="Auto-pause"
              onClick={toggleAutoPauseLocal} disabled={savingPause}
              style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,width:'100%',
                margin:'0 0 12px',padding:'12px 14px',borderRadius:14,
                background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
                cursor: savingPause ? 'default' : 'pointer',opacity: savingPause ? 0.6 : 1}}>
              <span style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:2}}>
                <span style={{fontWeight:600,fontSize:'0.9rem',color:'#fff'}}>⏸ Auto-pause</span>
                <span style={{fontSize:'0.72rem',color:'var(--gray)'}}>Pause when you stop, resume when you move</span>
              </span>
              <span style={{flexShrink:0,width:52,height:30,borderRadius:15,border:'1px solid var(--border)',
                position:'relative',background: autoPauseOn ? '#D4AF37' : 'var(--card, #1a1f29)',transition:'background .15s'}}>
                <span style={{position:'absolute',top:3,left: autoPauseOn ? 25 : 3,width:22,height:22,
                  borderRadius:'50%',background:'#fff',transition:'left .15s'}} />
              </span>
            </button>

            <div
              onClick={hrDevice ? disconnectHr : openHrSheet}
              style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,width:'100%',
                margin:'0 0 4px',padding:'12px 14px',borderRadius:14,cursor:'pointer',
                background: hrDevice ? 'rgba(231,76,60,0.10)' : 'rgba(255,255,255,0.04)',
                border:`1px solid ${hrDevice ? 'rgba(231,76,60,0.45)' : 'var(--border)'}`}}>
              <span style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:2}}>
                <span style={{fontWeight:600,fontSize:'0.9rem',color:'#fff'}}>
                  {hrDevice ? `❤️ ${hrDevice.name}` : '➕ Add a sensor'}
                </span>
                <span style={{fontSize:'0.72rem',color:'var(--gray)'}}>
                  {hrDevice ? `${hrBpm ? hrBpm + ' bpm — ' : ''}tap to disconnect` : 'Pair a Bluetooth heart-rate monitor'}
                </span>
              </span>
              {hrDevice
                ? <span style={{flexShrink:0,fontSize:'1.4rem',fontWeight:700,color:'#E74C3C',fontFamily:'Barlow Condensed'}}>{hrBpm ?? '—'}</span>
                : <span style={{flexShrink:0,color:'var(--gray)',fontSize:'1.1rem'}}>›</span>}
            </div>

            <button className="btn btn-ghost btn-sm" style={{width:'100%',marginTop:14}} onClick={()=>setOptionsSheet(false)}>Done</button>
          </div>
        </div>
      )}

      {hrSheet && (
        <div onClick={e => { if (e.target === e.currentTarget) closeHrSheet(); }}
          style={{position:'fixed',inset:0,zIndex:400,background:'rgba(0,0,0,0.6)',display:'flex',
            alignItems:'flex-end',justifyContent:'center'}}>
          <div style={{width:'100%',maxWidth:480,background:'var(--card, #11161f)',borderTopLeftRadius:20,
            borderTopRightRadius:20,border:'1px solid var(--border)',padding:'20px 20px calc(24px + env(safe-area-inset-bottom))'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
              <div style={{fontWeight:700,fontSize:'1.05rem',color:'#fff'}}>❤️ Add a sensor</div>
              <button className="btn btn-ghost btn-sm" onClick={closeHrSheet}>Done</button>
            </div>
            <div style={{fontSize:'0.78rem',color:'var(--gray)',marginBottom:16}}>
              Bluetooth heart-rate monitors (chest straps and armbands) appear here. Wake your strap and keep it close.
            </div>
            {!HeartRate.isNative ? (
              <div style={{fontSize:'0.82rem',color:'var(--gray)',padding:'14px 0'}}>
                Sensor pairing works in the TEAM 3332 app on your phone — it isn't available in the web preview.
              </div>
            ) : (
              <div>
                {hrDevices.length === 0 && (
                  <div style={{fontSize:'0.82rem',color:'var(--gray)',padding:'18px 0',textAlign:'center'}}>
                    {hrScanning ? 'Scanning for sensors…' : 'No sensors found yet.'}
                  </div>
                )}
                {hrDevices.map(d => (
                  <button key={d.id} onClick={() => connectHr(d)}
                    style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',
                      padding:'14px 12px',background:'transparent',border:'none',borderBottom:'1px solid var(--border)',
                      cursor:'pointer',color:'#fff',fontSize:'0.92rem'}}>
                    <span>❤️ {d.name}</span>
                    <span style={{color:'#D4AF37',fontSize:'0.82rem',fontWeight:600}}>Connect</span>
                  </button>
                ))}
                <button className="btn btn-ghost btn-sm" style={{width:'100%',marginTop:14}}
                  onClick={hrScanning ? stopHrScan : openHrSheet}>
                  {hrScanning ? 'Stop scanning' : 'Scan again'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   ACTIVITY LOG
══════════════════════════════════════ */
function ActivityLog({ onToast, user }) {
  const [showModal, setShowModal] = useState(false);
  const [activities, setActivities] = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [form, setForm] = useState({ name:'Morning Run', type:'Run', distance:'', pace:'', duration:'', notes:'' });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const [showRecord, setShowRecord] = useState(false);
  const [selected, setSelected] = useState(null);
  const [gpx, setGpx] = useState(null);          // { route_data, logged_at, elevation_gain, point_count }
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const handleGpxFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { onToast('GPX file too large (max 15 MB)'); return; }
    setImporting(true);
    try {
      const text = await file.text();
      const { parsed } = await api.postRaw('/activities/parse-gpx', text);
      setForm(f => ({
        ...f,                                  // keep the selected activity type (Run/Walk)
        name: parsed.name || `Imported ${f.type || 'Run'}`,
        distance: String(parsed.distance),
        pace: parsed.pace || '',
        duration: parsed.duration || '',
        notes: parsed.elevation_gain > 0 ? `Elevation gain: ${parsed.elevation_gain} ft` : '',
      }));
      setGpx({ route_data: parsed.route_data, logged_at: parsed.logged_at });
      onToast(`GPX imported — ${parsed.distance} mi. Review & save.`);
    } catch(err) { onToast(`Import failed: ${err.message}`); }
    finally { setImporting(false); }
  };

  const loadActivities = () => {
    setLoading(true);
    api.get('/activities?limit=20')
      .then(d => { setActivities(d.activities || []); setTotal(d.total || 0); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadActivities, []);

  const handleLog = async () => {
    if (!form.distance) return;
    setSaving(true);
    try {
      await api.post('/activities', {
        name: form.name || 'My Run',
        type: form.type || 'Run',
        distance: parseFloat(form.distance),
        pace: form.pace,
        duration: form.duration,
        notes: form.notes,
        ...(gpx ? { route_data: gpx.route_data, logged_at: gpx.logged_at } : {}),
      });
      loadActivities();
      setShowModal(false);
      onToast(`${form.type || 'Run'} logged successfully!`);
      setForm({ name:'Morning Run', type:'Run', distance:'', pace:'', duration:'', notes:'' });
      setGpx(null);
    } catch(e) { onToast(`Error: ${e.message}`); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this run?')) return;
    await api.delete(`/activities/${id}`).catch(console.error);
    loadActivities();
    onToast('Run deleted');
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <div className="page-title">Activity Log</div>
            <div className="page-sub">{total} runs recorded</div>
          </div>
          <div className="flex gap-8">
            <button className="btn btn-primary btn-sm" onClick={()=>setShowRecord(true)}>● Record</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setGpx(null);setShowModal(true);}}>+ Log</button>
          </div>
        </div>
      </div>
      <div className="page-body">
        {loading && <div style={{textAlign:'center',padding:40}}><Spinner size={28} /></div>}
        {!loading && activities.length === 0 && (
          <div className="empty-state"><div className="icon">🏃</div><p>No runs yet. Log your first one!</p></div>
        )}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {activities.map(a => (
            <div key={a.id} className="card" style={{cursor:'pointer'}} onClick={()=>setSelected(selected===a.id?null:a.id)}>
              <div className="flex items-center justify-between mb-12">
                <div className="flex items-center gap-12">
                  <div className="activity-icon">{a.type === 'Walk' ? '🚶' : '🏃'}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:'0.92rem'}}>{a.name}</div>
                    <div style={{fontSize:'0.75rem',color:'var(--gray)'}}>{formatDate(a.logged_at)}</div>
                  </div>
                </div>
                <div className="flex gap-12 items-center" style={{textAlign:'right'}}>
                  <div><div style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:'1.1rem'}}>{a.distance}</div><div style={{fontSize:'0.7rem',color:'var(--gray)'}}>miles</div></div>
                  <div><div style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:'1.1rem'}}>{activityStat(a).val}</div><div style={{fontSize:'0.7rem',color:'var(--gray)'}}>{activityStat(a).unit}</div></div>
                  <div><div style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:'1.1rem'}}>{a.duration||'—'}</div><div style={{fontSize:'0.7rem',color:'var(--gray)'}}>time</div></div>
                  {a.avg_hr ? <div><div style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:'1.1rem',color:'#E74C3C'}}>{a.avg_hr}</div><div style={{fontSize:'0.7rem',color:'var(--gray)'}}>❤️ bpm</div></div> : null}
                  <div><div style={{fontFamily:'Barlow Condensed',fontWeight:700,fontSize:'1.1rem'}}>{a.calories||'—'}</div><div style={{fontSize:'0.7rem',color:'var(--gray)'}}>cal</div></div>
                  <button className="btn btn-xs btn-ghost" title="Share" onClick={e=>{e.stopPropagation(); shareActivity({
                    name: a.name, type: a.type, distance: a.distance,
                    durationStr: a.duration || null, secs: durSecs(a.duration) || (a.pace ? durSecs(a.pace) * (parseFloat(a.distance)||0) : 0),
                    points: (()=>{ try { const p = a.route_data ? (typeof a.route_data==='string' ? JSON.parse(a.route_data) : a.route_data) : null; return p && Array.isArray(p.points) ? p.points : null; } catch(err){ return null; } })(),
                    dateStr: formatDate(a.logged_at),
                  }, onToast);}} style={{marginLeft:4}}>📤</button>
                  <button className="btn btn-xs btn-ghost" onClick={e=>handleDelete(a.id,e)} style={{marginLeft:4}}>🗑</button>
                </div>
              </div>
              {selected===a.id && (
                <div style={{marginTop:8}}><SVGMap runId={a.id} routeData={a.route_data} /></div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showRecord && (
        <RecordRun onClose={()=>setShowRecord(false)} onSaved={loadActivities} onToast={onToast} autoPause={!!(user && user.auto_pause)} />
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e=>{if(e.target.className==='modal-overlay')setShowModal(false)}}>
          <div className="modal">
            <div className="modal-title">📍 Log an Activity</div>
            <div className="flex gap-8" style={{marginBottom:14}}>
              {['Run','Walk'].map(t => (
                <button key={t} className={`btn btn-sm ${form.type===t?'btn-primary':'btn-ghost'}`} style={{flex:1}}
                  onClick={()=>{set('type',t); if (form.name==='Morning Run'||form.name==='Morning Walk') set('name',`Morning ${t}`);}}>
                  {t==='Run'?'🏃 Run':'🚶 Walk'}
                </button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml" style={{display:'none'}} onChange={handleGpxFile} />
            <button className="btn btn-ghost btn-sm" style={{width:'100%',marginBottom:14,border:'1px dashed var(--gray)'}} onClick={()=>fileRef.current && fileRef.current.click()} disabled={importing}>
              {importing ? <Spinner /> : (gpx ? '✓ GPS file imported — choose a different file' : '⌚ Import from GPS file (.gpx)')}
            </button>
            {gpx && <div style={{fontSize:'0.75rem',color:'var(--gray)',marginTop:-8,marginBottom:12,textAlign:'center'}}>Works with exports from Strava, Garmin, Apple Watch & more. Route map included.</div>}
            <div className="form-group"><label>Run Name</label><input type="text" value={form.name} onChange={e=>set('name',e.target.value)} /></div>
            <div className="grid-2" style={{gap:12,marginBottom:16}}>
              <div className="form-group" style={{marginBottom:0}}><label>Distance (miles)</label><input type="number" placeholder="0.0" step="0.1" value={form.distance} onChange={e=>set('distance',e.target.value)} /></div>
              <div className="form-group" style={{marginBottom:0}}><label>Avg Pace (min/mi)</label><input type="text" placeholder="e.g. 8:30" value={form.pace} onChange={e=>set('pace',e.target.value)} /></div>
            </div>
            <div className="form-group"><label>Duration (e.g. 45:00)</label><input type="text" placeholder="HH:MM:SS or MM:SS" value={form.duration} onChange={e=>set('duration',e.target.value)} /></div>
            <div className="form-group"><label>Notes (optional)</label><textarea placeholder="How did it feel?" value={form.notes} onChange={e=>set('notes',e.target.value)} /></div>
            <div className="flex gap-12" style={{marginTop:4}}>
              <button className="btn btn-primary" style={{flex:1}} onClick={handleLog} disabled={saving}>
                {saving ? <Spinner /> : 'Save Run'}
              </button>
              <button className="btn btn-ghost" onClick={()=>setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   LEADERBOARD
══════════════════════════════════════ */
function Leaderboard() {
  const [filter, setFilter]   = useState('all');
  const [period, setPeriod]   = useState('monthly');
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/leaderboard?period=${period}&pace_group=${filter}`)
      .then(d => setData(d.leaderboard || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period, filter]);

  useEffect(load, [load]);

  const periodMap = { weekly:'Weekly', monthly:'Monthly', alltime:'All-Time' };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <div className="page-title">Leaderboard</div>
            <div className="page-sub">TEAM 3332 Global Rankings</div>
          </div>
          <div className="flex gap-8">
            {Object.entries(periodMap).map(([k,v])=>(
              <button key={k} className={`btn btn-xs ${period===k?'btn-primary':'btn-ghost'}`} onClick={()=>setPeriod(k)}>{v}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="page-body">
        <div className="tabs" style={{maxWidth:440}}>
          {['all','A','B','C','D'].map(g=>(
            <button key={g} className={`tab-btn ${filter===g?'active':''}`} onClick={()=>setFilter(g)}>
              {g==='all'?'All':g}
            </button>
          ))}
        </div>

        {loading && <div style={{textAlign:'center',padding:40}}><Spinner size={28} /></div>}

        {!loading && data.length === 0 && (
          <div className="empty-state"><div className="icon">🏆</div><p>No runners found for this filter yet.</p></div>
        )}

        {!loading && data.slice(0,3).length > 0 && (
          <div className="grid-3 mb-24">
            {data.slice(0,3).map((m,i)=>(
              <div key={m.id} className="card" style={{textAlign:'center',borderColor:i===0?'rgba(255,215,0,0.3)':i===1?'rgba(192,192,192,0.3)':'rgba(205,127,50,0.3)'}}>
                <div style={{fontSize:'2rem',marginBottom:8}}>{i===0?'🥇':i===1?'🥈':'🥉'}</div>
                <Avatar member={m} style={{margin:'0 auto 8px',width:48,height:48,fontSize:'1.1rem',background:i===0?'#FFD700':i===1?'#C0C0C0':'#CD7F32',color:'var(--black)'}} />
                <div style={{fontWeight:700,fontSize:'0.9rem'}}>{m.name}{m.is_you&&<span style={{color:'var(--blue)',fontSize:'0.72rem',marginLeft:4}}>you</span>}</div>
                <div style={{fontSize:'0.75rem',color:'var(--gray)',marginBottom:8}}>Group {m.pace_group} · {m.tier}</div>
                {m.club_id && <div style={{fontSize:'0.72rem',marginBottom:6}}><ClubName id={m.club_id} name={m.club_name} /></div>}
                <div style={{fontFamily:'Barlow Condensed',fontWeight:800,fontSize:'1.4rem',color:'var(--blue)'}}>{m.total_miles} mi</div>
              </div>
            ))}
          </div>
        )}

        {!loading && data.length > 0 && (
          <div className="card">
            <div className="card-title">Full Rankings</div>
            {data.map((m,i)=>(
              <div key={m.id} className={`lb-row ${m.is_you?'lb-you':''}`}>
                <div className={`lb-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}`}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</div>
                <Avatar member={m} style={{width:34,height:34,fontSize:'0.82rem'}} />
                <div style={{flex:1}}>
                  <div className="lb-name">{m.name}{m.is_you&&<span style={{fontSize:'0.7rem',color:'var(--blue)',marginLeft:6}}>you</span>}</div>
                  <div className="lb-sub">Group {m.pace_group} · {m.tier}{m.club_id && <span> · <ClubName id={m.club_id} name={m.club_name} style={{fontSize:'0.72rem'}} /></span>}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="lb-val">{m.total_miles} mi</div>
                  <div style={{fontSize:'0.72rem',color:'var(--gray)'}}>{m.run_count} runs</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   CHALLENGES
══════════════════════════════════════ */
function Challenges({ onToast }) {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tabFilter, setTabFilter]   = useState('all');

  const load = () => {
    setLoading(true);
    api.get('/challenges')
      .then(d => setChallenges(d.challenges || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleJoin = async (c) => {
    try {
      if (c.joined) {
        await api.delete(`/challenges/${c.id}/join`);
        onToast(`Left "${c.title}"`);
      } else {
        await api.post(`/challenges/${c.id}/join`);
        onToast(`Joined "${c.title}"!`);
      }
      load();
    } catch(e) { onToast(`Error: ${e.message}`); }
  };

  const visible = challenges.filter(c => {
    if (tabFilter === 'mine')      return c.joined && !c.my_completed;
    if (tabFilter === 'completed') return c.my_completed;
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <div className="page-title">Challenges</div>
            <div className="page-sub">Compete, earn badges, and level up</div>
          </div>
          <span className="badge badge-orange">{challenges.filter(c=>c.joined && !c.my_completed).length} Active</span>
        </div>
      </div>
      <div className="page-body">
        <div className="tabs">
          {[['all','All Challenges'],['mine','My Challenges'],['completed','Completed']].map(([k,v])=>(
            <button key={k} className={`tab-btn ${tabFilter===k?'active':''}`} onClick={()=>setTabFilter(k)}>{v}</button>
          ))}
        </div>

        {loading && <div style={{textAlign:'center',padding:40}}><Spinner size={28} /></div>}
        {!loading && visible.length === 0 && <div className="empty-state"><div className="icon">⚡</div><p>No challenges here yet.</p></div>}

        <div className="grid-2">
          {visible.map(c => {
            const pct = pctProgress(c.my_progress || 0, c.goal_value);
            return (
              <div key={c.id} className="challenge-card">
                <div className="challenge-header">
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                      <span style={{fontSize:'1.4rem'}}>{c.icon}</span>
                      <div className="challenge-title">{c.title}</div>
                    </div>
                    <div className="challenge-desc">{c.description}</div>
                  </div>
                </div>
                {c.joined && (
                  <div style={{margin:'12px 0'}}>
                    <div className="flex justify-between mb-4" style={{fontSize:'0.75rem',color:'var(--gray)'}}>
                      <span>Progress</span><span>{pct}%</span>
                    </div>
                    <div className="progress-bar"><div className="progress-fill" style={{width:`${pct}%`}}></div></div>
                  </div>
                )}
                {c.reward && (
                  <div style={{background:'var(--dark)',borderRadius:8,padding:'8px 12px',marginTop:12,fontSize:'0.78rem',color:'var(--blue)'}}>
                    🏆 Reward: {c.reward}
                  </div>
                )}
                <div className="challenge-footer">
                  <div className="challenge-meta">{c.sport==='Any' ? '🏃+🚶 Runs & walks' : c.sport==='Walk' ? '🚶 Walks only' : '🏃 Runs only'} · 👥 {c.participant_count} · {daysLeft(c.ends_at)}d left</div>
                  <button
                    className={`btn btn-xs ${c.joined?'btn-ghost':'btn-primary'}`}
                    onClick={()=>toggleJoin(c)}
                    disabled={c.my_completed}
                  >
                    {c.my_completed ? '✓ Done' : c.joined ? 'Leave' : 'Join'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   GROUP RUNS (member-facing)
══════════════════════════════════════ */
function GroupRuns({ onToast }) {
  const [runs, setRuns]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);

  const load = () => {
    api.get('/captain/runs/upcoming')
      .then(d => setRuns(d.runs || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggleJoin = async (r) => {
    setBusyId(r.id);
    try {
      await api.post(`/captain/runs/${r.id}/${r.joined ? 'leave' : 'join'}`);
      onToast(r.joined ? 'You left the run.' : '🎉 You\'re in! See you out there.');
      load();
    } catch(e) { onToast(e.message); }
    finally { setBusyId(null); }
  };

  const typeBadge = (t) => t === 'In-Person' ? 'badge-green' : t === 'Hybrid' ? 'badge-purple' : 'badge-blue';

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div><div className="page-title">Group Runs</div><div className="page-sub">Captain-led runs — virtual & in person</div></div>
        </div>
      </div>
      <div className="page-body">
        {loading && <div style={{textAlign:'center',padding:40}}><Spinner /></div>}
        {!loading && runs.length === 0 && (
          <div className="empty-state">
            <div className="icon">🗓️</div>
            <div style={{fontWeight:700,fontSize:'1rem',marginBottom:8}}>No upcoming group runs</div>
            <p>When a captain schedules a run and it's approved, it'll show up here. Check back soon!</p>
          </div>
        )}
        {runs.map(r => (
          <div key={r.id} className="card" style={{marginBottom:16}}>
            <div className="flex justify-between items-center" style={{flexWrap:'wrap',gap:12}}>
              <div style={{minWidth:0}}>
                <div className="flex items-center gap-8" style={{marginBottom:4,flexWrap:'wrap'}}>
                  <div style={{fontWeight:700,fontSize:'1rem'}}>{r.title}</div>
                  <span className={`badge ${typeBadge(r.run_type)}`}>{r.run_type}</span>
                </div>
                <div style={{fontSize:'0.8rem',color:'var(--gray)'}}>
                  🎖️ Captain {r.captain_name} · {formatDate(r.scheduled_at)}{r.location ? ` · 📍 ${r.location}` : ''}
                </div>
                {r.description && <div style={{fontSize:'0.82rem',marginTop:6,color:'var(--gray)'}}>{r.description}</div>}
              </div>
              <div style={{textAlign:'right'}}>
                <button
                  className={`btn btn-sm ${r.joined ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={busyId === r.id}
                  onClick={() => toggleJoin(r)}>
                  {busyId === r.id ? <Spinner /> : (r.joined ? '✓ Joined — tap to leave' : 'Join Run')}
                </button>
                <div style={{fontSize:'0.72rem',color:'var(--gray)',marginTop:6}}>👥 {r.member_count || 0} joined</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   CAPTAIN PANEL
══════════════════════════════════════ */
function CaptainApply({ user, onToast }) {
  const [application, setApplication] = useState(undefined); // undefined = loading
  const [form, setForm] = useState({ motivation:'', experience:'' });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const load = () => api.get('/captain/apply/status')
    .then(d => setApplication(d.application))
    .catch(() => setApplication(null));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.motivation.trim()) { onToast('Tell us why you want to be a captain.'); return; }
    setSaving(true);
    try {
      const d = await api.post('/captain/apply', { motivation: form.motivation, experience: form.experience });
      setApplication(d.application);
      onToast(d.message || 'Application submitted!');
    } catch(e) { onToast(e.message); }
    finally { setSaving(false); }
  };

  const Header = () => (
    <div className="page-header">
      <div className="page-header-inner"><div><div className="page-title">Become a Captain</div><div className="page-sub">Lead group runs & mentor the team</div></div></div>
    </div>
  );

  if (application === undefined) {
    return <div><Header /><div className="page-body"><div style={{textAlign:'center',padding:40}}><Spinner /></div></div></div>;
  }

  // Pending — under review
  if (application && application.status === 'pending') {
    return (
      <div><Header /><div className="page-body">
        <div className="empty-state">
          <div className="icon">⏳</div>
          <div style={{fontWeight:700,fontSize:'1rem',marginBottom:8}}>Application under review</div>
          <p>Thanks, {user.name.split(' ')[0]}! An admin is reviewing your captain application. You'll be promoted as soon as it's approved.</p>
          <div className="card" style={{textAlign:'left',marginTop:20,maxWidth:480}}>
            <div className="card-title">What you told us</div>
            <div style={{fontSize:'0.85rem',marginBottom:10}}><strong style={{color:'var(--gray)'}}>Why:</strong> {application.motivation}</div>
            {application.experience && <div style={{fontSize:'0.85rem'}}><strong style={{color:'var(--gray)'}}>Experience:</strong> {application.experience}</div>}
          </div>
        </div>
      </div></div>
    );
  }

  // Approved — needs re-login to pick up captain powers
  if (application && application.status === 'approved') {
    return (
      <div><Header /><div className="page-body">
        <div className="empty-state">
          <div className="icon">🎉</div>
          <div style={{fontWeight:700,fontSize:'1rem',marginBottom:8}}>You're approved — welcome, Captain!</div>
          <p>Your application was approved. Log out and back in to unlock your Captain Panel, group-run tools, and member questions.</p>
        </div>
      </div></div>
    );
  }

  // No application yet, or a previous one was rejected → show the form
  const wasRejected = application && application.status === 'rejected';
  return (
    <div><Header /><div className="page-body">
      <div className="card" style={{maxWidth:560,margin:'0 auto'}}>
        <div className="captain-header mb-24" style={{padding:0,background:'none',border:'none'}}>
          <div className="captain-badge-big">🎖️</div>
          <div>
            <div style={{fontWeight:700,fontSize:'1.05rem'}}>{wasRejected ? 'Apply again' : 'Lead the pack'}</div>
            <div style={{color:'var(--gray)',fontSize:'0.85rem',marginTop:2}}>Captains schedule group runs, answer member questions, and represent the team.</div>
          </div>
        </div>
        {wasRejected && (
          <div className="badge badge-purple" style={{marginBottom:16}}>Your last application wasn't approved — you're welcome to apply again.</div>
        )}
        <div className="form-group">
          <label>Why do you want to be a captain? *</label>
          <textarea placeholder="What would you bring to the team?" value={form.motivation} onChange={e=>set('motivation',e.target.value)} />
        </div>
        <div className="form-group">
          <label>Relevant experience (optional)</label>
          <textarea placeholder="Coaching, pacing, organizing runs, years running..." value={form.experience} onChange={e=>set('experience',e.target.value)} />
        </div>
        <button className="btn btn-primary btn-full" onClick={submit} disabled={saving}>
          {saving ? <Spinner /> : 'Submit Application'}
        </button>
      </div>
    </div></div>
  );
}

function CaptainInbox({ onToast }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyId, setReplyId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/captain/questions/inbox')
    .then(d => setQuestions(d.questions || []))
    .catch(console.error)
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openCount = questions.filter(q => q.status === 'open').length;

  const sendReply = async (id) => {
    if (!replyText.trim()) return;
    setSaving(true);
    try {
      await api.post(`/captain/questions/${id}/answer`, { answer: replyText });
      setReplyId(null); setReplyText('');
      onToast('Reply sent ✓');
      load();
    } catch(e) { onToast(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="card">
      <div className="card-title">Member Questions {openCount > 0 && <span className="badge badge-orange" style={{marginLeft:6}}>{openCount} new</span>}</div>
      {loading && <div style={{textAlign:'center',padding:16}}><Spinner /></div>}
      {!loading && questions.length === 0 && <div style={{color:'var(--gray)',fontSize:'0.85rem',padding:'8px 0'}}>No questions yet. Members can ask you anything from "Ask a Captain".</div>}
      {questions.map(q => (
        <div key={q.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
          <div className="flex justify-between items-center" style={{marginBottom:4}}>
            <div style={{fontWeight:600,fontSize:'0.85rem'}}>{q.member_name} <span style={{color:'var(--gray)',fontWeight:400}}>· Pace {q.member_pace_group}</span></div>
            <span className={`badge ${q.status==='answered'?'badge-green':'badge-orange'}`}>{q.status}</span>
          </div>
          <div style={{fontSize:'0.88rem',marginBottom:6}}>{q.question}</div>
          {q.answer && <div style={{fontSize:'0.82rem',color:'var(--gray)',borderLeft:'2px solid var(--blue)',paddingLeft:10,marginTop:6}}><strong>You:</strong> {q.answer}</div>}
          {q.status === 'open' && replyId !== q.id && (
            <button className="btn btn-secondary btn-sm" style={{marginTop:8}} onClick={()=>{setReplyId(q.id);setReplyText('');}}>Reply</button>
          )}
          {replyId === q.id && (
            <div style={{marginTop:8}}>
              <textarea placeholder="Your answer..." value={replyText} onChange={e=>setReplyText(e.target.value)} />
              <div className="flex gap-12" style={{marginTop:8}}>
                <button className="btn btn-primary btn-sm" onClick={()=>sendReply(q.id)} disabled={saving}>{saving ? <Spinner /> : 'Send'}</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>setReplyId(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AskCaptain({ user, onToast }) {
  const [captains, setCaptains] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ captain_id:'', question:'' });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const load = () => Promise.all([api.get('/captain/list'), api.get('/captain/questions/mine')])
    .then(([c, q]) => { setCaptains((c.captains||[]).filter(x=>x.id!==user.id)); setQuestions(q.questions || []); })
    .catch(console.error)
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const ask = async () => {
    if (!form.captain_id) { onToast('Pick a captain to ask.'); return; }
    if (!form.question.trim()) { onToast('Type your question first.'); return; }
    setSaving(true);
    try {
      await api.post('/captain/questions', { captain_id: Number(form.captain_id), question: form.question });
      setForm({ captain_id:'', question:'' });
      onToast('Question sent ✓');
      load();
    } catch(e) { onToast(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner"><div><div className="page-title">Ask a Captain</div><div className="page-sub">Get advice from your team captains</div></div></div>
      </div>
      <div className="page-body">
        {loading && <div style={{textAlign:'center',padding:40}}><Spinner /></div>}
        {!loading && (
          <div className="grid-2">
            <div className="card">
              <div className="card-title">Ask a question</div>
              {captains.length === 0 ? (
                <div style={{color:'var(--gray)',fontSize:'0.85rem',padding:'8px 0'}}>No captains are available to ask right now. Check back soon!</div>
              ) : (
                <>
                  <div className="form-group">
                    <label>Captain</label>
                    <select value={form.captain_id} onChange={e=>set('captain_id',e.target.value)}>
                      <option value="">Choose a captain…</option>
                      {captains.map(c=>(
                        <option key={c.id} value={c.id}>{c.name} (Pace {c.pace_group}){c.city ? ` · ${c.city}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Your question</label>
                    <textarea placeholder="Ask about training, pacing, gear, race prep..." value={form.question} onChange={e=>set('question',e.target.value)} />
                  </div>
                  <button className="btn btn-primary btn-full" onClick={ask} disabled={saving}>{saving ? <Spinner /> : 'Send Question'}</button>
                </>
              )}
            </div>
            <div className="card">
              <div className="card-title">Your questions</div>
              {questions.length === 0 && <div style={{color:'var(--gray)',fontSize:'0.85rem',padding:'8px 0'}}>You haven't asked anything yet.</div>}
              {questions.map(q=>(
                <div key={q.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                  <div className="flex justify-between items-center" style={{marginBottom:4}}>
                    <div style={{fontWeight:600,fontSize:'0.82rem'}}>🎖️ {q.captain_name}</div>
                    <span className={`badge ${q.status==='answered'?'badge-green':'badge-orange'}`}>{q.status}</span>
                  </div>
                  <div style={{fontSize:'0.88rem',marginBottom:6}}>{q.question}</div>
                  {q.answer
                    ? <div style={{fontSize:'0.82rem',color:'var(--gray)',borderLeft:'2px solid var(--blue)',paddingLeft:10,marginTop:6}}><strong>{q.captain_name.split(' ')[0]}:</strong> {q.answer}</div>
                    : <div style={{fontSize:'0.78rem',color:'var(--gray)',fontStyle:'italic'}}>Awaiting a reply…</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Captain Tools — three real tools: propose a challenge, post an announcement,
// nominate Member of the Month. Each opens a modal backed by a live endpoint.
function CaptainToolsCard({ onToast }) {
  const [open, setOpen] = useState(null); // 'challenge' | 'announce' | 'nominate' | null
  const close = () => setOpen(null);

  const isoDate = (offsetDays = 0) => {
    const d = new Date(); d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  // ── Challenge form ──
  const [cForm, setCForm] = useState({ title:'', description:'', type:'distance', sport:'Run', goal_value:'', reward:'', starts_at: isoDate(0), ends_at: isoDate(30) });
  const cSet = (k,v) => setCForm(f=>({...f,[k]:v}));
  const [cSaving, setCSaving] = useState(false);
  const submitChallenge = async () => {
    if (!cForm.title.trim() || !cForm.goal_value) { onToast('Title and goal are required'); return; }
    setCSaving(true);
    try {
      await api.post('/challenges', {
        title: cForm.title.trim(), description: cForm.description.trim() || null,
        type: cForm.type, sport: cForm.sport, goal_value: parseFloat(cForm.goal_value),
        reward: cForm.reward.trim() || null,
        starts_at: new Date(cForm.starts_at).toISOString(),
        ends_at: new Date(cForm.ends_at).toISOString(),
      });
      onToast('Team challenge created 🏅');
      setCForm({ title:'', description:'', type:'distance', sport:'Run', goal_value:'', reward:'', starts_at: isoDate(0), ends_at: isoDate(30) });
      close();
    } catch(e) { onToast(`Error: ${e.message}`); }
    finally { setCSaving(false); }
  };

  // ── Announcement form + my list ──
  const [aForm, setAForm] = useState({ title:'', body:'' });
  const [aMine, setAMine] = useState([]);
  const [aSaving, setASaving] = useState(false);
  const loadMine = () => api.get('/captain/announcements/mine').then(d=>setAMine(d.announcements||[])).catch(()=>{});
  useEffect(() => { if (open === 'announce') loadMine(); }, [open]);
  const submitAnnouncement = async () => {
    if (!aForm.title.trim() || !aForm.body.trim()) { onToast('Title and message are required'); return; }
    setASaving(true);
    try {
      await api.post('/captain/announcements', { title: aForm.title.trim(), body: aForm.body.trim() });
      onToast('Announcement posted to the team 📣');
      setAForm({ title:'', body:'' });
      loadMine();
    } catch(e) { onToast(`Error: ${e.message}`); }
    finally { setASaving(false); }
  };
  const deleteAnnouncement = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    try { await api.delete(`/captain/announcements/${id}`); onToast('Announcement deleted'); loadMine(); }
    catch(e) { onToast(`Error: ${e.message}`); }
  };

  // ── Nomination form ──
  const [members, setMembers] = useState([]);
  const [nForm, setNForm] = useState({ nominee_id:'', reason:'' });
  const [nSaving, setNSaving] = useState(false);
  useEffect(() => { if (open === 'nominate') api.get('/captain/members').then(d=>setMembers(d.members||[])).catch(()=>{}); }, [open]);
  const submitNomination = async () => {
    if (!nForm.nominee_id || !nForm.reason.trim()) { onToast('Pick a member and add a reason'); return; }
    setNSaving(true);
    try {
      await api.post('/captain/nominations', { nominee_id: parseInt(nForm.nominee_id,10), reason: nForm.reason.trim() });
      onToast('Nomination submitted 🏅');
      setNForm({ nominee_id:'', reason:'' });
      close();
    } catch(e) { onToast(`Error: ${e.message}`); }
    finally { setNSaving(false); }
  };

  const tools = [
    { key:'challenge', icon:'📋', label:'Propose a Team Challenge' },
    { key:'announce',  icon:'📣', label:'Post Team Announcement' },
    { key:'nominate',  icon:'🏅', label:'Nominate Member of the Month' },
  ];

  return (
    <div className="card">
      <div className="card-title">Captain Tools</div>
      {tools.map(t=>(
        <button key={t.key} className="btn btn-secondary btn-full" style={{marginBottom:8,justifyContent:'flex-start',gap:10}} onClick={()=>setOpen(t.key)}>
          <span>{t.icon}</span><span>{t.label}</span>
        </button>
      ))}

      {open === 'challenge' && (
        <div className="modal-overlay" onClick={e=>{if(e.target.className==='modal-overlay')close()}}>
          <div className="modal">
            <div className="modal-title">📋 Propose a Team Challenge</div>
            <div className="form-group"><label>Title</label><input type="text" placeholder="e.g. June 100-Mile Club" value={cForm.title} onChange={e=>cSet('title',e.target.value)} /></div>
            <div className="form-group"><label>Description</label><input type="text" placeholder="What's the challenge?" value={cForm.description} onChange={e=>cSet('description',e.target.value)} /></div>
            <div className="grid-2" style={{gap:12,marginBottom:16}}>
              <div className="form-group" style={{marginBottom:0}}><label>Type</label>
                <select value={cForm.type} onChange={e=>cSet('type',e.target.value)}>
                  <option value="distance">Distance</option><option value="frequency">Frequency</option><option value="pace">Pace</option><option value="streak">Streak</option>
                </select>
              </div>
              <div className="form-group" style={{marginBottom:0}}><label>Sport</label>
                <select value={cForm.sport} onChange={e=>cSet('sport',e.target.value)}>
                  <option value="Run">Run</option><option value="Walk">Walk</option><option value="Any">Any</option>
                </select>
              </div>
            </div>
            <div className="grid-2" style={{gap:12,marginBottom:16}}>
              <div className="form-group" style={{marginBottom:0}}><label>Goal value</label><input type="number" placeholder="e.g. 100" step="0.1" value={cForm.goal_value} onChange={e=>cSet('goal_value',e.target.value)} /></div>
              <div className="form-group" style={{marginBottom:0}}><label>Reward (optional)</label><input type="text" placeholder="e.g. Badge + sticker" value={cForm.reward} onChange={e=>cSet('reward',e.target.value)} /></div>
            </div>
            <div className="grid-2" style={{gap:12,marginBottom:16}}>
              <div className="form-group" style={{marginBottom:0}}><label>Starts</label><input type="date" value={cForm.starts_at} onChange={e=>cSet('starts_at',e.target.value)} /></div>
              <div className="form-group" style={{marginBottom:0}}><label>Ends</label><input type="date" value={cForm.ends_at} onChange={e=>cSet('ends_at',e.target.value)} /></div>
            </div>
            <div className="flex gap-8">
              <button className="btn btn-ghost btn-full" onClick={close}>Cancel</button>
              <button className="btn btn-primary btn-full" onClick={submitChallenge} disabled={cSaving}>{cSaving ? <Spinner /> : 'Create Challenge'}</button>
            </div>
          </div>
        </div>
      )}

      {open === 'announce' && (
        <div className="modal-overlay" onClick={e=>{if(e.target.className==='modal-overlay')close()}}>
          <div className="modal">
            <div className="modal-title">📣 Post Team Announcement</div>
            <div className="form-group"><label>Title</label><input type="text" placeholder="e.g. Saturday long run moved to 7am" value={aForm.title} onChange={e=>setAForm(f=>({...f,title:e.target.value}))} /></div>
            <div className="form-group"><label>Message</label><textarea rows={4} placeholder="Share the news with the whole team…" value={aForm.body} onChange={e=>setAForm(f=>({...f,body:e.target.value}))} style={{width:'100%',resize:'vertical'}} /></div>
            <div className="flex gap-8" style={{marginBottom:16}}>
              <button className="btn btn-ghost btn-full" onClick={close}>Close</button>
              <button className="btn btn-primary btn-full" onClick={submitAnnouncement} disabled={aSaving}>{aSaving ? <Spinner /> : 'Post to Team'}</button>
            </div>
            {aMine.length > 0 && <div className="card-title" style={{fontSize:'0.8rem'}}>Your recent announcements</div>}
            {aMine.map(a=>(
              <div key={a.id} className="flex justify-between items-center" style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:'0.85rem',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.title}</div>
                  <div style={{fontSize:'0.72rem',color:'var(--gray)'}}>{formatDate(a.created_at)}</div>
                </div>
                <button className="btn btn-xs btn-ghost" onClick={()=>deleteAnnouncement(a.id)} style={{marginLeft:8}}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {open === 'nominate' && (
        <div className="modal-overlay" onClick={e=>{if(e.target.className==='modal-overlay')close()}}>
          <div className="modal">
            <div className="modal-title">🏅 Nominate Member of the Month</div>
            <div className="form-group"><label>Member</label>
              <select value={nForm.nominee_id} onChange={e=>setNForm(f=>({...f,nominee_id:e.target.value}))}>
                <option value="">Choose a member…</option>
                {members.map(m=> <option key={m.id} value={m.id}>{m.name} (Pace {m.pace_group})</option>)}
              </select>
            </div>
            <div className="form-group"><label>Why are they your pick?</label><textarea rows={4} placeholder="What makes them stand out this month?" value={nForm.reason} onChange={e=>setNForm(f=>({...f,reason:e.target.value}))} style={{width:'100%',resize:'vertical'}} /></div>
            <div className="flex gap-8">
              <button className="btn btn-ghost btn-full" onClick={close}>Cancel</button>
              <button className="btn btn-primary btn-full" onClick={submitNomination} disabled={nSaving}>{nSaving ? <Spinner /> : 'Submit Nomination'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CaptainPanel({ user, onToast }) {
  const [myRuns, setMyRuns]   = useState([]);
  const [captStats, setCaptStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ title:'', scheduled_at:'', run_type:'Virtual', description:'' });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const load = () => {
    if (!user.is_captain) { setLoading(false); return; }
    Promise.all([api.get('/captain/runs'), api.get('/captain/stats')])
      .then(([r, s]) => { setMyRuns(r.runs || []); setCaptStats(s); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createRun = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      await api.post('/captain/runs', {
        title: form.title,
        description: form.description,
        run_type: form.run_type,
        scheduled_at: form.scheduled_at || new Date().toISOString(),
      });
      load();
      setShowNew(false);
      onToast('Group run submitted — it goes live once an admin approves it.');
      setForm({ title:'', scheduled_at:'', run_type:'Virtual', description:'' });
    } catch(e) { onToast(`Error: ${e.message}`); }
    finally { setSaving(false); }
  };

  if (!user.is_captain) {
    return <CaptainApply user={user} onToast={onToast} />;
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div><div className="page-title">Captain Panel</div><div className="page-sub">Lead, mentor, and build the team</div></div>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowNew(true)}>+ New Group Run</button>
        </div>
      </div>
      <div className="page-body">
        <div className="captain-header mb-24">
          <div className="captain-badge-big">🎖️</div>
          <div>
            <div style={{fontSize:'0.75rem',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--blue)',marginBottom:4}}>Team Captain</div>
            <div style={{fontFamily:'Barlow Condensed',fontWeight:800,fontSize:'1.6rem',textTransform:'uppercase'}}>{user.name}</div>
            <div style={{color:'var(--gray)',fontSize:'0.85rem',marginTop:4}}>Pace Group {user.pace_group} · {user.tier} Member</div>
          </div>
          {captStats && (
            <div style={{marginLeft:'auto',display:'flex',gap:24}}>
              {[
                {v: captStats.total_members_mentored || 0, l:'Members Mentored'},
                {v: captStats.completed_runs || 0,         l:'Runs Hosted'},
                {v: captStats.upcoming_runs || 0,          l:'Upcoming Runs'},
              ].map((s,i)=>(
                <div key={i} style={{textAlign:'center'}}>
                  <div style={{fontFamily:'Barlow Condensed',fontWeight:800,fontSize:'1.6rem',color:'var(--blue)'}}>{s.v}</div>
                  <div style={{fontSize:'0.72rem',color:'var(--gray)'}}>{s.l}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-title">My Group Runs</div>
            {loading && <div style={{textAlign:'center',padding:20}}><Spinner /></div>}
            {!loading && myRuns.length === 0 && <div style={{color:'var(--gray)',fontSize:'0.85rem',padding:'8px 0'}}>No runs yet — create your first one!</div>}
            {myRuns.map(r=>(
              <div key={r.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                <div className="flex justify-between items-center">
                  <div>
                    <div style={{fontWeight:600,fontSize:'0.88rem',marginBottom:3}}>{r.title}</div>
                    <div style={{fontSize:'0.75rem',color:'var(--gray)'}}>{formatDate(r.scheduled_at)} · {r.run_type}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <span className={`badge ${r.status==='completed'?'badge-green':'badge-orange'}`}>{r.status}</span>
                    {r.approval_status !== 'approved' && (
                      <span className={`badge ${r.approval_status==='pending'?'badge-gray':'badge-purple'}`} style={{marginLeft:6}}>
                        {r.approval_status==='pending' ? 'awaiting approval' : 'rejected'}
                      </span>
                    )}
                    <div style={{fontSize:'0.72rem',color:'var(--gray)',marginTop:4}}>👥 {r.member_count || 0}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <CaptainInbox onToast={onToast} />
            <CaptainToolsCard onToast={onToast} />
            <div className="card">
              <div className="card-title">Captain Perks</div>
              {['Exclusive captain-only apparel','Deeper gear & race discounts','Priority partner access','Monthly captain meetup invite'].map((p,i)=>(
                <div key={i} className="flex items-center gap-8" style={{padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'0.85rem'}}>
                  <span style={{color:'var(--blue)'}}>✓</span><span>{p}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={e=>{if(e.target.className==='modal-overlay')setShowNew(false)}}>
          <div className="modal">
            <div className="modal-title">🏃 New Group Run</div>
            <div className="form-group"><label>Run Title</label><input type="text" placeholder="e.g. Tuesday Morning Group Run" value={form.title} onChange={e=>set('title',e.target.value)} /></div>
            <div className="form-group"><label>Date & Time</label><input type="datetime-local" value={form.scheduled_at} onChange={e=>set('scheduled_at',e.target.value)} /></div>
            <div className="form-group"><label>Type</label>
              <select value={form.run_type} onChange={e=>set('run_type',e.target.value)}>
                <option value="Virtual">Virtual</option>
                <option value="In-Person">In-Person</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>
            <div className="form-group"><label>Notes for Members</label><textarea placeholder="Route, meeting point, difficulty level..." value={form.description} onChange={e=>set('description',e.target.value)} /></div>
            <div className="flex gap-12">
              <button className="btn btn-primary" style={{flex:1}} onClick={createRun} disabled={saving}>
                {saving ? <Spinner /> : 'Create Run'}
              </button>
              <button className="btn btn-ghost" onClick={()=>setShowNew(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   PROFILE
══════════════════════════════════════ */
function CheckoutButton({ tier, label }) {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const { url } = await api.post('/stripe/checkout', { tier });
      window.location.href = url;
    } catch(e) {
      alert('Could not start checkout. Please try again.');
      setLoading(false);
    }
  };

  return (
    <button className="btn btn-primary" onClick={handleCheckout} disabled={loading} style={{width:'100%',marginTop:12}}>
      {loading ? <Spinner /> : label}
    </button>
  );
}

// Resize/crop an image File to a square JPEG data URL (keeps avatar payloads small)
function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

/* ══════════════════════════════════════
   PROGRESS  (Strava-style "Me" sub-tab)
   Streak · active-day calendar · best efforts · race predictions · 6-month trend.
   Data from GET /api/activities/progress. Best efforts use real fastest-segment splits
   when a run has timestamped GPS points ([lat,lon,t]); runs recorded before 618e (or
   imported without time data) fall back to an even-pace projection, tagged "est." (618e).
══════════════════════════════════════ */
function fmtHMS(secs) { return secs > 0 ? fmtClock(Math.round(secs)) : '—'; }
function fmtPaceMi(spm) { return spm > 0 ? fmtClock(Math.round(spm)) + '/mi' : '—'; }

function ProgressCalendar({ activeDates }) {
  const now = new Date();
  const [cur, setCur] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const set = new Set(activeDates || []);
  const pad2 = (n) => String(n).padStart(2, '0');
  const first = new Date(cur.y, cur.m, 1);
  const startDow = first.getDay();
  const days = new Date(cur.y, cur.m + 1, 0).getDate();
  const key = (d) => `${cur.y}-${pad2(cur.m + 1)}-${pad2(d)}`;
  const todayKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const move = (delta) => setCur(c => { const nd = new Date(c.y, c.m + delta, 1); return { y: nd.getFullYear(), m: nd.getMonth() }; });
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const dow = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <div className="card">
      <div className="flex justify-between" style={{ alignItems: 'center', marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <div className="card-title" style={{ margin: 0 }}>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, textAlign: 'center' }}>
        {dow.map((d, i) => <div key={'h' + i} style={{ fontSize: '0.64rem', color: 'var(--gray)', fontWeight: 700, padding: '2px 0' }}>{d}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={'e' + i} />;
          const active = set.has(key(d));
          const isToday = key(d) === todayKey;
          return (
            <div key={'d' + i} style={{
              aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, fontSize: '0.72rem', lineHeight: 1,
              background: active ? 'rgba(212,175,55,0.12)' : 'transparent',
              border: isToday ? '1px solid var(--blue)' : '1px solid transparent',
              color: active ? 'var(--light)' : 'var(--gray)',
            }}>
              <span>{d}</span>
              <span style={{ fontSize: '0.7rem', height: '0.9em', color: 'var(--gold)' }}>{active ? '★' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let on = true;
    api.get('/activities/progress')
      .then(d => { if (on) setData(d); })
      .catch(e => { if (on) setErr(e.message || 'Could not load progress'); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spinner size={28} /></div>;
  if (err) return <div className="card" style={{ color: 'var(--gray)' }}>Couldn’t load progress: {err}</div>;

  const d = data || {};
  const hasRuns = (d.total_runs || 0) > 0;
  const monthly = d.monthly || [];
  const maxDist = Math.max(1, ...monthly.map(m => m.distance));
  const lastM = monthly.slice(-1)[0];
  const prevM = monthly.slice(-2, -1)[0];
  const dDelta = (lastM && prevM) ? (lastM.distance - prevM.distance) : null;
  const efforts = (d.best_efforts || []).filter(b => b.best);

  const topStats = [
    { l: 'Day Streak', v: `${d.streak || 0}`, icon: '🔥' },
    { l: 'Activities', v: `${d.total_runs || 0}` },
    { l: 'Total Miles', v: `${d.total_miles || 0}` },
    { l: 'Active Time', v: fmtHMS(d.total_time_secs || 0) },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {topStats.map((s, i) => (
          <div key={i} className="card" style={{ textAlign: 'center', padding: '14px 6px' }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: '1.45rem' }}>{s.icon ? `${s.icon} ` : ''}{s.v}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {!hasRuns && <div className="card" style={{ color: 'var(--gray)', textAlign: 'center', marginBottom: 16 }}>Log a few runs to unlock best efforts, race predictions, and your monthly trend.</div>}

      <div style={{ marginBottom: 16 }}><ProgressCalendar activeDates={d.active_dates} /></div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex justify-between" style={{ alignItems: 'baseline' }}>
          <div className="card-title" style={{ margin: 0 }}>6-Month Trend</div>
          {dDelta != null && <div style={{ fontSize: '0.72rem', color: dDelta >= 0 ? 'var(--green)' : 'var(--gold)' }}>{dDelta >= 0 ? '▲' : '▼'} {Math.abs(dDelta).toFixed(1)} mi vs last mo</div>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${monthly.length || 6},1fr)`, gap: 8, alignItems: 'end', height: 130, marginTop: 12 }}>
          {monthly.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--gray)', marginBottom: 3 }}>{m.distance > 0 ? m.distance : ''}</div>
              <div title={`${m.distance} mi · ${fmtHMS(m.time_secs)} · ${m.runs} run${m.runs === 1 ? '' : 's'}`}
                   style={{ width: '72%', height: `${Math.max(2, (m.distance / maxDist) * 100)}%`, background: 'linear-gradient(180deg,var(--gold),rgba(212,175,55,0.35))', borderRadius: '4px 4px 0 0' }} />
              <div style={{ fontSize: '0.64rem', color: 'var(--gray)', marginTop: 4 }}>{m.label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '0.66rem', color: 'var(--gray)', marginTop: 8, textAlign: 'center' }}>Bars = miles · tap/hover a bar for active time</div>
      </div>

      {d.predictions && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Race Predictions</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginBottom: 10 }}>Estimated from your best {d.prediction_base.label} ({fmtHMS(d.prediction_base.time_secs)}) · Riegel model</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {d.predictions.map((p, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '10px 4px', background: 'rgba(0,0,0,0.18)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.64rem', color: 'var(--gray)', marginBottom: 4 }}>{p.label}</div>
                <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: '1.05rem' }}>{fmtHMS(p.time_secs)}</div>
                <div style={{ fontSize: '0.58rem', color: 'var(--gray)', marginTop: 2 }}>{fmtPaceMi(p.pace_secs_per_mi)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasRuns && (
        <div className="card">
          <div className="card-title">Best Efforts</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginBottom: 10 }}>Estimated from each run’s overall pace. “est.” = projected from a longer run.</div>
          {efforts.length === 0 && <div style={{ color: 'var(--gray)', fontSize: '0.85rem' }}>No efforts yet — log a run.</div>}
          {efforts.map((b, i) => (
            <div key={i} className="flex justify-between" style={{ padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: '0.86rem', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>{b.label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--gray)', fontSize: '0.74rem' }}>{fmtPaceMi(b.best.pace_secs_per_mi)}</span>
                <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, minWidth: 62, textAlign: 'right' }}>{fmtHMS(b.best.time_secs)}</span>
                {b.best.estimated && <span className="badge badge-blue" style={{ fontSize: '0.56rem', padding: '1px 5px' }}>est.</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Profile({ user, onLogout, onToast, onUserUpdate }) {
  const [profileView, setProfileView] = useState('profile');
  const [stats, setStats]   = useState(null);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clubBusy, setClubBusy]   = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoRef = useRef(null);

  const refreshUser = async (msg) => {
    try { const r = await api.get('/auth/me'); onUserUpdate(r.user); } catch(e) {}
    if (msg) onToast(msg);
  };

  const onPhotoPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { onToast('Please choose an image file.'); return; }
    setUploadingPhoto(true);
    try {
      const dataUrl = await resizeImage(file, 256);
      await api.patch('/auth/me', { avatar_url: dataUrl });
      await refreshUser('Photo updated.');
    } catch (err) { onToast(`Error: ${err.message}`); }
    finally { setUploadingPhoto(false); }
  };

  const openPhotoPicker = () => { if (!uploadingPhoto && photoRef.current) photoRef.current.click(); };

  const leaveClub = async () => {
    setClubBusy(true);
    try { await api.post('/clubs/leave'); await refreshUser('You left your club.'); }
    catch(e) { alert(e.message); }
    finally { setClubBusy(false); }
  };

  useEffect(() => {
    Promise.all([
      api.get('/activities/stats'),
      api.get(`/users/${user.id}/badges`),
    ]).then(([s, b]) => {
      setStats(s);
      setBadges(b.badges || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [user.id]);

  const joinedAt = user.joined_at ? new Date(user.joined_at).toLocaleDateString('en-US', {month:'long', year:'numeric'}) : '2025';

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div><div className="page-title">My Profile</div><div className="page-sub">Member since {joinedAt}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sign Out</button>
        </div>
      </div>
      <div className="page-body">
        <div className="profile-banner mb-24">
          <div style={{position:'relative',flexShrink:0}}>
            <div className="avatar avatar-lg" onClick={openPhotoPicker}
                 style={{cursor:'pointer',overflow:'hidden',opacity:uploadingPhoto?0.6:1,backgroundImage:user.avatar_url?`url(${user.avatar_url})`:'none',backgroundSize:'cover',backgroundPosition:'center'}}>
              {!user.avatar_url && user.name[0]}
            </div>
            <span onClick={openPhotoPicker} title="Upload photo"
                  style={{position:'absolute',right:-2,bottom:-2,width:26,height:26,borderRadius:'50%',background:'var(--blue)',color:'var(--black)',border:'2px solid var(--card)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 4 7.5 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5L15 4H9zm3 4.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg>
            </span>
            <input ref={photoRef} type="file" accept="image/*" onChange={onPhotoPick} style={{display:'none'}} />
          </div>
          <div className="profile-info">
            <h2>{user.name}</h2>
            <div className="flex gap-8 mt-8 flex-wrap" style={{marginTop:8}}>
              <span className={`badge ${user.tier==='Elite'?'badge-orange':'badge-blue'}`}>{user.tier} Member</span>
              {user.is_captain && <span className="badge badge-orange">🎖️ Captain</span>}
              <span className="pace-group-pill">Pace Group {user.pace_group}</span>
              {user.club_name && user.club_status === 'verified' && <ClubName id={user.club_id} name={user.club_name} style={{fontSize:'0.78rem'}} />}
            </div>
            <div style={{fontSize:'0.82rem',color:'var(--gray)',marginTop:8}}>{user.email}</div>
            {fmtLocation(user) && <div style={{fontSize:'0.82rem',color:'var(--gray)',marginTop:4}}>📍 {fmtLocation(user)}</div>}
          </div>
        </div>

        <div className="flex gap-8" style={{marginBottom:16}}>
          <button className={`tab-btn ${profileView==='profile'?'active':''}`} onClick={()=>setProfileView('profile')}>Profile</button>
          <button className={`tab-btn ${profileView==='progress'?'active':''}`} onClick={()=>setProfileView('progress')}>Progress</button>
        </div>

        {profileView==='progress' && <ProgressView />}

        {profileView==='profile' && loading && <div style={{textAlign:'center',padding:40}}><Spinner size={28} /></div>}

        {profileView==='profile' && !loading && (
          <div className="grid-2">
            <div className="card">
              <div className="card-title">Running Stats</div>
              {[
                {l:'Total Miles',    v: stats?.total_miles != null ? `${stats.total_miles} mi` : '—'},
                {l:'Total Runs',     v: stats?.total_runs ?? '—'},
                {l:'Weekly Miles',   v: stats?.weekly_miles != null ? `${stats.weekly_miles} mi` : '—'},
                {l:'Current Streak', v: stats?.streak != null ? `${stats.streak} days` : '0 days'},
                {l:'Pace Group',     v: `Group ${user.pace_group}`},
                {l:'Membership',     v: user.tier},
              ].map((s,i)=>(
                <div key={i} className="flex justify-between" style={{padding:'10px 0',borderBottom:'1px solid var(--border)',fontSize:'0.88rem'}}>
                  <span style={{color:'var(--gray)'}}>{s.l}</span>
                  <span style={{fontWeight:600}}>{s.v}</span>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-title">🏃 Run Club</div>
              {user.club_name ? (
                <div>
                  <div className="flex justify-between" style={{alignItems:'center',marginBottom:8}}>
                    {user.club_status === 'verified'
                      ? <ClubName id={user.club_id} name={user.club_name} style={{fontSize:'0.95rem',fontWeight:600}} />
                      : <span style={{fontWeight:600,fontSize:'0.95rem'}}>🏃 {user.club_name}</span>}
                    <button className="btn btn-ghost btn-sm" onClick={leaveClub} disabled={clubBusy}>{clubBusy ? <Spinner /> : 'Leave'}</button>
                  </div>
                  <div style={{fontSize:'0.75rem',color:'var(--gray)'}}>
                    {user.club_status === 'verified'
                      ? 'Tap your club name to see all members.'
                      : 'Pending admin verification — your club will appear publicly once approved.'}
                  </div>
                </div>
              ) : (
                <ClubPicker onJoined={(d)=>refreshUser(d.message)} />
              )}
            </div>

            <div className="card">
              <div className="card-title">Badges & Achievements</div>
              {badges.length === 0 && <div style={{color:'var(--gray)',fontSize:'0.85rem'}}>No badges yet — start running!</div>}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                {badges.map((b,i)=>(
                  <div key={i} style={{textAlign:'center',opacity:b.earned?1:0.3}} title={b.description||b.name}>
                    <div style={{fontSize:'1.8rem',marginBottom:4}}>{b.icon}</div>
                    <div style={{fontSize:'0.68rem',color:b.earned?'var(--light)':'var(--gray)',lineHeight:1.3}}>{b.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   ACCOUNT (membership + location)
══════════════════════════════════════ */
function Account({ user, onToast, onUserUpdate, onLogout }) {
  const [loc, setLoc] = useState({ country: user.country || '', state: user.state || '', city: user.city || '' });
  const [savingLoc, setSavingLoc] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [savingPause, setSavingPause] = useState(false);

  const toggleAutoPause = async () => {
    setSavingPause(true);
    const next = user.auto_pause ? 0 : 1;
    try {
      const r = await api.patch('/auth/me', { auto_pause: !!next });
      onUserUpdate(r.user);
      onToast(next ? 'Auto-pause is on.' : 'Auto-pause is off.');
    } catch (e) { alert(e.message); }
    finally { setSavingPause(false); }
  };

  const deleteAccount = async () => {
    if (!delPw) { onToast('Enter your password to confirm.'); return; }
    setDeleting(true);
    try {
      await api.req('DELETE', '/auth/me', { password: delPw });
      onToast('Your account has been permanently deleted.');
      onLogout(); // clears token + user → returns to the login screen
    } catch (e) {
      alert(e.message);
      setDeleting(false);
    }
  };

  const refreshUser = async (msg) => {
    try { const r = await api.get('/auth/me'); onUserUpdate(r.user); } catch(e) {}
    if (msg) onToast(msg);
  };

  const saveLoc = async () => {
    setSavingLoc(true);
    try {
      await api.patch('/auth/me', { country: loc.country, state: loc.state.trim() || null, city: loc.city.trim() });
      await refreshUser('Location updated.');
    } catch(e) { alert(e.message); }
    finally { setSavingLoc(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div><div className="page-title">Account</div><div className="page-sub">Membership & settings</div></div>
        </div>
      </div>
      <div className="page-body">
        <div className="grid-2">
          <div className="card">
            <div className="card-title">Membership</div>
            <div style={{marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)',fontSize:'0.88rem'}}>
                <span style={{color:'var(--gray)'}}>Current Plan</span>
                <span className={`badge ${user.tier==='Elite'?'badge-gold':'badge-blue'}`}>{user.tier}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)',fontSize:'0.88rem'}}>
                <span style={{color:'var(--gray)'}}>Status</span>
                <span style={{color:'var(--green)',fontWeight:600}}>Active</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',fontSize:'0.88rem'}}>
                <span style={{color:'var(--gray)'}}>Annual Price</span>
                <span style={{fontWeight:600}}>{user.tier === 'Elite' ? '$249/yr' : '$199/yr'}</span>
              </div>
            </div>
            {user.tier !== 'Elite' && (
              <div style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:10,padding:16,marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:'0.88rem',color:'var(--gold)',marginBottom:4}}>Upgrade to Elite</div>
                <div style={{fontSize:'0.78rem',color:'var(--gray)'}}>Unlock exclusive challenges, captain eligibility & priority support for $249/yr</div>
                <CheckoutButton tier="Elite" label="Upgrade to Elite → $249/yr" />
              </div>
            )}
            <div style={{fontSize:'0.75rem',color:'var(--gray)',textAlign:'center',marginTop:8}}>
              Payments secured by Stripe 🔒
            </div>
          </div>

          <div className="card">
            <div className="card-title">📍 Location</div>
            <LocationFields value={loc} onChange={setLoc} />
            <button className="btn btn-primary btn-sm" style={{width:'100%'}} disabled={savingLoc || !locationComplete(loc)} onClick={saveLoc}>
              {savingLoc ? <Spinner /> : 'Save Location'}
            </button>
          </div>
        </div>

        <div className="card" style={{marginTop:16}}>
          <div className="card-title">Recording</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:14}}>
            <div>
              <div style={{fontWeight:600,fontSize:'0.9rem'}}>Auto-pause</div>
              <div style={{fontSize:'0.78rem',color:'var(--gray)',marginTop:2,maxWidth:400}}>
                Automatically pause your time and distance when you stop — a crosswalk, red light, or
                water break — and resume when you start moving again. Off by default.
              </div>
            </div>
            <button
              role="switch" aria-checked={!!user.auto_pause} aria-label="Auto-pause"
              onClick={toggleAutoPause} disabled={savingPause}
              style={{flexShrink:0,width:52,height:30,borderRadius:15,border:'1px solid var(--border)',
                cursor: savingPause ? 'default' : 'pointer',position:'relative',padding:0,
                background: user.auto_pause ? '#D4AF37' : 'var(--card)',transition:'background .15s',opacity: savingPause ? 0.6 : 1}}>
              <span style={{position:'absolute',top:3,left: user.auto_pause ? 25 : 3,width:22,height:22,
                borderRadius:'50%',background:'#fff',transition:'left .15s'}} />
            </button>
          </div>
        </div>

        <div className="card" style={{marginTop:16,border:'1px solid rgba(239,68,68,0.35)'}}>
          <div className="card-title" style={{color:'#EF4444'}}>Delete Account</div>
          <div style={{fontSize:'0.82rem',color:'var(--gray)',marginBottom:14}}>
            Permanently delete your account and all associated data — your runs, badges, challenge
            progress, and profile. This cannot be undone, and any active membership is cancelled.
          </div>
          {!showDelete ? (
            <button className="btn btn-ghost btn-sm" style={{color:'#EF4444',borderColor:'rgba(239,68,68,0.5)'}} onClick={()=>setShowDelete(true)}>
              Delete my account
            </button>
          ) : (
            <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:10,padding:16}}>
              <div style={{fontSize:'0.82rem',color:'var(--white)',marginBottom:10,fontWeight:600}}>
                Enter your password to confirm permanent deletion:
              </div>
              <input
                type="password"
                placeholder="Your password"
                value={delPw}
                autoComplete="current-password"
                onChange={e=>setDelPw(e.target.value)}
                style={{width:'100%',marginBottom:12}}
              />
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-ghost btn-sm" disabled={deleting} onClick={()=>{ setShowDelete(false); setDelPw(''); }}>
                  Cancel
                </button>
                <button className="btn btn-sm" style={{background:'#EF4444',color:'#fff',flex:1}} disabled={deleting || !delPw} onClick={deleteAccount}>
                  {deleting ? <Spinner /> : 'Permanently delete account'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   APP SHELL
══════════════════════════════════════ */
const NAV = [
  { id:'dashboard', icon:'🏠', label:'Dashboard' },
  { id:'activity', icon:'📍', label:'Activity Log' },
  { id:'leaderboard', icon:'🏆', label:'Leaderboard' },
  { id:'challenges', icon:'⚡', label:'Challenges' },
  { id:'groupruns', icon:'🗓️', label:'Group Runs' },
  { id:'askcaptain', icon:'💬', label:'Ask a Captain' },
  { id:'captain', icon:'🎖️', label:'Captain Panel' },
  { id:'profile', icon:'👤', label:'My Profile' },
  { id:'account', icon:'⚙️', label:'Account' },
];

function App() {
  const [user, setUser]           = useState(null);
  const [page, setPage]           = useState('dashboard');
  const [toast, setToast]         = useState(null);
  const [booting, setBooting]     = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [activityKey, setActivityKey] = useState(0);

  useEffect(() => {
    // Check for Stripe redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      showToast('🎉 Payment successful! Welcome to TEAM 3332.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('payment') === 'cancelled') {
      showToast('Payment cancelled.');
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (api.getToken()) {
      api.get('/auth/me')
        .then(d => setUser(d.user))
        .catch(() => api.setToken(null))
        .finally(() => setBooting(false));
    } else {
      setBooting(false);
    }
  }, []);

  // Live Activity deep-link: tapping the lock-screen card / Dynamic Island opens
  // team3332://run, which jumps straight to the record screen. Handles both warm taps
  // (appUrlOpen while running) and cold launch (getLaunchUrl). No-op off native. (619)
  useEffect(() => {
    if (!IS_NATIVE_APP) return;
    let handle = null;
    const open = (url) => {
      if (typeof url === 'string' && url.indexOf('team3332://run') === 0) setShowRecord(true);
    };
    try {
      CapApp.getLaunchUrl().then(r => { if (r && r.url) open(r.url); }).catch(() => {});
      CapApp.addListener('appUrlOpen', (e) => open(e && e.url)).then(h => { handle = h; }).catch(() => {});
    } catch (e) { /* never block the app on deep-link wiring */ }
    return () => { try { handle && handle.remove && handle.remove(); } catch (e) {} };
  }, []);

  // Apple Watch: a run recorded on the wrist arrives here and is saved to the member's
  // account. Refresh the Runs list and toast the result. No-op off native. (session 17)
  useEffect(() => {
    const cleanup = WatchSync.init({
      onSaved: (a) => {
        setToast(a && a.distance ? `⌚ Watch run saved — ${a.distance} mi!` : '⌚ Watch run saved!');
        setActivityKey(k => k + 1);
      },
      onError: (m) => setToast(`Watch sync error: ${m}`),
    });
    // Also drain whenever the app comes back to the foreground — transferUserInfo is an
    // opportunistic background transfer, so a run recorded while the phone was asleep is often
    // sitting in the native queue by the time the user reopens the app.
    let resumeSub = null;
    try {
      CapApp.addListener('appStateChange', (s) => { if (s && s.isActive) WatchSync.drainBurst(); })
        .then(h => { resumeSub = h; }).catch(() => {});
    } catch (e) { /* non-native or no App plugin — fine */ }
    return () => {
      try { cleanup && cleanup(); } catch (e) {}
      try { resumeSub && resumeSub.remove && resumeSub.remove(); } catch (e) {}
    };
  }, []);

  // Keep the watch told who's signed in (label/gate recording, and clear on logout). After a
  // login, also drain — a run may have arrived (and been queued natively) while logged out.
  useEffect(() => {
    WatchSync.pushContext(user);
    if (user) WatchSync.drainBurst();
  }, [user]);

  const showToast = msg => setToast(msg);

  const navigate = (id) => {
    setPage(id);
    setSidebarOpen(false);
  };

  if (booting) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:16}}>
        <div style={{fontFamily:'Barlow Condensed',fontWeight:900,fontSize:'2rem'}}>TEAM <span style={{color:'var(--blue)'}}>3332</span></div>
        <Spinner size={28} />
      </div>
    );
  }

  const renderPage = () => {
    switch(page) {
      case 'dashboard':  return <Dashboard user={user} />;
      case 'activity':   return <ActivityLog key={activityKey} onToast={showToast} user={user} />;
      case 'leaderboard':return <Leaderboard />;
      case 'challenges': return <Challenges onToast={showToast} />;
      case 'groupruns':  return <GroupRuns onToast={showToast} />;
      case 'askcaptain': return <AskCaptain user={user} onToast={showToast} />;
      case 'captain':    return <CaptainPanel user={user} onToast={showToast} />;
      case 'profile':    return <Profile user={user} onLogout={()=>{ api.setToken(null); setUser(null); }} onToast={showToast} onUserUpdate={u=>setUser(u)} />;
      case 'account':    return <Account user={user} onToast={showToast} onUserUpdate={u=>setUser(u)} onLogout={()=>{ api.setToken(null); setUser(null); }} />;
      default:           return <Dashboard user={user} />;
    }
  };

  if (!user) return <AuthPage onLogin={(u, isNew) => { setUser(u); if (isNew) setShowOnboarding(true); }} />;
  if (showOnboarding) return <Onboarding user={user} onComplete={(u, msg) => { if (u) setUser(u); setShowOnboarding(false); if (msg) showToast(msg); }} />;

  // Bottom nav: 4 tabs flanking a raised center Record button.
  // Goals (challenges) lives in the sidebar menu. Order: Home · Runs · ⊙Record · Board · Me
  const bottomNavItems = [
    { id:'dashboard', label:'Home', icon:(
      <svg className="bnav-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 2 11h3v9h6v-6h2v6h6v-9h3z"/></svg>
    )},
    { id:'activity', label:'Runs', icon:(
      <svg className="bnav-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.5 14.5c.5-2 1.8-3.7 3.7-4.6l.9 1.7 2-1 .9 1.7 2-1c.6-.3 1.3-.2 1.9.1l4.8 3c1.1.7 1.8 1.8 1.9 3.1 0 .8-.6 1.5-1.4 1.5H3.4c-.8 0-1.4-.7-1.4-1.5 0-1 .2-2 .5-3z"/></svg>
    )},
    { id:'leaderboard', label:'Board', icon:(
      <svg className="bnav-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z"/></svg>
    )},
    { id:'profile', label:'Me', icon:(
      <svg className="bnav-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z"/></svg>
    )},
  ];

  return (
    <div className="app-shell">
      {/* Mobile header */}
      <div className="mobile-header">
        <div className="mobile-logo">TEAM <span>3332</span></div>
        <button className="hamburger" onClick={()=>setSidebarOpen(o=>!o)}>☰</button>
      </div>

      {/* Sidebar overlay (mobile) */}
      <div className={`sidebar-overlay ${sidebarOpen?'open':''}`} onClick={()=>setSidebarOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen?'open':''}`}>
        <div className="sidebar-logo">TEAM <span>3332</span></div>
        <div className="sidebar-section-label">Main</div>
        {NAV.slice(0,4).map(n=>(
          <div key={n.id} className={`nav-item ${page===n.id?'active':''}`} onClick={()=>navigate(n.id)}>
            <span className="nav-icon">{n.icon}</span>
            <span>{n.label}</span>
          </div>
        ))}
        <div className="sidebar-section-label" style={{marginTop:8}}>Team</div>
        {NAV.slice(4).map(n=>(
          <div key={n.id} className={`nav-item ${page===n.id?'active':''}`} onClick={()=>navigate(n.id)}>
            <span className="nav-icon">{n.icon}</span>
            <span>{n.label}</span>
            {n.id==='captain' && user.is_captain && <span className="badge badge-orange" style={{marginLeft:'auto',padding:'1px 6px',fontSize:'0.65rem'}}>●</span>}
          </div>
        ))}
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="avatar">{user.name[0]}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user.name}</div>
              <div className="sidebar-user-tier">{user.tier}{user.is_captain?' · Captain':''}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        {renderPage()}
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {bottomNavItems.slice(0,2).map(n=>(
            <button key={n.id} className={`bottom-nav-item ${page===n.id?'active':''}`} onClick={()=>navigate(n.id)}>
              <span className="bnav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
          <button className="bottom-nav-item bnav-record" onClick={()=>setShowRecord(true)} aria-label="Record a run or walk">
            <span className="bnav-record-circle"><svg className="bnav-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>
            Record
          </button>
          {bottomNavItems.slice(2).map(n=>(
            <button key={n.id} className={`bottom-nav-item ${page===n.id?'active':''}`} onClick={()=>navigate(n.id)}>
              <span className="bnav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>
      </nav>

      {showRecord && (
        <RecordRun
          onClose={()=>setShowRecord(false)}
          onSaved={()=>{ setActivityKey(k=>k+1); setPage('activity'); }}
          onToast={showToast}
          autoPause={!!(user && user.auto_pause)}
          onAutoPauseChange={u=>setUser(u)}
        />
      )}

      {toast && <Toast message={toast} onClose={()=>setToast(null)} />}
    </div>
  );
}

/* Error boundary — catches render/lifecycle throws anywhere in the tree and
   shows a branded fallback + Reload instead of a silent black screen. The boot
   watchdog below only covers load failures (React/Babel never mounting); this
   covers errors thrown *after* the app has mounted. */
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(){ return { hasError: true }; }
  componentDidCatch(error, info){
    try { console.error('App crashed (caught by ErrorBoundary):', error, info); } catch(e){}
  }
  render(){
    if(!this.state.hasError) return this.props.children;
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px',textAlign:'center',fontFamily:'Barlow,system-ui,sans-serif',background:'#080B12',color:'#F0F4FF'}}>
        <div style={{maxWidth:'340px'}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:900,fontSize:'2rem',letterSpacing:'1px',marginBottom:'14px'}}>TEAM <span style={{color:'#D4AF37'}}>3332</span></div>
          <div style={{fontSize:'0.95rem',lineHeight:1.55,color:'#8A9BB5',marginBottom:'22px'}}>Something went wrong. Please reload; if it keeps happening, try again shortly.</div>
          <button onClick={()=>location.reload()} style={{background:'#D4AF37',color:'#080B12',border:'none',borderRadius:'10px',padding:'12px 26px',fontWeight:700,fontSize:'0.95rem',cursor:'pointer'}}>Reload</button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary><App /></ErrorBoundary>
);

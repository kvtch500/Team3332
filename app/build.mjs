// app/build.mjs — pre-transpile AND bundle the frontend.
//
// Phase 2a (June 2026): React, ReactDOM and Leaflet are now BUNDLED into app/app.js
// (bundle:true) instead of being loaded as CDN UMD globals. app/src/app.jsx imports them
// (`import React from 'react'`, `import * as ReactDOM from 'react-dom/client'`,
// `import L from 'leaflet'`). esbuild pulls them from node_modules into a single self-
// executing app.js, so the web app boots with ZERO CDN dependency for the rendering stack
// and works offline. The Leaflet stylesheet is copied next to app.js as app/leaflet.css.
//
// window.Capacitor is STILL injected by the native head-loader in index.html — the
// just-verified background-GPS path is deliberately untouched. Phase 2b (later) bundles
// @capacitor/core and retires that loader, gated on on-device GPS re-testing.
//
// Run from the repo ROOT:  npm run build:app
// (esbuild + react + react-dom + leaflet are deps; run `npm install` at the repo root once.)
//
// IMPORTANT: app/app.js (+ app/leaflet.css) is what the live web app AND the native bundle
// load. After editing app/src/app.jsx you MUST rebuild and commit the regenerated
// app/app.js (and app/leaflet.css), or the app breaks.

import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

await build({
  entryPoints: [path.join(here, 'src', 'app.jsx')],
  outfile: path.join(here, 'app.js'),
  // app.jsx now imports react / react-dom/client / leaflet, so we bundle them in.
  bundle: true,
  format: 'iife',            // self-executing <script>, no module loader needed
  platform: 'browser',
  jsx: 'transform',          // classic runtime -> React.createElement (uses the imported React)
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  loader: { '.jsx': 'jsx' },
  // Pull in React's production build (smaller, faster, no dev warnings) — matches the
  // react.production.min.js we previously loaded from the CDN.
  define: { 'process.env.NODE_ENV': '"production"' },
  // Match a modern iOS WKWebView + evergreen desktop browsers. Bump down if older devices
  // ever need support.
  target: ['safari14', 'chrome90', 'firefox90', 'edge90'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'info',
});

console.log('✓ built app/app.js from app/src/app.jsx');

// Copy Leaflet's stylesheet next to app.js so the map renders with zero CDN dependency.
// (The app uses only vector layers — tileLayer/polyline/circleMarker — so the marker/layers
//  image assets referenced inside leaflet.css are never requested; no images to copy.)
const leafletCss = require.resolve('leaflet/dist/leaflet.css');
await copyFile(leafletCss, path.join(here, 'leaflet.css'));
console.log('✓ copied leaflet.css -> app/leaflet.css');

// Self-host Google Fonts so the running app makes ZERO font CDN requests. This is a one-time
// build-time fetch: after app/fonts.css + app/fonts/* exist (and are committed), it no-ops and
// builds work offline. index.html links the local app/fonts.css. (619 — 100% CDN-free)
execFileSync(process.execPath, [path.join(here, 'fetch-fonts.mjs')], { stdio: 'inherit' });

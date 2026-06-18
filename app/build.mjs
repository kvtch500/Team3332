// app/build.mjs — pre-transpile the frontend.
//
// Reads app/src/app.jsx (the React app body, which uses the GLOBAL React / ReactDOM / L
// loaded as CDN UMD in index.html, and window.Capacitor from the native head-loader) and
// emits app/app.js — a plain, minified script with the JSX already compiled to
// React.createElement. No in-browser Babel, no slow cold-boot transpile.
//
// Run from the repo ROOT:  npm run build:app
// (esbuild is a root devDependency; run `npm install` at the repo root once first.)
//
// IMPORTANT: app/app.js is what the live web app AND the native bundle load. After editing
// app/src/app.jsx you MUST rebuild and commit the regenerated app/app.js, or the app breaks.

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(here, 'src', 'app.jsx')],
  outfile: path.join(here, 'app.js'),
  // The source references React/ReactDOM/L/window.Capacitor as globals and has NO imports,
  // so there is nothing to bundle — esbuild only transpiles JSX + modern syntax.
  bundle: false,
  jsx: 'transform',          // classic runtime -> React.createElement (uses global React)
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  loader: { '.jsx': 'jsx' },
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

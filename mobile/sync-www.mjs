// sync-www.mjs — copies the live web frontend (../app) into ./www so Capacitor
// bundles it natively. ONE source of truth: edit ../app/index.html as usual,
// then `npm run sync:www` (or any run/sync script) re-copies it here.
//
// The frontend already calls an ABSOLUTE API URL (https://...railway.app/api),
// so the bundled native app talks to the same Railway backend — nothing to rewrite.

import { cp, rm, mkdir, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here   = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '..', 'app');     // the live web app
const wwwDir = path.resolve(here, 'www');           // Capacitor webDir

// Files/folders to bundle from ../app. index.html is the entry point.
const INCLUDE = ['index.html', 'privacy.html', 'terms.html', 'reset-password.html', 'public'];

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function main() {
  if (!(await exists(srcDir))) {
    console.error(`✗ source app folder not found at ${srcDir}`);
    process.exit(1);
  }

  await rm(wwwDir, { recursive: true, force: true });
  await mkdir(wwwDir, { recursive: true });

  let copied = 0;
  for (const name of INCLUDE) {
    const from = path.join(srcDir, name);
    if (!(await exists(from))) continue;
    await cp(from, path.join(wwwDir, name), { recursive: true });
    copied++;
  }

  const list = await readdir(wwwDir);
  console.log(`✓ synced ${copied} item(s) into www/: ${list.join(', ')}`);
  console.log('  next: npx cap sync   (then npx cap run ios)');
}

main().catch((e) => { console.error(e); process.exit(1); });

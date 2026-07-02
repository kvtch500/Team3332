// patch-native-config.mjs — re-add custom local plugins to the native packageClassList. (618g)
//
// Capacitor 6 registers iOS plugins from capacitor.config.json's `packageClassList`, which
// `npx cap sync` regenerates from npm packages ONLY — so our hand-written local plugins get
// dropped every sync. This runs AFTER `cap sync` (see package.json "sync") to add them back.
// Without it, the LiveActivity card silently stops working after any sync.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const LOCAL_PLUGINS = ['LiveActivityPlugin', 'HeartRatePlugin', 'WatchSyncPlugin'];
const target = 'ios/App/App/capacitor.config.json';

if (!existsSync(target)) { console.log(`patch-native-config: ${target} not found, skipping`); process.exit(0); }
const cfg = JSON.parse(readFileSync(target, 'utf8'));
cfg.packageClassList = cfg.packageClassList || [];
let added = 0;
for (const p of LOCAL_PLUGINS) if (!cfg.packageClassList.includes(p)) { cfg.packageClassList.push(p); added++; }
if (added) { writeFileSync(target, JSON.stringify(cfg, null, 2) + '\n'); console.log(`patch-native-config: added ${added} local plugin(s) to packageClassList ✓`); }
else console.log('patch-native-config: local plugins already present ✓');

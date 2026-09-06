/**
 * stage-alt-icons.js — put the record icons where iOS can find them.
 *
 * Alternate app icons cannot live in the asset catalog the way the primary
 * one does: UIApplication.setAlternateIconName() resolves plain PNG files in
 * the app bundle's ROOT by name. So each record ships two flat files,
 * <key>@2x.png (120px) and <key>@3x.png (180px), copied into ios/App/App/
 * and referenced from Info.plist by the bare name "<key>".
 *
 * Run after scripts/make-record-icons.py, and before a build:
 *     node scripts/stage-alt-icons.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'icons', 'records');
const DEST = path.join(ROOT, 'ios', 'App', 'App');

if (!fs.existsSync(SRC)) {
  console.error('No icons/records — run: python3 scripts/make-record-icons.py');
  process.exit(1);
}

const keys = [...new Set(
  fs.readdirSync(SRC).filter(f => f.endsWith('-1024.png')).map(f => f.replace('-1024.png', ''))
)].sort();

let n = 0;
for (const k of keys) {
  for (const [px, suffix] of [[120, '@2x'], [180, '@3x']]) {
    const from = path.join(SRC, `${k}-${px}.png`);
    if (!fs.existsSync(from)) { console.error('missing', from); process.exit(1); }
    fs.copyFileSync(from, path.join(DEST, `${k}${suffix}.png`));
    n++;
  }
}
console.log(`staged ${n} files for ${keys.length} alternate icons -> ios/App/App/`);
console.log('  ' + keys.join(', '));

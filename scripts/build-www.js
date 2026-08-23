#!/usr/bin/env node
/**
 * build-www.js — Copy web-servable assets to www/ for Capacitor.
 *
 * Capacitor's webDir is "www". This script copies only the files
 * the app needs (HTML, CSS, JS, images, fonts, manifest) and
 * excludes server-only files (.env, node_modules, netlify/,
 * scripts/, .git, etc.).
 *
 * The app bundle is 100% local assets (App Store-safe, Guideline 4.2);
 * only the API calls reach out to the live Netlify functions at runtime.
 *
 * Usage:  node scripts/build-www.js
 * Or:     npm run build:www
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'www');

// Directories and files to EXCLUDE from copy
const EXCLUDE = new Set([
  'node_modules',
  'design-refs',   // external design-review handover, not app content
  'docs',          // internal documentation, not app content
  '.git',
  '.netlify',
  '.claude',
  '.env',
  '.env.local',
  'netlify',         // server-side functions — not needed in app bundle
  'scripts',
  'www',             // don't recurse into output dir
  'ios',             // Capacitor iOS project
  'android',         // Capacitor Android project (if ever added)
  'package.json',
  'package-lock.json',
  'capacitor.config.ts',
  'capacitor.config.json',
  '.gitignore',
  '.DS_Store',
  'AIRTABLE_SCHEMA.md',
    // The sales deck must not ship inside the App Store binary.
    'deck.html',
    'AUDIT.md',
    'yeng-constantino_yengcard (1)',
  'IOS_APP.md',
  'README.md',
]);

// File extensions to include (everything web-renderable)
const INCLUDE_EXT = new Set([
  '.html', '.css', '.js', '.json',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.woff', '.woff2', '.ttf', '.eot',
  '.xml', '.txt', '.webmanifest',
  '.mp3', '.mp4', '.webm', '.ogg',
]);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function shouldIncludeFile(fileName) {
  var ext = path.extname(fileName).toLowerCase();
  return INCLUDE_EXT.has(ext);
}

function copyRecursive(src, dest) {
  var entries = fs.readdirSync(src, { withFileTypes: true });

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var name = entry.name;

    if (EXCLUDE.has(name)) continue;
    if (name.startsWith('.') && name !== '.htaccess') continue;

    var srcPath = path.join(src, name);
    var destPath = path.join(dest, name);

    if (entry.isDirectory()) {
      ensureDir(destPath);
      copyRecursive(srcPath, destPath);
    } else if (entry.isFile() && shouldIncludeFile(name)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---- Main ----
console.log('Building www/ from project root...');
console.log('Source:', ROOT);
console.log('Dest:  ', DEST);

if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true });
}
ensureDir(DEST);

copyRecursive(ROOT, DEST);

function countFiles(dir) {
  var count = 0;
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].isDirectory()) {
      count += countFiles(path.join(dir, entries[i].name));
    } else {
      count++;
    }
  }
  return count;
}

var total = countFiles(DEST);
console.log('Done! Copied ' + total + ' files to www/');

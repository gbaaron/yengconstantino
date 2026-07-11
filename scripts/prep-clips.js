#!/usr/bin/env node
/*
 * prep-clips.js — batch-clean iPhone screen recordings for the
 * "App Promo Showcase" After Effects template (ModiFlexx, 1920x1080, 25fps).
 *
 * The template does all the motion/masking. Your raw recordings just need to be
 * conformed so they drop into the Mockup_Frame placeholders cleanly:
 *   - 25 fps            (matches the template's frame rate -> no judder)
 *   - audio stripped    (so the clip's own sound can't fight Yeng's track)
 *   - resolution kept   (the phone mockup masks the edges — do NOT crop)
 *   - H.264 mp4         (After Effects imports these without fuss)
 *
 * USAGE (from project root):
 *   1. Drop your .mov/.mp4 screen recordings in scripts/promo/clips/
 *   2. node scripts/prep-clips.js
 *   3. Import the files from scripts/promo/clips_prepped/ into After Effects.
 *
 * Optional per-file trim: rename a clip with a leading "@<seconds>-" to cut dead
 * time off the front, e.g. "@2.5-01-home.mov" trims the first 2.5 seconds.
 *
 * No npm deps. Requires ffmpeg on PATH.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "scripts", "promo", "clips");
const OUT = path.join(ROOT, "scripts", "promo", "clips_prepped");

const FPS = 25; // template frame rate — keep in sync with promo template

const VIDEO_EXT = new Set([".mov", ".mp4", ".m4v", ".webm"]);

function ff(args) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

if (!fs.existsSync(SRC)) {
  console.error(`No clips folder found at ${path.relative(ROOT, SRC)}`);
  console.error("Create it and drop your screen recordings in, then re-run.");
  process.exit(1);
}

const files = fs
  .readdirSync(SRC)
  .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()));

if (!files.length) {
  console.log(`No video files in ${path.relative(ROOT, SRC)}.`);
  console.log("Drop your .mov/.mp4 iPhone recordings there and run this again.");
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });

console.log(`Prepping ${files.length} clip(s) -> 25fps, muted, template-ready\n`);

let done = 0;
for (const file of files) {
  // Optional "@<seconds>-" prefix trims dead time off the front.
  const trimMatch = file.match(/^@([\d.]+)-(.+)$/);
  const trimStart = trimMatch ? parseFloat(trimMatch[1]) : 0;
  const cleanName = trimMatch ? trimMatch[2] : file;
  const outName = path.parse(cleanName).name + ".mp4";

  const inArgs = [];
  if (trimStart > 0) inArgs.push("-ss", String(trimStart));
  inArgs.push("-i", path.join("scripts", "promo", "clips", file));

  try {
    ff([
      ...inArgs,
      "-an", // strip audio
      "-r", String(FPS), // conform frame rate
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18", // visually lossless for screen UI
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      path.join("scripts", "promo", "clips_prepped", outName),
    ]);
    done++;
    const note = trimStart > 0 ? `  (trimmed ${trimStart}s off front)` : "";
    console.log(`  ok  ${file} -> ${outName}${note}`);
  } catch (e) {
    console.error(`  FAIL ${file}: ${e.stderr ? e.stderr.toString().trim() : e.message}`);
  }
}

console.log(`\nDone. ${done}/${files.length} ready in ${path.relative(ROOT, OUT)}`);
console.log("Import those into After Effects and drop each into a Mockup_Frame placeholder.");

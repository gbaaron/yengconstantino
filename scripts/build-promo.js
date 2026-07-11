#!/usr/bin/env node
/*
 * build-promo.js — Automated promo-video builder for the Yeng app.
 *
 * Turns a folder of raw iPhone screen recordings + a music track into a
 * finished 1080x1920 promo: each clip composited inside an iPhone bezel on a
 * brand-gradient background, with a caption, cross-faded intro/outro title
 * cards, and Yeng's music underneath.
 *
 * USAGE (run from the project root):
 *   node scripts/build-promo.js --demo      # synthesize placeholder clips + tone, prove the pipeline
 *   node scripts/build-promo.js             # use real clips in scripts/promo/clips + scripts/promo/music.*
 *
 * WORKFLOW for the real thing:
 *   1. Screen-record each feature on your iPhone (Control Center recorder for
 *      home-screen/widget/Face ID shots; in-app recorder is fine too).
 *   2. Drop the .mov/.mp4 files in scripts/promo/clips/ named to match
 *      promo.config.json (01-home.mov, 02-music.mov, ...).
 *   3. Drop a Yeng track at scripts/promo/music.m4a (or .mp3).
 *   4. node scripts/build-promo.js   ->  scripts/promo/build/promo-yeng.mp4
 *
 * No npm deps. Requires ffmpeg + ffprobe on PATH and python3+Pillow for assets.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PROMO = path.join(ROOT, "scripts", "promo");
const ASSETS = path.join(PROMO, "assets");
const CLIPS = path.join(PROMO, "clips");
const BUILD = path.join(PROMO, "build");

const DEMO = process.argv.includes("--demo");

// ---------- small helpers ----------
const rel = (p) => path.relative(ROOT, p); // relative paths keep the filtergraph free of spaces/colons
function sh(bin, args) {
  return execFileSync(bin, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
}
function ff(args) {
  try {
    sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  } catch (e) {
    console.error("\nffmpeg failed:\n" + (e.stderr ? e.stderr.toString() : e.message));
    process.exit(1);
  }
}
function ensureAssets() {
  if (!fs.existsSync(path.join(ASSETS, "meta.json"))) {
    console.log("Generating assets (iPhone frame + background)...");
    sh("python3", [path.join(PROMO, "gen-assets.py")]);
  }
}
function findFont() {
  const dest = path.join(ASSETS, "font.ttf");
  if (fs.existsSync(dest)) return rel(dest);
  const candidates = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  ];
  const src = candidates.find((c) => fs.existsSync(c));
  if (!src) {
    console.error("No usable font found. Install a .ttf or edit findFont().");
    process.exit(1);
  }
  fs.copyFileSync(src, dest); // copy to a space/colon-free relative path for the filtergraph
  return rel(dest);
}

// ---------- load config + geometry ----------
ensureAssets();
const META = JSON.parse(fs.readFileSync(path.join(ASSETS, "meta.json"), "utf8"));
const CFG = JSON.parse(fs.readFileSync(path.join(PROMO, "promo.config.json"), "utf8"));
const FONT = findFont();
const FPS = CFG.fps || 30;
const T = (CFG.transition && CFG.transition.duration) || 0.6;
const BG = rel(path.join(ASSETS, "bg.png"));
const FRAME = rel(path.join(ASSETS, "iphone-frame.png"));
fs.mkdirSync(BUILD, { recursive: true });

// caption text goes through a textfile to dodge filtergraph escaping
function captionFile(idx, text) {
  const p = path.join(BUILD, `cap_${idx}.txt`);
  fs.writeFileSync(p, text || "");
  return rel(p);
}
const drawCaption = (txtRel, y, size, box) =>
  `drawtext=fontfile=${FONT}:textfile=${txtRel}:fontcolor=white:fontsize=${size}:` +
  `x=(w-text_w)/2:y=${y}` +
  (box ? `:box=1:boxcolor=black@0.38:boxborderw=26` : `:shadowcolor=black@0.6:shadowx=0:shadowy=3`);

// ---------- resolve/synthesize clips ----------
function resolveClip(scene, i) {
  const real = path.join(CLIPS, scene.clip);
  if (fs.existsSync(real)) return { file: rel(real), ss: scene.trimStart || 0 };
  if (!DEMO) {
    console.error(`Missing clip: ${rel(real)}  (run with --demo to synthesize placeholders)`);
    process.exit(1);
  }
  // Demo: synthesize a placeholder recording at screen aspect
  const out = path.join(BUILD, `demo_clip_${i}.mp4`);
  const dur = scene.duration + 1;
  ff([
    "-f", "lavfi", "-i", `testsrc2=s=${META.screen_w}x${META.screen_h}:r=${FPS}:d=${dur}`,
    "-pix_fmt", "yuv420p", rel(out),
  ]);
  return { file: rel(out), ss: 0 };
}

// ---------- render one footage scene ----------
function renderScene(scene, i) {
  const { file, ss } = resolveClip(scene, i);
  const out = path.join(BUILD, `scene_${String(i).padStart(2, "0")}.mp4`);
  const cap = captionFile(i, scene.caption);
  const fc = [
    `[0:v]scale=${META.canvas_w}:${META.canvas_h},fps=${FPS},setsar=1[bg]`,
    `[1:v]scale=${META.screen_w}:${META.screen_h}:force_original_aspect_ratio=increase,` +
      `crop=${META.screen_w}:${META.screen_h},setsar=1[scr]`,
    `[bg][scr]overlay=${META.screen_x}:${META.screen_y}[a]`,
    `[a][2:v]overlay=${META.frame_x}:${META.frame_y}[b]`,
    `[b]${drawCaption(cap, 96, 46, true)},format=yuv420p[v]`,
  ].join(";");
  ff([
    "-loop", "1", "-i", BG,
    "-ss", String(ss), "-i", file,
    "-i", FRAME,
    "-filter_complex", fc,
    "-map", "[v]", "-t", String(scene.duration), "-r", String(FPS),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    rel(out),
  ]);
  return { file: rel(out), duration: scene.duration };
}

// ---------- render a title card (intro/outro) ----------
function renderTitle(spec, name) {
  const out = path.join(BUILD, `${name}.mp4`);
  const titleF = captionFile(`${name}_t`, spec.title);
  const subF = captionFile(`${name}_s`, spec.subtitle);
  const logo = spec.logo && fs.existsSync(path.join(ROOT, spec.logo)) ? spec.logo : null;
  const inputs = ["-loop", "1", "-i", BG];
  let chain = `[0:v]scale=${META.canvas_w}:${META.canvas_h},fps=${FPS},setsar=1[bg]`;
  let last = "bg";
  if (logo) {
    inputs.push("-loop", "1", "-i", logo);
    chain += `;[1:v]scale=360:-1[lg];[${last}][lg]overlay=(W-w)/2:H*0.28[b0]`;
    last = "b0";
  }
  chain +=
    `;[${last}]${drawCaption(titleF, "H*0.50", 118, false)}[b1]` +
    `;[b1]${drawCaption(subF, "H*0.50+150", 44, false)},format=yuv420p[v]`;
  ff([
    ...inputs,
    "-filter_complex", chain,
    "-map", "[v]", "-t", String(spec.duration), "-r", String(FPS),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    rel(out),
  ]);
  return { file: rel(out), duration: spec.duration };
}

// ---------- xfade all scenes into one silent video ----------
function xfadeConcat(scenes) {
  const out = path.join(BUILD, "_video.mp4");
  const inputs = [];
  scenes.forEach((s) => inputs.push("-i", s.file));
  let fc = "";
  let prev = "[0:v]";
  let acc = scenes[0].duration;
  for (let k = 1; k < scenes.length; k++) {
    const offset = (acc - T).toFixed(3);
    const label = k === scenes.length - 1 ? "[vout]" : `[vx${k}]`;
    fc += `${prev}[${k}:v]xfade=transition=${CFG.transition.style}:duration=${T}:offset=${offset}${label};`;
    prev = label;
    acc += scenes[k].duration - T;
  }
  fc = fc.replace(/;$/, "");
  ff([
    ...inputs,
    "-filter_complex", fc,
    "-map", "[vout]", "-r", String(FPS),
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
    rel(out),
  ]);
  return { file: rel(out), duration: acc };
}

// ---------- resolve music (or synthesize a tone in demo) ----------
function resolveMusic(totalDur) {
  const m = CFG.music || {};
  const explicit = m.file ? path.join(ROOT, m.file) : null;
  let file = explicit && fs.existsSync(explicit) ? m.file : null;
  if (!file) {
    // try common extensions next to the configured path
    for (const ext of ["m4a", "mp3", "wav", "aac"]) {
      const guess = path.join(PROMO, `music.${ext}`);
      if (fs.existsSync(guess)) { file = rel(guess); break; }
    }
  }
  if (!file) {
    if (!DEMO) { console.warn("No music track found — exporting silent video."); return null; }
    const tone = path.join(BUILD, "demo_music.m4a");
    ff([
      "-f", "lavfi", "-i", `sine=frequency=220:duration=${totalDur.toFixed(2)}`,
      "-af", "volume=0.15", "-c:a", "aac", rel(tone),
    ]);
    file = rel(tone);
  }
  return { ...m, file };
}

// ---------- final mux: video + music ----------
function mux(video, total) {
  const music = resolveMusic(total);
  const out = path.join(ROOT, CFG.output);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (!music) {
    ff(["-i", video.file, "-c", "copy", rel(out)]);
    return out;
  }
  const fin = music.fadeIn ?? 1.0;
  const fout = music.fadeOut ?? 1.5;
  const vol = music.volume ?? 1.0;
  const start = music.startAt ?? 0;
  const af =
    `[1:a]atrim=start=${start}:duration=${total.toFixed(3)},asetpts=PTS-STARTPTS,` +
    `afade=t=in:st=0:d=${fin},afade=t=out:st=${(total - fout).toFixed(3)}:d=${fout},` +
    `volume=${vol}[a]`;
  ff([
    "-i", video.file, "-i", music.file,
    "-filter_complex", af,
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
    rel(out),
  ]);
  return out;
}

// ---------- run ----------
(function main() {
  console.log(DEMO ? "Building PROMO in --demo mode (placeholders + tone)\n" : "Building PROMO\n");
  const scenes = [];
  if (CFG.intro) { console.log("  intro card"); scenes.push(renderTitle(CFG.intro, "intro")); }
  CFG.scenes.forEach((s, i) => {
    console.log(`  scene ${i + 1}/${CFG.scenes.length}: ${s.caption}`);
    scenes.push(renderScene(s, i));
  });
  if (CFG.outro) { console.log("  outro card"); scenes.push(renderTitle(CFG.outro, "outro")); }

  console.log("  cross-fading scenes...");
  const video = xfadeConcat(scenes);
  console.log("  adding music...");
  const out = mux(video, video.duration);

  const dur = sh("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "default=nk=1:nw=1", rel(out)]).toString().trim();
  console.log(`\nDone -> ${rel(out)}  (${Number(dur).toFixed(1)}s, 1080x1920)`);
})();

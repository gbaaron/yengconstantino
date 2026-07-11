#!/usr/bin/env python3
"""
Generate promo-video assets for the Yeng app:
  - iphone-frame.png : transparent PNG of an iPhone bezel with a rounded
                       screen cutout + Dynamic Island. Placed OVER the
                       screen footage so the bezel masks the clip's corners.
  - bg.png           : brand-gradient background canvas (1080x1920).
  - meta.json        : exact pixel geometry the Node orchestrator needs.

Pure PIL (Pillow) - no other deps. Re-run any time; it overwrites.
Tune SCREEN_W / SCREEN_H / CANVAS to change sizing.
"""
import json, os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "assets")
os.makedirs(OUT, exist_ok=True)

# ---- Output canvas (9:16 vertical) ----
CANVAS_W, CANVAS_H = 1080, 1920

# ---- Screen area (the visible app footage) ----
# Modern iPhone screen aspect ~ 9:19.5. Keep it tall but leave room for captions.
SCREEN_W = 724
SCREEN_H = int(SCREEN_W * 19.5 / 9)      # ~1568
BEZEL = 20                                # black border thickness around screen
BODY_RADIUS = 96                          # outer body corner radius
SCREEN_RADIUS = 70                        # screen corner radius

# ---- Brand colors ----
PURPLE = (108, 43, 217)      # #6C2BD9 splash purple
MAGENTA = (187, 0, 255)      # #bb00ff Yeng primary
DARK = (15, 15, 26)          # #0F0F1A app dark surface


def brand_gradient(w, h):
    """Diagonal-ish vertical gradient DARK -> PURPLE -> MAGENTA with a soft glow."""
    base = Image.new("RGB", (w, h))
    px = base.load()
    top = DARK
    midp = PURPLE
    bot = MAGENTA
    for y in range(h):
        t = y / (h - 1)
        if t < 0.55:
            u = t / 0.55
            c = tuple(int(top[i] + (midp[i] - top[i]) * u) for i in range(3))
        else:
            u = (t - 0.55) / 0.45
            c = tuple(int(midp[i] + (bot[i] - midp[i]) * u) for i in range(3))
        for x in range(w):
            px[x, y] = c
    # Soft radial glow near upper-center for depth
    glow = Image.new("L", (w, h), 0)
    gd = ImageDraw.Draw(glow)
    cx, cy, r = w // 2, int(h * 0.32), int(w * 0.72)
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=90)
    glow = glow.resize((w // 4, h // 4)).resize((w, h))  # cheap blur
    white = Image.new("RGB", (w, h), (255, 255, 255))
    base = Image.composite(white, base, glow.point(lambda v: int(v * 0.28)))
    return base


def rounded_mask(w, h, r):
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    return m


def make_frame():
    body_w = SCREEN_W + BEZEL * 2
    body_h = SCREEN_H + BEZEL * 2
    frame = Image.new("RGBA", (body_w, body_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)

    # Black phone body (rounded)
    body_mask = rounded_mask(body_w, body_h, BODY_RADIUS)
    black_body = Image.new("RGBA", (body_w, body_h), (10, 10, 12, 255))
    frame.paste(black_body, (0, 0), body_mask)

    # Subtle titanium edge highlight
    d.rounded_rectangle([1, 1, body_w - 2, body_h - 2],
                        radius=BODY_RADIUS, outline=(70, 70, 78, 255), width=3)

    # Punch a transparent rounded hole for the screen
    hole = rounded_mask(SCREEN_W, SCREEN_H, SCREEN_RADIUS)
    transparent = Image.new("RGBA", (SCREEN_W, SCREEN_H), (0, 0, 0, 0))
    frame.paste(transparent, (BEZEL, BEZEL), hole)

    # Dynamic Island (opaque black pill, drawn on the frame => sits over footage)
    di_w, di_h = int(SCREEN_W * 0.34), 40
    di_x = BEZEL + (SCREEN_W - di_w) // 2
    di_y = BEZEL + 26
    d.rounded_rectangle([di_x, di_y, di_x + di_w, di_y + di_h],
                        radius=di_h // 2, fill=(6, 6, 8, 255))

    frame.save(os.path.join(OUT, "iphone-frame.png"))
    return body_w, body_h


def main():
    body_w, body_h = make_frame()

    # Background canvas
    bg = brand_gradient(CANVAS_W, CANVAS_H)
    bg.save(os.path.join(OUT, "bg.png"))

    # Where the framed phone sits on the canvas (centered, nudged down for a top caption)
    frame_x = (CANVAS_W - body_w) // 2
    frame_y = (CANVAS_H - body_h) // 2 + 40

    meta = {
        "canvas_w": CANVAS_W, "canvas_h": CANVAS_H,
        "frame_w": body_w, "frame_h": body_h,
        "frame_x": frame_x, "frame_y": frame_y,
        "bezel": BEZEL,
        "screen_w": SCREEN_W, "screen_h": SCREEN_H,
        # absolute position of the screen's top-left on the canvas
        "screen_x": frame_x + BEZEL,
        "screen_y": frame_y + BEZEL,
        "colors": {"purple": "#6C2BD9", "magenta": "#bb00ff", "dark": "#0F0F1A"},
    }
    with open(os.path.join(OUT, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print("Assets written to", OUT)
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()

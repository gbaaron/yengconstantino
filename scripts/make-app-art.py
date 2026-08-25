#!/usr/bin/env python3
"""Generate the iOS launch image and app icon on the site's palette.

    python3 scripts/make-app-art.py        # needs Pillow: pip3 install Pillow

Why this exists
---------------
The native shell was still wearing the palette this project was scrapped for.
The app icon was dark purple (#18002B family), the splash was a white canvas
with the stock sky-blue Capacitor mark, and capacitor.config.json set the
splash background to #6C2BD9 -- the exact purple named on the banned list in
the design brief. Launching the app gave you white, then blue, then purple,
then warm paper: four unrelated colour worlds before the product appeared.

These are generated rather than hand-drawn so they can be regenerated when the
palette moves, and so the values stay tied to the stylesheet.

Type note: the site sets --font-display to 'Fraunces', 'Playfair Display',
serif. Fraunces is a Google webfont and is not installed locally, so this uses
Georgia Bold -- a high-contrast serif in the same register, and effectively the
fallback the site already ships to anyone without the webfont.

iOS requires app icons to be fully opaque with no alpha channel, so everything
is composed in RGB.
"""

import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow is required:  pip3 install Pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── Palette, lifted from css/styles.css ──
# Keep these in step with the :root tokens. The launch screen is the first
# thing anyone sees, so a stale value here shows as a colour flash between
# the splash and the first painted page.
PAPER = (0xF7, 0xEB, 0xD5)   # --paper-main
CREAM = (0xFF, 0xF9, 0xEE)   # --paper-light
INK = (0x1F, 0x19, 0x16)     # --ink
RED = (0xD6, 0x2D, 0x2F)     # --yeng-red
GOLD = (0xF4, 0xB3, 0x1C)    # --sun-yellow

SERIF_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SERIF_ITALIC = "/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf"


def font(path, size):
    if not os.path.exists(path):
        sys.exit(f"font not found: {path}")
    return ImageFont.truetype(path, size)


def centre(draw, text, fnt, cx, cy):
    """Return the top-left origin that visually centres `text` on (cx, cy).

    Uses the ink bounding box rather than the advance box, so the glyphs are
    optically centred instead of centred on their metrics -- which for a
    serif capital with a descender-free profile is a visible difference."""
    l, t, r, b = draw.textbbox((0, 0), text, font=fnt)
    return (cx - (r - l) / 2 - l, cy - (b - t) / 2 - t)


def make_splash(size=2732):
    """Paper ground, the wordmark in ink, a gold rule beneath it.

    Deliberately the site masthead and nothing else. The splash shows for two
    seconds; anything more is noise, and a busy launch screen is the surest
    way to look like a template."""
    im = Image.new("RGB", (size, size), PAPER)
    d = ImageDraw.Draw(im)

    # The image is centred and cropped to the device aspect, so keep every
    # mark well inside the middle square that always survives the crop.
    word = font(SERIF_BOLD, int(size * 0.115))
    kick = font(SERIF_ITALIC, int(size * 0.030))

    cx, cy = size / 2, size / 2

    d.text(centre(d, "Yeng", word, cx, cy), "Yeng", font=word, fill=INK)

    l, t, r, b = d.textbbox(centre(d, "Yeng", word, cx, cy), "Yeng", font=word)
    rule_w = (r - l) * 0.42
    rule_y = b + size * 0.028
    rule_h = max(3, int(size * 0.0042))
    d.rectangle([cx - rule_w / 2, rule_y, cx + rule_w / 2, rule_y + rule_h], fill=GOLD)

    d.text(centre(d, "OPM", kick, cx, rule_y + size * 0.052), "OPM", font=kick, fill=RED)
    return im


def make_icon(size=1024):
    """Concert red ground, a single serif Y in paper, a gold rule.

    Has to read at 60px on a home screen, so it is one letter and one mark.
    The red is the site's primary accent, which makes the icon recognisably
    the same product as the masthead."""
    im = Image.new("RGB", (size, size), RED)
    d = ImageDraw.Draw(im)

    y = font(SERIF_BOLD, int(size * 0.60))
    cx, cy = size / 2, size * 0.46

    d.text(centre(d, "Y", y, cx, cy), "Y", font=y, fill=CREAM)

    l, t, r, b = d.textbbox(centre(d, "Y", y, cx, cy), "Y", font=y)
    rule_w = (r - l) * 0.90
    rule_y = b + size * 0.055
    rule_h = max(6, int(size * 0.022))
    d.rectangle([cx - rule_w / 2, rule_y, cx + rule_w / 2, rule_y + rule_h], fill=GOLD)
    return im


def main():
    splash_dir = os.path.join(ROOT, "ios/App/App/Assets.xcassets/Splash.imageset")
    icon_dir = os.path.join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset")

    if not os.path.isdir(splash_dir):
        sys.exit(f"not found: {splash_dir}")

    splash = make_splash()
    for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        splash.save(os.path.join(splash_dir, name), "PNG")
        print("  wrote", name)

    icon = make_icon()
    icon.save(os.path.join(icon_dir, "AppIcon-1024.png"), "PNG")
    print("  wrote AppIcon-1024.png")

    print("\nNow run:  npm run cap:copy")


if __name__ == "__main__":
    main()

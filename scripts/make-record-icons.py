#!/usr/bin/env python3
"""
make-record-icons.py — one app icon per record.

The gold Y, the Philippine sun and the three stars in icons/icon-1024.png are
the brand and stay the brand; what changes per record is the palette it is
lit with. So this is a TRI-TONE, not a repaint: the master's luminance is
remapped onto a ramp built from that record's own three sampled colours
(ground -> accent -> second accent). Every detail and every bit of the paper
texture survives, and all nine icons still read as the same app.

The ramp is deliberately not linear. The artwork is mostly mid-dark ground
with a narrow band of bright gold, so the shadow end gets most of the ramp
and the highlight end stays tight — otherwise the Y washes out to a flat
colour and the sun behind it disappears.

    python3 scripts/make-record-icons.py

Writes icons/records/<key>-1024.png plus the 180 and 120 px sizes iOS wants
for an alternate icon (60pt @3x and @2x). The default icon is NOT generated:
it stays the original master artwork.
"""
import json, os, re, sys
from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER = os.path.join(ROOT, 'icons', 'icon-1024.png')
OUT = os.path.join(ROOT, 'icons', 'records')

def records_from_theme_js():
    """Read the record list out of js/theme.js so the icons can never drift
    from the palettes the app actually uses."""
    src = open(os.path.join(ROOT, 'js', 'theme.js'), encoding='utf-8').read()
    body = src[src.index('LIST: ['):]
    out = []
    for m in re.finditer(
            r"\{\s*key:\s*'([^']+)'.*?a:\s*'(#[0-9A-Fa-f]{6})',\s*b:\s*'(#[0-9A-Fa-f]{6})',\s*bg:\s*'(#[0-9A-Fa-f]{6})'",
            body, re.S):
        out.append({'key': m.group(1), 'a': m.group(2), 'b': m.group(3), 'bg': m.group(4)})
        if len(out) >= 12: break
    return out

def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def lerp(c1, c2, t):
    return tuple(round(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

def luminance(c):
    v = []
    for n in c:
        x = n / 255
        v.append(x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4)
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]

def ramp(bg, a, b):
    """256-entry lookup from the record's own three colours.

    Direction follows the record's ground, the same way the in-app theme
    decides light or dark by luminance. On a dark record the Y is the bright
    end of the ramp; on a light one that mapping produces a muddy olive
    ground with a Y that barely separates from it, so the ramp is inverted
    and the Y becomes the DARK end on light paper.

    Stops are not evenly spaced: the artwork is mostly mid-dark ground with
    a narrow band of bright gold, so most of the ramp is spent below the
    midpoint and the highlight end stays tight."""
    light = luminance(rgb(bg)) > 0.5
    if light:
        ground = lerp(rgb(bg), (255, 255, 255), 0.30)    # keep the paper paper
        mid    = lerp(rgb(a), (255, 255, 255), 0.10)
        high   = lerp(rgb(a), (0, 0, 0), 0.30)           # the Y, darkened
        peak   = lerp(rgb(b), (0, 0, 0), 0.52)
    else:
        ground = lerp(rgb(bg), (0, 0, 0), 0.35)          # deepen so the Y separates
        mid    = rgb(a)
        high   = lerp(rgb(b), (255, 255, 255), 0.34)
        peak   = lerp(rgb(b), (255, 255, 255), 0.80)
    stops = [(0.0, ground), (0.52, mid), (0.84, high), (1.0, peak)]
    table = []
    for i in range(256):
        t = i / 255
        for j in range(len(stops) - 1):
            t0, c0 = stops[j]; t1, c1 = stops[j + 1]
            if t0 <= t <= t1:
                table.append(lerp(c0, c1, (t - t0) / (t1 - t0) if t1 > t0 else 0))
                break
        else:
            table.append(stops[-1][1])
    return table

def main():
    if not os.path.exists(MASTER):
        sys.exit('missing ' + MASTER)
    os.makedirs(OUT, exist_ok=True)
    master = Image.open(MASTER).convert('RGB')
    if master.size != (1024, 1024):
        master = master.resize((1024, 1024), Image.LANCZOS)
    # A touch more contrast first: the master is soft, and the tri-tone
    # flattens it further.
    lum = ImageEnhance.Contrast(master.convert('L')).enhance(1.18)

    recs = records_from_theme_js()
    made = []
    for r in recs:
        if r['key'] == 'scrapbook':
            continue                      # the default keeps the original art
        table = ramp(r['bg'], r['a'], r['b'])
        flat = [v for c in table for v in c]
        img = lum.convert('RGB')
        img = Image.merge('RGB', [
            lum.point([c[0] for c in table]),
            lum.point([c[1] for c in table]),
            lum.point([c[2] for c in table]),
        ])
        for size, suffix in ((1024, '-1024'), (180, '-180'), (120, '-120')):
            p = os.path.join(OUT, r['key'] + suffix + '.png')
            img.resize((size, size), Image.LANCZOS).save(p, 'PNG')
        made.append(r['key'])
    print('wrote %d icon sets -> icons/records/' % len(made))
    print('  ' + ', '.join(made))

if __name__ == '__main__':
    main()

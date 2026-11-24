#!/usr/bin/env python3
"""Generate Chrome Web Store screenshots and promo tiles from repository assets."""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SHOTS = os.path.join(ROOT, "docs", "screenshots")
OUT_SHOTS = os.path.join(HERE, "screenshots")
OUT_PROMO = os.path.join(HERE, "promo")
ICON = os.path.join(ROOT, "extensions", "chrome", "icons", "icon128.png")

os.makedirs(OUT_SHOTS, exist_ok=True)
os.makedirs(OUT_PROMO, exist_ok=True)

SHOT_MAP = {
    "query-workbench.png": "01-query-workbench.png",
    "score-explain.png": "02-score-explain.png",
    "sql-console.png": "03-sql-console.png",
    "extension-vue-browser.png": "04-console.png",
    "overview.png": "05-cluster-overview.png",
}

for old in os.listdir(OUT_SHOTS):
    if old.endswith(".png"):
        os.remove(os.path.join(OUT_SHOTS, old))

for src, dst in SHOT_MAP.items():
    im = Image.open(os.path.join(SHOTS, src)).convert("RGB")
    im = im.resize((1280, 800), Image.LANCZOS)
    im.save(os.path.join(OUT_SHOTS, dst), "PNG", optimize=True)

DARK = (11, 18, 32)
TEAL = (45, 212, 191)
WHITE = (241, 245, 249)
MUTED = (148, 163, 184)


def font(size, bold=False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    for base in (r"C:\Windows\Fonts", "/usr/share/fonts/truetype/dejavu"):
        path = os.path.join(base, name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def backdrop(w, h):
    im = Image.new("RGB", (w, h), DARK)
    d = ImageDraw.Draw(im)
    # subtle vertical gradient
    for y in range(h):
        t = y / max(1, h - 1)
        c = (int(11 + 6 * t), int(18 + 10 * t), int(32 + 14 * t))
        d.line([(0, y), (w, y)], fill=c)
    # faint chevrons on the right
    step = max(48, w // 14)
    for i in range(-2, w // step + 2):
        x = i * step
        pts = [(x, h), (x + step // 2, h - step // 3), (x + step, h)]
        d.line(pts, fill=(30, 58, 66), width=max(3, w // 260))
    return im


def paste_icon(im, size, xy):
    icon = Image.open(ICON).convert("RGBA").resize((size, size), Image.LANCZOS)
    im.paste(icon, xy, icon)


def centered(draw, text, fnt, y, fill, w):
    box = draw.textbbox((0, 0), text, font=fnt)
    draw.text(((w - (box[2] - box[0])) / 2, y), text, font=fnt, fill=fill)


# 440x280 small promo tile
tile = backdrop(440, 280)
paste_icon(tile, 96, (172, 40))
d = ImageDraw.Draw(tile)
centered(d, "ESQueryStudio", font(31, True), 152, WHITE, 440)
centered(d, "Elasticsearch Query Workbench", font(14), 196, MUTED, 440)
d.line([(160, 232), (280, 232)], fill=TEAL, width=3)
tile.save(os.path.join(OUT_PROMO, "small-tile-440x280.png"), "PNG", optimize=True)

# 1400x560 marquee
mar = backdrop(1400, 560)
paste_icon(mar, 168, (110, 178))
d = ImageDraw.Draw(mar)
d.text((318, 190), "ESQueryStudio", font=font(62, True), fill=WHITE)
d.text((320, 272), "Elasticsearch Query Workbench", font=font(26), fill=TEAL)
d.text((320, 318), "DSL · Lucene · ES-SQL · PIT · Explain · Live monitor",
       font=font(19), fill=MUTED)
d.text((320, 362), "Direct connection. Local credentials. No backend.", font=font(19), fill=MUTED)
mar.save(os.path.join(OUT_PROMO, "marquee-1400x560.png"), "PNG", optimize=True)

print("store assets generated")

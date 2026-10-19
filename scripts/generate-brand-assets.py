"""Convert the supplied Spndrr artwork. Requires Python 3 and Pillow 9.2+.

Run from any directory: python scripts/generate-brand-assets.py
"""

import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/branding/source"
BACKGROUND = "#f4f7f6"
RESAMPLE = Image.Resampling.LANCZOS


def artwork(name):
    image = Image.open(SOURCE / f"spndrr-{name}.png").convert("RGBA")
    return image.crop(image.getbbox())


def square(image, size, coverage=0.84, background=None):
    mode = "RGB" if background else "RGBA"
    canvas = Image.new(mode, (size, size), background or (0, 0, 0, 0))
    edge = round(size * coverage)
    scaled = ImageOps.contain(image, (edge, edge), RESAMPLE)
    position = ((size - scaled.width) // 2, (size - scaled.height) // 2)
    if background:
        canvas.paste(scaled, position, scaled)
    else:
        canvas.alpha_composite(scaled, position)
    return canvas


def save(image, path, **options):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, **options)


mark = artwork("mark")
for app in ("web", "mobile"):
    public = ROOT / f"apps/{app}/public"
    for name, width in (("logo", 640), ("stacked", 512), ("wordmark", 640)):
        image = artwork(name)
        image = image.resize((width, round(width * image.height / image.width)), RESAMPLE)
        save(image, public / f"brand/spndrr-{name}.png", optimize=True)
        save(image, public / f"brand/spndrr-{name}.webp", lossless=True)
    icon = square(mark, 256)
    save(icon, public / "brand/spndrr-mark.png", optimize=True)
    save(icon, public / "brand/spndrr-mark.webp", lossless=True)
    for size in (192, 512):
        save(square(mark, size, background=BACKGROUND), public / f"brand/icon-{size}.png", optimize=True)
    # Entire mark stays inside the central 80%-diameter maskable safe circle.
    save(square(mark, 512, coverage=0.56, background=BACKGROUND), public / "brand/icon-maskable-512.png", optimize=True)
    app_root = ROOT / f"apps/{app}/app"
    # File conventions generate the corresponding Next.js metadata links.
    save(square(mark, 48, coverage=0.94), app_root / "icon.png", optimize=True)
    save(square(mark, 180, background=BACKGROUND), app_root / "apple-icon.png", optimize=True)
    save(square(mark, 64, coverage=0.94), app_root / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    manifest = {
        "name": "Spndrr", "short_name": "Spndrr",
        "description": "Your assistant-first personal finance guide.",
        "start_url": "/", "scope": "/", "display": "standalone",
        "background_color": BACKGROUND, "theme_color": BACKGROUND,
        "icons": [
            {"src": f"/brand/icon-{size}.png", "sizes": f"{size}x{size}", "type": "image/png", "purpose": "any"}
            for size in (192, 512)
        ] + [{"src": "/brand/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
    }
    (app_root / "manifest.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n")

mobile = ROOT / "apps/mobile"
save(square(mark, 1024, background=BACKGROUND), mobile / "assets/icon.png", optimize=True)
save(square(mark, 1024, background=BACKGROUND), mobile / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", optimize=True)
save(square(artwork("stacked"), 2732, coverage=0.22, background=BACKGROUND), mobile / "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png", optimize=True)

res = mobile / "android/app/src/main/res"
# Adaptive icon layers are 108dp; 56% coverage fits the 66dp safe region.
for density, scale in (("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)):
    save(square(mark, round(108 * scale), coverage=0.56), res / f"drawable-{density}/spndrr_mark.png", optimize=True)
    for name in ("ic_launcher", "ic_launcher_round"):
        save(square(mark, round(48 * scale), coverage=0.7, background=BACKGROUND), res / f"mipmap-{density}/{name}.png", optimize=True)

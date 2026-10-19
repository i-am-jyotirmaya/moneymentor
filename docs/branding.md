# Spndrr branding

The supplied September 27 artwork is now used by the web and Capacitor mobile apps.

| Artwork | Placement | Output |
| --- | --- | --- |
| Standalone money S (`04_20_11 PM-1`) | Compact mobile header, browser tab, home screen, Android launcher and splash, iOS app icon | Transparent PNG/WebP, multi-resolution ICO, opaque app-icon PNG |
| Horizontal logo (`04_20_13 PM-3`) | Desktop sign-in, narrow sign-in, sidebar, mobile menu, signed-out home | PNG and lossless WebP |
| Stacked logo (`04_20_14 PM-4`) | iOS launch screen; reusable brand asset | PNG and lossless WebP |
| Wordmark (`04_20_15 PM-5`) | Reusable text-only brand asset | PNG and lossless WebP |

Original transparent PNGs are kept in `assets/branding/source`. The second batch repeats the first batch; the selected standalone mark has clear margins on all sides. Conversion trims transparent outer space, preserves the original proportions and colors, and resizes with Lanczos filtering. The horizontal logo uses a light plate in the dark sidebar so its dark lettering remains readable.

`apps/web/public/brand` and `apps/mobile/public/brand` contain identical runtime assets. Shared UI components use explicit dimensions and unoptimized local WebP files, so branding works in the statically exported mobile bundle without an image server. PNG copies are available for other uses. The source artwork is raster, so no artificial SVG wrapper or inaccurate vector tracing is included.

Both apps use Next.js file conventions for `favicon.ico` (16/32/48/64px), `icon.png` (48px), `apple-icon.png` (180px), and `manifest.webmanifest`. Manifest icons include 192px and 512px versions plus a separate maskable 512px icon. The manifest supplies branding for home-screen shortcuts; it does not add offline caching.

Native icons use an opaque `#f4f7f6` background. Android includes mdpi through xxxhdpi legacy launcher PNGs and transparent 108dp adaptive foregrounds with the mark inside the 66dp safe region. Existing adaptive-icon XML and splash resources reference the new foreground. iOS uses an opaque 1024px app icon and a centered stacked logo on the existing 2732px launch image. `apps/mobile/assets/icon.png` is the reusable 1024px native master.

## Regenerate

With Python 3 and Pillow 9.2+ installed, run:

```sh
python scripts/generate-brand-assets.py
```

This regenerates checked-in assets for both apps and native projects from the four source PNGs. No new runtime dependency is required.

## Check

```sh
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web test:e2e tests/mvp-access.spec.ts --workers=2
pnpm --filter mobile lint
pnpm --filter mobile test
NEXT_PUBLIC_API_BASE_URL=https://api.spndrr.com pnpm --filter mobile build
pnpm --filter mobile test:e2e tests/mobile.spec.ts
```

The HTTPS API value is a build-time example. Use the appropriate API origin for your environment. Native launcher masks and launch screens should also be checked on Android and iOS devices before a store release.

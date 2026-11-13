# Spndrr branding

Direction B “Slice” was picked by Jyotirmaya on 2026-11-12 and designed by ForgeDesigner. The Inter 700 wordmark is converted to paths in the SVG masters. The palette is cobalt `#2944D4` for the pie and ink `#0E1220` for the pulled slice and light-surface wordmark. On dark surfaces, the pie is `#B7C4FF` and the wordmark is white.

| Artwork | Placement | Output |
| --- | --- | --- |
| Mark | Compact mobile header, browser tab, home screen, Android launcher and splash, iOS app icon | Transparent PNG/WebP, multi-resolution ICO, opaque app-icon PNG |
| Horizontal logo | Sign-in, mobile menu, signed-out home and other light surfaces | PNG and lossless WebP |
| Dark horizontal logo | Desktop sidebar on `#191E2B` | PNG and lossless WebP |
| Stacked logo | iOS launch screen; reusable brand asset | PNG and lossless WebP |
| Wordmark | Reusable text-only brand asset | PNG and lossless WebP |
| Dark mark, stacked logo and wordmark | Retained as sources for future dark-surface uses | Source PNG and SVG only |

The four base transparent PNGs and their four `-dark` variants live in `assets/branding/source`. SVG masters, including the app-icon master, live in `assets/branding/source/svg`. Conversion trims transparent outer space, preserves proportions and colors, and resizes with Lanczos filtering. Both horizontal runtime logos are 640 × 204px. The sidebar uses the dark lockup directly; the white plate is gone. Light surfaces retain the light logo.

`apps/web/public/brand` and `apps/mobile/public/brand` contain identical runtime assets. Mobile re-exports the shared web workspace layout and components. Shared UI components use explicit dimensions and unoptimized local WebP files, so branding works in the statically exported mobile bundle without an image server. PNG copies are available for other uses.

Both apps use Next.js file conventions for `favicon.ico` (16/32/48/64px), `icon.png` (48px), `apple-icon.png` (180px), and `manifest.webmanifest`. Manifest icons include 192px and 512px versions plus a separate maskable 512px icon. The manifest supplies branding for home-screen shortcuts; it does not add offline caching.

Brand and launcher backgrounds use `#F3F5F9` everywhere, including both manifests, native icons and splash screens. Android includes mdpi through xxxhdpi legacy launcher PNGs and transparent 108dp adaptive foregrounds. Adaptive coverage is 0.52, keeping the mark’s farthest point inside the 33dp safe radius with extra margin. Maskable coverage remains 0.56. The designer’s 288dp Android 12 splash vector uses `@color/sp_mark` (cobalt) and `@color/sp_mark_slice` (ink); the launch style references `@drawable/spndrr_mark_splash`. iOS uses an opaque 1024px app icon and a centered stacked logo on the existing 2732px launch image. `apps/mobile/assets/icon.png` is the reusable 1024px native master.

## Regenerate

With Python 3 and Pillow 9.2+ installed, run from the repository root:

```sh
python3 scripts/generate-brand-assets.py
```

This regenerates checked-in web, mobile and native assets from the four base source PNGs and the dark horizontal logo. Other dark variants and SVG masters remain source assets. The Android 12 splash vector is maintained separately from the designer’s export, with its color resources in `res/values/colors.xml`. No new runtime dependency is required.

## Check

Run from the repository root:

```sh
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web test:e2e tests/mvp-access.spec.ts --workers=2
pnpm --filter mobile lint
pnpm --filter mobile typecheck
pnpm --filter mobile test
NEXT_PUBLIC_API_BASE_URL=https://api.spndrr.com pnpm --filter mobile build
pnpm --filter mobile test:e2e tests/mobile.spec.ts
```

The web production build includes type checking. The HTTPS API value is a build-time example; use the appropriate API origin for your environment. Native launcher masks and launch screens should also be checked on Android and iOS devices before release.

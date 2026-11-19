# Inter subset

Source: Inter 4.001 variable (opsz 14–32, wght 100–900) from Google Fonts,
licensed under SIL OFL 1.1 (see OFL.txt).

Subset with fontTools pyftsubset 4.65 using exactly:

```sh
pyftsubset Inter-VariableFont_opsz,wght.ttf --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20B9,U+2190-2193,U+2212,U+2215" --layout-features="kern,liga,calt,tnum,lnum,case,ccmp,locl,mark,mkmk" --flavor=woff2 --output-file=InterVariable-subset.woff2
```

Size: 63,444 bytes. Latin only; non-Latin scripts fall back to the system face
(pending product question Q-J4).

## Inter Tight subset

The Cobalt Slice mockup bundle supplies the Inter Tight variable source.
The web display font uses the same glyph set and font features as Inter
above, keeping the rupee sign and tabular figures. The WOFF2 file is 38,516
bytes and is distributed with the Inter Tight OFL.

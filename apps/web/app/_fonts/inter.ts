import localFont from "next/font/local";

// SPEC 2.1: bundle Inter for consistent typography on web and Android.
export const inter = localFont({
  src: "./InterVariable-subset.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
  variable: "--font-inter",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

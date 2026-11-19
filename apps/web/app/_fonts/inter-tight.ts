import localFont from "next/font/local";

export const interTight = localFont({
  src: "./InterTight-subset.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter-tight",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

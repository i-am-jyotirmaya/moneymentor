import { inter } from "./_fonts/inter";
import { interTight } from "./_fonts/inter-tight";
import { NavigationProgress } from "./_components/navigation-progress";
import { SpndrrWebDesign } from "./_components/web-design";
import { AppearanceInit } from "./_components/appearance-init";
import { AppearanceSync } from "./_components/appearance";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./cobalt-slice.css";

export const metadata: Metadata = {
  title: "Spndrr",
  description: "Spndrr is your assistant-first personal finance guide.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F6FB" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0D18" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} h-full antialiased`}
      data-spndrr-web=""
      suppressHydrationWarning
    >
      <head><AppearanceInit /></head>
      <body className="min-h-full">
        <SpndrrWebDesign>
          <AppearanceSync />
          <NavigationProgress>{children}</NavigationProgress>
        </SpndrrWebDesign>
      </body>
    </html>
  );
}

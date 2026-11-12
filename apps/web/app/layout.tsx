import { inter } from "./_fonts/inter";
import { NavigationProgress } from "./_components/navigation-progress";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spndrr",
  description: "Spndrr is your assistant-first personal finance guide.",
};

export const viewport: Viewport = {
  themeColor: "#F3F5F9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Light is forced until the dark-mode PR (SPEC 6.4 / section 11 step 5),
    // which replaces the static attribute with the head script.
    <html lang="en" className={`${inter.variable} h-full antialiased`} data-theme="light">
      <body className="min-h-full">
        <NavigationProgress>{children}</NavigationProgress>
      </body>
    </html>
  );
}

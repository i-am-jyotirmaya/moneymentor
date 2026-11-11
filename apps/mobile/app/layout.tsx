import { inter } from "../../web/app/_fonts/inter";
import { NavigationProgress } from "../../web/app/_components/navigation-progress";
import type { Metadata, Viewport } from "next";
import { MobileRuntime } from "../components/mobile-runtime";
import "./mobile.css";

export const metadata: Metadata = {
  title: "Spndrr",
  description: "Your assistant-first personal finance guide.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F3F5F9",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Light is forced until the dark-mode PR (SPEC 6.4 / section 11 step 5),
    // which replaces the static attribute with the head script.
    <html lang="en" className={`${inter.variable} h-full antialiased`} data-theme="light">
      <body className="min-h-full">
        <MobileRuntime />
        <NavigationProgress>{children}</NavigationProgress>
      </body>
    </html>
  );
}

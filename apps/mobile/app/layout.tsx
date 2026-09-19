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
  themeColor: "#f4f7f6",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <MobileRuntime />
        <NavigationProgress>{children}</NavigationProgress>
      </body>
    </html>
  );
}

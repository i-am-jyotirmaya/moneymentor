import { inter } from "./_fonts/inter";
import { interTight } from "./_fonts/inter-tight";
import { NavigationProgress } from "./_components/navigation-progress";
import { SpndrrWebDesign } from "./_components/web-design";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./cobalt-slice.css";

export const metadata: Metadata = {
  title: "Spndrr",
  description: "Spndrr is your assistant-first personal finance guide.",
};

export const viewport: Viewport = {
  themeColor: "#F4F6FB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Light is forced until the dark-mode PR (SPEC 6.4 / section 11 step 5),
    // which replaces the static attribute with the head script.
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} h-full antialiased`}
      data-theme="light"
      data-spndrr-web=""
    >
      <body className="min-h-full">
        <SpndrrWebDesign>
          <NavigationProgress>{children}</NavigationProgress>
        </SpndrrWebDesign>
      </body>
    </html>
  );
}

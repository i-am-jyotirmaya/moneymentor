import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spndrr",
  description: "Spndrr is your assistant-first personal finance guide.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}

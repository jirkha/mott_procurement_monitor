import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOTT — Monitoring zakázek",
  description: "Přehled veřejných zakázek v dopravním plánování",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className="h-full">
      <body
        className="min-h-full bg-slate-50 font-sans text-slate-900 antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

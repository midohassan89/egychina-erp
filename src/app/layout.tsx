import type { Metadata } from "next";
import { Inter, Noto_Sans_Arabic, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/providers/AuthProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

/** Arabic + Simplified Chinese for thermal receipts (Xprinter UTF-8 / glyph coverage). */
const notoArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-receipt-ar",
  display: "swap",
});

const notoSc = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-receipt-zh",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Souq El Obour - POS",
  description: "Point of Sale and accounting system for Souq El Obour",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${notoArabic.variable} ${notoSc.variable} font-sans antialiased`}
      >
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}

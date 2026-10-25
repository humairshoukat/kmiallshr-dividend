import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "KMIALLSHR Dividend Board",
  description:
    "Every current PSX KMIALLSHR constituent with January–December dividend totals for 2025 and 2026 and after-tax holding returns.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${plexMono.variable}`}>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });

export const metadata: Metadata = {
  title: "PaperTrade — NSE paper trading",
  description: "Practice trading Indian stocks with live NSE prices, pro charts and a virtual portfolio.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0e13" },
    { media: "(prefers-color-scheme: light)", color: "#f3f5f8" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme lives in a cookie so the server renders the right palette (no flash, no inline script)
  const theme = (await cookies()).get("pt-theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme} className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

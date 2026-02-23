import type { Metadata } from "next";
import { Inter, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sc",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lobster Ranch - 萌龙牧场 Web3 Game",
  description: "收集、对战与繁殖萌萌的小龙龙。在 Base 链上体验 Web3 宠物养成游戏。",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh">
      <body
        className={`${inter.variable} ${notoSansSC.variable} antialiased bg-slate-900 text-white`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

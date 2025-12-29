import type { Metadata } from "next";
import { Yomogi, Zen_Maru_Gothic } from "next/font/google";
import "./globals.css";

const zenMaru = Zen_Maru_Gothic({
  variable: "--font-zen-maru",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const yomogi = Yomogi({
  variable: "--font-yomogi",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aroma Spread Trainer",
  description: "Spread markdown をそのままクイズ化できるシンプルアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${zenMaru.variable} ${yomogi.variable} antialiased bg-indigo-50 text-gray-800`}
      >
        {children}
      </body>
    </html>
  );
}

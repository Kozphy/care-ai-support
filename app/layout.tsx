import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "Kozphy Care — AI 客服中心",
    description:
      "結合 AI、核准知識庫與真人轉接的全天候智慧客服中心。",
    openGraph: {
      title: "Kozphy Care — AI 客服中心",
      description: "快速解答，也知道何時交給真人。",
      type: "website",
      locale: "zh_TW",
      images: [
        {
          url: `${origin}/og.png`,
          width: 1200,
          height: 630,
          alt: "Kozphy Care AI 客服中心",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Kozphy Care — AI 客服中心",
      description: "快速解答，也知道何時交給真人。",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}

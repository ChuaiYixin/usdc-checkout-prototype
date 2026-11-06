import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLocale, getT } from "@/i18n/server";
import { LanguageSwitch, LocaleProvider } from "@/i18n/client";
import { GuideLauncher } from "@/guide/GuideLauncher";
import { GuideOverlay } from "@/guide/GuideOverlay";
import { GuideProvider } from "@/guide/GuideProvider";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: "Quayline",
    description: t("Accept USDC from buyers anywhere and settle to your Singapore bank account in SGD."),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <LocaleProvider locale={locale}>
          <GuideProvider>
            {children}
            <GuideLauncher />
            <GuideOverlay />
          </GuideProvider>
          <LanguageSwitch />
        </LocaleProvider>
      </body>
    </html>
  );
}

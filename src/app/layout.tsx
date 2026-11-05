import type { Metadata } from "next";
import { getLocale, getT } from "@/i18n/server";
import { LanguageSwitch, LocaleProvider } from "@/i18n/client";
import { GuideBar } from "@/guide/GuideBar";
import { GuideProvider } from "@/guide/GuideProvider";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("USDC Checkout Prototype"),
    description: t("Cross-border stablecoin checkout for a Singapore merchant — Base Sepolia testnet only."),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body className="min-h-screen pb-12 font-sans antialiased">
        <LocaleProvider locale={locale}>
          <GuideProvider>
            {children}
            <GuideBar />
          </GuideProvider>
          <LanguageSwitch />
        </LocaleProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "USDC Checkout Prototype",
  description: "Cross-border stablecoin checkout for a Singapore merchant — Base Sepolia testnet only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}

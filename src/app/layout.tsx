import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const interSans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Résolution des URLs Open Graph / Twitter relatives (silence en dev,
  // URLs correctes en production dès que NEXT_PUBLIC_SITE_URL est défini).
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : new URL("http://localhost:3000"),
  title: {
    default: "Téranga Market — Le meilleur du shopping en ligne",
    template: "%s — Téranga Market",
  },
  description:
    "Téranga Market : votre marketplace en ligne de confiance. Électronique, mode, maison, produits numériques et plus — livraison rapide, paiement à la livraison ou en ligne.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${interSans.variable} font-sans antialiased bg-background text-foreground`}>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}

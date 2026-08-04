import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

/**
 * Script bloquant (v1.1, AR-0184) — pose `data-theme` sur `<html>` AVANT
 * le premier rendu si l'utilisateur a explicitement choisi un thème
 * (localStorage), pour éviter un flash du mauvais thème à l'hydratation.
 * Sans choix explicite ("système"), l'attribut reste absent et
 * `prefers-color-scheme` (voir `globals.css`) décide seul.
 */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Provence 360 — Acquisition client",
  description: "Plateforme d'acquisition client automatisée pour Provence 360.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-p360-offwhite text-p360-ink">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

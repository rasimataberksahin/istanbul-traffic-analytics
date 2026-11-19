import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "İstanbul Trafik Analizi", template: "%s | İstanbul Trafik Analizi" },
  description: "İBB açık trafik verileriyle saatlik hız, tıkanıklık ve veri kalitesi analizi.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a19" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <a className="skip-link" href="#icerik">
          İçeriğe geç
        </a>
        <AppHeader />
        <main className="main" id="icerik">
          {children}
        </main>
        <footer className="footer">
          <div className="main">
            Veri kaynağı: İstanbul Büyükşehir Belediyesi Açık Veri Portalı, Saatlik Trafik Yoğunluk Veri Seti.
          </div>
        </footer>
      </body>
    </html>
  );
}

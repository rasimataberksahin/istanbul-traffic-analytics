import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { StickyFilters } from "@/components/StickyFilters";
import { LocaleProvider } from "@/lib/i18n/client";
import { translator } from "@/lib/i18n/locale";
import { getLocale, getTheme } from "@/lib/i18n/server";
import "./globals.css";

const sans = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-mono", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale());
  const name = t("İstanbul Trafik Analizi", "Istanbul Traffic Analytics");
  return {
    title: { default: name, template: `%s | ${name}` },
    description: t(
      "İBB açık trafik verileriyle saatlik hız, tıkanıklık ve veri kalitesi analizi.",
      "Hourly speed, congestion and data quality analysis of Istanbul's open traffic data.",
    ),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);
  const t = translator(locale);

  return (
    <html
      className={`${sans.variable} ${mono.variable}`}
      data-theme={theme === "system" ? undefined : theme}
      lang={locale}
      // The header changes data-theme and lang on the client after hydration.
      suppressHydrationWarning
    >
      <body>
        <LocaleProvider locale={locale}>
          <a className="skip-link" href="#icerik">
            {t("İçeriğe geç", "Skip to content")}
          </a>
          <AppHeader theme={theme} />
          <StickyFilters />
          <main className="main" id="icerik">
            {children}
          </main>
          <footer className="footer">
            <div className="main footer-inner">
              <div>
                <strong>{t("İstanbul Trafik Analizi", "Istanbul Traffic Analytics")}</strong>
                <p>
                  {t(
                    "İBB'nin saatlik trafik ölçümleri üzerine açık kaynak bir veri mühendisliği projesi.",
                    "An open source data engineering project built on the hourly traffic measurements of Istanbul Metropolitan Municipality.",
                  )}
                </p>
              </div>
              <ul aria-label={t("Kaynaklar", "Sources")}>
                <li>
                  {t("Trafik verisi", "Traffic data")}:{" "}
                  <a href="https://data.ibb.gov.tr/dataset/hourly-traffic-density-data-set" rel="noreferrer">
                    {t("İBB Açık Veri Portalı", "IMM Open Data Portal")}
                  </a>
                </li>
                <li>
                  {t("Trafik olayları", "Traffic incidents")}:{" "}
                  <a href="https://data.ibb.gov.tr/dataset/ulasim-yonetim-merkezi-trafik-duyurulari-verisi" rel="noreferrer">
                    {t("İBB Ulaşım Yönetim Merkezi", "IMM Traffic Management Centre")}
                  </a>
                </li>
                <li>
                  {t("Semt adları ve harita", "Place names and map")}:{" "}
                  <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">
                    {t("© OpenStreetMap katkıcıları", "© OpenStreetMap contributors")}
                  </a>
                  ,{" "}
                  <a href="https://openfreemap.org" rel="noreferrer">
                    OpenFreeMap
                  </a>
                </li>
                <li>
                  {t("Hava verisi", "Weather data")}:{" "}
                  <a href="https://open-meteo.com/" rel="noreferrer">
                    Open-Meteo.com
                  </a>{" "}
                  (CC BY 4.0)
                </li>
                <li>
                  <a href="https://github.com/rasimataberksahin/istanbul-traffic-analytics" rel="noreferrer">
                    {t("Kaynak kodu GitHub'da", "Source code on GitHub")}
                  </a>
                </li>
              </ul>
            </div>
          </footer>
        </LocaleProvider>
      </body>
    </html>
  );
}

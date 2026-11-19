"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { LOCALE_COOKIE, PREFERENCE_MAX_AGE, THEME_COOKIE, type Locale, type Theme } from "@/lib/i18n/locale";

function remember(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${PREFERENCE_MAX_AGE}; samesite=lax`;
}

/** An explicit theme goes on <html data-theme>; "system" removes it so the media query decides. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

function applyLocale(locale: Locale) {
  document.documentElement.setAttribute("lang", locale);
}

export function AppHeader({ theme: initialTheme }: { theme: Theme }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, t } = useI18n();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [isPending, startTransition] = useTransition();

  const links = [
    { href: "/", label: t("Genel bakış", "Overview") },
    { href: "/analiz", label: t("Analiz raporu", "Report") },
    { href: "/harita", label: t("Harita", "Map") },
    { href: "/olaylar", label: t("Olaylar", "Incidents") },
    { href: "/veri-hatti", label: t("Veri hattı", "Pipeline") },
    { href: "/kilavuz", label: t("Kılavuz", "Guide") },
  ];

  function chooseTheme(next: Theme) {
    setTheme(next);
    remember(THEME_COOKIE, next);
    applyTheme(next);
  }

  function chooseLocale(next: Locale) {
    if (next === locale) {
      return;
    }
    remember(LOCALE_COOKIE, next);
    applyLocale(next);
    // Pages are rendered on the server in the chosen language.
    startTransition(() => router.refresh());
  }

  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: t("Açık tema", "Light theme"), icon: Sun },
    { value: "dark", label: t("Koyu tema", "Dark theme"), icon: Moon },
    { value: "system", label: t("Sistem teması", "System theme"), icon: Desktop },
  ];

  return (
    <header className="header">
      <div className="header-inner">
        <Link className="brand" href="/">
          <span aria-hidden="true" className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            {t("İstanbul Trafik Analizi", "Istanbul Traffic Analytics")}
            <span className="brand-sub">{t("İBB saatlik trafik verisi", "IMM hourly traffic data")}</span>
          </span>
        </Link>
        <nav aria-label={t("Ana menü", "Main menu")} className="nav">
          {links.map((link) => (
            <Link key={link.href} aria-current={pathname === link.href ? "page" : undefined} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="header-tools">
          <div aria-label={t("Dil", "Language")} className="switch" role="group" aria-busy={isPending}>
            {(["tr", "en"] as const).map((value) => (
              <button
                aria-label={value === "tr" ? "Türkçe" : "English"}
                aria-pressed={locale === value}
                key={value}
                lang={value}
                onClick={() => chooseLocale(value)}
                type="button"
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
          <div aria-label={t("Tema", "Theme")} className="switch icons" role="group">
            {themes.map(({ value, label, icon: Icon }) => (
              <button aria-label={label} aria-pressed={theme === value} key={value} onClick={() => chooseTheme(value)} title={label} type="button">
                <Icon aria-hidden="true" size={15} weight={theme === value ? "fill" : "regular"} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { PaletteButton } from "@/components/CommandPalette";
import type { Locale, Theme } from "@/lib/i18n/locale";
import { LOCALE_EVENT, saveLocale, saveTheme, THEME_EVENT } from "@/lib/preferences";

export function AppHeader({ theme: initialTheme }: { theme: Theme }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, t } = useI18n();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [isPending, startTransition] = useTransition();
  const navRef = useRef<HTMLElement>(null);

  // On narrow screens the menu scrolls sideways: keep the current page in view and mark which
  // edges still hide links, so the fade appears only where there is more to see.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) {
      return;
    }
    const markEdges = () => {
      nav.classList.toggle("at-start", nav.scrollLeft <= 1);
      nav.classList.toggle("at-end", nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 1);
    };
    // The pill behind the current link slides from the previous page instead of jumping.
    const placeIndicator = () => {
      const target = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (target) {
        nav.style.setProperty("--pill-x", `${target.offsetLeft}px`);
        nav.style.setProperty("--pill-w", `${target.offsetWidth}px`);
      }
      nav.classList.toggle("has-pill", Boolean(target));
    };
    placeIndicator();
    requestAnimationFrame(() => nav.classList.add("pill-ready"));
    const current = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (current && nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2, behavior: "smooth" });
    }
    const onResize = () => {
      markEdges();
      placeIndicator();
    };
    markEdges();
    nav.addEventListener("scroll", markEdges, { passive: true });
    window.addEventListener("resize", onResize);
    // Fonts arriving after the first paint change link widths.
    void document.fonts?.ready.then(placeIndicator);
    return () => {
      nav.removeEventListener("scroll", markEdges);
      window.removeEventListener("resize", onResize);
    };
  }, [pathname, locale]);

  const chooseLocale = useCallback(
    (next: Locale) => {
      if (next === locale) {
        return;
      }
      saveLocale(next);
      // Pages are rendered on the server in the chosen language.
      startTransition(() => router.refresh());
    },
    [locale, router],
  );

  // The command palette changes the theme and language through window events.
  useEffect(() => {
    const onTheme = (event: Event) => setTheme((event as CustomEvent<Theme>).detail);
    const onLocale = (event: Event) => chooseLocale((event as CustomEvent<Locale>).detail);
    window.addEventListener(THEME_EVENT, onTheme);
    window.addEventListener(LOCALE_EVENT, onLocale);
    return () => {
      window.removeEventListener(THEME_EVENT, onTheme);
      window.removeEventListener(LOCALE_EVENT, onLocale);
    };
  }, [chooseLocale]);

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
    saveTheme(next);
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
        <nav aria-label={t("Ana menü", "Main menu")} className="nav" ref={navRef}>
          {links.map((link) => (
            <Link key={link.href} aria-current={pathname === link.href ? "page" : undefined} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="header-tools">
          <PaletteButton />
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Genel bakış" },
  { href: "/analiz", label: "Analiz raporu" },
  { href: "/harita", label: "Harita" },
  { href: "/veri-hatti", label: "Veri hattı" },
];

export function AppHeader() {
  const pathname = usePathname();

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
            İstanbul Trafik Analizi
            <span className="brand-sub">İBB saatlik trafik verisi</span>
          </span>
        </Link>
        <nav aria-label="Ana menü" className="nav">
          {LINKS.map((link) => (
            <Link key={link.href} aria-current={pathname === link.href ? "page" : undefined} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

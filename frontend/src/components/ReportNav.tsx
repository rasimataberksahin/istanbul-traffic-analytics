"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

/** Table of contents that marks the section being read. */
export function ReportNav({ sections }: { sections: { id: string; title: string }[] }) {
  const [current, setCurrent] = useState<string | null>(sections[0]?.id ?? null);
  const { t } = useI18n();

  useEffect(() => {
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.boundingClientRect.top);
          } else {
            visible.delete(entry.target.id);
          }
        }
        // The topmost section inside the reading band wins.
        const top = sections.find((section) => visible.has(section.id));
        if (top) {
          setCurrent(top.id);
        }
      },
      { rootMargin: "-90px 0px -55% 0px" },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) {
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label={t("Rapor bölümleri", "Report sections")} className="report-nav">
      <p className="report-nav-title">{t("İçindekiler", "Contents")}</p>
      <ol>
        {sections.map((section, index) => (
          <li key={section.id}>
            <a aria-current={current === section.id ? "true" : undefined} href={`#${section.id}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

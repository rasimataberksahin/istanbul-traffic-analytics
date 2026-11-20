import Link from "next/link";
import { makeFormat } from "@/lib/format";
import { categoryLabel, severityLabel, tidyTitle } from "@/lib/incidents";
import type { Locale } from "@/lib/i18n/locale";
import { translator } from "@/lib/i18n/locale";
import type { LatestIncident } from "@/lib/types";

interface IncidentTickerProps {
  items: LatestIncident[];
  locale: Locale;
}

/**
 * The newest announcements as a slow ribbon under the page title. It pauses under the pointer
 * or keyboard focus, and becomes a plain scrolling row when motion is reduced.
 */
export function IncidentTicker({ items, locale }: IncidentTickerProps) {
  const t = translator(locale);
  const f = makeFormat(locale);
  if (items.length === 0) {
    return null;
  }
  const time = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  // The timestamps are Istanbul wall-clock times stored without a zone: read them as they are.
  const when = (value: string) => time.format(new Date(`${value.slice(0, 19)}Z`));

  const row = (hidden: boolean) =>
    items.map((item) => (
      <li aria-hidden={hidden || undefined} className="ticker-item" key={`${hidden ? "b" : "a"}-${item.incidentId}`}>
        <Link href={`/olaylar?cell=${item.geohash}#harita`} tabIndex={hidden ? -1 : undefined}>
          <time dateTime={item.startedAt}>{when(item.startedAt)}</time>
          <span className="ticker-kind" data-category={item.category}>
            {item.severity && item.severity !== "unknown" ? severityLabel(item.severity, locale) : categoryLabel(item.category, locale)}
          </span>
          <span className="ticker-title">{tidyTitle(item.title)}</span>
          {item.neighborhood || item.district ? (
            <span className="ticker-place">
              {[item.neighborhood, item.district].filter(Boolean).join(", ")}
              {item.durationMin ? ` · ${f.formatDecimal(item.durationMin)} ${t("dk", "min")}` : ""}
            </span>
          ) : null}
        </Link>
      </li>
    ));

  return (
    <section aria-label={t("Son duyurular", "Latest announcements")} className="ticker">
      <div className="ticker-label">
        <span aria-hidden="true" className="live-dot" />
        <span>{t("Son duyurular", "Latest")}</span>
      </div>
      <div className="ticker-viewport">
        <ul className="ticker-track" style={{ animationDuration: `${Math.max(40, items.length * 7)}s` }}>
          {row(false)}
          {row(true)}
        </ul>
      </div>
    </section>
  );
}

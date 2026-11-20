"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/client";
import { suffix } from "@/lib/i18n/turkish";
import { congestionLevel, istanbulClock, type CongestionLevel } from "@/lib/now";

interface NowCardProps {
  /** Typical vehicle-weighted speed for each hour, from the latest 12 months of traffic data. */
  weekday: (number | null)[];
  weekend: (number | null)[];
  /** Incidents announced per week, by ISO day (index 0 = Monday) and hour. */
  incidentsPerWeek: number[][] | null;
  /** The months the typical speeds come from, already formatted. */
  basis: string;
}

const subscribe = (notify: () => void) => {
  const timer = window.setInterval(notify, 1000);
  return () => window.clearInterval(timer);
};
const now = () => Math.floor(Date.now() / 1000);
const serverNow = () => null;

const LEVELS: Record<CongestionLevel, [string, string]> = {
  free: ["Akıcı", "Flowing"],
  moderate: ["Orta", "Moderate"],
  heavy: ["Yoğun", "Heavy"],
  severe: ["Çok yoğun", "Very heavy"],
};

/**
 * The city right now: Istanbul's clock and what the data says this hour is usually like. The
 * traffic feed ended in January 2025, so these are typical values, not live readings.
 */
export function NowCard({ weekday, weekend, incidentsPerWeek, basis }: NowCardProps) {
  const { locale, t, f } = useI18n();
  const seconds = useSyncExternalStore(subscribe, now, serverNow);
  const clock = seconds === null ? null : istanbulClock(new Date(seconds * 1000), locale);

  const isWeekend = clock ? clock.isoDay >= 6 : false;
  const line = isWeekend ? weekend : weekday;
  const known = line.filter((value): value is number => value !== null);
  const freeFlow = known.length > 0 ? Math.max(...known) : null;
  const hour = clock?.hour ?? null;
  const speedNow = hour === null ? null : (line[hour] ?? null);
  const level = speedNow !== null && freeFlow ? congestionLevel(speedNow, freeFlow) : null;

  // The slowest hour in the next twelve, or now if this is it.
  let peakAhead: { hour: number; speed: number; inHours: number } | null = null;
  if (hour !== null) {
    for (let step = 0; step < 12; step += 1) {
      const next = (hour + step) % 24;
      const speed = line[next];
      if (speed !== null && speed !== undefined && (!peakAhead || speed < peakAhead.speed)) {
        peakAhead = { hour: next, speed, inHours: step };
      }
    }
  }

  const incidentsNow = clock && incidentsPerWeek ? (incidentsPerWeek[clock.isoDay - 1]?.[clock.hour] ?? null) : null;
  const allSlots = incidentsPerWeek?.flat() ?? [];
  const incidentsAverage = allSlots.length > 0 ? allSlots.reduce((sum, value) => sum + value, 0) / allSlots.length : null;
  const incidentRatio = incidentsNow !== null && incidentsAverage ? incidentsNow / incidentsAverage : null;

  const share = speedNow !== null && freeFlow ? (speedNow / freeFlow) * 100 : null;
  const dayLabel = isWeekend ? t("hafta sonu", "weekend") : t("hafta içi", "weekday");

  return (
    <section aria-label={t("İstanbul'da şimdi", "Istanbul right now")} className="now-card">
      <div className="now-head">
        <span className="live-pill">
          <span aria-hidden="true" className="live-dot" />
          {t("Şimdi", "Now")}
        </span>
        <div className="now-clock" aria-live="off">
          <span className="now-time">{clock ? clock.time : "--:--:--"}</span>
          <span className="now-date">{clock ? `${clock.weekdayName}, ${clock.date}` : t("İstanbul saati", "Istanbul time")}</span>
        </div>
        {level ? (
          <span className="now-level" data-level={level}>
            {t(LEVELS[level][0], LEVELS[level][1])}
          </span>
        ) : null}
      </div>

      <div className="now-facts">
        <div className="now-fact">
          <span className="now-fact-label">{t(`Bu saatte tipik hız (${dayLabel})`, `Typical speed this hour (${dayLabel})`)}</span>
          <strong>{speedNow === null ? f.noData : f.formatSpeed(speedNow)}</strong>
          <span className="now-fact-note">
            {share === null
              ? ""
              : t(`Gecenin serbest akışının ${suffix(f.formatPercent(share), "possessive")}`, `${f.formatPercent(share)} of free-flow speed`)}
          </span>
        </div>
        <div className="now-fact">
          <span className="now-fact-label">{t("Önümüzdeki 12 saatin en yoğunu", "Busiest of the next 12 hours")}</span>
          <strong>{peakAhead ? f.formatHour(peakAhead.hour) : f.noData}</strong>
          <span className="now-fact-note">
            {peakAhead === null
              ? ""
              : peakAhead.inHours === 0
                ? t("Şu an, ", "Right now, ") + f.formatSpeed(peakAhead.speed)
                : t(
                    `${peakAhead.inHours} saat sonra, ${f.formatSpeed(peakAhead.speed)}`,
                    `In ${peakAhead.inHours} h, ${f.formatSpeed(peakAhead.speed)}`,
                  )}
          </span>
        </div>
        <div className="now-fact">
          <span className="now-fact-label">{t("Bu gün ve saatte duyurulan olay", "Incidents announced at this day and hour")}</span>
          <strong>{incidentsNow === null ? f.noData : t(`Haftada ${f.formatDecimal(incidentsNow)}`, `${f.formatDecimal(incidentsNow)} a week`)}</strong>
          <span className="now-fact-note">
            {incidentRatio === null
              ? ""
              : incidentRatio >= 1.15
                ? t(`Haftalık saat ortalamasının ${f.formatDecimal(incidentRatio)} katı`, `${f.formatDecimal(incidentRatio)}× the average hour`)
                : incidentRatio <= 0.85
                  ? t("Ortalama bir saatten sakin", "Quieter than an average hour")
                  : t("Ortalama bir saat kadar", "About an average hour")}
          </span>
        </div>
      </div>

      <div
        aria-label={t(
          `${dayLabel} günlerinde saatlik tipik yoğunluk, şu anki saat işaretli`,
          `Typical congestion by hour on ${dayLabel}s, the current hour marked`,
        )}
        className="now-strip"
        role="img"
      >
        {line.map((speed, index) => {
          const congestion = speed !== null && freeFlow ? Math.max(0, 1 - speed / freeFlow) : 0;
          const state = hour === null ? "" : index === hour ? "current" : index < hour ? "past" : "";
          return (
            <span
              className="now-bar"
              data-level={speed !== null && freeFlow ? congestionLevel(speed, freeFlow) : undefined}
              data-state={state || undefined}
              key={index}
              style={{ height: `${Math.round(14 + congestion * 86)}%` }}
              title={`${f.formatHour(index)} · ${speed === null ? f.noData : f.formatSpeed(speed)}`}
            />
          );
        })}
      </div>
      <div aria-hidden="true" className="now-axis">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>

      <p className="now-note">
        {t(
          `Saat İstanbul saatidir ve her saniye güncellenir. Trafik verisi Ocak 2025'te bittiği için hızlar ${basis} döneminin aynı saatlerinin ortalamasıdır, olaylar son 12 ayın duyurularıdır. Resmî tatiller ayrılmaz.`,
          `The clock is Istanbul time and ticks every second. The traffic feed ended in January 2025, so speeds are the average of the same hours in ${basis} and incidents are the last 12 months of announcements. Public holidays are not separated.`,
        )}{" "}
        <Link href="/olaylar">{t("Olaylara git", "Go to incidents")}</Link>
      </p>
    </section>
  );
}

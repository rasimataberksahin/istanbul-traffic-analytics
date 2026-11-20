"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/client";
import { suffix } from "@/lib/i18n/turkish";
import { congestionLevel, dialAngle, istanbulClock, polar, ringSegment, type CongestionLevel } from "@/lib/now";

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

const HEADLINES: Record<CongestionLevel, [string, string]> = {
  free: ["Bu saatte yollar genelde açık.", "Roads are usually clear at this hour."],
  moderate: ["Bu saatte trafik genelde orta yoğunlukta.", "Traffic is usually moderate at this hour."],
  heavy: ["Bu saatte trafik genelde yoğun.", "Traffic is usually heavy at this hour."],
  severe: ["Bu saatte trafik genelde çok yoğun.", "Traffic is usually very heavy at this hour."],
};

// Dial geometry, in SVG units.
const SIZE = 280;
const C = SIZE / 2;
const INNER = 74;
const BASE = 12;
const REACH = 40;
const GAP = 1.4;
const LABEL_RADIUS = 132;

type DayView = "weekday" | "weekend";

/**
 * The city right now: Istanbul's clock on a 24-hour dial of what each hour is usually like, with
 * a hand at the current minute. The traffic feed ended in January 2025, so these are typical
 * values, not live readings.
 */
export function NowCard({ weekday, weekend, incidentsPerWeek, basis }: NowCardProps) {
  const { locale, t, f } = useI18n();
  const seconds = useSyncExternalStore(subscribe, now, serverNow);
  const clock = seconds === null ? null : istanbulClock(new Date(seconds * 1000), locale);
  const [chosen, setChosen] = useState<DayView | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const today: DayView = clock && clock.isoDay >= 6 ? "weekend" : "weekday";
  const view = chosen ?? today;
  const isToday = view === today;
  const line = view === "weekend" ? weekend : weekday;
  const todayLine = today === "weekend" ? weekend : weekday;

  const freeFlowOf = (values: (number | null)[]) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length > 0 ? Math.max(...known) : null;
  };
  const freeFlow = freeFlowOf(line);
  const todayFreeFlow = freeFlowOf(todayLine);

  const hour = clock?.hour ?? null;
  const speedNow = hour === null ? null : (todayLine[hour] ?? null);
  const level = speedNow !== null && todayFreeFlow ? congestionLevel(speedNow, todayFreeFlow) : null;

  // The slowest hour in the next twelve, or now if this is it.
  let peakAhead: { hour: number; speed: number; inHours: number } | null = null;
  if (hour !== null) {
    for (let step = 0; step < 12; step += 1) {
      const next = (hour + step) % 24;
      const speed = todayLine[next];
      if (speed !== null && speed !== undefined && (!peakAhead || speed < peakAhead.speed)) {
        peakAhead = { hour: next, speed, inHours: step };
      }
    }
  }

  const incidentsNow = clock && incidentsPerWeek ? (incidentsPerWeek[clock.isoDay - 1]?.[clock.hour] ?? null) : null;
  const allSlots = incidentsPerWeek?.flat() ?? [];
  const incidentsAverage = allSlots.length > 0 ? allSlots.reduce((sum, value) => sum + value, 0) / allSlots.length : null;
  const incidentRatio = incidentsNow !== null && incidentsAverage ? incidentsNow / incidentsAverage : null;

  const share = speedNow !== null && todayFreeFlow ? (speedNow / todayFreeFlow) * 100 : null;
  const dayLabel = (value: DayView) => (value === "weekend" ? t("hafta sonu", "weekend") : t("hafta içi", "weekday"));

  const handAngle = clock ? dialAngle(clock.hour, clock.minute, clock.second) : null;
  const [handX, handY] = handAngle === null ? [C, C] : polar(C, C, INNER + BASE + REACH + 8, handAngle);
  const [tailX, tailY] = handAngle === null ? [C, C] : polar(C, C, INNER + 1, handAngle);

  const focus = hovered === null ? null : { hour: hovered, speed: line[hovered] ?? null };
  const focusLevel = focus && focus.speed !== null && freeFlow ? congestionLevel(focus.speed, freeFlow) : null;
  const [hh, mm, ss] = clock ? clock.time.split(":") : ["--", "--", "--"];

  return (
    <section aria-label={t("İstanbul'da şimdi", "Istanbul right now")} className="now-card">
      <div className="now-dial-wrap">
        <svg
          aria-label={t(
            `${dayLabel(view)} günlerinde saatlik tipik yoğunluk, 24 saatlik kadran. Kol şu anki İstanbul saatini gösterir.`,
            `Typical congestion by hour on ${dayLabel(view)}s as a 24-hour dial. The hand shows the current time in Istanbul.`,
          )}
          className="now-dial"
          onPointerLeave={() => setHovered(null)}
          role="img"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
        >
          <circle className="dial-face" cx={C} cy={C} r={INNER + BASE + REACH + 4} />
          <circle className="dial-inner" cx={C} cy={C} r={INNER - 4} />
          {line.map((speed, index) => {
            const congestion = speed !== null && freeFlow ? Math.max(0, 1 - speed / freeFlow) : 0;
            const outer = INNER + BASE + Math.min(1, congestion / 0.5) * REACH;
            const state = !isToday || hour === null ? "" : index === hour ? "current" : index < hour ? "past" : "";
            return (
              <path
                className="dial-hour"
                d={ringSegment(C, C, INNER, outer, index * 15 + GAP, (index + 1) * 15 - GAP)}
                data-active={hovered === index || undefined}
                data-level={speed !== null && freeFlow ? congestionLevel(speed, freeFlow) : "none"}
                data-state={state || undefined}
                key={index}
                onPointerEnter={() => setHovered(index)}
                style={{ animationDelay: `${index * 18}ms` }}
              >
                <title>{`${f.formatHour(index)} · ${speed === null ? f.noData : f.formatSpeed(speed)}`}</title>
              </path>
            );
          })}
          {[0, 6, 12, 18].map((tick) => {
            const [x, y] = polar(C, C, LABEL_RADIUS, tick * 15);
            return (
              <text className="dial-tick" dominantBaseline="middle" key={tick} textAnchor="middle" x={x} y={y}>
                {String(tick).padStart(2, "0")}
              </text>
            );
          })}
          {handAngle !== null ? (
            <g className="dial-hand">
              <line x1={tailX} x2={handX} y1={tailY} y2={handY} />
              <circle cx={handX} cy={handY} r={4.5} />
            </g>
          ) : null}
          <g className="dial-center">
            {focus ? (
              <>
                <text className="dial-center-main" textAnchor="middle" x={C} y={C - 4}>
                  {f.formatHour(focus.hour)}
                </text>
                <text className="dial-center-sub" textAnchor="middle" x={C} y={C + 20}>
                  {focus.speed === null ? f.noData : f.formatSpeed(focus.speed)}
                </text>
                {focusLevel ? (
                  <text className="dial-center-note" textAnchor="middle" x={C} y={C + 38}>
                    {t(LEVELS[focusLevel][0], LEVELS[focusLevel][1])}
                  </text>
                ) : null}
              </>
            ) : (
              <>
                <text className="dial-center-main" textAnchor="middle" x={C} y={C - 2}>
                  {`${hh}:${mm}`}
                  <tspan className="dial-center-seconds" dx={2}>
                    {ss}
                  </tspan>
                </text>
                <text className="dial-center-note" textAnchor="middle" x={C} y={C + 22}>
                  {t("İstanbul saati", "Istanbul time")}
                </text>
              </>
            )}
          </g>
        </svg>
        <div aria-label={t("Kadranda gösterilen gün tipi", "Day type shown on the dial")} className="presets now-toggle" role="group">
          {(["weekday", "weekend"] as const).map((value) => (
            <button aria-pressed={view === value} key={value} onClick={() => setChosen(value === today ? null : value)} type="button">
              {value === "weekend" ? t("Hafta sonu", "Weekend") : t("Hafta içi", "Weekday")}
              {clock && value === today ? <span className="now-toggle-today">{t("bugün", "today")}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="now-body">
        <div className="now-head">
          <span className="live-pill">
            <span aria-hidden="true" className="live-dot" />
            {t("Şimdi", "Now")}
          </span>
          <span className="now-date">{clock ? `${clock.weekdayName}, ${clock.date}` : t("İstanbul saati", "Istanbul time")}</span>
          {level ? (
            <span className="now-level" data-level={level}>
              {t(LEVELS[level][0], LEVELS[level][1])}
            </span>
          ) : null}
        </div>

        <h2 className="now-title">
          {level ? t(HEADLINES[level][0], HEADLINES[level][1]) : t("İstanbul'un bu saati genelde nasıl geçer?", "What is this hour usually like in Istanbul?")}
        </h2>

        <div className="now-facts">
          <div className="now-fact">
            <span className="now-fact-label">{t(`Bu saatte tipik hız (${dayLabel(today)})`, `Typical speed this hour (${dayLabel(today)})`)}</span>
            <strong>{speedNow === null ? f.noData : f.formatSpeed(speedNow)}</strong>
            <span className="now-fact-note">
              {share === null
                ? ""
                : t(`Gecenin serbest akışının ${suffix(f.formatPercent(share), "possessive")}`, `${f.formatPercent(share)} of free-flow speed`)}
            </span>
            {share !== null ? (
              <span aria-hidden="true" className="now-meter">
                <span style={{ width: `${Math.min(100, share)}%` }} />
              </span>
            ) : null}
          </div>
          <div className="now-fact">
            <span className="now-fact-label">{t("Önümüzdeki 12 saatin en yoğunu", "Busiest of the next 12 hours")}</span>
            <strong>{peakAhead ? f.formatHour(peakAhead.hour) : f.noData}</strong>
            <span className="now-fact-note">
              {peakAhead === null
                ? ""
                : peakAhead.inHours === 0
                  ? t("Şu an, ", "Right now, ") + f.formatSpeed(peakAhead.speed)
                  : t(`${peakAhead.inHours} saat sonra, ${f.formatSpeed(peakAhead.speed)}`, `In ${peakAhead.inHours} h, ${f.formatSpeed(peakAhead.speed)}`)}
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

        <ul aria-label={t("Renkler", "Colours")} className="now-legend">
          {(Object.keys(LEVELS) as CongestionLevel[]).map((key) => (
            <li data-level={key} key={key}>
              {t(LEVELS[key][0], LEVELS[key][1])}
            </li>
          ))}
        </ul>

        <p className="now-note">
          {t(
            `Kadrandaki her dilim bir saattir; dilim uzadıkça o saat gecenin serbest akışından o kadar yavaştır. Trafik verisi Ocak 2025'te bittiği için hızlar ${basis} döneminin aynı saatlerinin ortalamasıdır, olaylar son 12 ayın duyurularıdır.`,
            `Each slice of the dial is an hour; the longer it is, the slower that hour is than free flow at night. The traffic feed ended in January 2025, so speeds are the average of the same hours in ${basis} and incidents are the last 12 months of announcements.`,
          )}{" "}
          <Link href="/olaylar">{t("Olaylara git", "Go to incidents")}</Link>
        </p>
      </div>
    </section>
  );
}

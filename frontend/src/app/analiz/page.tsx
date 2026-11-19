import type { Metadata } from "next";
import Link from "next/link";
import { ReportNav } from "@/components/ReportNav";
import { BandChart } from "@/components/charts/BandChart";
import { CalendarHeatmap } from "@/components/charts/CalendarHeatmap";
import { TrafficMap, type MapMode } from "@/components/charts/TrafficMap";
import { MatrixHeatmap } from "@/components/charts/MatrixHeatmap";
import { SeriesChart } from "@/components/charts/SeriesChart";
import {
  ChartCard,
  ColumnBars,
  DataTable,
  DivergingBars,
  EmptyState,
  Finding,
  ReportSection,
  makeDelta,
  StatTile,
  type StatDelta,
} from "@/components/ui";
import {
  getCalendar,
  getDayOfWeekHour,
  getHolidayEffects,
  getLocationChanges,
  getMonthHour,
  getMonthlyInsights,
  getPeriodProfiles,
  getReliability,
} from "@/lib/api";
import { formatHour, makeFormat } from "@/lib/format";
import { translator } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { dayName, term } from "@/lib/i18n/terms";
import {
  compareYears,
  comparableWeekdays,
  findVolumeBreak,
  groupPeriods,
  maximumHour,
  mean,
  minimumHour,
  periodLabel,
  rankWeekdays,
  widestSpread,
} from "@/lib/insights";
import { placeLabel } from "@/lib/places";
import { changeClass } from "@/lib/scale";
import type { MonthlyInsight } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale());
  return { title: t("Analiz raporu", "Analysis report") };
}

export const dynamic = "force-dynamic";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HOUR_TICKS = HOURS.filter((hour) => hour % 3 === 0).map((hour) => ({ index: hour, label: formatHour(hour) }));
const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

function yearAverage(months: MonthlyInsight[], year: number, read: (month: MonthlyInsight) => number | null) {
  return mean(months.filter((month) => month.month.startsWith(String(year))), read);
}

/** Six thresholds that split the values into seven equally sized color classes. */
function quantileThresholds(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const thresholds = [1, 2, 3, 4, 5, 6].map((step) => Math.round(sorted[Math.floor((sorted.length * step) / 7)] ?? 0));
  return thresholds.map((value, index) => (index > 0 && value <= (thresholds[index - 1] ?? 0) ? (thresholds[index - 1] ?? 0) + 1 : value));
}

export default async function AnalysisPage() {
  const locale = await getLocale();
  const t = translator(locale);
  const {
    formatLargeCount,
    formatDecimal,
    formatIndex,
    formatInteger,
    formatLongDate,
    formatMonth,
    formatMonthIndex,
    formatPercent,
    formatShortDate,
    formatShortMonth,
    formatSigned,
    formatSignedPercent,
    formatSpeed,
    noData,
    speedUnit,
  } = makeFormat(locale);
  const day = (name: string) => dayName(name, locale);

  const SECTIONS = [
    { id: "ozet", title: t("Özet", "Summary") },
    { id: "aylik-trend", title: t("Aylık hız", "Monthly speed") },
    { id: "yillik", title: t("Yıllık karşılaştırma", "Year on year") },
    { id: "tikaniklik", title: t("Tıkanıklık", "Congestion") },
    { id: "mevsimsellik", title: t("Ay ve saat", "Month and hour") },
    { id: "haftanin-gunleri", title: t("Haftanın günleri", "Days of the week") },
    { id: "takvim", title: t("Takvim", "Calendar") },
    { id: "donemler", title: t("Okul, tatil, Ramazan", "School, holidays, Ramadan") },
    { id: "tatiller", title: t("Resmî tatiller", "Public holidays") },
    { id: "guvenilirlik", title: t("Öngörülebilirlik", "Predictability") },
    { id: "konum-degisimi", title: t("Bölgesel değişim", "Change by area") },
    { id: "veri-kapsami", title: t("Veri kapsamı ve yöntem", "Coverage and method") },
  ];

  const changeModes: MapMode[] = [
    {
      id: "change",
      label: t("Akşam zirvesi hız değişimi", "Change in evening peak speed"),
      palette: "div",
      legend: { low: t("6 km/sa üstü hızlandı", "more than 6 km/h faster"), high: t("6 km/sa üstü yavaşladı", "more than 6 km/h slower") },
      extrude: "magnitude",
    },
  ];

  function yearDelta(
    current: number | null | undefined,
    previous: number | null | undefined,
    year: number,
    higherIsBetter: boolean,
    digits = 1,
  ): StatDelta | undefined {
    if (current === null || current === undefined || previous === null || previous === undefined) {
      return undefined;
    }
    const change = current - previous;
    return makeDelta(change, t(`${year} ile fark: ${formatSigned(change, digits)}`, `vs ${year}: ${formatSigned(change, digits)}`), higherIsBetter, 10 ** -digits / 2);
  }

  /** Describes in how many comparable months the evening got faster or slower. */
  function yearSummary(pairs: { change: number | null }[]): string {
    const compared = pairs.filter((pair) => pair.change !== null);
    const faster = compared.filter((pair) => (pair.change ?? 0) > 0).length;
    const slower = compared.filter((pair) => (pair.change ?? 0) < 0).length;
    if (faster === compared.length) {
      return t(
        `Karşılaştırılan ${compared.length} ayın hepsinde akşam zirvesi bir önceki yılın aynı ayından daha hızlıydı.`,
        `In all ${compared.length} compared months the evening peak was faster than in the same month a year earlier.`,
      );
    }
    if (slower === compared.length) {
      return t(
        `Karşılaştırılan ${compared.length} ayın hepsinde akşam zirvesi bir önceki yılın aynı ayından daha yavaştı.`,
        `In all ${compared.length} compared months the evening peak was slower than in the same month a year earlier.`,
      );
    }
    return t(
      `Karşılaştırılan ${compared.length} ayın ${faster} tanesinde akşam zirvesi hızlandı, ${slower} tanesinde yavaşladı.`,
      `Of ${compared.length} compared months, the evening peak got faster in ${faster} and slower in ${slower}.`,
    );
  }

  const [monthly, monthHour, dayOfWeek, calendar, periods, holidays, reliability, changes] = await Promise.all([
    getMonthlyInsights(),
    getMonthHour(),
    getDayOfWeekHour(),
    getCalendar(),
    getPeriodProfiles(),
    getHolidayEffects(),
    getReliability(),
    getLocationChanges(),
  ]);

  if (monthly.length === 0) {
    return (
      <EmptyState
        title={t("Henüz veri yüklenmedi", "No data loaded yet")}
        message={t("Analiz raporu için ETL hattıyla en az bir ay yükleyin.", "Load at least one month with the ETL pipeline to see the report.")}
      />
    );
  }

  const first = monthly[0] as MonthlyInsight;
  const last = monthly.at(-1) as MonthlyInsight;
  const totalRows = monthly.reduce((sum, month) => sum + month.rowCount, 0);
  const evening = compareYears(monthly, (month) => month.eveningPeakSpeedKmh);
  const congestion = compareYears(monthly, (month) => month.congestionIndex);
  const currentYear = evening?.currentYear ?? Number(last.month.slice(0, 4));
  const previousYearNumber = currentYear - 1;

  const comparable = evening !== null;
  const eveningNow = yearAverage(monthly, currentYear, (month) => month.eveningPeakSpeedKmh);
  const eveningBefore = yearAverage(monthly, previousYearNumber, (month) => month.eveningPeakSpeedKmh);
  const congestionNow = yearAverage(monthly, currentYear, (month) => month.congestionIndex);
  const congestionBefore = yearAverage(monthly, previousYearNumber, (month) => month.congestionIndex);
  const hoursNow = yearAverage(monthly, currentYear, (month) => month.congestedHoursPerWeekday);
  const hoursBefore = yearAverage(monthly, previousYearNumber, (month) => month.congestedHoursPerWeekday);

  const withEvening = monthly.filter((month) => month.eveningPeakSpeedKmh !== null);
  const slowestMonth = withEvening.reduce((a, b) => ((b.eveningPeakSpeedKmh ?? 0) < (a.eveningPeakSpeedKmh ?? 0) ? b : a));
  const fastestMonth = withEvening.reduce((a, b) => ((b.eveningPeakSpeedKmh ?? 0) > (a.eveningPeakSpeedKmh ?? 0) ? b : a));
  const mostCongested = monthly.reduce((a, b) => ((b.congestionIndex ?? 0) > (a.congestionIndex ?? 0) ? b : a));

  // Month by hour: when does the evening low arrive in each month?
  const monthRows = monthly.map((month) => ({ key: month.month, label: formatShortMonth(month.month), title: formatMonth(month.month) }));
  const eveningLowHours = monthly.map((month) => ({
    month,
    low: minimumHour(
      HOURS.map((hour) => monthHour.find((cell) => cell.month === month.month && cell.hourOfDay === hour)?.weightedAverageSpeedKmh ?? null),
      12,
      23,
    ),
  }));
  const lowHourCounts = new Map<number, number>();
  for (const { low } of eveningLowHours) {
    if (low) {
      lowHourCounts.set(low.hour, (lowHourCounts.get(low.hour) ?? 0) + 1);
    }
  }
  const usualLowHour = [...lowHourCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 18;
  const shiftedMonths = eveningLowHours.filter(({ low }) => low && low.hour !== usualLowHour);

  // Day of week by hour.
  const dayRows = [1, 2, 3, 4, 5, 6, 7].flatMap((iso) => {
    const cell = dayOfWeek.find((item) => item.isoDayOfWeek === iso);
    return cell ? [{ key: String(iso), label: day(cell.dayName), title: day(cell.dayName) }] : [];
  });
  const slowestDayHour = dayOfWeek.reduce<(typeof dayOfWeek)[number] | null>(
    (slowest, cell) =>
      cell.weightedAverageSpeedKmh !== null && (slowest === null || cell.weightedAverageSpeedKmh < (slowest.weightedAverageSpeedKmh ?? Infinity))
        ? cell
        : slowest,
    null,
  );
  const eveningOf = (iso: number) =>
    mean(
      dayOfWeek.filter((cell) => cell.isoDayOfWeek === iso && cell.hourOfDay >= 17 && cell.hourOfDay <= 19),
      (cell) => cell.weightedAverageSpeedKmh,
    );
  const weekdayEvenings = [1, 2, 3, 4, 5].map((iso) => ({ iso, name: dayRows.find((row) => row.key === String(iso))?.label ?? "", speed: eveningOf(iso) }));
  const worstEvening = weekdayEvenings.reduce((a, b) => ((b.speed ?? Infinity) < (a.speed ?? Infinity) ? b : a));
  const bestEvening = weekdayEvenings.reduce((a, b) => ((b.speed ?? -Infinity) > (a.speed ?? -Infinity) ? b : a));

  // Calendar.
  const eveningSpeeds = comparableWeekdays(calendar).map((item) => item.eveningSpeedKmh);
  const calendarThresholds = quantileThresholds(eveningSpeeds.length ? eveningSpeeds : [40, 45, 50, 55, 60, 65, 70]);
  const { slowest: slowDays, fastest: fastDays } = rankWeekdays(calendar, 10);

  // Periods.
  const periodProfiles = groupPeriods(periods);
  const term_ = periodProfiles.find((profile) => profile.period === "school_term");
  const summer = periodProfiles.find((profile) => profile.period === "summer_break");
  const ramadan = periodProfiles.find((profile) => profile.period === "ramadan");
  const termLow = term_ ? minimumHour(term_.speeds, 12, 23) : null;
  const ramadanLow = ramadan ? minimumHour(ramadan.speeds, 12, 23) : null;
  const summerLow = summer ? minimumHour(summer.speeds, 12, 23) : null;
  const morningOf = (values: (number | null)[]) => mean([7, 8, 9], (hour) => values[hour] ?? null);
  const termMorning = term_ ? morningOf(term_.speeds) : null;
  const summerMorning = summer ? morningOf(summer.speeds) : null;
  // Ramadan shifts the volume peak before iftar; compare the peak with 19:00 in both periods.
  const IFTAR_HOUR = 19;
  const termPeak = term_ ? maximumHour(term_.vehicles, 12, 23) : null;
  const ramadanPeak = ramadan ? maximumHour(ramadan.vehicles, 12, 23) : null;
  const dropAfterPeak = (vehicles: (number | null)[] | undefined, peak: { value: number } | null) =>
    vehicles && peak && vehicles[IFTAR_HOUR] ? ((vehicles[IFTAR_HOUR] ?? 0) / peak.value - 1) * 100 : null;
  const ramadanIftarDrop = dropAfterPeak(ramadan?.vehicles, ramadanPeak);
  const termIftarDrop = dropAfterPeak(term_?.vehicles, termPeak);

  // Holidays.
  const measuredHolidays = holidays.filter((holiday) => holiday.speedChangeKmh !== null);
  const quietestHoliday = measuredHolidays.reduce<(typeof holidays)[number] | null>(
    (quietest, holiday) => (quietest === null || (holiday.volumeChangePct ?? 0) < (quietest.volumeChangePct ?? 0) ? holiday : quietest),
    null,
  );

  // Reliability.
  const widest = widestSpread(reliability);
  const quietHour = reliability.find((point) => point.hourOfDay === 3);

  // Location changes.
  const located = changes.locations;
  const slowerShare = located.length ? (located.filter((cell) => cell.speedChangeKmh < -1).length / located.length) * 100 : null;
  const fasterShare = located.length ? (located.filter((cell) => cell.speedChangeKmh > 1).length / located.length) * 100 : null;
  const medianChange = located.length ? [...located].sort((a, b) => a.speedChangeKmh - b.speedChangeKmh)[Math.floor(located.length / 2)]?.speedChangeKmh ?? null : null;
  const worsened = located.slice(0, 10);
  const improved = [...located].reverse().slice(0, 10);

  const lowestCoverage = monthly.reduce((a, b) => (b.coveragePct < a.coveragePct ? b : a));
  const volumeBreak = findVolumeBreak(monthly);
  const hourCol = t("Saat", "Hour");
  const monthCol = t("Ay", "Month");
  const percent = (value: number) => (locale === "en" ? `${Math.round(value)}%` : `%${Math.round(value)}`);

  const ramadanFinding =
    termPeak && ramadanPeak && ramadanIftarDrop !== null && termIftarDrop !== null ? (
      <Finding
        title={
          ramadanPeak.hour !== termPeak.hour
            ? t(`Ramazan'da trafik ${formatHour(ramadanPeak.hour)}'de zirve yapıyor`, `In Ramadan traffic peaks at ${formatHour(ramadanPeak.hour)}`)
            : t(`Ramazan'da iftar saatinde trafik ${formatSignedPercent(ramadanIftarDrop)}`, `In Ramadan traffic changes ${formatSignedPercent(ramadanIftarDrop)} at iftar`)
        }
      >
        {t(
          `Okul döneminde akşam hacmi ${formatHour(termPeak.hour)}'de zirve yapar ve 19:00'a kadar ${formatSignedPercent(termIftarDrop)} değişir. Ramazan'da zirve ${formatHour(ramadanPeak.hour)}'e çekilir, iftar saati 19:00'da hücre başına araç zirveye göre ${formatSignedPercent(ramadanIftarDrop)} değişir. En yavaş saat iki dönemde de ${formatHour(ramadanLow?.hour ?? 18)}.`,
          `In the school term evening volume peaks at ${formatHour(termPeak.hour)} and changes ${formatSignedPercent(termIftarDrop)} by 19:00. In Ramadan the peak moves to ${formatHour(ramadanPeak.hour)}, and at iftar (19:00) vehicles per cell are ${formatSignedPercent(ramadanIftarDrop)} against the peak. The slowest hour is ${formatHour(ramadanLow?.hour ?? 18)} in both periods.`,
        )}
      </Finding>
    ) : null;

  return (
    <>
      <header className="page-title report-title">
        <p className="eyebrow">{t("Analiz raporu", "Analysis report")}</p>
        <h1>{t(`İstanbul trafiği, ${formatMonth(first.month)} - ${formatMonth(last.month)}`, `Istanbul traffic, ${formatMonth(first.month)} - ${formatMonth(last.month)}`)}</h1>
        <p>
          {t(
            `${formatInteger(monthly.length)} ayda ${formatLargeCount(totalRows)} saatlik ölçümün uzun dönemli analizi. Bölümler sırayla okunabilir veya içindekiler listesinden doğrudan açılabilir. Metindeki bulgular veriden hesaplanır, yeni bir ay yüklendiğinde kendiliğinden güncellenir.`,
            `A long-term analysis of ${formatLargeCount(totalRows)} hourly readings over ${formatInteger(monthly.length)} months. Read the sections in order or jump from the contents list. The findings are computed from the data and update when a new month is loaded.`,
          )}
        </p>
      </header>

      <div className="report">
        <ReportNav sections={SECTIONS} />

        <div className="report-body">
          <ReportSection
            id="ozet"
            lead={t(
              `${currentYear} yılının aylık ortalamaları ${previousYearNumber} ile karşılaştırılır. Okların yönü trafiğin iyileştiğini veya kötüleştiğini gösterir.`,
              `Monthly averages of ${currentYear} are compared with ${previousYearNumber}. The arrows show whether traffic got better or worse.`,
            )}
            number={1}
            title={t("Dönemin özeti", "Summary of the period")}
          >
            <section className="stats" aria-label={t("Yıllık göstergeler", "Yearly figures")}>
              <StatTile
                info={t(
                  "Veritabanına yüklenmiş ay sayısı ve bu aylardaki toplam saatlik ölçüm satırı.",
                  "The number of months loaded into the database and the total hourly rows in them.",
                )}
                label={t("Kapsanan dönem", "Period covered")}
                note={t(`${formatInteger(totalRows)} satır`, `${formatInteger(totalRows)} rows`)}
                value={t(`${formatInteger(monthly.length)} ay`, `${formatInteger(monthly.length)} months`)}
              />
              <StatTile
                delta={comparable ? yearDelta(eveningNow, eveningBefore, previousYearNumber, true) : undefined}
                info={t(
                  "Hafta içi, resmî tatil olmayan günlerin 17:00-19:59 arasındaki araç ağırlıklı şehir hızının yıllık ortalaması. Yükselmesi akşamların rahatladığını gösterir.",
                  "The yearly average of the vehicle-weighted city speed between 17:00 and 19:59 on non-holiday weekdays. A rise means evenings got easier.",
                )}
                label={t(`Akşam zirvesi hızı, ${currentYear}`, `Evening peak speed, ${currentYear}`)}
                note={t("Hafta içi 17:00-19:59", "Weekdays 17:00-19:59")}
                value={formatSpeed(eveningNow)}
              />
              <StatTile
                delta={comparable ? yearDelta(congestionNow, congestionBefore, previousYearNumber, false, 3) : undefined}
                info={t(
                  "1 - akşam hızı / gece hızı. Şehrin akşamını kendi gecesiyle kıyaslar: 0 hiç yavaşlama yok, 0,40 akşam hızının gecenin %60'ına indiği anlamına gelir. Düşmesi iyidir.",
                  "1 - evening speed / night speed. It compares the city's evening with its own night: 0 means no slowdown, 0.40 means the evening runs at 60% of the night speed. Lower is better.",
                )}
                label={t(`Tıkanıklık endeksi, ${currentYear}`, `Congestion index, ${currentYear}`)}
                note={t("1 - akşam hızı / gece hızı", "1 - evening speed / night speed")}
                value={congestionNow === null ? noData : formatIndex(congestionNow)}
              />
              <StatTile
                delta={comparable ? yearDelta(hoursNow, hoursBefore, previousYearNumber, false) : undefined}
                info={t(
                  "Bir iş gününde şehir hızının gece hızının %75'inin altında kaldığı saat sayısı. Trafiğin günün ne kadarına yayıldığını gösterir; azalması iyidir.",
                  "How many hours of a workday the city speed stays below 75% of its night speed. It shows how much of the day is congested; fewer is better.",
                )}
                label={t(`Yoğun saat / iş günü, ${currentYear}`, `Congested hours / workday, ${currentYear}`)}
                note={t("Şehir hızı gece hızının %75'inin altında", "City speed below 75% of night speed")}
                value={hoursNow === null ? noData : t(`${formatDecimal(hoursNow)} saat`, `${formatDecimal(hoursNow)} h`)}
              />
            </section>
            <div className="findings-grid">
              <Finding title={t(`En yavaş ay: ${formatMonth(slowestMonth.month)}`, `Slowest month: ${formatMonth(slowestMonth.month)}`)}>
                {t(
                  `Hafta içi akşam zirvesinde şehir ortalaması ${formatSpeed(slowestMonth.eveningPeakSpeedKmh)} oldu. En rahat ay ${formatMonth(fastestMonth.month)} (${formatSpeed(fastestMonth.eveningPeakSpeedKmh)}).`,
                  `The city averaged ${formatSpeed(slowestMonth.eveningPeakSpeedKmh)} in the weekday evening peak. The easiest month was ${formatMonth(fastestMonth.month)} (${formatSpeed(fastestMonth.eveningPeakSpeedKmh)}).`,
                )}
              </Finding>
              {evening?.averageChange !== null && evening?.averageChange !== undefined ? (
                <Finding
                  title={t(
                    `Akşamlar ${evening.currentYear}'te ortalama ${formatSigned(evening.averageChange)} km/sa`,
                    `Evenings in ${evening.currentYear}: ${formatSigned(evening.averageChange)} km/h on average`,
                  )}
                >
                  {yearSummary(evening.pairs)}
                </Finding>
              ) : null}
              {ramadanFinding}
              {slowerShare !== null && changes.currentFrom ? (
                <Finding title={t(`Hücrelerin ${formatPercent(slowerShare)}'i yavaşladı`, `${formatPercent(slowerShare)} of cells got slower`)}>
                  {t(
                    `Son 12 ayın akşam zirvesi önceki 12 ayla karşılaştırıldığında hücrelerin ${formatPercent(fasterShare ?? 0)}'i hızlandı, kalanında değişim 1 km/sa'in altında.`,
                    `Comparing the evening peak of the last 12 months with the 12 before, ${formatPercent(fasterShare ?? 0)} of cells got faster and the rest changed by less than 1 km/h.`,
                  )}
                </Finding>
              ) : null}
            </div>
          </ReportSection>

          <ReportSection
            id="aylik-trend"
            lead={t(
              "Her ay için dört zaman diliminin araç ağırlıklı şehir hızı. Gece hızı serbest akışın, akşam zirvesi ise en yoğun saatlerin göstergesidir.",
              "The vehicle-weighted city speed in four time windows for every month. Night speed stands for free flow, the evening peak for the busiest hours.",
            )}
            number={2}
            title={t("Aylar boyunca hız", "Speed month by month")}
          >
            <div className="grid">
              <ChartCard
                className="span-8"
                info={t(
                  "Dört çizgi aynı ayın dört farklı saat dilimini gösterir. Gece çizgisi ile akşam çizgisi arasındaki açıklık ne kadar büyükse o ay akşam trafiği o kadar ağırdır.",
                  "The four lines are four time windows of the same month. The wider the gap between the night and evening lines, the heavier that month's evening traffic.",
                )}
                subtitle={t("Hafta içi zirveler resmî tatilleri dışarıda bırakır", "Weekday peaks exclude public holidays")}
                table={
                  <DataTable
                    columns={[monthCol, t("Gece 01-04", "Night 01-04"), t("Gün geneli", "All day"), t("Sabah 07-09", "Morning 07-09"), t("Akşam 17-19", "Evening 17-19")]}
                    rows={monthly.map((month) => [
                      formatMonth(month.month),
                      month.nightSpeedKmh === null ? "-" : formatDecimal(month.nightSpeedKmh),
                      month.weightedAverageSpeedKmh === null ? "-" : formatDecimal(month.weightedAverageSpeedKmh),
                      month.morningPeakSpeedKmh === null ? "-" : formatDecimal(month.morningPeakSpeedKmh),
                      month.eveningPeakSpeedKmh === null ? "-" : formatDecimal(month.eveningPeakSpeedKmh),
                    ])}
                  />
                }
                title={t("Aylık ortalama hız", "Monthly average speed")}
              >
                <SeriesChart
                  ariaLabel={t("Aylara göre gece, gün geneli, sabah ve akşam zirvesi hızı", "Night, all-day, morning and evening peak speed by month")}
                  height={300}
                  labels={monthly.map((month) => formatMonth(month.month))}
                  series={[
                    { id: "night", label: t("Gece 01-04", "Night 01-04"), color: SERIES_COLORS[0] ?? "", values: monthly.map((month) => month.nightSpeedKmh) },
                    { id: "all", label: t("Gün geneli", "All day"), color: SERIES_COLORS[1] ?? "", values: monthly.map((month) => month.weightedAverageSpeedKmh) },
                    { id: "morning", label: t("Sabah 07-09", "Morning 07-09"), color: SERIES_COLORS[2] ?? "", values: monthly.map((month) => month.morningPeakSpeedKmh) },
                    { id: "evening", label: t("Akşam 17-19", "Evening 17-19"), color: SERIES_COLORS[3] ?? "", values: monthly.map((month) => month.eveningPeakSpeedKmh) },
                  ]}
                  ticks={monthly.map((month, index) => ({ index, label: formatShortMonth(month.month) })).filter((tick) => tick.index % 3 === 0)}
                  unit="speed"
                />
              </ChartCard>
              <div className="span-4 stack">
                <Finding title={t("Gece ile akşam arasındaki makas", "The gap between night and evening")}>
                  {t(
                    `${formatMonth(mostCongested.month)} ayında akşam hızı gece hızının ${formatPercent((1 - (mostCongested.congestionIndex ?? 0)) * 100)}'ine indi. Bu, dönemin en yüksek tıkanıklık endeksi (${formatIndex(mostCongested.congestionIndex ?? 0)}).`,
                    `In ${formatMonth(mostCongested.month)} the evening speed fell to ${formatPercent((1 - (mostCongested.congestionIndex ?? 0)) * 100)} of the night speed, the highest congestion index of the period (${formatIndex(mostCongested.congestionIndex ?? 0)}).`,
                  )}
                </Finding>
                <Finding title={t("Sabah zirvesi akşamdan rahat", "Mornings are easier than evenings")}>
                  {t(
                    `Tüm dönemde sabah zirvesi ortalama ${formatSpeed(mean(monthly, (month) => month.morningPeakSpeedKmh))}, akşam zirvesi ${formatSpeed(mean(monthly, (month) => month.eveningPeakSpeedKmh))}. Akşam trafiği iş, okul ve sosyal yolculukları aynı saatlere toplar.`,
                    `Over the whole period the morning peak averaged ${formatSpeed(mean(monthly, (month) => month.morningPeakSpeedKmh))} and the evening peak ${formatSpeed(mean(monthly, (month) => month.eveningPeakSpeedKmh))}. Evening traffic packs work, school and social trips into the same hours.`,
                  )}
                </Finding>
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="yillik"
            lead={
              evening
                ? t(
                    `${evening.currentYear} yılının her ayı ${evening.previousYear} yılının aynı ayıyla karşılaştırılır. Mevsim etkisi böylece ortadan kalkar.`,
                    `Each month of ${evening.currentYear} is compared with the same month of ${evening.previousYear}, which removes the effect of the season.`,
                  )
                : t("Yıllık karşılaştırma için aynı ayın iki yılına ait veri gerekir.", "A year-on-year comparison needs the same month in two years.")
            }
            number={3}
            title={t("Yıllık karşılaştırma", "Year on year")}
          >
            {evening ? (
              <div className="grid">
                <ChartCard
                  className="span-7"
                  info={t(
                    "Aynı ayın iki yılını yan yana koyar. Mavi çizgi turuncunun üstündeyse o ay akşamlar bir önceki yıla göre daha hızlı akmıştır.",
                    "Puts the same month of two years side by side. Where the blue line is above the orange one, that month's evenings flowed faster than a year earlier.",
                  )}
                  subtitle={t("Hafta içi 17:00-19:59 şehir hızı", "City speed, weekdays 17:00-19:59")}
                  table={
                    <DataTable
                      columns={[monthCol, String(evening.previousYear), String(evening.currentYear), t(`Fark (${speedUnit})`, `Change (${speedUnit})`)]}
                      rows={evening.pairs.map((pair) => [
                        formatMonthIndex(pair.monthIndex),
                        pair.previous === null ? "-" : formatDecimal(pair.previous),
                        pair.current === null ? "-" : formatDecimal(pair.current),
                        pair.change === null ? "-" : formatSigned(pair.change),
                      ])}
                    />
                  }
                  title={t(`Akşam zirvesi: ${evening.previousYear} ve ${evening.currentYear}`, `Evening peak: ${evening.previousYear} and ${evening.currentYear}`)}
                >
                  <SeriesChart
                    ariaLabel={t(`${evening.previousYear} ve ${evening.currentYear} aylık akşam zirvesi hızı`, `Monthly evening peak speed in ${evening.previousYear} and ${evening.currentYear}`)}
                    labels={evening.pairs.map((pair) => formatMonthIndex(pair.monthIndex))}
                    series={[
                      { id: "previous", label: String(evening.previousYear), color: "var(--series-2)", values: evening.pairs.map((pair) => pair.previous) },
                      { id: "current", label: String(evening.currentYear), color: "var(--series-1)", values: evening.pairs.map((pair) => pair.current) },
                    ]}
                    ticks={evening.pairs.map((pair) => ({ index: pair.monthIndex, label: formatMonthIndex(pair.monthIndex) }))}
                    unit="speed"
                  />
                </ChartCard>
                <ChartCard
                  className="span-5"
                  info={t(
                    "Her ay için iki yıl arasındaki fark. Sağa uzanan mavi çubuklar akşamların hızlandığını, sola uzanan kırmızı çubuklar yavaşladığını gösterir.",
                    "The difference between the two years for each month. Blue bars to the right mean evenings got faster, red bars to the left mean they got slower.",
                  )}
                  subtitle={t("Pozitif değer akşamların hızlandığını gösterir", "A positive value means evenings got faster")}
                  title={t("Aylık fark", "Change by month")}
                >
                  <DivergingBars
                    items={evening.pairs
                      .filter((pair) => pair.change !== null)
                      .map((pair) => ({ label: formatMonthIndex(pair.monthIndex), value: pair.change ?? 0, display: formatSigned(pair.change ?? 0) }))}
                    negativeLabel={t("Daha yavaş", "Slower")}
                    positiveLabel={t("Daha hızlı", "Faster")}
                  />
                </ChartCard>
                {congestion?.averageChange !== null && congestion?.averageChange !== undefined ? (
                  <div className="span-12">
                    <Finding
                      title={t(
                        `Tıkanıklık endeksi ortalama ${formatSigned(congestion.averageChange, 3)} değişti`,
                        `The congestion index changed by ${formatSigned(congestion.averageChange, 3)} on average`,
                      )}
                    >
                      {t(
                        "Endeks şehrin akşamını kendi gecesiyle kıyasladığı için mevsim ve ölçüm kapsamındaki değişimlerden ham hıza göre daha az etkilenir.",
                        "Because the index compares the city's evening with its own night, it is less affected by season and by changes in measurement coverage than raw speed.",
                      )}
                    </Finding>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title={t("Karşılaştırma yapılamıyor", "No comparison possible")}
                message={t("Aynı ayın iki farklı yılı yüklendiğinde bu bölüm dolar.", "This section fills in once the same month is loaded for two years.")}
              />
            )}
          </ReportSection>

          <ReportSection
            id="tikaniklik"
            lead={t(
              "Tıkanıklık endeksi akşam zirvesinin gece hızına göre ne kadar düştüğünü, yoğun saat sayısı ise bir iş gününde şehrin kaç saat boyunca gece hızının dörtte üçünün altında aktığını gösterir.",
              "The congestion index shows how far the evening peak drops below the night speed; congested hours count how long a workday the city flows below three quarters of its night speed.",
            )}
            number={4}
            title={t("Tıkanıklık ve yoğun saatler", "Congestion and busy hours")}
          >
            <div className="grid">
              <ChartCard
                className="span-6"
                info={t(
                  "Her çubuk bir ayın tıkanıklık endeksidir. Turuncu çubuk dönemin en tıkalı ayıdır. Endeks 0 ile 1 arasındadır ve yükseldikçe akşam trafiği geceye göre ağırlaşır.",
                  "Each bar is a month's congestion index. The orange bar is the most congested month. The index runs from 0 to 1; the higher it is, the heavier the evening compared with the night.",
                )}
                subtitle={t("1 - akşam zirvesi hızı / gece hızı", "1 - evening peak speed / night speed")}
                table={
                  <DataTable
                    columns={[monthCol, t("Endeks", "Index"), t("Yoğun saat / iş günü", "Congested hours / workday")]}
                    rows={monthly.map((month) => [
                      formatMonth(month.month),
                      month.congestionIndex === null ? "-" : formatIndex(month.congestionIndex),
                      month.congestedHoursPerWeekday === null ? "-" : formatDecimal(month.congestedHoursPerWeekday),
                    ])}
                  />
                }
                title={t("Aylık tıkanıklık endeksi", "Monthly congestion index")}
              >
                <ColumnBars
                  formatValue={(value) => formatIndex(value)}
                  items={monthly.map((month) => ({
                    key: month.month,
                    label: formatShortMonth(month.month),
                    value: month.congestionIndex,
                    highlight: month.month === mostCongested.month,
                    title: `${formatMonth(month.month)}: ${month.congestionIndex === null ? noData : formatIndex(month.congestionIndex)}`,
                  }))}
                />
              </ChartCard>
              <ChartCard
                className="span-6"
                info={t(
                  "Bir iş gününde şehrin kaç saat boyunca gece hızının %75'inin altında aktığı. Çubuk ne kadar uzunsa yoğunluk günün o kadar çok saatine yayılmıştır.",
                  "How many hours of a workday the city flows below 75% of its night speed. The taller the bar, the more of the day is congested.",
                )}
                subtitle={t("Hafta içi, tatil olmayan ve en az 20 saati ölçülmüş günler", "Non-holiday weekdays with at least 20 measured hours")}
                title={t("İş günü başına yoğun saat", "Congested hours per workday")}
              >
                <ColumnBars
                  formatValue={(value) => formatDecimal(value)}
                  items={monthly.map((month) => ({
                    key: month.month,
                    label: formatShortMonth(month.month),
                    value: month.congestedHoursPerWeekday,
                    title: `${formatMonth(month.month)}: ${month.congestedHoursPerWeekday === null ? noData : t(`${formatDecimal(month.congestedHoursPerWeekday)} saat`, `${formatDecimal(month.congestedHoursPerWeekday)} h`)}`,
                  }))}
                />
              </ChartCard>
            </div>
          </ReportSection>

          <ReportSection
            id="mevsimsellik"
            lead={t(
              "Her satır bir ayın hafta içi saatlik profilidir. Koyu hücreler yavaş trafiği gösterir. Akşam koyuluğunun genişliği, yoğunluğun kaç saate yayıldığını anlatır.",
              "Each row is a month's weekday hourly profile. Dark squares are slow traffic; the width of the dark evening band shows how many hours the rush lasts.",
            )}
            number={5}
            title={t("Ay ve saate göre hız", "Speed by month and hour")}
          >
            <div className="grid">
              <ChartCard
                className="span-12"
                info={t(
                  "Satırlar aylar, sütunlar günün saatleridir. Koyu bantlar sabah ve akşam yoğunluğudur. Yaz aylarında sabah bandının açılması okulların tatilde olmasıyla ilgilidir.",
                  "Rows are months, columns are hours. The dark bands are the morning and evening rush. The morning band fades in summer, when schools are closed.",
                )}
                subtitle={t("Hafta içi, resmî tatiller hariç", "Weekdays, public holidays excluded")}
                title={t("Ay x saat ısı haritası", "Month by hour heatmap")}
              >
                <MatrixHeatmap
                  ariaLabel={t("Ay ve saate göre hafta içi hız", "Weekday speed by month and hour")}
                  cells={monthHour.map((cell) => ({ row: cell.month, hour: cell.hourOfDay, value: cell.weightedAverageSpeedKmh }))}
                  labelWidth={64}
                  rowHeight={18}
                  rows={monthRows}
                />
              </ChartCard>
              <div className="span-12">
                <Finding title={t(`Akşamın en yavaş saati çoğu ayda ${formatHour(usualLowHour)}`, `The slowest evening hour is ${formatHour(usualLowHour)} in most months`)}>
                  {shiftedMonths.length === 0
                    ? t("Zirve saati dönem boyunca hiç değişmedi.", "The peak hour never moved during the period.")
                    : t(
                        `Zirvenin farklı saate kaydığı aylar: ${shiftedMonths
                          .slice(0, 8)
                          .map(({ month, low }) => `${formatMonth(month.month)} (${formatHour(low?.hour ?? 0)})`)
                          .join(", ")}${shiftedMonths.length > 8 ? " ve diğerleri" : ""}.`,
                        `Months in which the peak moved: ${shiftedMonths
                          .slice(0, 8)
                          .map(({ month, low }) => `${formatMonth(month.month)} (${formatHour(low?.hour ?? 0)})`)
                          .join(", ")}${shiftedMonths.length > 8 ? " and others" : ""}.`,
                      )}
                </Finding>
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="haftanin-gunleri"
            lead={t(
              "Tüm dönem boyunca haftanın her günü için saatlik hız. Resmî tatiller hesaba katılmaz.",
              "Hourly speed for every day of the week over the whole period. Public holidays are left out.",
            )}
            number={6}
            title={t("Haftanın günleri", "Days of the week")}
          >
            <div className="grid">
              <ChartCard
                className="span-8"
                info={t(
                  "Her satır haftanın bir günü, her sütun bir saattir. Cuma akşamı ve hafta sonu sabahlarının farkı burada kolayca görülür.",
                  "Each row is a day of the week, each column an hour. Friday evenings and quiet weekend mornings stand out here.",
                )}
                subtitle={t("Araç ağırlıklı ortalama, tüm aylar", "Vehicle-weighted average, all months")}
                title={t("Gün x saat ısı haritası", "Day by hour heatmap")}
              >
                <MatrixHeatmap
                  ariaLabel={t("Haftanın günü ve saate göre hız", "Speed by day of week and hour")}
                  cells={dayOfWeek.map((cell) => ({ row: String(cell.isoDayOfWeek), hour: cell.hourOfDay, value: cell.weightedAverageSpeedKmh }))}
                  labelWidth={84}
                  rowHeight={30}
                  rows={dayRows}
                />
              </ChartCard>
              <div className="span-4 stack">
                {slowestDayHour ? (
                  <Finding
                    title={t(
                      `Haftanın en yavaş saati: ${day(slowestDayHour.dayName)} ${formatHour(slowestDayHour.hourOfDay)}`,
                      `Slowest hour of the week: ${day(slowestDayHour.dayName)} ${formatHour(slowestDayHour.hourOfDay)}`,
                    )}
                  >
                    {t(`Bu saatte şehir ortalaması ${formatSpeed(slowestDayHour.weightedAverageSpeedKmh)}.`, `The city averages ${formatSpeed(slowestDayHour.weightedAverageSpeedKmh)} at this hour.`)}
                  </Finding>
                ) : null}
                <Finding title={t(`Akşamları en zor gün ${worstEvening.name}`, `The hardest evening is ${worstEvening.name}`)}>
                  {t(
                    `17:00-19:59 arasında ${worstEvening.name} ortalaması ${formatSpeed(worstEvening.speed)}, en rahat iş günü ${bestEvening.name} (${formatSpeed(bestEvening.speed)}).`,
                    `Between 17:00 and 19:59 ${worstEvening.name} averages ${formatSpeed(worstEvening.speed)}; the easiest workday is ${bestEvening.name} (${formatSpeed(bestEvening.speed)}).`,
                  )}
                </Finding>
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="takvim"
            lead={t(
              "Her kare bir gündür ve rengi o günün 17:00-19:59 şehir hızını gösterir. Renk sınıfları tüm iş günlerinin dağılımından hesaplanır, böylece her renk günlerin yaklaşık yedide birini kapsar.",
              "Each square is a day, colored by that day's 17:00-19:59 city speed. The color classes come from the distribution of all workdays, so each color covers about one seventh of the days.",
            )}
            number={7}
            title={t("Takvim: her gün tek tek", "Calendar: every day")}
          >
            <div className="grid">
              <ChartCard
                className="span-12"
                info={t(
                  "GitHub katkı takvimi gibi okunur: her sütun bir hafta, her satır bir gündür. Koyu kareler akşamı en yavaş günlerdir. Noktalı kareler resmî tatildir. Bir karenin üzerine gelince o günün değerleri görünür.",
                  "Read it like a GitHub contribution calendar: each column is a week, each row a weekday. Dark squares are the slowest evenings, dotted squares are public holidays. Hover a square for that day's values.",
                )}
                subtitle={t("Noktalı günler resmî tatildir. Gri günlerde akşam verisi yoktur.", "Dotted days are public holidays. Grey days have no evening data.")}
                title={t("Akşam hızı takvimi", "Evening speed calendar")}
              >
                <CalendarHeatmap days={calendar} thresholds={calendarThresholds} />
              </ChartCard>
              {[
                { rows: slowDays, title: t("Akşamı en yavaş 10 gün", "The 10 slowest evenings") },
                { rows: fastDays, title: t("Akşamı en hızlı 10 gün", "The 10 fastest evenings") },
              ].map((table) => (
                <ChartCard className="span-6" key={table.title} subtitle={t("Hafta içi, tatil olmayan günler", "Non-holiday weekdays")} title={table.title}>
                  <DataTable
                    columns={[t("Tarih", "Date"), t("Gün", "Day"), t("Akşam hızı", "Evening speed"), t("Dönem", "Period")]}
                    rows={table.rows.map((item) => [formatLongDate(item.date), day(item.dayName), formatSpeed(item.eveningSpeedKmh), term(item.periods ?? "", locale)])}
                  />
                </ChartCard>
              ))}
            </div>
          </ReportSection>

          <ReportSection
            id="donemler"
            lead={t(
              "Hafta içi günler okul dönemi, yarıyıl ve ara tatiller, yaz tatili ve Ramazan olarak gruplanır. Bir gün birden fazla döneme denk gelirse Ramazan önceliklidir.",
              "Weekdays are grouped into school term, semester and mid-term breaks, summer break and Ramadan. A day in more than one period counts as Ramadan.",
            )}
            number={8}
            title={t("Okul, tatil ve Ramazan", "School, holidays and Ramadan")}
          >
            <div className="grid">
              <ChartCard
                className="span-6"
                info={t(
                  "Her çizgi bir dönemin ortalama hafta içi gününü gösterir. Yaz tatilinde sabah çukurunun sığlaşması okul trafiğinin etkisini gösterir.",
                  "Each line is the average weekday of one period. The shallower morning dip in the summer break shows the weight of school traffic.",
                )}
                subtitle={t("Hafta içi saatlik hız", "Weekday hourly speed")}
                table={
                  <DataTable
                    columns={[hourCol, ...periodProfiles.map((profile) => periodLabel(profile.period, locale))]}
                    rows={HOURS.map((hour) => [
                      formatHour(hour),
                      ...periodProfiles.map((profile) => {
                        const value = profile.speeds[hour];
                        return value === null || value === undefined ? "-" : formatDecimal(value);
                      }),
                    ])}
                  />
                }
                title={t("Dönemlere göre hız", "Speed by period")}
              >
                <SeriesChart
                  ariaLabel={t("Dönemlere göre hafta içi saatlik hız", "Weekday hourly speed by period")}
                  labels={HOURS.map(formatHour)}
                  series={periodProfiles.map((profile, index) => ({
                    id: profile.period,
                    label: t(`${periodLabel(profile.period, locale)} (${profile.days} gün)`, `${periodLabel(profile.period, locale)} (${profile.days} days)`),
                    color: SERIES_COLORS[index] ?? "var(--series-1)",
                    values: profile.speeds,
                  }))}
                  ticks={HOUR_TICKS}
                  unit="speed"
                />
              </ChartCard>
              <ChartCard
                className="span-6"
                info={t(
                  "Aynı dönemlerin trafik hacmi: bir hücreden bir saatte geçen ortalama araç. Ramazan'da akşam zirvesinin iftardan önceye kaydığı burada görülür.",
                  "Traffic volume in the same periods: average vehicles per cell and hour. In Ramadan the evening peak moves before iftar.",
                )}
                subtitle={t("Hücre ve saat başına ortalama araç", "Average vehicles per cell and hour")}
                table={
                  <DataTable
                    columns={[hourCol, ...periodProfiles.map((profile) => periodLabel(profile.period, locale))]}
                    rows={HOURS.map((hour) => [
                      formatHour(hour),
                      ...periodProfiles.map((profile) => {
                        const value = profile.vehicles[hour];
                        return value === null || value === undefined ? "-" : formatDecimal(value);
                      }),
                    ])}
                  />
                }
                title={t("Dönemlere göre trafik hacmi", "Traffic volume by period")}
              >
                <SeriesChart
                  ariaLabel={t("Dönemlere göre hafta içi saatlik araç sayısı", "Weekday hourly vehicles by period")}
                  labels={HOURS.map(formatHour)}
                  series={periodProfiles.map((profile, index) => ({
                    id: profile.period,
                    label: periodLabel(profile.period, locale),
                    color: SERIES_COLORS[index] ?? "var(--series-1)",
                    values: profile.vehicles,
                  }))}
                  ticks={HOUR_TICKS}
                  unit="vehicles"
                />
              </ChartCard>
              <div className="span-12 findings-grid">
                {termMorning !== null && summerMorning !== null ? (
                  <Finding title={t(`Yazın sabahlar ${formatSigned(summerMorning - termMorning)} km/sa`, `Summer mornings: ${formatSigned(summerMorning - termMorning)} km/h`)}>
                    {t(
                      `07:00-09:59 arasında yaz tatili ortalaması ${formatSpeed(summerMorning)}, okul dönemi ${formatSpeed(termMorning)}. Okul servisleri ve veli trafiği sabahı belirgin biçimde yavaşlatır.`,
                      `Between 07:00 and 09:59 the summer break averages ${formatSpeed(summerMorning)} against ${formatSpeed(termMorning)} in the school term. School buses and drop-offs clearly slow the morning down.`,
                    )}
                  </Finding>
                ) : null}
                {summerLow && termLow ? (
                  <Finding title={t(`Yaz akşamı en yavaş saat ${formatHour(summerLow.hour)}`, `Slowest summer evening hour: ${formatHour(summerLow.hour)}`)}>
                    {t(
                      `Yaz tatilinde akşamın en düşük hızı ${formatSpeed(summerLow.value)}, okul döneminde ${formatSpeed(termLow.value)}.`,
                      `The lowest evening speed is ${formatSpeed(summerLow.value)} in the summer break and ${formatSpeed(termLow.value)} in the school term.`,
                    )}
                  </Finding>
                ) : null}
                {ramadanFinding}
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="tatiller"
            lead={t(
              "Her resmî tatil, çevresindeki üç haftanın aynı gününe ait 07:00-21:59 saatleriyle karşılaştırılır. Böylece Pazar gününe denk gelen tatil Pazar günleriyle kıyaslanır.",
              "Each public holiday is compared with 07:00-21:59 on the same weekday in the three surrounding weeks, so a holiday on a Sunday is compared with Sundays.",
            )}
            number={9}
            title={t("Bayramlar ve resmî tatiller", "Religious and public holidays")}
          >
            <div className="grid">
              <ChartCard
                className="span-7"
                info={t(
                  "Her çubuk bir tatilin gündüz hızının olağan günlere göre farkıdır. Sağa uzanan çubuk tatilde şehrin rahatladığını gösterir. Tabloda araç sayısındaki değişim de yer alır.",
                  "Each bar is a holiday's daytime speed against ordinary days. Bars to the right mean the city was freer on the holiday. The table also shows the change in vehicles.",
                )}
                subtitle={t(`Gündüz hızının olağan günlere göre farkı (${speedUnit})`, `Daytime speed against ordinary days (${speedUnit})`)}
                table={
                  <DataTable
                    columns={[
                      t("Tatil", "Holiday"),
                      t("Tarih", "Date"),
                      t("Gün", "Days"),
                      t("Tatil hızı", "Holiday speed"),
                      t("Olağan", "Ordinary"),
                      t("Fark", "Change"),
                      t("Araç değişimi", "Vehicle change"),
                    ]}
                    rows={measuredHolidays.map((holiday) => [
                      term(holiday.name, locale),
                      formatShortDate(holiday.startDate) + (holiday.days > 1 ? ` - ${formatShortDate(holiday.endDate)}` : ""),
                      String(holiday.days),
                      formatSpeed(holiday.holidaySpeedKmh),
                      formatSpeed(holiday.baselineSpeedKmh),
                      holiday.speedChangeKmh === null ? "-" : formatSigned(holiday.speedChangeKmh),
                      holiday.volumeChangePct === null ? "-" : formatSignedPercent(holiday.volumeChangePct),
                    ])}
                  />
                }
                title={t("Tatillerde şehir ne kadar rahatlıyor?", "How much freer is the city on holidays?")}
              >
                <DivergingBars
                  items={measuredHolidays.map((holiday) => ({
                    label: `${term(holiday.name, locale)} ${holiday.startDate.slice(0, 4)}`,
                    value: holiday.speedChangeKmh ?? 0,
                    display: formatSigned(holiday.speedChangeKmh ?? 0),
                  }))}
                  negativeLabel={t("Daha yavaş", "Slower")}
                  positiveLabel={t("Daha hızlı", "Faster")}
                />
              </ChartCard>
              <div className="span-5 stack">
                {quietestHoliday ? (
                  <Finding
                    title={t(
                      `En sessiz tatil: ${term(quietestHoliday.name, locale)} ${quietestHoliday.startDate.slice(0, 4)}`,
                      `Quietest holiday: ${term(quietestHoliday.name, locale)} ${quietestHoliday.startDate.slice(0, 4)}`,
                    )}
                  >
                    {t(
                      `Hücre başına araç olağan günlere göre ${formatSignedPercent(quietestHoliday.volumeChangePct ?? 0)} değişti, gündüz hızı ${formatSigned(quietestHoliday.speedChangeKmh ?? 0)} km/sa farklılaştı.`,
                      `Vehicles per cell changed by ${formatSignedPercent(quietestHoliday.volumeChangePct ?? 0)} against ordinary days and the daytime speed by ${formatSigned(quietestHoliday.speedChangeKmh ?? 0)} km/h.`,
                    )}
                  </Finding>
                ) : null}
                <Finding title={t("Uzun bayramlar en büyük etkiyi yapar", "Long religious holidays have the biggest effect")}>
                  {t(
                    "Ramazan ve Kurban bayramlarında şehir dışına çıkış ve kapalı iş yerleri trafiği birkaç gün boyunca azaltır. Tek günlük tatillerde etki, günün haftanın hangi gününe denk geldiğine bağlıdır.",
                    "During Eid al-Fitr and Eid al-Adha people leave the city and businesses close, so traffic falls for several days. For one-day holidays the effect depends on which weekday they fall on.",
                  )}
                </Finding>
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="guvenilirlik"
            lead={t(
              "Ortalama hız bir saatin tipik durumunu anlatır, ama yolculuk planlarken kötü günler önemlidir. Bant ne kadar genişse o saatte trafiğin ne olacağını önceden kestirmek o kadar zordur.",
              "The average describes a typical hour, but bad days matter when you plan a trip. The wider the band, the harder it is to predict traffic at that hour.",
            )}
            number={10}
            title={t("Öngörülebilirlik", "Predictability")}
          >
            <div className="grid">
              <ChartCard
                className="span-8"
                info={t(
                  "Çizgi medyan günü, koyu bant günlerin yarısını, açık bant günlerin %80'ini kapsar. Bantların genişlediği saatlerde trafik günden güne çok değişir; bu saatlerde yolculuğa pay bırakmak gerekir.",
                  "The line is the median day, the dark band covers half of the days and the light band 80% of them. Where the bands widen, traffic varies a lot from day to day, so allow extra time.",
                )}
                subtitle={t("Hafta içi günlerin saatlik şehir hızı dağılımı", "Distribution of hourly city speed on weekdays")}
                table={
                  <DataTable
                    columns={[hourCol, t("Gün", "Days"), t("10.", "10th"), t("25.", "25th"), t("Medyan", "Median"), t("75.", "75th"), t("90.", "90th")]}
                    rows={reliability.map((point) => [
                      formatHour(point.hourOfDay),
                      formatInteger(point.days),
                      formatDecimal(point.p10SpeedKmh),
                      formatDecimal(point.p25SpeedKmh),
                      formatDecimal(point.medianSpeedKmh),
                      formatDecimal(point.p75SpeedKmh),
                      formatDecimal(point.p90SpeedKmh),
                    ])}
                  />
                }
                title={t("Saat saat günlük hız aralığı", "Daily speed range by hour")}
              >
                <BandChart points={reliability} />
              </ChartCard>
              <div className="span-4 stack">
                {widest ? (
                  <Finding title={t(`En belirsiz saat ${formatHour(widest.hourOfDay)}`, `Least predictable hour: ${formatHour(widest.hourOfDay)}`)}>
                    {t(
                      `Bu saatte iyi bir gün (${formatSpeed(widest.p90SpeedKmh)}) ile kötü bir gün (${formatSpeed(widest.p10SpeedKmh)}) arasında ${formatDecimal(widest.p90SpeedKmh - widest.p10SpeedKmh)} km/sa fark var.`,
                      `At this hour a good day (${formatSpeed(widest.p90SpeedKmh)}) and a bad day (${formatSpeed(widest.p10SpeedKmh)}) differ by ${formatDecimal(widest.p90SpeedKmh - widest.p10SpeedKmh)} km/h.`,
                    )}
                  </Finding>
                ) : null}
                {quietHour ? (
                  <Finding title={t("Gece neredeyse sabit", "Nights barely change")}>
                    {t(
                      `03:00'te günlerin %80'i ${formatDecimal(quietHour.p10SpeedKmh)} ile ${formatDecimal(quietHour.p90SpeedKmh)} km/sa arasında kalır.`,
                      `At 03:00, 80% of days stay between ${formatDecimal(quietHour.p10SpeedKmh)} and ${formatDecimal(quietHour.p90SpeedKmh)} km/h.`,
                    )}
                  </Finding>
                ) : null}
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="konum-degisimi"
            lead={
              changes.currentFrom && changes.previousFrom && changes.previousTo && changes.currentTo
                ? t(
                    `Her hücrenin hafta içi akşam zirvesi hızı, ${formatMonth(changes.currentFrom)} - ${formatMonth(changes.currentTo)} ile ${formatMonth(changes.previousFrom)} - ${formatMonth(changes.previousTo)} arasında karşılaştırılır. Seyrek ölçülen hücreler sıralamayı bozmasın diye, her iki dönemde de en iyi ölçülen hücrenin akşam saatlerinin en az yarısı kadar veri gerekir.`,
                    `Each cell's weekday evening peak speed is compared between ${formatMonth(changes.currentFrom)} - ${formatMonth(changes.currentTo)} and ${formatMonth(changes.previousFrom)} - ${formatMonth(changes.previousTo)}. To keep rarely measured cells out of the ranking, a cell needs at least half as many evening hours as the best measured cell in both periods.`,
                  )
                : t("Bu bölüm iki ayrı 12 aylık dönem yüklendiğinde dolar.", "This section fills in once two separate 12-month periods are loaded.")
            }
            number={11}
            title={t("Hangi bölgeler yavaşladı?", "Which areas got slower?")}
          >
            {located.length === 0 ? (
              <EmptyState
                title={t("Karşılaştırma için yeterli veri yok", "Not enough data to compare")}
                message={t("En az iki yıllık veri yüklendiğinde bu harita oluşur.", "This map appears once at least two years of data are loaded.")}
              />
            ) : (
              <div className="grid">
                <ChartCard
                  className="span-8"
                  info={t(
                    "Her kare bir hücrenin son 12 aydaki akşam hızının önceki 12 aya göre değişimidir. Kırmızı yavaşladı, mavi hızlandı. 3B görünümde sütun yüksekliği değişimin büyüklüğünü gösterir. Arama kutusuyla bir semti bulabilirsiniz.",
                    "Each square is the change in a cell's evening speed, last 12 months against the 12 before. Red got slower, blue got faster. In 3D the column height shows the size of the change. Use the search box to find a place.",
                  )}
                  subtitle={t(
                    `${formatInteger(located.length)} hücre. Kırmızı hücreler yavaşladı, mavi hücreler hızlandı.`,
                    `${formatInteger(located.length)} cells. Red cells got slower, blue cells got faster.`,
                  )}
                  title={t("Akşam zirvesi hız değişimi", "Change in evening peak speed")}
                >
                  <TrafficMap
                    ariaLabel={t(
                      "Hücrelere göre akşam zirvesi hız değişimi haritası. En çok değişen hücreler yandaki tablolardadır.",
                      "Map of the change in evening peak speed by cell. The cells that changed most are in the tables next to it.",
                    )}
                    cells={located.map((cell) => {
                      const place = placeLabel(cell, locale);
                      return {
                        id: cell.geohash,
                        title: place.title,
                        subtitle: place.subtitle,
                        isDistrictOnly: !cell.neighborhood,
                        latitude: cell.latitude,
                        longitude: cell.longitude,
                        levels: [changeClass(cell.speedChangeKmh)],
                        lines: [
                          { value: `${formatSigned(cell.speedChangeKmh)} ${speedUnit}`, label: t("değişim", "change") },
                          { value: formatSpeed(cell.currentPeakSpeedKmh), label: t("son 12 ay", "last 12 months") },
                          { value: formatSpeed(cell.previousPeakSpeedKmh), label: t("önceki 12 ay", "previous 12 months") },
                        ],
                      };
                    })}
                    compact
                    cooperative
                    key={locale}
                    modes={changeModes}
                    searchable
                  />
                </ChartCard>
                <div className="span-4 stack">
                  {medianChange !== null ? (
                    <Finding title={t(`Medyan hücre ${formatSigned(medianChange)} km/sa`, `Median cell: ${formatSigned(medianChange)} km/h`)}>
                      {t(
                        `Hücrelerin ${formatPercent(slowerShare ?? 0)}'inde akşam zirvesi 1 km/sa'ten fazla yavaşladı, ${formatPercent(fasterShare ?? 0)}'inde hızlandı. Değişimler hücrenin kendi geçmişiyle kıyaslandığı için ölçüm kapsamındaki saatlik dalgalanmalardan etkilenmez.`,
                        `In ${formatPercent(slowerShare ?? 0)} of cells the evening peak got more than 1 km/h slower and in ${formatPercent(fasterShare ?? 0)} it got faster. Each cell is compared with its own past, so hourly swings in coverage do not affect the result.`,
                      )}
                    </Finding>
                  ) : null}
                  {medianChange !== null &&
                  evening?.averageChange !== null &&
                  evening?.averageChange !== undefined &&
                  Math.abs(evening.averageChange - medianChange) >= 1 ? (
                    <Finding title={t("Şehir ortalaması ile tipik hücre ayrışıyor", "The city average and the typical cell disagree")}>
                      {t(
                        `Şehrin araç ağırlıklı akşam hızı yıllık ${formatSigned(evening.averageChange)} km/sa değişirken medyan hücre ${formatSigned(medianChange)} km/sa değişti. İyileşme hücrelerin çoğuna yayılmamış, araç ağırlığı yüksek ana arterlerde toplanmış olabilir. Sayım düzeyindeki değişim de ağırlıkları kaydırmış olabilir, bu yüzden şehir ortalamasındaki artış tek başına "trafik rahatladı" diye okunmamalı.`,
                        `The city's vehicle-weighted evening speed changed by ${formatSigned(evening.averageChange)} km/h a year while the median cell changed by ${formatSigned(medianChange)} km/h. The improvement may sit on a few heavily used arterials rather than most cells, and the change in the counting level may have shifted the weights, so the higher city average alone does not mean "traffic got better".`,
                      )}
                    </Finding>
                  ) : null}
                  <Link className="button secondary" href="/harita">
                    {t("Haritada semt profillerini incele", "Explore place profiles on the map")}
                  </Link>
                </div>
                {[
                  { rows: worsened, title: t("En çok yavaşlayan 10 semt", "The 10 places that slowed most") },
                  { rows: improved, title: t("En çok hızlanan 10 semt", "The 10 places that sped up most") },
                ].map((table) => (
                  <ChartCard className="span-6" key={table.title} subtitle={t(`Akşam zirvesi hızı, ${speedUnit}`, `Evening peak speed, ${speedUnit}`)} title={table.title}>
                    <DataTable
                      columns={[t("Semt", "Place"), t("Önceki 12 ay", "Previous 12 months"), t("Son 12 ay", "Last 12 months"), t("Fark", "Change")]}
                      rows={table.rows.map((cell) => [
                        placeLabel(cell, locale).full,
                        formatDecimal(cell.previousPeakSpeedKmh),
                        formatDecimal(cell.currentPeakSpeedKmh),
                        formatSigned(cell.speedChangeKmh),
                      ])}
                    />
                  </ChartCard>
                ))}
              </div>
            )}
          </ReportSection>

          <ReportSection
            id="veri-kapsami"
            lead={t(
              "Analizlerin ne kadar güvenilir olduğu, verinin ne kadar eksiksiz olduğuna bağlıdır. Bu bölüm her ayın kapsamasını ve raporda kullanılan kuralları listeler.",
              "How far the analysis can be trusted depends on how complete the data is. This section lists each month's coverage and the rules used in the report.",
            )}
            number={12}
            title={t("Veri kapsamı ve yöntem", "Coverage and method")}
          >
            <div className="grid">
              <ChartCard
                className="span-7"
                info={t(
                  "Bir ayın saatlerinin yüzde kaçında analize uygun veri olduğu. Turuncu aylar %95'in altında kalır; bu aylardaki sonuçlar daha az saate dayanır.",
                  "The share of a month's hours with usable data. Orange months are below 95%; their results rest on fewer hours.",
                )}
                subtitle={t("Analize uygun verisi olan saatlerin oranı", "Share of hours with usable data")}
                title={t("Aylık kapsama", "Monthly coverage")}
              >
                <ColumnBars
                  formatValue={percent}
                  items={monthly.map((month) => ({
                    key: month.month,
                    label: formatShortMonth(month.month),
                    value: month.coveragePct,
                    highlight: month.coveragePct < 95,
                    title: `${formatMonth(month.month)}: ${formatPercent(month.coveragePct)}`,
                  }))}
                />
                <p className="card-subtitle" style={{ marginTop: 10 }}>
                  {t(
                    `En düşük kapsama ${formatMonth(lowestCoverage.month)} ayında: ${formatPercent(lowestCoverage.coveragePct)}, ${formatInteger(lowestCoverage.partialHours)} kesintili saat. Ayrıntılar `,
                    `The lowest coverage is in ${formatMonth(lowestCoverage.month)}: ${formatPercent(lowestCoverage.coveragePct)}, ${formatInteger(lowestCoverage.partialHours)} partial hours. Details are on the `,
                  )}
                  <Link href="/veri-hatti">{t("veri hattı sayfasında", "pipeline page")}</Link>.
                </p>
              </ChartCard>
              <ChartCard
                className="span-7"
                info={t(
                  "Bir hücreden bir saatte geçen ortalama araç. Turuncu çubuk İBB'nin araç sayım düzeyinin değiştiği aydır; o tarihin iki yanı hacim açısından karşılaştırılmaz.",
                  "Average vehicles per cell and hour. The orange bar is the month in which IMM's vehicle counting level changed; volumes on the two sides of it are not compared.",
                )}
                subtitle={t("Hücre ve saat başına ortalama araç", "Average vehicles per cell and hour")}
                table={
                  <DataTable
                    columns={[monthCol, t("Hücre başına araç", "Vehicles per cell")]}
                    rows={monthly.map((month) => [formatMonth(month.month), formatDecimal(month.averageVehicleCount)])}
                  />
                }
                title={t("Aylık trafik hacmi", "Monthly traffic volume")}
              >
                <ColumnBars
                  formatValue={(value) => formatInteger(value)}
                  items={monthly.map((month) => ({
                    key: month.month,
                    label: formatShortMonth(month.month),
                    value: month.averageVehicleCount,
                    highlight: month.month === volumeBreak?.month,
                    title: t(`${formatMonth(month.month)}: ${formatDecimal(month.averageVehicleCount)} araç`, `${formatMonth(month.month)}: ${formatDecimal(month.averageVehicleCount)} vehicles`),
                  }))}
                />
              </ChartCard>
              <div className="span-5 stack">
                {volumeBreak ? (
                  <Finding title={t(`${formatMonth(volumeBreak.month)} itibarıyla sayım düzeyi değişti`, `The counting level changed in ${formatMonth(volumeBreak.month)}`)}>
                    {t(
                      `Hücre başına araç bir ayda ${formatDecimal(volumeBreak.previous)}'ten ${formatDecimal(volumeBreak.current)}'e çıktı (${formatSignedPercent(volumeBreak.changePct)}) ve bu düzeyde kaldı. Hız serilerinde aynı kırılma görülmediği için bu, trafikteki bir artıştan çok İBB'nin araç sayımındaki bir değişikliğe işaret eder. Bu tarihin iki yanı arasında hacim karşılaştırılmaz.`,
                      `Vehicles per cell jumped from ${formatDecimal(volumeBreak.previous)} to ${formatDecimal(volumeBreak.current)} within a month (${formatSignedPercent(volumeBreak.changePct)}) and stayed there. The speed series show no such break, so this points to a change in IMM's vehicle counting rather than more traffic. Volumes are not compared across this date.`,
                    )}
                  </Finding>
                ) : null}
              </div>
              <ChartCard className="span-12" title={t("Yöntem notları", "Method notes")}>
                <ul className="notes">
                  <li>{t("Hızlar araç sayısıyla ağırlıklandırılır. Basit ortalama yoğun saatleri olduğundan hızlı gösterir.", "Speeds are weighted by vehicle count. A simple average makes busy hours look faster than they are.")}</li>
                  <li>{t("Ham satırlar yerine yükleme sırasında güncellenen saatlik ve günlük özet tablolar okunur.", "The report reads hourly and daily summary tables refreshed at load time instead of the raw rows.")}</li>
                  <li>
                    {t(
                      "Veri kesintisi olan saatler, ortalama hızı 150 km/sa üstündeki ölçümler ve 5 araç altındaki konum ölçümleri dışarıda bırakılır.",
                      "Hours with data outages, readings above 150 km/h and location readings with fewer than 5 vehicles are left out.",
                    )}
                  </li>
                  <li>
                    {t(
                      "Her saatte veri gönderen hücre sayısı değiştiği için hacim, toplam araç yerine hücre ve saat başına ortalama araçla karşılaştırılır.",
                      "The number of reporting cells changes every hour, so volume is compared as average vehicles per cell and hour rather than total vehicles.",
                    )}
                  </li>
                  <li>{t("Okul ve tatil tarihleri MEB çalışma takviminden, resmî tatiller ETL takviminden alınır.", "School and break dates come from the Ministry of Education calendar, public holidays from the ETL calendar.")}</li>
                </ul>
              </ChartCard>
            </div>
          </ReportSection>
        </div>
      </div>
    </>
  );
}

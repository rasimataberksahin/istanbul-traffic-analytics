import type { Metadata } from "next";
import Link from "next/link";
import { BandChart } from "@/components/charts/BandChart";
import { CalendarHeatmap } from "@/components/charts/CalendarHeatmap";
import { CellMap } from "@/components/charts/CellMap";
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
import {
  formatCompact,
  formatDecimal,
  formatHour,
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
} from "@/lib/format";
import {
  compareYears,
  comparableWeekdays,
  findVolumeBreak,
  groupPeriods,
  maximumHour,
  mean,
  minimumHour,
  PERIOD_LABELS,
  rankWeekdays,
  widestSpread,
} from "@/lib/insights";
import { changeClass } from "@/lib/scale";
import type { MonthlyInsight } from "@/lib/types";

export const metadata: Metadata = { title: "Analiz raporu" };
export const dynamic = "force-dynamic";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HOUR_TICKS = HOURS.filter((hour) => hour % 3 === 0).map((hour) => ({ index: hour, label: formatHour(hour) }));
const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

const SECTIONS = [
  { id: "ozet", title: "Özet" },
  { id: "aylik-trend", title: "Aylık hız" },
  { id: "yillik", title: "Yıllık karşılaştırma" },
  { id: "tikaniklik", title: "Tıkanıklık" },
  { id: "mevsimsellik", title: "Ay ve saat" },
  { id: "haftanin-gunleri", title: "Haftanın günleri" },
  { id: "takvim", title: "Takvim" },
  { id: "donemler", title: "Okul, tatil, Ramazan" },
  { id: "tatiller", title: "Resmî tatiller" },
  { id: "guvenilirlik", title: "Öngörülebilirlik" },
  { id: "konum-degisimi", title: "Bölgesel değişim" },
  { id: "veri-kapsami", title: "Veri kapsamı ve yöntem" },
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
  return makeDelta(change, `${year} ile fark: ${formatSigned(change, digits)}`, higherIsBetter, 10 ** -digits / 2);
}

/** Describes in how many comparable months the evening got faster or slower. */
function yearSummary(pairs: { change: number | null }[]): string {
  const compared = pairs.filter((pair) => pair.change !== null);
  const faster = compared.filter((pair) => (pair.change ?? 0) > 0).length;
  const slower = compared.filter((pair) => (pair.change ?? 0) < 0).length;
  if (faster === compared.length) {
    return `Karşılaştırılan ${compared.length} ayın hepsinde akşam zirvesi bir önceki yılın aynı ayından daha hızlıydı.`;
  }
  if (slower === compared.length) {
    return `Karşılaştırılan ${compared.length} ayın hepsinde akşam zirvesi bir önceki yılın aynı ayından daha yavaştı.`;
  }
  return `Karşılaştırılan ${compared.length} ayın ${faster} tanesinde akşam zirvesi hızlandı, ${slower} tanesinde yavaşladı.`;
}

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
    return <EmptyState title="Henüz veri yüklenmedi" message="Analiz raporu için ETL hattıyla en az bir ay yükleyin." />;
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
    return cell ? [{ key: String(iso), label: cell.dayName, title: cell.dayName }] : [];
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
  const eveningSpeeds = comparableWeekdays(calendar).map((day) => day.eveningSpeedKmh);
  const calendarThresholds = quantileThresholds(eveningSpeeds.length ? eveningSpeeds : [40, 45, 50, 55, 60, 65, 70]);
  const { slowest: slowDays, fastest: fastDays } = rankWeekdays(calendar, 10);

  // Periods.
  const periodProfiles = groupPeriods(periods);
  const term = periodProfiles.find((profile) => profile.period === "school_term");
  const summer = periodProfiles.find((profile) => profile.period === "summer_break");
  const ramadan = periodProfiles.find((profile) => profile.period === "ramadan");
  const termLow = term ? minimumHour(term.speeds, 12, 23) : null;
  const ramadanLow = ramadan ? minimumHour(ramadan.speeds, 12, 23) : null;
  const summerLow = summer ? minimumHour(summer.speeds, 12, 23) : null;
  const morningOf = (values: (number | null)[]) => mean([7, 8, 9], (hour) => values[hour] ?? null);
  const termMorning = term ? morningOf(term.speeds) : null;
  const summerMorning = summer ? morningOf(summer.speeds) : null;
  // Ramadan shifts the volume peak before iftar; compare the peak with 19:00 in both periods.
  const IFTAR_HOUR = 19;
  const termPeak = term ? maximumHour(term.vehicles, 12, 23) : null;
  const ramadanPeak = ramadan ? maximumHour(ramadan.vehicles, 12, 23) : null;
  const dropAfterPeak = (vehicles: (number | null)[] | undefined, peak: { value: number } | null) =>
    vehicles && peak && vehicles[IFTAR_HOUR] ? ((vehicles[IFTAR_HOUR] ?? 0) / peak.value - 1) * 100 : null;
  const ramadanIftarDrop = dropAfterPeak(ramadan?.vehicles, ramadanPeak);
  const termIftarDrop = dropAfterPeak(term?.vehicles, termPeak);

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

  const ramadanFinding =
    termPeak && ramadanPeak && ramadanIftarDrop !== null && termIftarDrop !== null ? (
      <Finding
        title={
          ramadanPeak.hour !== termPeak.hour
            ? `Ramazan'da trafik ${formatHour(ramadanPeak.hour)}'de zirve yapıyor`
            : `Ramazan'da iftar saatinde trafik ${formatSignedPercent(ramadanIftarDrop)}`
        }
      >
        Okul döneminde akşam hacmi {formatHour(termPeak.hour)}&apos;de zirve yapar ve 19:00&apos;a kadar{" "}
        {formatSignedPercent(termIftarDrop)} değişir. Ramazan&apos;da zirve {formatHour(ramadanPeak.hour)}&apos;e çekilir, iftar
        saati 19:00&apos;da hücre başına araç zirveye göre {formatSignedPercent(ramadanIftarDrop)} değişir. En yavaş saat iki
        dönemde de {formatHour(ramadanLow?.hour ?? 18)}.
      </Finding>
    ) : null;

  return (
    <>
      <header className="page-title report-title">
        <p className="eyebrow">Analiz raporu</p>
        <h1>İstanbul trafiği, {formatMonth(first.month)} - {formatMonth(last.month)}</h1>
        <p>
          {formatInteger(monthly.length)} ayda {formatCompact(totalRows)} saatlik ölçümün uzun dönemli analizi. Bölümler
          sırayla okunabilir veya içindekiler listesinden doğrudan açılabilir. Metindeki bulgular veriden hesaplanır, yeni bir
          ay yüklendiğinde kendiliğinden güncellenir.
        </p>
      </header>

      <div className="report">
        <nav aria-label="Rapor bölümleri" className="report-nav">
          <p className="report-nav-title">İçindekiler</p>
          <ol>
            {SECTIONS.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="report-body">
          <ReportSection
            id="ozet"
            lead={`${currentYear} yılının aylık ortalamaları ${previousYearNumber} ile karşılaştırılır. Okların yönü trafiğin iyileştiğini veya kötüleştiğini gösterir.`}
            number={1}
            title="Dönemin özeti"
          >
            <section className="stats" aria-label="Yıllık göstergeler">
              <StatTile
                label="Kapsanan dönem"
                note={`${formatInteger(totalRows)} satır`}
                value={`${formatInteger(monthly.length)} ay`}
              />
              <StatTile
                delta={comparable ? yearDelta(eveningNow, eveningBefore, previousYearNumber, true) : undefined}
                label={`Akşam zirvesi hızı, ${currentYear}`}
                note="Hafta içi 17:00-19:59"
                value={formatSpeed(eveningNow)}
              />
              <StatTile
                delta={comparable ? yearDelta(congestionNow, congestionBefore, previousYearNumber, false, 3) : undefined}
                label={`Tıkanıklık endeksi, ${currentYear}`}
                note="1 - akşam hızı / gece hızı"
                value={congestionNow === null ? "Veri yok" : formatIndex(congestionNow)}
              />
              <StatTile
                delta={comparable ? yearDelta(hoursNow, hoursBefore, previousYearNumber, false) : undefined}
                label={`Yoğun saat / iş günü, ${currentYear}`}
                note="Şehir hızı gece hızının %75'inin altında"
                value={hoursNow === null ? "Veri yok" : `${formatDecimal(hoursNow)} saat`}
              />
            </section>
            <div className="findings-grid">
              <Finding title={`En yavaş ay: ${formatMonth(slowestMonth.month)}`}>
                Hafta içi akşam zirvesinde şehir ortalaması {formatSpeed(slowestMonth.eveningPeakSpeedKmh)} oldu. En rahat ay{" "}
                {formatMonth(fastestMonth.month)} ({formatSpeed(fastestMonth.eveningPeakSpeedKmh)}).
              </Finding>
              {evening?.averageChange !== null && evening?.averageChange !== undefined ? (
                <Finding title={`Akşamlar ${evening.currentYear}'te ortalama ${formatSigned(evening.averageChange)} km/sa`}>
                  {yearSummary(evening.pairs)}
                </Finding>
              ) : null}
              {ramadanFinding}
              {slowerShare !== null && changes.currentFrom ? (
                <Finding title={`Hücrelerin ${formatPercent(slowerShare)}'i yavaşladı`}>
                  Son 12 ayın akşam zirvesi önceki 12 ayla karşılaştırıldığında hücrelerin {formatPercent(fasterShare ?? 0)}&apos;i
                  hızlandı, kalanında değişim 1 km/sa&apos;in altında.
                </Finding>
              ) : null}
            </div>
          </ReportSection>

          <ReportSection
            id="aylik-trend"
            lead="Her ay için dört zaman diliminin araç ağırlıklı şehir hızı. Gece hızı serbest akışın, akşam zirvesi ise en yoğun saatlerin göstergesidir."
            number={2}
            title="Aylar boyunca hız"
          >
            <div className="grid">
              <ChartCard
                className="span-8"
                subtitle="Hafta içi zirveler resmî tatilleri dışarıda bırakır"
                table={
                  <DataTable
                    columns={["Ay", "Gece 01-04", "Gün geneli", "Sabah 07-09", "Akşam 17-19"]}
                    rows={monthly.map((month) => [
                      formatMonth(month.month),
                      month.nightSpeedKmh === null ? "-" : formatDecimal(month.nightSpeedKmh),
                      month.weightedAverageSpeedKmh === null ? "-" : formatDecimal(month.weightedAverageSpeedKmh),
                      month.morningPeakSpeedKmh === null ? "-" : formatDecimal(month.morningPeakSpeedKmh),
                      month.eveningPeakSpeedKmh === null ? "-" : formatDecimal(month.eveningPeakSpeedKmh),
                    ])}
                  />
                }
                title="Aylık ortalama hız"
              >
                <SeriesChart
                  ariaLabel="Aylara göre gece, gün geneli, sabah ve akşam zirvesi hızı"
                  height={320}
                  labels={monthly.map((month) => formatMonth(month.month))}
                  series={[
                    { id: "night", label: "Gece 01-04", color: SERIES_COLORS[0] ?? "", values: monthly.map((month) => month.nightSpeedKmh) },
                    { id: "all", label: "Gün geneli", color: SERIES_COLORS[1] ?? "", values: monthly.map((month) => month.weightedAverageSpeedKmh) },
                    { id: "morning", label: "Sabah 07-09", color: SERIES_COLORS[2] ?? "", values: monthly.map((month) => month.morningPeakSpeedKmh) },
                    { id: "evening", label: "Akşam 17-19", color: SERIES_COLORS[3] ?? "", values: monthly.map((month) => month.eveningPeakSpeedKmh) },
                  ]}
                  ticks={monthly
                    .map((month, index) => ({ index, label: formatShortMonth(month.month) }))
                    .filter((tick) => tick.index % 3 === 0)}
                  unit="speed"
                />
              </ChartCard>
              <div className="span-4 stack">
                <Finding title="Gece ile akşam arasındaki makas">
                  {formatMonth(mostCongested.month)} ayında akşam hızı gece hızının{" "}
                  {formatPercent((1 - (mostCongested.congestionIndex ?? 0)) * 100)}&apos;ine indi. Bu, dönemin en yüksek tıkanıklık
                  endeksi ({formatIndex(mostCongested.congestionIndex ?? 0)}).
                </Finding>
                <Finding title="Sabah zirvesi akşamdan rahat">
                  Tüm dönemde sabah zirvesi ortalama {formatSpeed(mean(monthly, (month) => month.morningPeakSpeedKmh))}, akşam zirvesi{" "}
                  {formatSpeed(mean(monthly, (month) => month.eveningPeakSpeedKmh))}. Akşam trafiği iş, okul ve sosyal yolculukları
                  aynı saatlere toplar.
                </Finding>
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="yillik"
            lead={
              evening
                ? `${evening.currentYear} yılının her ayı ${evening.previousYear} yılının aynı ayıyla karşılaştırılır. Mevsim etkisi böylece ortadan kalkar.`
                : "Yıllık karşılaştırma için aynı ayın iki yılına ait veri gerekir."
            }
            number={3}
            title="Yıllık karşılaştırma"
          >
            {evening ? (
              <div className="grid">
                <ChartCard
                  className="span-7"
                  subtitle="Hafta içi 17:00-19:59 şehir hızı"
                  table={
                    <DataTable
                      columns={["Ay", String(evening.previousYear), String(evening.currentYear), "Fark (km/sa)"]}
                      rows={evening.pairs.map((pair) => [
                        formatMonthIndex(pair.monthIndex),
                        pair.previous === null ? "-" : formatDecimal(pair.previous),
                        pair.current === null ? "-" : formatDecimal(pair.current),
                        pair.change === null ? "-" : formatSigned(pair.change),
                      ])}
                    />
                  }
                  title={`Akşam zirvesi: ${evening.previousYear} ve ${evening.currentYear}`}
                >
                  <SeriesChart
                    ariaLabel={`${evening.previousYear} ve ${evening.currentYear} aylık akşam zirvesi hızı`}
                    labels={evening.pairs.map((pair) => formatMonthIndex(pair.monthIndex))}
                    series={[
                      { id: "previous", label: String(evening.previousYear), color: "var(--series-2)", values: evening.pairs.map((pair) => pair.previous) },
                      { id: "current", label: String(evening.currentYear), color: "var(--series-1)", values: evening.pairs.map((pair) => pair.current) },
                    ]}
                    ticks={evening.pairs.map((pair) => ({ index: pair.monthIndex, label: formatMonthIndex(pair.monthIndex) }))}
                    unit="speed"
                  />
                </ChartCard>
                <ChartCard className="span-5" subtitle="Pozitif değer akşamların hızlandığını gösterir" title="Aylık fark">
                  <DivergingBars
                    items={evening.pairs
                      .filter((pair) => pair.change !== null)
                      .map((pair) => ({
                        label: formatMonthIndex(pair.monthIndex),
                        value: pair.change ?? 0,
                        display: `${formatSigned(pair.change ?? 0)}`,
                      }))}
                    negativeLabel="Daha yavaş"
                    positiveLabel="Daha hızlı"
                  />
                </ChartCard>
                {congestion?.averageChange !== null && congestion?.averageChange !== undefined ? (
                  <div className="span-12">
                    <Finding title={`Tıkanıklık endeksi ortalama ${formatSigned(congestion.averageChange, 3)} değişti`}>
                      Endeks şehrin akşamını kendi gecesiyle kıyasladığı için mevsim ve ölçüm kapsamındaki değişimlerden ham hıza
                      göre daha az etkilenir.
                    </Finding>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState title="Karşılaştırma yapılamıyor" message="Aynı ayın iki farklı yılı yüklendiğinde bu bölüm dolar." />
            )}
          </ReportSection>

          <ReportSection
            id="tikaniklik"
            lead="Tıkanıklık endeksi akşam zirvesinin gece hızına göre ne kadar düştüğünü, yoğun saat sayısı ise bir iş gününde şehrin kaç saat boyunca gece hızının dörtte üçünün altında aktığını gösterir."
            number={4}
            title="Tıkanıklık ve yoğun saatler"
          >
            <div className="grid">
              <ChartCard
                className="span-6"
                subtitle="1 - akşam zirvesi hızı / gece hızı"
                table={
                  <DataTable
                    columns={["Ay", "Endeks", "Yoğun saat / iş günü"]}
                    rows={monthly.map((month) => [
                      formatMonth(month.month),
                      month.congestionIndex === null ? "-" : formatIndex(month.congestionIndex),
                      month.congestedHoursPerWeekday === null ? "-" : formatDecimal(month.congestedHoursPerWeekday),
                    ])}
                  />
                }
                title="Aylık tıkanıklık endeksi"
              >
                <ColumnBars
                  formatValue={(value) => formatIndex(value)}
                  items={monthly.map((month) => ({
                    key: month.month,
                    label: formatShortMonth(month.month),
                    value: month.congestionIndex,
                    highlight: month.month === mostCongested.month,
                    title: `${formatMonth(month.month)}: ${month.congestionIndex === null ? "veri yok" : formatIndex(month.congestionIndex)}`,
                  }))}
                />
              </ChartCard>
              <ChartCard className="span-6" subtitle="Hafta içi, tatil olmayan ve en az 20 saati ölçülmüş günler" title="İş günü başına yoğun saat">
                <ColumnBars
                  formatValue={(value) => formatDecimal(value)}
                  items={monthly.map((month) => ({
                    key: month.month,
                    label: formatShortMonth(month.month),
                    value: month.congestedHoursPerWeekday,
                    title: `${formatMonth(month.month)}: ${month.congestedHoursPerWeekday === null ? "veri yok" : `${formatDecimal(month.congestedHoursPerWeekday)} saat`}`,
                  }))}
                />
              </ChartCard>
            </div>
          </ReportSection>

          <ReportSection
            id="mevsimsellik"
            lead="Her satır bir ayın hafta içi saatlik profilidir. Koyu hücreler yavaş trafiği gösterir. Akşam koyuluğunun genişliği, yoğunluğun kaç saate yayıldığını anlatır."
            number={5}
            title="Ay ve saate göre hız"
          >
            <div className="grid">
              <ChartCard className="span-12" subtitle="Hafta içi, resmî tatiller hariç" title="Ay x saat ısı haritası">
                <MatrixHeatmap ariaLabel="Ay ve saate göre hafta içi hız" cells={monthHour.map((cell) => ({ row: cell.month, hour: cell.hourOfDay, value: cell.weightedAverageSpeedKmh }))} labelWidth={64} rows={monthRows} rowHeight={18} />
              </ChartCard>
              <div className="span-12">
                <Finding title={`Akşamın en yavaş saati çoğu ayda ${formatHour(usualLowHour)}`}>
                  {shiftedMonths.length === 0
                    ? "Zirve saati dönem boyunca hiç değişmedi."
                    : `Zirvenin farklı saate kaydığı aylar: ${shiftedMonths
                        .slice(0, 8)
                        .map(({ month, low }) => `${formatMonth(month.month)} (${formatHour(low?.hour ?? 0)})`)
                        .join(", ")}${shiftedMonths.length > 8 ? " ve diğerleri" : ""}.`}
                </Finding>
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="haftanin-gunleri"
            lead="Tüm dönem boyunca haftanın her günü için saatlik hız. Resmî tatiller hesaba katılmaz."
            number={6}
            title="Haftanın günleri"
          >
            <div className="grid">
              <ChartCard className="span-8" subtitle="Araç ağırlıklı ortalama, tüm aylar" title="Gün x saat ısı haritası">
                <MatrixHeatmap
                  ariaLabel="Haftanın günü ve saate göre hız"
                  cells={dayOfWeek.map((cell) => ({ row: String(cell.isoDayOfWeek), hour: cell.hourOfDay, value: cell.weightedAverageSpeedKmh }))}
                  labelWidth={84}
                  rowHeight={30}
                  rows={dayRows}
                />
              </ChartCard>
              <div className="span-4 stack">
                {slowestDayHour ? (
                  <Finding title={`Haftanın en yavaş saati: ${slowestDayHour.dayName} ${formatHour(slowestDayHour.hourOfDay)}`}>
                    Bu saatte şehir ortalaması {formatSpeed(slowestDayHour.weightedAverageSpeedKmh)}.
                  </Finding>
                ) : null}
                <Finding title={`Akşamları en zor gün ${worstEvening.name}`}>
                  17:00-19:59 arasında {worstEvening.name} ortalaması {formatSpeed(worstEvening.speed)}, en rahat iş günü{" "}
                  {bestEvening.name} ({formatSpeed(bestEvening.speed)}).
                </Finding>
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="takvim"
            lead="Her kare bir gündür ve rengi o günün 17:00-19:59 şehir hızını gösterir. Renk sınıfları tüm iş günlerinin dağılımından hesaplanır, böylece her renk günlerin yaklaşık yedide birini kapsar."
            number={7}
            title="Takvim: her gün tek tek"
          >
            <div className="grid">
              <ChartCard className="span-12" subtitle="Noktalı günler resmî tatildir. Gri günlerde akşam verisi yoktur." title="Akşam hızı takvimi">
                <CalendarHeatmap days={calendar} thresholds={calendarThresholds} />
              </ChartCard>
              <ChartCard className="span-6" subtitle="Hafta içi, tatil olmayan günler" title="Akşamı en yavaş 10 gün">
                <DataTable
                  columns={["Tarih", "Gün", "Akşam hızı", "Dönem"]}
                  rows={slowDays.map((day) => [formatLongDate(day.date), day.dayName, formatSpeed(day.eveningSpeedKmh), day.periods ?? ""])}
                />
              </ChartCard>
              <ChartCard className="span-6" subtitle="Hafta içi, tatil olmayan günler" title="Akşamı en hızlı 10 gün">
                <DataTable
                  columns={["Tarih", "Gün", "Akşam hızı", "Dönem"]}
                  rows={fastDays.map((day) => [formatLongDate(day.date), day.dayName, formatSpeed(day.eveningSpeedKmh), day.periods ?? ""])}
                />
              </ChartCard>
            </div>
          </ReportSection>

          <ReportSection
            id="donemler"
            lead="Hafta içi günler okul dönemi, yarıyıl ve ara tatiller, yaz tatili ve Ramazan olarak gruplanır. Bir gün birden fazla döneme denk gelirse Ramazan önceliklidir."
            number={8}
            title="Okul, tatil ve Ramazan"
          >
            <div className="grid">
              <ChartCard
                className="span-6"
                subtitle="Hafta içi saatlik hız"
                table={
                  <DataTable
                    columns={["Saat", ...periodProfiles.map((profile) => PERIOD_LABELS[profile.period])]}
                    rows={HOURS.map((hour) => [
                      formatHour(hour),
                      ...periodProfiles.map((profile) => {
                        const value = profile.speeds[hour];
                        return value === null || value === undefined ? "-" : formatDecimal(value);
                      }),
                    ])}
                  />
                }
                title="Dönemlere göre hız"
              >
                <SeriesChart
                  ariaLabel="Dönemlere göre hafta içi saatlik hız"
                  labels={HOURS.map(formatHour)}
                  series={periodProfiles.map((profile, index) => ({
                    id: profile.period,
                    label: `${PERIOD_LABELS[profile.period]} (${profile.days} gün)`,
                    color: SERIES_COLORS[index] ?? "var(--series-1)",
                    values: profile.speeds,
                  }))}
                  ticks={HOUR_TICKS}
                  unit="speed"
                />
              </ChartCard>
              <ChartCard
                className="span-6"
                subtitle="Hücre ve saat başına ortalama araç"
                table={
                  <DataTable
                    columns={["Saat", ...periodProfiles.map((profile) => PERIOD_LABELS[profile.period])]}
                    rows={HOURS.map((hour) => [
                      formatHour(hour),
                      ...periodProfiles.map((profile) => {
                        const value = profile.vehicles[hour];
                        return value === null || value === undefined ? "-" : formatDecimal(value);
                      }),
                    ])}
                  />
                }
                title="Dönemlere göre trafik hacmi"
              >
                <SeriesChart
                  ariaLabel="Dönemlere göre hafta içi saatlik araç sayısı"
                  labels={HOURS.map(formatHour)}
                  series={periodProfiles.map((profile, index) => ({
                    id: profile.period,
                    label: PERIOD_LABELS[profile.period],
                    color: SERIES_COLORS[index] ?? "var(--series-1)",
                    values: profile.vehicles,
                  }))}
                  ticks={HOUR_TICKS}
                  unit="vehicles"
                />
              </ChartCard>
              <div className="span-12 findings-grid">
                {termMorning !== null && summerMorning !== null ? (
                  <Finding title={`Yazın sabahlar ${formatSigned(summerMorning - termMorning)} km/sa`}>
                    07:00-09:59 arasında yaz tatili ortalaması {formatSpeed(summerMorning)}, okul dönemi {formatSpeed(termMorning)}.
                    Okul servisleri ve veli trafiği sabahı belirgin biçimde yavaşlatır.
                  </Finding>
                ) : null}
                {summerLow && termLow ? (
                  <Finding title={`Yaz akşamı en yavaş saat ${formatHour(summerLow.hour)}`}>
                    Yaz tatilinde akşamın en düşük hızı {formatSpeed(summerLow.value)}, okul döneminde {formatSpeed(termLow.value)}.
                  </Finding>
                ) : null}
                {ramadanFinding}
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="tatiller"
            lead="Her resmî tatil, çevresindeki üç haftanın aynı gününe ait 07:00-21:59 saatleriyle karşılaştırılır. Böylece Pazar gününe denk gelen tatil Pazar günleriyle kıyaslanır."
            number={9}
            title="Bayramlar ve resmî tatiller"
          >
            <div className="grid">
              <ChartCard
                className="span-7"
                subtitle="Gündüz hızının olağan günlere göre farkı (km/sa)"
                table={
                  <DataTable
                    columns={["Tatil", "Tarih", "Gün", "Tatil hızı", "Olağan", "Fark", "Araç değişimi"]}
                    rows={measuredHolidays.map((holiday) => [
                      holiday.name,
                      formatShortDate(holiday.startDate) + (holiday.days > 1 ? ` - ${formatShortDate(holiday.endDate)}` : ""),
                      String(holiday.days),
                      formatSpeed(holiday.holidaySpeedKmh),
                      formatSpeed(holiday.baselineSpeedKmh),
                      holiday.speedChangeKmh === null ? "-" : formatSigned(holiday.speedChangeKmh),
                      holiday.volumeChangePct === null ? "-" : formatSignedPercent(holiday.volumeChangePct),
                    ])}
                  />
                }
                title="Tatillerde şehir ne kadar rahatlıyor?"
              >
                <DivergingBars
                  items={measuredHolidays.map((holiday) => ({
                    label: `${holiday.name} ${holiday.startDate.slice(0, 4)}`,
                    value: holiday.speedChangeKmh ?? 0,
                    display: formatSigned(holiday.speedChangeKmh ?? 0),
                  }))}
                  negativeLabel="Daha yavaş"
                  positiveLabel="Daha hızlı"
                />
              </ChartCard>
              <div className="span-5 stack">
                {quietestHoliday ? (
                  <Finding title={`En sessiz tatil: ${quietestHoliday.name} ${quietestHoliday.startDate.slice(0, 4)}`}>
                    Hücre başına araç olağan günlere göre {formatSignedPercent(quietestHoliday.volumeChangePct ?? 0)} değişti, gündüz
                    hızı {formatSigned(quietestHoliday.speedChangeKmh ?? 0)} km/sa farklılaştı.
                  </Finding>
                ) : null}
                <Finding title="Uzun bayramlar en büyük etkiyi yapar">
                  Ramazan ve Kurban bayramlarında şehir dışına çıkış ve kapalı iş yerleri trafiği birkaç gün boyunca azaltır. Tek
                  günlük tatillerde etki, günün haftanın hangi gününe denk geldiğine bağlıdır.
                </Finding>
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="guvenilirlik"
            lead="Ortalama hız bir saatin tipik durumunu anlatır, ama yolculuk planlarken kötü günler önemlidir. Bant ne kadar genişse o saatte trafiğin ne olacağını önceden kestirmek o kadar zordur."
            number={10}
            title="Öngörülebilirlik"
          >
            <div className="grid">
              <ChartCard
                className="span-8"
                subtitle="Hafta içi günlerin saatlik şehir hızı dağılımı"
                table={
                  <DataTable
                    columns={["Saat", "Gün", "10.", "25.", "Medyan", "75.", "90."]}
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
                title="Saat saat günlük hız aralığı"
              >
                <BandChart points={reliability} />
              </ChartCard>
              <div className="span-4 stack">
                {widest ? (
                  <Finding title={`En belirsiz saat ${formatHour(widest.hourOfDay)}`}>
                    Bu saatte iyi bir gün ({formatSpeed(widest.p90SpeedKmh)}) ile kötü bir gün ({formatSpeed(widest.p10SpeedKmh)})
                    arasında {formatDecimal(widest.p90SpeedKmh - widest.p10SpeedKmh)} km/sa fark var.
                  </Finding>
                ) : null}
                {quietHour ? (
                  <Finding title="Gece neredeyse sabit">
                    03:00&apos;te günlerin %80&apos;i {formatDecimal(quietHour.p10SpeedKmh)} ile {formatDecimal(quietHour.p90SpeedKmh)} km/sa
                    arasında kalır.
                  </Finding>
                ) : null}
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="konum-degisimi"
            lead={
              changes.currentFrom && changes.previousFrom && changes.previousTo && changes.currentTo
                ? `Her hücrenin hafta içi akşam zirvesi hızı, ${formatMonth(changes.currentFrom)} - ${formatMonth(changes.currentTo)} ile ${formatMonth(changes.previousFrom)} - ${formatMonth(changes.previousTo)} arasında karşılaştırılır. Seyrek ölçülen hücreler sıralamayı bozmasın diye, her iki dönemde de en iyi ölçülen hücrenin akşam saatlerinin en az yarısı kadar veri gerekir.`
                : "Bu bölüm iki ayrı 12 aylık dönem yüklendiğinde dolar."
            }
            number={11}
            title="Hangi bölgeler yavaşladı?"
          >
            {located.length === 0 ? (
              <EmptyState title="Karşılaştırma için yeterli veri yok" message="En az iki yıllık veri yüklendiğinde bu harita oluşur." />
            ) : (
              <div className="grid">
                <ChartCard className="span-8" subtitle={`${formatInteger(located.length)} hücre. Kırmızı hücreler yavaşladı, mavi hücreler hızlandı.`} title="Akşam zirvesi hız değişimi">
                  <CellMap
                    ariaLabel="Hücrelere göre akşam zirvesi hız değişimi haritası. En çok değişen hücreler yandaki tablolardadır."
                    cells={located.map((cell) => ({
                      id: cell.geohash,
                      latitude: cell.latitude,
                      longitude: cell.longitude,
                      level: changeClass(cell.speedChangeKmh),
                      lines: [
                        { value: `${formatSigned(cell.speedChangeKmh)} km/sa`, label: "değişim" },
                        { value: formatSpeed(cell.currentPeakSpeedKmh), label: "son 12 ay" },
                        { value: formatSpeed(cell.previousPeakSpeedKmh), label: "önceki 12 ay" },
                      ],
                    }))}
                    legend={{ low: "6 km/sa üstü hızlandı", high: "6 km/sa üstü yavaşladı" }}
                  />
                </ChartCard>
                <div className="span-4 stack">
                  {medianChange !== null ? (
                    <Finding title={`Medyan hücre ${formatSigned(medianChange)} km/sa`}>
                      Hücrelerin {formatPercent(slowerShare ?? 0)}&apos;inde akşam zirvesi 1 km/sa&apos;ten fazla yavaşladı,{" "}
                      {formatPercent(fasterShare ?? 0)}&apos;inde hızlandı. Değişimler hücrenin kendi geçmişiyle kıyaslandığı için ölçüm
                      kapsamındaki saatlik dalgalanmalardan etkilenmez.
                    </Finding>
                  ) : null}
                  {medianChange !== null &&
                  evening?.averageChange !== null &&
                  evening?.averageChange !== undefined &&
                  Math.abs(evening.averageChange - medianChange) >= 1 ? (
                    <Finding title="Şehir ortalaması ile tipik hücre ayrışıyor">
                      Şehrin araç ağırlıklı akşam hızı yıllık {formatSigned(evening.averageChange)} km/sa değişirken medyan hücre{" "}
                      {formatSigned(medianChange)} km/sa değişti. İyileşme hücrelerin çoğuna yayılmamış, araç ağırlığı yüksek ana
                      arterlerde toplanmış olabilir. Sayım düzeyindeki değişim de ağırlıkları kaydırmış olabilir, bu yüzden şehir
                      ortalamasındaki artış tek başına &quot;trafik rahatladı&quot; diye okunmamalı.
                    </Finding>
                  ) : null}
                  <Link className="button secondary" href="/harita">
                    Haritada hücre profillerini incele
                  </Link>
                </div>
                <ChartCard className="span-6" subtitle="Akşam zirvesi hızı, km/sa" title="En çok yavaşlayan 10 hücre">
                  <DataTable
                    columns={["Hücre", "Önceki 12 ay", "Son 12 ay", "Fark"]}
                    rows={worsened.map((cell) => [
                      cell.geohash,
                      formatDecimal(cell.previousPeakSpeedKmh),
                      formatDecimal(cell.currentPeakSpeedKmh),
                      formatSigned(cell.speedChangeKmh),
                    ])}
                  />
                </ChartCard>
                <ChartCard className="span-6" subtitle="Akşam zirvesi hızı, km/sa" title="En çok hızlanan 10 hücre">
                  <DataTable
                    columns={["Hücre", "Önceki 12 ay", "Son 12 ay", "Fark"]}
                    rows={improved.map((cell) => [
                      cell.geohash,
                      formatDecimal(cell.previousPeakSpeedKmh),
                      formatDecimal(cell.currentPeakSpeedKmh),
                      formatSigned(cell.speedChangeKmh),
                    ])}
                  />
                </ChartCard>
              </div>
            )}
          </ReportSection>

          <ReportSection
            id="veri-kapsami"
            lead="Analizlerin ne kadar güvenilir olduğu, verinin ne kadar eksiksiz olduğuna bağlıdır. Bu bölüm her ayın kapsamasını ve raporda kullanılan kuralları listeler."
            number={12}
            title="Veri kapsamı ve yöntem"
          >
            <div className="grid">
              <ChartCard className="span-7" subtitle="Analize uygun verisi olan saatlerin oranı" title="Aylık kapsama">
                <ColumnBars
                  formatValue={(value) => `%${Math.round(value)}`}
                  items={monthly.map((month) => ({
                    key: month.month,
                    label: formatShortMonth(month.month),
                    value: month.coveragePct,
                    highlight: month.coveragePct < 95,
                    title: `${formatMonth(month.month)}: ${formatPercent(month.coveragePct)}`,
                  }))}
                />
                <p className="card-subtitle" style={{ marginTop: 10 }}>
                  En düşük kapsama {formatMonth(lowestCoverage.month)} ayında: {formatPercent(lowestCoverage.coveragePct)},{" "}
                  {formatInteger(lowestCoverage.partialHours)} kesintili saat. Ayrıntılar{" "}
                  <Link href="/veri-hatti">veri hattı sayfasında</Link>.
                </p>
              </ChartCard>
              <ChartCard
                className="span-7"
                subtitle="Hücre ve saat başına ortalama araç"
                table={
                  <DataTable
                    columns={["Ay", "Hücre başına araç"]}
                    rows={monthly.map((month) => [formatMonth(month.month), formatDecimal(month.averageVehicleCount)])}
                  />
                }
                title="Aylık trafik hacmi"
              >
                <ColumnBars
                  formatValue={(value) => formatInteger(value)}
                  items={monthly.map((month) => ({
                    key: month.month,
                    label: formatShortMonth(month.month),
                    value: month.averageVehicleCount,
                    highlight: month.month === volumeBreak?.month,
                    title: `${formatMonth(month.month)}: ${formatDecimal(month.averageVehicleCount)} araç`,
                  }))}
                />
              </ChartCard>
              <div className="span-5 stack">
                {volumeBreak ? (
                  <Finding title={`${formatMonth(volumeBreak.month)} itibarıyla sayım düzeyi değişti`}>
                    Hücre başına araç bir ayda {formatDecimal(volumeBreak.previous)}&apos;ten {formatDecimal(volumeBreak.current)}&apos;e
                    çıktı ({formatSignedPercent(volumeBreak.changePct)}) ve bu düzeyde kaldı. Hız serilerinde aynı kırılma görülmediği için
                    bu, trafikteki bir artıştan çok İBB&apos;nin araç sayımındaki bir değişikliğe işaret eder. Bu tarihin iki yanı arasında
                    hacim karşılaştırılmaz, hız karşılaştırmaları etkilenmez.
                  </Finding>
                ) : null}
              </div>
              <ChartCard className="span-12" title="Yöntem notları">
                <ul className="notes">
                  <li>Hızlar araç sayısıyla ağırlıklandırılır. Basit ortalama yoğun saatleri olduğundan hızlı gösterir.</li>
                  <li>Ham satırlar yerine yükleme sırasında güncellenen saatlik ve günlük özet tablolar okunur.</li>
                  <li>Veri kesintisi olan saatler, ortalama hızı 150 km/sa üstündeki ölçümler ve 5 araç altındaki konum ölçümleri dışarıda bırakılır.</li>
                  <li>Her saatte veri gönderen hücre sayısı değiştiği için hacim, toplam araç yerine hücre ve saat başına ortalama araçla karşılaştırılır.</li>
                  <li>Okul ve tatil tarihleri MEB çalışma takviminden, resmî tatiller ETL takviminden alınır.</li>
                </ul>
              </ChartCard>
            </div>
          </ReportSection>
        </div>
      </div>
    </>
  );
}

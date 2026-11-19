import Link from "next/link";
import { DailyTrendChart } from "@/components/charts/DailyTrendChart";
import { HourlyChart } from "@/components/charts/HourlyChart";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { SpeedHeatmap } from "@/components/charts/SpeedHeatmap";
import { FilterFrame } from "@/components/FilterFrame";
import { ChartCard, DataTable, EmptyState, Finding, HorizontalBars, makeDelta, StatTile, type StatDelta } from "@/components/ui";
import {
  getDailyTrend,
  getDayTypeComparison,
  getHeatmap,
  getHourlyProfile,
  getMetadata,
  getMonthlyInsights,
  getSpeedBands,
  getSummary,
} from "@/lib/api";
import { buildRange, DAY_TYPE_OPTIONS, parseFilter, previousYear, rangeDays, type RawSearchParams } from "@/lib/filters";
import {
  formatDecimal,
  formatHour,
  formatInteger,
  formatLongDate,
  formatMonth,
  formatPercent,
  formatShortDate,
  formatSigned,
  formatSignedPercent,
  formatSpeed,
} from "@/lib/format";
import { findVolumeBreak, maximumHour, minimumHour, spansBreak } from "@/lib/insights";
import type { HourlyPoint, TrafficSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The day by hour matrix stays readable up to about two months of rows. */
const HEATMAP_MAX_DAYS = 62;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const averageVehicles = (summary: TrafficSummary) =>
  summary.totals.observationCount > 0 ? summary.totals.vehicleObservations / summary.totals.observationCount : null;

function speedDelta(current: number | null, previous: number | null | undefined, year: string): StatDelta | undefined {
  if (current === null || previous === null || previous === undefined) {
    return undefined;
  }
  const change = current - previous;
  return makeDelta(change, `${year}: ${formatSpeed(previous)} (${formatSigned(change)} km/sa)`, true);
}

const hourValues = (points: HourlyPoint[]) =>
  HOURS.map((hour) => points.find((point) => point.hourOfDay === hour)?.weightedAverageSpeedKmh ?? null);

export default async function OverviewPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const metadata = await getMetadata();
  if (!metadata.firstDate || !metadata.lastDate) {
    return <NoDataLoaded />;
  }

  const range = buildRange(metadata.firstDate, metadata.lastDate);
  const filter = parseFilter(await searchParams, range);
  const earlier = previousYear(filter, range);
  const showHeatmap = rangeDays(filter.from, filter.to) <= HEATMAP_MAX_DAYS;

  const [summary, hourly, comparison, daily, heatmap, bands, previousSummary, previousHourly, monthly] = await Promise.all([
    getSummary(filter),
    getHourlyProfile(filter),
    getDayTypeComparison(filter),
    getDailyTrend(filter),
    showHeatmap ? getHeatmap(filter) : Promise.resolve([]),
    getSpeedBands(filter),
    earlier ? getSummary(earlier) : Promise.resolve(null),
    earlier ? getHourlyProfile(earlier) : Promise.resolve(null),
    getMonthlyInsights(),
  ]);

  const { totals, slowestHour, fastestHour } = summary;
  const dayTypeLabel = DAY_TYPE_OPTIONS.find((option) => option.value === filter.dayType)?.label;
  const hasData = totals.observationCount > 0;
  const hasPrevious = previousSummary !== null && previousSummary.totals.observationCount > 0;
  const previousLabel = earlier ? earlier.from.slice(0, 4) === earlier.to.slice(0, 4) ? earlier.from.slice(0, 4) : "Geçen yıl" : "";

  const vehiclesNow = averageVehicles(summary);
  const vehiclesBefore = hasPrevious && previousSummary ? averageVehicles(previousSummary) : null;
  // Volume is not compared across the month in which the counting level changed.
  const volumeBreak = findVolumeBreak(monthly);
  const crossesBreak = earlier !== null && spansBreak(volumeBreak, earlier.from, filter.to);
  const volumeChange =
    vehiclesNow !== null && vehiclesBefore && !crossesBreak ? (vehiclesNow / vehiclesBefore - 1) * 100 : null;

  const currentLine = hourValues(hourly);
  const previousLine = previousHourly ? hourValues(previousHourly) : null;
  const eveningNow = minimumHour(currentLine, 12, 23);
  const eveningBefore = previousLine ? minimumHour(previousLine, 12, 23) : null;
  const biggestDrop = previousLine
    ? maximumHour(currentLine.map((value, hour) => (value === null || previousLine[hour] === null ? null : (previousLine[hour] ?? 0) - value)))
    : null;

  return (
    <>
      <header className="page-title">
        <p className="eyebrow">Genel bakış</p>
        <h1>İstanbul trafiğine genel bakış</h1>
        <p>
          {formatLongDate(filter.from)} ile {formatLongDate(filter.to)} arasındaki {dayTypeLabel?.toLocaleLowerCase("tr-TR")}.
          Hızlar araç sayısına göre ağırlıklıdır, veri kesintisi olan saatler hesaba katılmaz.
          {hasPrevious ? " Göstergeler bir önceki yılın aynı tarihleriyle karşılaştırılır." : ""}
        </p>
      </header>

      <FilterFrame filter={filter} months={metadata.loadedMonths} range={range}>
        {!hasData ? (
          <EmptyState
            resetHref="/"
            title="Bu filtrede veri yok"
            message="Seçtiğiniz tarih aralığında bu gün tipine ait gözlem bulunmuyor. Tarih aralığını genişletin veya başka bir gün tipi seçin."
          />
        ) : (
          <>
            <section className="stats" aria-label="Özet göstergeler">
              <StatTile
                delta={speedDelta(totals.weightedAverageSpeedKmh, previousSummary?.totals.weightedAverageSpeedKmh, previousLabel)}
                label="Ortalama hız"
                note={`Basit ortalama ${formatSpeed(totals.simpleAverageSpeedKmh)}`}
                value={formatSpeed(totals.weightedAverageSpeedKmh)}
              />
              <StatTile
                delta={speedDelta(
                  slowestHour?.weightedAverageSpeedKmh ?? null,
                  hasPrevious ? previousSummary?.slowestHour?.weightedAverageSpeedKmh : null,
                  previousLabel,
                )}
                label="En yavaş saat"
                note={formatSpeed(slowestHour?.weightedAverageSpeedKmh)}
                value={slowestHour ? formatHour(slowestHour.hourOfDay) : "Veri yok"}
              />
              <StatTile
                label="En hızlı saat"
                note={formatSpeed(fastestHour?.weightedAverageSpeedKmh)}
                value={fastestHour ? formatHour(fastestHour.hourOfDay) : "Veri yok"}
              />
              <StatTile
                delta={
                  volumeChange === null
                    ? undefined
                    : makeDelta(
                        volumeChange,
                        `${previousLabel}: ${formatDecimal(vehiclesBefore ?? 0)} (${formatSignedPercent(volumeChange)})`,
                        null,
                      )
                }
                label="Hücre başına araç"
                note={
                  crossesBreak && volumeBreak
                    ? `Geçen yılla karşılaştırılmaz, sayım düzeyi ${formatMonth(volumeBreak.month)} ayında değişti`
                    : `${formatInteger(totals.locationCount)} hücre, saatlik ortalama`
                }
                value={vehiclesNow === null ? "Veri yok" : formatDecimal(vehiclesNow)}
              />
            </section>

            <div className="grid">
              <ChartCard
                className="span-8"
                title={filter.dayType === "all" ? "Hafta içi ve hafta sonu saatlik hız" : `Saatlik hız: ${dayTypeLabel}`}
                subtitle={
                  filter.dayType === "all"
                    ? "Resmî tatiller hariç, araç ağırlıklı ortalama"
                    : "Araç ağırlıklı ortalama"
                }
                table={
                  filter.dayType === "all" ? (
                    <DataTable
                      columns={["Saat", "Hafta içi (km/sa)", "Hafta sonu (km/sa)"]}
                      rows={comparison.map((point) => [
                        formatHour(point.hourOfDay),
                        point.weekdaySpeedKmh === null ? "Veri yok" : formatDecimal(point.weekdaySpeedKmh),
                        point.weekendSpeedKmh === null ? "Veri yok" : formatDecimal(point.weekendSpeedKmh),
                      ])}
                    />
                  ) : (
                    <DataTable
                      columns={["Saat", "Hız (km/sa)", "Araç gözlemi"]}
                      rows={hourly.map((point) => [
                        formatHour(point.hourOfDay),
                        formatDecimal(point.weightedAverageSpeedKmh),
                        formatInteger(point.vehicleObservations),
                      ])}
                    />
                  )
                }
              >
                <HourlyChart comparison={comparison} hourly={hourly} showComparison={filter.dayType === "all"} />
              </ChartCard>

              <ChartCard
                className="span-4"
                title="Hız bantları"
                subtitle="Araç gözlemlerinin ortalama hıza göre dağılımı"
                table={
                  <DataTable
                    columns={["Hız bandı (km/sa)", "Araç gözlemi", "Pay"]}
                    rows={bands.map((band) => [
                      band.speedBand,
                      formatInteger(band.vehicleObservations),
                      formatPercent(band.vehicleSharePct),
                    ])}
                  />
                }
              >
                <HorizontalBars
                  items={bands.map((band) => ({
                    label: `${band.speedBand} km/sa`,
                    value: band.vehicleSharePct,
                    display: formatPercent(band.vehicleSharePct),
                  }))}
                />
              </ChartCard>

              {previousLine && hasPrevious ? (
                <>
                  <ChartCard
                    className="span-8"
                    title="Geçen yılın aynı dönemiyle saatlik karşılaştırma"
                    subtitle={`${formatLongDate(filter.from)} - ${formatLongDate(filter.to)} ve bir yıl öncesi, ${dayTypeLabel?.toLocaleLowerCase("tr-TR")}`}
                    table={
                      <DataTable
                        columns={["Saat", "Bu dönem (km/sa)", `${previousLabel} (km/sa)`, "Fark"]}
                        rows={HOURS.map((hour) => {
                          const now = currentLine[hour] ?? null;
                          const before = previousLine[hour] ?? null;
                          return [
                            formatHour(hour),
                            now === null ? "-" : formatDecimal(now),
                            before === null ? "-" : formatDecimal(before),
                            now === null || before === null ? "-" : formatSigned(now - before),
                          ];
                        })}
                      />
                    }
                  >
                    <SeriesChart
                      ariaLabel="Bu dönem ve geçen yılın aynı dönemi saatlik hız"
                      labels={HOURS.map(formatHour)}
                      series={[
                        { id: "current", label: "Bu dönem", color: "var(--series-1)", values: currentLine },
                        { id: "previous", label: previousLabel, color: "var(--series-2)", values: previousLine },
                      ]}
                      ticks={HOURS.filter((hour) => hour % 3 === 0).map((hour) => ({ index: hour, label: formatHour(hour) }))}
                      unit="speed"
                    />
                  </ChartCard>
                  <div className="span-4 stack">
                    {eveningNow && eveningBefore ? (
                      <Finding title={`Akşam zirvesi ${formatSigned(eveningNow.value - eveningBefore.value)} km/sa değişti`}>
                        Bu dönemde öğleden sonraki en yavaş saat {formatHour(eveningNow.hour)} ({formatSpeed(eveningNow.value)}).
                        Bir yıl önce {formatHour(eveningBefore.hour)} ({formatSpeed(eveningBefore.value)}) idi.
                      </Finding>
                    ) : null}
                    {biggestDrop && biggestDrop.value > 0.5 ? (
                      <Finding title={`En büyük kayıp ${formatHour(biggestDrop.hour)}'de`}>
                        Bu saatte şehir bir yıl öncesine göre {formatDecimal(biggestDrop.value)} km/sa daha yavaş.
                      </Finding>
                    ) : null}
                    {volumeChange !== null ? (
                      <Finding title={`Hücre başına araç ${formatSignedPercent(volumeChange)}`}>
                        Her saatte veri gönderen hücre sayısı değiştiği için toplam yerine hücre ve saat başına ortalama araç
                        karşılaştırılır.
                      </Finding>
                    ) : null}
                  </div>
                </>
              ) : null}

              <ChartCard
                className="span-12"
                title="Günlük ortalama hız"
                subtitle="Seçili dönemdeki her gün için araç ağırlıklı ortalama"
                table={
                  <DataTable
                    columns={["Tarih", "Gün", "Hız (km/sa)", "Araç gözlemi"]}
                    rows={daily.map((point) => [
                      formatShortDate(point.date),
                      point.hasPublicHoliday ? `${point.dayName} (tatil)` : point.dayName,
                      formatDecimal(point.weightedAverageSpeedKmh),
                      formatInteger(point.vehicleObservations),
                    ])}
                  />
                }
              >
                <DailyTrendChart points={daily} />
              </ChartCard>

              {showHeatmap ? (
                <ChartCard
                  className="span-12"
                  title="Gün ve saate göre hız"
                  subtitle="Koyu renkli hücreler yavaş trafiği gösterir, gri hücrelerde analiz edilebilir veri yoktur"
                >
                  <SpeedHeatmap cells={heatmap} days={daily} />
                </ChartCard>
              ) : (
                <section className="card span-12 callout">
                  <h2>Gün ve saat ısı haritası</h2>
                  <p className="card-subtitle">
                    Bu görünüm {HEATMAP_MAX_DAYS} güne kadar olan aralıklarda gösterilir. Uzun dönemlerin ay ve saat
                    kırılımı <Link href="/analiz#mevsimsellik">analiz raporunda</Link> yer alır.
                  </p>
                </section>
              )}
            </div>
          </>
        )}
      </FilterFrame>
    </>
  );
}

function NoDataLoaded() {
  return (
    <EmptyState
      title="Henüz veri yüklenmedi"
      message="Dashboard'u kullanmak için önce ETL hattını çalıştırıp bir ayı PostgreSQL'e yükleyin."
    />
  );
}

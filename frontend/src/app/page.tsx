import Link from "next/link";
import { DailyTrendChart } from "@/components/charts/DailyTrendChart";
import { HourlyChart } from "@/components/charts/HourlyChart";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Sparkline } from "@/components/charts/Sparkline";
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
import { buildRange, dayTypeLabel, parseFilter, previousYear, rangeDays, type RawSearchParams } from "@/lib/filters";
import { makeFormat } from "@/lib/format";
import { translator } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { dayName } from "@/lib/i18n/terms";
import { findVolumeBreak, maximumHour, minimumHour, spansBreak } from "@/lib/insights";
import type { HourlyPoint, TrafficSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The day by hour matrix stays readable up to about two months of rows. */
const HEATMAP_MAX_DAYS = 62;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const averageVehicles = (summary: TrafficSummary) =>
  summary.totals.observationCount > 0 ? summary.totals.vehicleObservations / summary.totals.observationCount : null;

const hourValues = (points: HourlyPoint[]) =>
  HOURS.map((hour) => points.find((point) => point.hourOfDay === hour)?.weightedAverageSpeedKmh ?? null);

export default async function OverviewPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const locale = await getLocale();
  const t = translator(locale);
  const f = makeFormat(locale);
  const {
    formatLargeCount,
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
    speedUnit,
  } = f;

  const metadata = await getMetadata();
  if (!metadata.firstDate || !metadata.lastDate) {
    return (
      <EmptyState
        title={t("Henüz veri yüklenmedi", "No data loaded yet")}
        message={t(
          "Dashboard'u kullanmak için önce ETL hattını çalıştırıp bir ayı PostgreSQL'e yükleyin.",
          "Run the ETL pipeline and load at least one month into PostgreSQL to use the dashboard.",
        )}
      />
    );
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
  const dayLabel = dayTypeLabel(filter.dayType, locale);
  const dayLabelLower = dayLabel.toLocaleLowerCase(locale === "en" ? "en-GB" : "tr-TR");
  const hasData = totals.observationCount > 0;
  const hasPrevious = previousSummary !== null && previousSummary.totals.observationCount > 0;
  const previousLabel = earlier
    ? earlier.from.slice(0, 4) === earlier.to.slice(0, 4)
      ? earlier.from.slice(0, 4)
      : t("Geçen yıl", "Last year")
    : "";

  function speedDelta(current: number | null, previous: number | null | undefined): StatDelta | undefined {
    if (current === null || previous === null || previous === undefined) {
      return undefined;
    }
    const change = current - previous;
    return makeDelta(change, `${previousLabel}: ${formatSpeed(previous)} (${formatSigned(change)} ${speedUnit})`, true);
  }

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

  const slowIndex = slowestHour ? slowestHour.hourOfDay : null;
  const fastIndex = fastestHour ? fastestHour.hourOfDay : null;
  const breakIndex = volumeBreak ? monthly.findIndex((month) => month.month === volumeBreak.month) : -1;
  const currentMonthIndex = monthly.findIndex((month) => month.month.slice(0, 7) === filter.to.slice(0, 7));
  const weighting = t(
    "Her ölçüm o saatte geçen araç sayısıyla ağırlıklandırılır, böylece yoğun yollar ortalamada hak ettiği payı alır.",
    "Each measurement is weighted by the number of vehicles that passed in that hour, so busy roads get their fair share of the average.",
  );

  return (
    <>
      <div className="hero-band">
        <header className="page-title">
          <p className="eyebrow">{t("Genel bakış", "Overview")}</p>
          <h1>{t("İstanbul trafiği, saat saat", "Istanbul traffic, hour by hour")}</h1>
          <p>
            {t(
              `${formatLongDate(filter.from)} ile ${formatLongDate(filter.to)} arasındaki ${dayLabelLower}. Hızlar araç sayısına göre ağırlıklıdır, veri kesintisi olan saatler hesaba katılmaz.`,
              `${dayLabel} from ${formatLongDate(filter.from)} to ${formatLongDate(filter.to)}. Speeds are weighted by vehicle count and hours with data outages are left out.`,
            )}
            {hasPrevious ? t(" Göstergeler bir önceki yılın aynı tarihleriyle karşılaştırılır.", " Indicators are compared with the same dates one year earlier.") : ""}
          </p>
        </header>
        {hasData ? (
          <div className="hero-figure">
            <div className="hero-figure-label">{t("Bu dönemde ölçülen", "Measured in this period")}</div>
            <div className="hero-figure-value">
              {formatLargeCount(totals.observationCount)}
              <small>{t("saatlik ölçüm", "hourly readings")}</small>
            </div>
            <p className="hero-figure-note">
              {t(
                `${formatInteger(totals.locationCount)} konum hücresi, ${formatInteger(rangeDays(filter.from, filter.to))} gün`,
                `${formatInteger(totals.locationCount)} location cells, ${formatInteger(rangeDays(filter.from, filter.to))} days`,
              )}
            </p>
          </div>
        ) : null}
      </div>

      <FilterFrame filter={filter} months={metadata.loadedMonths} range={range}>
        {!hasData ? (
          <EmptyState
            resetHref="/"
            title={t("Bu filtrede veri yok", "No data for this filter")}
            message={t(
              "Seçtiğiniz tarih aralığında bu gün tipine ait gözlem bulunmuyor. Tarih aralığını genişletin veya başka bir gün tipi seçin.",
              "There are no readings of this day type in the selected dates. Widen the date range or choose another day type.",
            )}
          />
        ) : (
          <>
            <section className="stats" aria-label={t("Özet göstergeler", "Key figures")}>
              <StatTile
                chart={
                  <Sparkline
                    label={t("Seçili dönemde günlük ortalama hız", "Daily average speed in the selected period")}
                    values={daily.map((point) => point.weightedAverageSpeedKmh)}
                  />
                }
                delta={speedDelta(totals.weightedAverageSpeedKmh, previousSummary?.totals.weightedAverageSpeedKmh)}
                info={
                  <>
                    <p>
                      {t(
                        "Seçili dönemde şehrin tüm ölçümlerinin araç ağırlıklı ortalama hızı. Küçük grafik her günün ortalamasını gösterir.",
                        "The vehicle-weighted average speed of every reading in the selected period. The small chart shows each day's average.",
                      )}
                    </p>
                    <p>{weighting}</p>
                    <p>
                      {t(
                        "Basit ortalama her ölçüme eşit ağırlık verir ve boş yolları öne çıkardığı için daha yüksek çıkar.",
                        "The simple average gives every reading the same weight; it comes out higher because quiet roads count as much as busy ones.",
                      )}
                    </p>
                  </>
                }
                label={t("Ortalama hız", "Average speed")}
                note={t(`Basit ortalama ${formatSpeed(totals.simpleAverageSpeedKmh)}`, `Simple average ${formatSpeed(totals.simpleAverageSpeedKmh)}`)}
                value={formatSpeed(totals.weightedAverageSpeedKmh)}
              />
              <StatTile
                chart={
                  <Sparkline
                    highlight={slowIndex}
                    label={t("Saatlik hız, en yavaş saat işaretli", "Hourly speed with the slowest hour marked")}
                    values={currentLine}
                  />
                }
                delta={speedDelta(
                  slowestHour?.weightedAverageSpeedKmh ?? null,
                  hasPrevious ? previousSummary?.slowestHour?.weightedAverageSpeedKmh : null,
                )}
                info={t(
                  "Günün 24 saati içinde ortalama hızın en düşük olduğu saat, yani trafiğin en sıkışık olduğu an. Grafikte turuncu nokta bu saati gösterir.",
                  "The hour of the day with the lowest average speed, when traffic is at its worst. The orange dot marks it on the chart.",
                )}
                label={t("En yavaş saat", "Slowest hour")}
                note={formatSpeed(slowestHour?.weightedAverageSpeedKmh)}
                value={slowestHour ? formatHour(slowestHour.hourOfDay) : f.noData}
              />
              <StatTile
                chart={
                  <Sparkline
                    highlight={fastIndex}
                    label={t("Saatlik hız, en hızlı saat işaretli", "Hourly speed with the fastest hour marked")}
                    values={currentLine}
                  />
                }
                info={t(
                  "Ortalama hızın en yüksek olduğu saat. Genellikle gece 03:00-05:00 arasıdır ve yolların serbest akış hızına yakındır.",
                  "The hour with the highest average speed. It is usually between 03:00 and 05:00 and close to free-flow speed.",
                )}
                label={t("En hızlı saat", "Fastest hour")}
                note={formatSpeed(fastestHour?.weightedAverageSpeedKmh)}
                value={fastestHour ? formatHour(fastestHour.hourOfDay) : f.noData}
              />
              <StatTile
                chart={
                  <Sparkline
                    highlight={currentMonthIndex >= 0 ? currentMonthIndex : null}
                    label={t("Aylık hücre başına araç", "Vehicles per cell by month")}
                    muted={(index) => breakIndex > 0 && index < breakIndex}
                    values={monthly.map((month) => month.averageVehicleCount)}
                    variant="bars"
                  />
                }
                delta={
                  volumeChange === null
                    ? undefined
                    : makeDelta(volumeChange, `${previousLabel}: ${formatDecimal(vehiclesBefore ?? 0)} (${formatSignedPercent(volumeChange)})`, null)
                }
                info={
                  <>
                    <p>
                      {t(
                        "Bir konum hücresinden bir saatte geçen ortalama araç sayısı. Her saatte veri gönderen hücre sayısı değiştiği için toplam araç yerine bu oran kullanılır.",
                        "The average number of vehicles that pass one location cell in one hour. The number of reporting cells changes from hour to hour, so this rate is used instead of a total.",
                      )}
                    </p>
                    <p>
                      {t(
                        "Çubuklar ayları gösterir. Soluk çubuklar, İBB'nin araç sayım düzeyinin değiştiği aydan öncesidir; bu iki dönem birbiriyle karşılaştırılmaz.",
                        "Bars are months. Faded bars come before the month in which IMM's vehicle counting level changed; the two periods are not compared.",
                      )}
                    </p>
                  </>
                }
                label={t("Hücre başına araç", "Vehicles per cell")}
                note={
                  crossesBreak && volumeBreak
                    ? t(
                        `Geçen yılla karşılaştırılmaz, sayım düzeyi ${formatMonth(volumeBreak.month)} ayında değişti`,
                        `Not compared with last year: counting changed in ${formatMonth(volumeBreak.month)}`,
                      )
                    : t(`${formatInteger(totals.locationCount)} hücre, saatlik ortalama`, `${formatInteger(totals.locationCount)} cells, hourly average`)
                }
                value={vehiclesNow === null ? f.noData : formatDecimal(vehiclesNow)}
              />
            </section>

            <div className="grid">
              <ChartCard
                className="span-8"
                info={
                  filter.dayType === "all"
                    ? t(
                        "Her saat için hafta içi ve hafta sonu günlerin ortalama hızı. Hafta içi çizgisindeki iki çukur sabah ve akşam iş trafiğidir. Turuncu etiket hafta içinin en yavaş saatini gösterir.",
                        "Average speed for each hour on weekdays and weekends. The two dips in the weekday line are the morning and evening commutes. The label marks the slowest weekday hour.",
                      )
                    : t(
                        "Seçili gün tipinde her saatin ortalama hızı. Çizginin en alçak noktası günün en yoğun saatidir.",
                        "Average speed for each hour of the selected day type. The lowest point of the line is the busiest hour.",
                      )
                }
                title={
                  filter.dayType === "all"
                    ? t("Hafta içi ve hafta sonu saatlik hız", "Hourly speed, weekdays and weekends")
                    : t(`Saatlik hız: ${dayLabel}`, `Hourly speed: ${dayLabel}`)
                }
                subtitle={
                  filter.dayType === "all"
                    ? t("Resmî tatiller hariç, araç ağırlıklı ortalama", "Public holidays excluded, vehicle-weighted average")
                    : t("Araç ağırlıklı ortalama", "Vehicle-weighted average")
                }
                table={
                  filter.dayType === "all" ? (
                    <DataTable
                      columns={[t("Saat", "Hour"), t(`Hafta içi (${speedUnit})`, `Weekdays (${speedUnit})`), t(`Hafta sonu (${speedUnit})`, `Weekends (${speedUnit})`)]}
                      rows={comparison.map((point) => [
                        formatHour(point.hourOfDay),
                        point.weekdaySpeedKmh === null ? f.noData : formatDecimal(point.weekdaySpeedKmh),
                        point.weekendSpeedKmh === null ? f.noData : formatDecimal(point.weekendSpeedKmh),
                      ])}
                    />
                  ) : (
                    <DataTable
                      columns={[t("Saat", "Hour"), t(`Hız (${speedUnit})`, `Speed (${speedUnit})`), t("Araç gözlemi", "Vehicle readings")]}
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
                info={t(
                  "Araçların hangi hız aralığında yol aldığını gösterir. Örneğin %30 değeri, o dönemde geçen araçların %30'unun ortalama hızı o aralıkta olan yollarda olduğunu anlatır.",
                  "Shows which speed range vehicles travelled at. A 30% bar means that 30% of the vehicles in the period were on roads whose average speed was in that range.",
                )}
                title={t("Hız bantları", "Speed bands")}
                subtitle={t("Araç gözlemlerinin ortalama hıza göre dağılımı", "Vehicle readings by average speed")}
                table={
                  <DataTable
                    columns={[t(`Hız bandı (${speedUnit})`, `Speed band (${speedUnit})`), t("Araç gözlemi", "Vehicle readings"), t("Pay", "Share")]}
                    rows={bands.map((band) => [band.speedBand, formatInteger(band.vehicleObservations), formatPercent(band.vehicleSharePct)])}
                  />
                }
              >
                <HorizontalBars
                  items={bands.map((band) => ({
                    label: `${band.speedBand} ${speedUnit}`,
                    value: band.vehicleSharePct,
                    display: formatPercent(band.vehicleSharePct),
                  }))}
                />
              </ChartCard>

              {previousLine && hasPrevious ? (
                <>
                  <ChartCard
                    className="span-8"
                    info={t(
                      "Seçili dönem ile bir yıl önceki aynı tarihlerin saatlik hızı. Mavi çizgi turuncunun altındaysa o saatte trafik geçen yıla göre yavaşlamıştır.",
                      "Hourly speed in the selected period and on the same dates a year earlier. Where the blue line is below the orange one, traffic got slower than last year.",
                    )}
                    title={t("Geçen yılın aynı dönemiyle saatlik karşılaştırma", "Hour by hour against the same dates last year")}
                    subtitle={t(
                      `${formatLongDate(filter.from)} - ${formatLongDate(filter.to)} ve bir yıl öncesi, ${dayLabelLower}`,
                      `${formatLongDate(filter.from)} - ${formatLongDate(filter.to)} and one year earlier, ${dayLabelLower}`,
                    )}
                    table={
                      <DataTable
                        columns={[
                          t("Saat", "Hour"),
                          t(`Bu dönem (${speedUnit})`, `This period (${speedUnit})`),
                          `${previousLabel} (${speedUnit})`,
                          t("Fark", "Change"),
                        ]}
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
                      ariaLabel={t("Bu dönem ve geçen yılın aynı dönemi saatlik hız", "Hourly speed in this period and the same period last year")}
                      labels={HOURS.map(formatHour)}
                      series={[
                        { id: "current", label: t("Bu dönem", "This period"), color: "var(--series-1)", values: currentLine },
                        { id: "previous", label: previousLabel, color: "var(--series-2)", values: previousLine },
                      ]}
                      ticks={HOURS.filter((hour) => hour % 3 === 0).map((hour) => ({ index: hour, label: formatHour(hour) }))}
                      unit="speed"
                    />
                  </ChartCard>
                  <div className="span-4 stack">
                    {eveningNow && eveningBefore ? (
                      <Finding
                        title={t(
                          `Akşam zirvesi ${formatSigned(eveningNow.value - eveningBefore.value)} ${speedUnit} değişti`,
                          `Evening peak changed by ${formatSigned(eveningNow.value - eveningBefore.value)} ${speedUnit}`,
                        )}
                      >
                        {t(
                          `Bu dönemde öğleden sonraki en yavaş saat ${formatHour(eveningNow.hour)} (${formatSpeed(eveningNow.value)}). Bir yıl önce ${formatHour(eveningBefore.hour)} (${formatSpeed(eveningBefore.value)}) idi.`,
                          `The slowest afternoon hour is ${formatHour(eveningNow.hour)} (${formatSpeed(eveningNow.value)}) in this period. A year earlier it was ${formatHour(eveningBefore.hour)} (${formatSpeed(eveningBefore.value)}).`,
                        )}
                      </Finding>
                    ) : null}
                    {biggestDrop && biggestDrop.value > 0.5 ? (
                      <Finding title={t(`En büyük kayıp ${formatHour(biggestDrop.hour)}'de`, `Biggest loss at ${formatHour(biggestDrop.hour)}`)}>
                        {t(
                          `Bu saatte şehir bir yıl öncesine göre ${formatDecimal(biggestDrop.value)} km/sa daha yavaş.`,
                          `At this hour the city is ${formatDecimal(biggestDrop.value)} km/h slower than a year earlier.`,
                        )}
                      </Finding>
                    ) : null}
                    {volumeChange !== null ? (
                      <Finding title={t(`Hücre başına araç ${formatSignedPercent(volumeChange)}`, `Vehicles per cell ${formatSignedPercent(volumeChange)}`)}>
                        {t(
                          "Her saatte veri gönderen hücre sayısı değiştiği için toplam yerine hücre ve saat başına ortalama araç karşılaştırılır.",
                          "The number of reporting cells changes every hour, so the average per cell and hour is compared instead of a total.",
                        )}
                      </Finding>
                    ) : null}
                  </div>
                </>
              ) : null}

              <ChartCard
                className="span-12"
                info={t(
                  "Seçili dönemdeki her günün ortalama hızı. Turuncu noktalar hafta sonudur; hafta sonu ve tatiller trafiğin azaldığı için yukarıda kalır.",
                  "The average speed of every day in the selected period. Orange dots are weekends; weekends and holidays sit higher because there is less traffic.",
                )}
                title={t("Günlük ortalama hız", "Daily average speed")}
                subtitle={t("Seçili dönemdeki her gün için araç ağırlıklı ortalama", "Vehicle-weighted average for each day in the selected period")}
                table={
                  <DataTable
                    columns={[t("Tarih", "Date"), t("Gün", "Day"), t(`Hız (${speedUnit})`, `Speed (${speedUnit})`), t("Araç gözlemi", "Vehicle readings")]}
                    rows={daily.map((point) => [
                      formatShortDate(point.date),
                      point.hasPublicHoliday ? `${dayName(point.dayName, locale)} (${t("tatil", "holiday")})` : dayName(point.dayName, locale),
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
                  info={t(
                    "Her satır bir gün, her sütun bir saattir. Koyu mavi kareler trafiğin yavaş olduğu saatleri gösterir. Bir karenin üzerine gelince o saatin ortalama hızı görünür.",
                    "Each row is a day and each column an hour. Dark blue squares are slow hours. Hover a square to see that hour's average speed.",
                  )}
                  title={t("Gün ve saate göre hız", "Speed by day and hour")}
                  subtitle={t(
                    "Koyu renkli hücreler yavaş trafiği gösterir, gri hücrelerde analiz edilebilir veri yoktur",
                    "Darker squares mean slower traffic, grey squares have no usable data",
                  )}
                >
                  <SpeedHeatmap cells={heatmap} days={daily} />
                </ChartCard>
              ) : (
                <section className="card span-12 callout">
                  <h2>{t("Gün ve saat ısı haritası", "Day and hour heatmap")}</h2>
                  <p className="card-subtitle">
                    {t(
                      `Bu görünüm ${HEATMAP_MAX_DAYS} güne kadar olan aralıklarda gösterilir. Uzun dönemlerin ay ve saat kırılımı `,
                      `This view is shown for ranges up to ${HEATMAP_MAX_DAYS} days. The month by hour view of long periods is in the `,
                    )}
                    <Link href="/analiz#mevsimsellik">{t("analiz raporunda", "report")}</Link>
                    {t(" yer alır.", ".")}
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

import type { Metadata } from "next";
import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import { IncidentTicker } from "@/components/IncidentTicker";
import { Sparkline } from "@/components/charts/Sparkline";
import { MatrixHeatmap } from "@/components/charts/MatrixHeatmap";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { TrafficMap, type MapMode } from "@/components/charts/TrafficMap";
import { IncidentFilters } from "@/components/IncidentFilters";
import {
  ChartCard,
  DataTable,
  DivergingBars,
  EmptyState,
  Finding,
  HorizontalBars,
  makeDelta,
  ReportSection,
  StatTile,
} from "@/components/ui";
import {
  getIncidentCell,
  getIncidentCells,
  getIncidentDurations,
  getIncidentMetadata,
  getIncidentMonthly,
  getIncidentRoads,
  getIncidentSummary,
  getIncidentTrafficImpact,
  getIncidentWeather,
  getIncidentWeekHour,
  getLatestIncidents,
  type IncidentQuery,
} from "@/lib/api";
import { formatHour, makeFormat } from "@/lib/format";
import { parseGeohash, type RawSearchParams } from "@/lib/filters";
import { translator, type Translate } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { suffix } from "@/lib/i18n/turkish";
import { dayName } from "@/lib/i18n/terms";
import {
  busiestSlot,
  categoryLabel,
  changePct,
  countThresholds,
  isIncidentCategory,
  periodOptions,
  RECOVERY_GROUPS,
  recoveryHours,
  recoveryLabel,
  recoverySeries,
  severityLabel,
  tidyTitle,
} from "@/lib/incidents";
import { placeLabel } from "@/lib/places";
import { classOf } from "@/lib/scale";
import type { IncidentCell } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale());
  return { title: t("Trafik olayları", "Traffic incidents") };
}

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

type CellMeasure = (cell: IncidentCell) => number;

function mapModes(t: Translate): { mode: MapMode; read: CellMeasure }[] {
  const legend = { low: t("En çok olay", "Most incidents"), high: t("En az olay", "Fewest incidents") };
  return [
    { mode: { id: "all", label: t("Tüm olaylar", "All incidents"), palette: "heat", legend, extrude: "descending" }, read: (cell) => cell.incidents },
    { mode: { id: "accidents", label: t("Kazalar", "Accidents"), palette: "heat", legend, extrude: "descending" }, read: (cell) => cell.accidents },
    {
      mode: { id: "severe", label: t("Ağır kazalar", "Serious accidents"), palette: "heat", legend, extrude: "descending" },
      read: (cell) => cell.severeAccidents,
    },
    { mode: { id: "breakdowns", label: t("Arızalar", "Breakdowns"), palette: "heat", legend, extrude: "descending" }, read: (cell) => cell.breakdowns },
  ];
}

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const locale = await getLocale();
  const t = translator(locale);
  const f = makeFormat(locale);
  const {
    formatDecimal,
    formatInteger,
    formatLongDate,
    formatDateTime,
    formatMonth,
    formatPercent,
    formatShortMonth,
    formatSigned,
    formatSignedPercent,
    formatLargeCount,
    speedUnit,
    noData,
  } = f;
  const minutes = (value: number | null | undefined) => (value === null || value === undefined ? noData : t(`${formatDecimal(value)} dk`, `${formatDecimal(value)} min`));

  const metadata = await getIncidentMetadata();
  if (!metadata.firstDate || !metadata.lastDate) {
    return (
      <EmptyState
        title={t("Olay verisi yüklenmedi", "No incident data loaded")}
        message={t("python -m traffic_etl.incidents komutuyla UYM duyurularını yükleyin.", "Load the UYM announcements with python -m traffic_etl.incidents.")}
      />
    );
  }

  const params = await searchParams;
  const rawFrom = single(params.from);
  const rawTo = single(params.to);
  const rawCategory = single(params.category);
  const query: IncidentQuery = {
    from: rawFrom && DATE.test(rawFrom) ? rawFrom : undefined,
    to: rawTo && DATE.test(rawTo) ? rawTo : undefined,
    category: isIncidentCategory(rawCategory) ? rawCategory : null,
  };
  const options = periodOptions(metadata.firstDate, metadata.lastDate);

  const [summary, monthly, weekHour, cells, roads, durations, weather, impact, latest] = await Promise.all([
    getIncidentSummary(query),
    getIncidentMonthly(),
    getIncidentWeekHour(query),
    getIncidentCells(query),
    getIncidentRoads(query),
    getIncidentDurations(query),
    getIncidentWeather(query),
    getIncidentTrafficImpact(),
    getLatestIncidents(14).catch(() => []),
  ]);
  const period = { from: summary.filter.from, to: summary.filter.to, category: query.category };
  const activeKey =
    options.find((option) => option.from === period.from && option.to === period.to)?.key ?? (!query.from && !query.to ? "12m" : null);

  const busiestCell = cells.reduce<IncidentCell | null>((best, cell) => (best === null || cell.accidents > best.accidents ? cell : best), null);
  const selected = parseGeohash(params) ?? busiestCell?.geohash ?? null;
  const detail = selected ? await getIncidentCell(selected, period) : null;

  // Headline numbers.
  const category = (name: string) => summary.categories.find((item) => item.category === name);
  const accidents = category("accident");
  const breakdowns = category("breakdown");
  const roadworks = category("roadworks");
  const severe = summary.accidentSeverity.filter((item) => ["injury", "chain", "fatal"].includes(item.severity)).reduce((sum, item) => sum + item.incidents, 0);
  const fatal = summary.accidentSeverity.find((item) => item.severity === "fatal")?.incidents ?? 0;
  const total = summary.categories.reduce((sum, item) => sum + item.incidents, 0);
  const yearDelta = (current: number | undefined, previous: number | null | undefined) => {
    const change = current === undefined ? null : changePct(current, previous);
    return change === null
      ? undefined
      : makeDelta(change, t(`Geçen yıl ${formatInteger(previous ?? 0)} (${formatSignedPercent(change)})`, `Last year ${formatInteger(previous ?? 0)} (${formatSignedPercent(change)})`), false, 0.5);
  };

  // Map.
  const modes = mapModes(t);
  const thresholds = modes.map(({ read }) => countThresholds(cells.map(read)));
  const level = (value: number, index: number) => (value <= 0 ? 7 : 8 - classOf(value, thresholds[index] ?? [1, 2, 3, 4, 5, 6]));

  // Monthly history.
  const months = [...new Set(monthly.map((row) => row.month))].sort();
  const monthlyValue = (month: string, name: string) => monthly.find((row) => row.month === month && row.category === name)?.incidents ?? 0;
  const severeByMonth = months.map((month) => monthly.filter((row) => row.month === month).reduce((sum, row) => sum + row.severeAccidents, 0));
  const yearTicks = months.map((month, index) => ({ index, month })).filter(({ month }) => month.endsWith("-01-01")).map(({ index, month }) => ({ index, label: month.slice(0, 4) }));
  const fullYears = months.filter((month) => month < `${metadata.lastDate?.slice(0, 4)}-01-01` && month >= "2014-01-01");
  const firstFull = fullYears.slice(0, 12).reduce((sum, month) => sum + monthlyValue(month, "accident"), 0);
  const lastFull = fullYears.slice(-12).reduce((sum, month) => sum + monthlyValue(month, "accident"), 0);

  // Week by hour.
  const weekValues = weekHour.map((cell) => cell.incidents);
  const busiest = busiestSlot(weekHour);

  // Roads.
  const topRoads = roads.roads.filter((road) => road.road !== "other").slice(0, 8);
  const otherRoads = roads.roads.find((road) => road.road === "other");

  // Durations.
  const accidentDuration = durations.categories.find((item) => item.category === "accident");
  // Response times exist only where an arrival was logged before the closure.
  const responseShare = accidentDuration && accidentDuration.incidents > 0 ? (accidentDuration.responseCount / accidentDuration.incidents) * 100 : 0;
  const MIN_RESPONSES = 200;
  const years = durations.yearly.filter((row) => row.accidents >= 500);

  // Weather.
  const rate = (condition: string) => weather.find((item) => item.condition === condition);
  const heavy = rate("heavy_rain");
  const light = rate("light_rain");
  const snow = rate("snow");

  // Traffic impact.
  const recovery = RECOVERY_GROUPS.map((group) => ({ group, values: recoverySeries(impact, group) }));
  const fatalSeries = recovery.find((item) => item.group === "accident_fatal")?.values ?? [];
  const damageSeries = recovery.find((item) => item.group === "accident_damage")?.values ?? [];
  const explanation = impact.explanation;
  const cellHref = (geohash: string) => {
    const next = new URLSearchParams();
    if (query.from) next.set("from", query.from);
    if (query.to) next.set("to", query.to);
    if (query.category) next.set("category", query.category);
    next.set("cell", geohash);
    return `/olaylar?${next}#harita`;
  };
  const ratioText = (value: number | null | undefined) => (value == null ? noData : `${formatDecimal(value)}×`);

  return (
    <>
      <div className="hero-band">
        <header className="page-title">
          <p className="eyebrow">{t("Trafik olayları", "Traffic incidents")}</p>
          <h1>{t("İstanbul yollarında ne oluyor?", "What happens on Istanbul's roads?")}</h1>
          <p>
            {t(
              `İBB Ulaşım Yönetim Merkezi'nin ${formatLongDate(metadata.firstDate)} ile ${formatLongDate(metadata.lastDate)} arasında duyurduğu kaza, arıza, yol çalışması ve kapanmalar. Her olay bir semte ve trafik hücresine bağlanır; 2023-2025 arasında aynı hücrenin saatlik hızıyla birleştirilir.`,
              `Accidents, breakdowns, road works and closures announced by the IMM Traffic Management Centre between ${formatLongDate(metadata.firstDate)} and ${formatLongDate(metadata.lastDate)}. Every incident is tied to a neighbourhood and a traffic cell, and joined with that cell's hourly speed for 2023-2025.`,
            )}
          </p>
        </header>
        <div className="hero-figure">
          <div className="hero-figure-label">{t("Toplam duyuru", "Announcements")}</div>
          <div className="hero-figure-value">
            <CountUp text={formatLargeCount(metadata.incidentCount)} />
          </div>
          <p className="hero-figure-note">
            {t(`Son olay ${formatLongDate(metadata.lastDate)}, aylık güncellenir`, `Latest ${formatLongDate(metadata.lastDate)}, updated monthly`)}
          </p>
        </div>
      </div>

      <IncidentTicker items={latest} locale={locale} />

      <IncidentFilters
        activeKey={activeKey}
        category={query.category ?? null}
        options={options}
        status={`${formatLongDate(period.from)} - ${formatLongDate(period.to)}`}
      >
        <section aria-label={t("Özet göstergeler", "Key figures")} className="stats">
          <StatTile
            delta={yearDelta(accidents?.incidents, accidents?.previousYearIncidents)}
            info={t(
              "Dönemde duyurulan trafik kazaları ve bir yıl önceki aynı tarihlerle farkı. Yalnızca UYM'nin duyurduğu, çoğunlukla ana yollardaki kazalar sayılır; tüm kazaların resmî istatistiği değildir.",
              "Traffic accidents announced in the period and the change against the same dates a year earlier. Only accidents announced by the centre count, mostly on main roads; this is not the official statistic of all accidents.",
            )}
            label={t("Kaza", "Accidents")}
            note={t(`Günde ${formatDecimal((accidents?.incidents ?? 0) / summary.days)}`, `${formatDecimal((accidents?.incidents ?? 0) / summary.days)} a day`)}
            value={formatInteger(accidents?.incidents ?? 0)}
          />
          <StatTile
            info={t(
              "Yaralanmalı, zincirleme ve can kaybı olan kazalar. Kaza ağırlığı kayıttaki kaza türünden, o boşsa duyuru başlığından okunur.",
              "Accidents with injuries, pile-ups and deaths. Severity comes from the accident type, or from the announcement title when the type is empty.",
            )}
            label={t("Ağır kaza", "Serious accidents")}
            note={t(`${formatInteger(fatal)} tanesinde can kaybı`, `${formatInteger(fatal)} with a death`)}
            value={formatInteger(severe)}
          />
          <StatTile
            delta={yearDelta(breakdowns?.incidents, breakdowns?.previousYearIncidents)}
            info={t(
              "Yolda kalan araçlar. Arızalar da şerit kapattığı için trafiği kazalar kadar etkileyebilir.",
              "Vehicles broken down on the road. They close lanes too, so they can slow traffic as much as accidents.",
            )}
            label={t("Araç arızası", "Breakdowns")}
            note={t(`${formatInteger(roadworks?.incidents ?? 0)} yol çalışması`, `${formatInteger(roadworks?.incidents ?? 0)} road works`)}
            value={formatInteger(breakdowns?.incidents ?? 0)}
          />
          <StatTile
            info={t(
              "Bir kazanın duyurulduğu andan kapatıldığı ana kadar geçen sürenin medyanı. Müdahale süresi, ekibin olay yerine ulaştığı ayrıca kaydedilen olaylardan hesaplanır; kayıtların çoğunda müdahale zamanı kapanış zamanının aynısıdır ve kullanılmaz.",
              "The median time from an accident's announcement to its closure. Response time comes only from incidents where the team's arrival was logged separately; most records copy the closing time into that field, so they are left out.",
            )}
            label={t("Kaza süresi (medyan)", "Accident duration (median)")}
            note={t(
              `Müdahale ${minutes(accidents?.medianResponseMin)}, kayıtların ${suffix("%" + formatInteger(responseShare), "possessiveLocative")}`,
              `Response ${minutes(accidents?.medianResponseMin)}, in ${formatInteger(responseShare)}% of records`,
            )}
            value={minutes(accidents?.medianDurationMin)}
          />
        </section>

        <div className="report-body incidents-body">
          <ReportSection
            id="harita"
            lead={t(
              `Her kare yaklaşık 610 m x 920 m genişliğinde bir hücredir ve rengi dönemdeki olay sayısını gösterir. ${formatInteger(cells.length)} hücrede ${formatInteger(total)} olay var. Bir kareye tıklayınca o bölgenin saatlik dağılımı, en çok olay yaşanan kesimleri ve son olayları açılır.`,
              `Each square is a cell of about 610 m x 920 m, colored by the number of incidents in the period. ${formatInteger(total)} incidents fall in ${formatInteger(cells.length)} cells. Click a square to see that area's hours, busiest segments and latest incidents.`,
            )}
            number={1}
            title={t("Olay haritası", "Incident map")}
          >
            {cells.length === 0 ? (
              <EmptyState title={t("Bu dönemde olay yok", "No incidents in this period")} message={t("Başka bir dönem ya da tür seçin.", "Choose another period or type.")} />
            ) : (
              <TrafficMap
                ariaLabel={t(
                  "İstanbul trafik olayları haritası. Kaydırıp yakınlaştırabilir, bir semt arayabilir ya da bir kareye tıklayabilirsiniz.",
                  "Map of traffic incidents in Istanbul. Pan, zoom, search a place or click a square.",
                )}
                cells={cells.map((cell) => {
                  const place = placeLabel(cell, locale);
                  return {
                    id: cell.geohash,
                    title: place.title,
                    subtitle: place.subtitle,
                    isDistrictOnly: !cell.neighborhood,
                    latitude: cell.latitude,
                    longitude: cell.longitude,
                    levels: modes.map(({ read }, index) => level(read(cell), index)),
                    lines: [
                      { value: formatInteger(cell.incidents), label: t("olay", "incidents") },
                      { value: formatInteger(cell.accidents), label: t("kaza", "accidents") },
                      { value: formatInteger(cell.severeAccidents), label: t("ağır kaza", "serious accidents") },
                      { value: minutes(cell.medianDurationMin), label: t("medyan süre", "median duration") },
                    ],
                  };
                })}
                key={`${locale}-${period.from}-${period.to}-${period.category ?? "all"}`}
                modes={modes.map(({ mode }) => mode)}
                note={t(`${formatInteger(cells.length)} hücre · ${formatLongDate(period.from)} - ${formatLongDate(period.to)}`, `${formatInteger(cells.length)} cells · ${formatLongDate(period.from)} - ${formatLongDate(period.to)}`)}
                panel={
                  detail ? (
                    <>
                      <p className="eyebrow">{t("Seçili bölge", "Selected area")}</p>
                      <h2 className="panel-place">{placeLabel(detail.cell, locale).title}</h2>
                      <div className="panel-district">
                        <span>{placeLabel(detail.cell, locale).subtitle}</span>
                        <span className="chip mono">{detail.cell.geohash}</span>
                      </div>
                      <dl className="details">
                        <div>
                          <dt>{t("Olay", "Incidents")}</dt>
                          <dd>{formatInteger(detail.cell.incidents)}</dd>
                        </div>
                        <div>
                          <dt>{t("Kaza", "Accidents")}</dt>
                          <dd>{formatInteger(detail.cell.accidents)}</dd>
                        </div>
                        <div>
                          <dt>{t("Ağır kaza", "Serious")}</dt>
                          <dd>{formatInteger(detail.cell.severeAccidents)}</dd>
                        </div>
                        <div>
                          <dt>{t("Medyan süre", "Median duration")}</dt>
                          <dd>{minutes(detail.cell.medianDurationMin)}</dd>
                        </div>
                      </dl>
                      <p className="card-subtitle">{t("Günün saatlerine göre olaylar", "Incidents by hour of day")}</p>
                      <div className="panel-spark">
                        <Sparkline
                          highlight={detail.hourly.indexOf(Math.max(...detail.hourly))}
                          label={t("Saatlere göre olay sayısı", "Incidents by hour")}
                          values={detail.hourly}
                          variant="bars"
                        />
                        <div className="panel-spark-axis" aria-hidden="true">
                          <span>00</span>
                          <span>06</span>
                          <span>12</span>
                          <span>18</span>
                          <span>23</span>
                        </div>
                      </div>
                      {detail.segments.length > 0 ? (
                        <>
                          <p className="panel-heading">{t("En çok olay yaşanan kesimler", "Busiest segments")}</p>
                          <ul className="panel-list">
                            {detail.segments.map((segment) => (
                              <li key={`${segment.road}-${segment.segment}`}>
                                <span>
                                  <strong>{segment.road || t("Diğer", "Other")}</strong> {segment.segment}
                                </span>
                                <span className="value">{formatInteger(segment.incidents)}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      <p className="panel-heading">{t("Son olaylar", "Latest incidents")}</p>
                      <ul className="incident-feed">
                        {detail.latest.map((item) => (
                          <li key={item.incidentId}>
                            <span className="incident-meta">
                              <span className={`incident-dot ${item.category}`} />
                              {formatDateTime(item.startedAt)}
                              {item.severity ? ` · ${severityLabel(item.severity, locale)}` : ` · ${categoryLabel(item.category, locale)}`}
                              {item.durationMin ? ` · ${minutes(item.durationMin)}` : ""}
                            </span>
                            <span className="incident-title">{tidyTitle(item.title)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="card-subtitle">{t("Bir kareye tıklayın.", "Click a square.")}</p>
                  )
                }
                searchable
                selectParam="cell"
                selected={selected}
              />
            )}
          </ReportSection>

          <ReportSection
            id="zaman"
            lead={t(
              "Aylık duyuru sayıları 2013'ten bu yana. Kayıtların artması kısmen Ulaşım Yönetim Merkezi'nin izlediği yol ağının genişlemesinden gelir, bu yüzden uzun dönem artış doğrudan kaza artışı olarak okunmamalıdır.",
              "Monthly announcements since 2013. Part of the growth comes from the centre covering more of the road network, so the long-term rise should not be read directly as more accidents.",
            )}
            number={2}
            title={t("Yıllar ve saatler", "Years and hours")}
          >
            <div className="grid">
              <ChartCard
                className="span-12"
                info={t(
                  "Her ay duyurulan kaza, arıza ve yol çalışması sayısı ile ağır kazalar. 2020 baharındaki çukur pandemi kısıtlamalarıdır. Ayın sonuna kadar dolmamış son ay daha düşük görünür.",
                  "Accidents, breakdowns, road works and serious accidents announced each month. The dip in spring 2020 is the pandemic lockdown. The last month may not be complete yet.",
                )}
                subtitle={t(`${formatMonth(months[0] ?? metadata.firstDate)} - ${formatMonth(months.at(-1) ?? metadata.lastDate)}, aylık`, `${formatMonth(months[0] ?? metadata.firstDate)} - ${formatMonth(months.at(-1) ?? metadata.lastDate)}, monthly`)}
                table={
                  <DataTable
                    columns={[t("Ay", "Month"), t("Kaza", "Accidents"), t("Ağır kaza", "Serious"), t("Arıza", "Breakdowns"), t("Yol çalışması", "Road works")]}
                    rows={[...months].reverse().map((month, index) => [
                      formatMonth(month),
                      formatInteger(monthlyValue(month, "accident")),
                      formatInteger(severeByMonth[months.length - 1 - index] ?? 0),
                      formatInteger(monthlyValue(month, "breakdown")),
                      formatInteger(monthlyValue(month, "roadworks")),
                    ])}
                  />
                }
                title={t("Aylık olaylar, 2013'ten bugüne", "Incidents per month since 2013")}
              >
                <SeriesChart
                  ariaLabel={t("Aylara göre kaza, arıza, yol çalışması ve ağır kaza sayısı", "Accidents, breakdowns, road works and serious accidents by month")}
                  height={300}
                  labels={months.map((month) => formatShortMonth(month))}
                  series={[
                    { id: "accident", label: t("Kaza", "Accidents"), color: SERIES[1] ?? "", values: months.map((month) => monthlyValue(month, "accident")) },
                    { id: "breakdown", label: t("Araç arızası", "Breakdowns"), color: SERIES[0] ?? "", values: months.map((month) => monthlyValue(month, "breakdown")) },
                    { id: "roadworks", label: t("Yol çalışması", "Road works"), color: SERIES[2] ?? "", values: months.map((month) => monthlyValue(month, "roadworks")) },
                    { id: "severe", label: t("Ağır kaza", "Serious accidents"), color: SERIES[3] ?? "", values: severeByMonth },
                  ]}
                  ticks={yearTicks}
                  unit="count"
                />
              </ChartCard>
              <ChartCard
                className="span-8"
                info={t(
                  "Haftanın her günü ve her saati için dönemdeki olay sayısı. Koyu kareler olayların yoğunlaştığı zamanlardır. İş çıkış saatleri ve hafta sonu geceleri belirgin şekilde ayrışır.",
                  "Incidents in the period for each day of the week and hour. Dark squares are when incidents cluster. Evening rush hours and weekend nights stand out.",
                )}
                subtitle={t("Seçili dönem ve tür", "Selected period and type")}
                title={t("Gün ve saate göre olaylar", "Incidents by day and hour")}
              >
                <MatrixHeatmap
                  ariaLabel={t("Haftanın günü ve saate göre olay sayısı", "Incidents by day of week and hour")}
                  cells={weekHour.map((cell) => ({ row: String(cell.isoDayOfWeek), hour: cell.hourOfDay, value: cell.incidents }))}
                  labelWidth={84}
                  rowHeight={30}
                  rows={WEEKDAYS.map((name, index) => ({ key: String(index + 1), label: dayName(name, locale), title: dayName(name, locale) }))}
                  thresholds={countThresholds(weekValues)}
                  unit="count"
                />
              </ChartCard>
              <div className="span-4 stack">
                {busiest ? (
                  <Finding
                    title={t(
                      `En yoğun saat: ${dayName(WEEKDAYS[busiest.isoDayOfWeek - 1] ?? "", locale)} ${formatHour(busiest.hourOfDay)}`,
                      `Busiest slot: ${dayName(WEEKDAYS[busiest.isoDayOfWeek - 1] ?? "", locale)} ${formatHour(busiest.hourOfDay)}`,
                    )}
                  >
                    {t(`Bu saatte dönem boyunca ${formatInteger(busiest.incidents)} olay duyuruldu.`, `${formatInteger(busiest.incidents)} incidents were announced at this hour during the period.`)}
                  </Finding>
                ) : null}
                {firstFull > 0 && lastFull > 0 ? (
                  <Finding title={t(`Yıllık kaza duyurusu ${formatSignedPercent(changePct(lastFull, firstFull) ?? 0, 0)}`, `Yearly accident announcements ${formatSignedPercent(changePct(lastFull, firstFull) ?? 0, 0)}`)}>
                    {t(
                      `İlk tam yılda ${formatInteger(firstFull)}, son tam yılda ${formatInteger(lastFull)} kaza duyuruldu. Artışın bir kısmı kayıt kapsamının genişlemesinden gelir.`,
                      `${formatInteger(firstFull)} accidents were announced in the first full year and ${formatInteger(lastFull)} in the latest. Part of the rise comes from wider coverage.`,
                    )}
                  </Finding>
                ) : null}
              </div>
            </div>
          </ReportSection>

          <ReportSection
            id="yollar"
            lead={t(
              "Yol ve kesim, duyuru başlığından ayrıştırılır: \"D100 Acıbadem-Altunizade Yönü, sol şerit...\" gibi. Kesim yönlüdür; aynı iki nokta arasında iki ayrı yön ayrı sayılır.",
              "Road and segment are parsed from the announcement title, as in \"D100 Acıbadem-Altunizade direction, left lane...\". Segments are directional, so each direction counts separately.",
            )}
            number={3}
            title={t("En çok olay yaşanan yollar", "Roads with the most incidents")}
          >
            <div className="grid">
              <ChartCard
                className="span-5"
                info={t(
                  "Seçili dönemde yollara göre olay sayısı. D100 (E-5) ve TEM, şehrin ana aksları olduğu için olayların çoğunu taşır.",
                  "Incidents by road in the selected period. D100 (E-5) and TEM, the city's main axes, carry most incidents.",
                )}
                subtitle={t(
                  otherRoads ? `Başlığında yol adı ayrıştırılamayan ${formatInteger(otherRoads.incidents)} olay "Diğer" sayılır` : "Seçili dönemde",
                  otherRoads ? `${formatInteger(otherRoads.incidents)} incidents without a parsed road count as "Other"` : "In the selected period",
                )}
                title={t("Yollara göre", "By road")}
              >
                <HorizontalBars items={topRoads.map((road) => ({ label: road.road, value: road.incidents, display: formatInteger(road.incidents) }))} />
              </ChartCard>
              <ChartCard
                className="span-7"
                info={t(
                  "Dönemde en az 5 olay yaşanan yönlü kesimler. Ağır kaza; yaralanmalı, zincirleme ve can kaybı olan kazalardır. Bir satıra tıklayınca harita o kesime gider.",
                  "Directional segments with at least 5 incidents in the period. Serious accidents are injury, pile-up and fatal accidents. Click a row to open the segment on the map.",
                )}
                subtitle={t("Yönlü kesim, olay sayısına göre", "Directional segment, by incidents")}
                title={t("En çok olay yaşanan kesimler", "Busiest segments")}
              >
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t("Yol", "Road")}</th>
                        <th scope="col">{t("Kesim", "Segment")}</th>
                        <th className="num" scope="col">{t("Olay", "Incidents")}</th>
                        <th className="num" scope="col">{t("Kaza", "Accidents")}</th>
                        <th className="num" scope="col">{t("Ağır", "Serious")}</th>
                        <th className="num" scope="col">{t("Medyan süre", "Median")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roads.segments.map((segment) => (
                        <tr key={`${segment.road}-${segment.segment}`}>
                          <td>{segment.road}</td>
                          <td>
                            {segment.geohash ? (
                              <Link className="row-link" href={cellHref(segment.geohash)}>
                                {segment.segment}
                              </Link>
                            ) : (
                              segment.segment
                            )}
                          </td>
                          <td className="num">{formatInteger(segment.incidents)}</td>
                          <td className="num">{formatInteger(segment.accidents)}</td>
                          <td className="num">{formatInteger(segment.severeAccidents)}</td>
                          <td className="num">{minutes(segment.medianDurationMin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </div>
          </ReportSection>

          <ReportSection
            id="sureler"
            lead={t(
              "Süre, duyurunun açılışından kapanışına; müdahale, açılıştan ekibin olay yerine ulaştığı kayda kadar geçen zamandır. Bir dakikadan kısa ya da bir haftadan uzun kayıtlar hatalı kabul edilir ve hesaba katılmaz.",
              "Duration runs from the announcement's opening to its closure; response runs until the team's arrival was logged. Records shorter than a minute or longer than a week are treated as errors and left out.",
            )}
            number={4}
            title={t("Olaylar ne kadar sürüyor?", "How long do incidents last?")}
          >
            <div className="grid">
              <ChartCard
                className="span-5"
                info={t(
                  "Kategoriye göre medyan süre. Medyan, olayların yarısının bu süreden kısa sürdüğünü gösterir; birkaç çok uzun kayıt ortalamayı bozabileceği için medyan kullanılır.",
                  "Median duration by category. Half of the incidents are shorter than the median; it is used because a few very long records can distort an average.",
                )}
                subtitle={t("Medyan süre (dakika)", "Median duration (minutes)")}
                table={
                  <DataTable
                    columns={[t("Tür", "Type"), t("Olay", "Incidents"), t("Medyan", "Median"), "P75", "P90", t("Müdahale", "Response")]}
                    rows={durations.categories.map((item) => [
                      categoryLabel(item.category, locale),
                      formatInteger(item.incidents),
                      minutes(item.medianDurationMin),
                      minutes(item.p75DurationMin),
                      minutes(item.p90DurationMin),
                      minutes(item.medianResponseMin),
                    ])}
                  />
                }
                title={t("Türe göre süre", "Duration by type")}
              >
                <HorizontalBars
                  items={durations.categories
                    .filter((item) => item.medianDurationMin !== null && item.incidents >= 20)
                    .map((item) => ({ label: categoryLabel(item.category, locale), value: item.medianDurationMin ?? 0, display: minutes(item.medianDurationMin) }))}
                />
              </ChartCard>
              <ChartCard
                className="span-7"
                info={t(
                  "Her yıl kazaların medyan süresi ve medyan müdahale süresi. Müdahale süresi yalnızca ayrıca kaydedildiği yıllarda (en az 200 kaza) çizilir. Çizgilerin düşmesi kazaların daha hızlı temizlendiğini gösterir.",
                  "Median accident duration and response time per year. Response time is drawn only for years where it was logged separately for at least 200 accidents. Falling lines mean accidents are cleared faster.",
                )}
                subtitle={t("Kazalar, yıllara göre medyan (dakika)", "Accidents, median per year (minutes)")}
                title={t("Kazalar daha hızlı mı temizleniyor?", "Are accidents cleared faster?")}
              >
                <SeriesChart
                  ariaLabel={t("Yıllara göre kaza süresi ve müdahale süresi", "Accident duration and response time by year")}
                  labels={years.map((row) => String(row.year))}
                  series={[
                    { id: "duration", label: t("Kaza süresi", "Accident duration"), color: SERIES[1] ?? "", values: years.map((row) => row.medianDurationMin) },
                    {
                      id: "response",
                      label: t("Müdahale süresi", "Response time"),
                      color: SERIES[0] ?? "",
                      values: years.map((row) => (row.responseCount >= MIN_RESPONSES ? row.medianResponseMin : null)),
                    },
                  ]}
                  ticks={years.map((row, index) => ({ index, label: String(row.year) })).filter((tick) => tick.index % 2 === 0)}
                  unit="minutes"
                />
              </ChartCard>
              {accidentDuration ? (
                <div className="span-12">
                  <Finding title={t(`Kazaların yarısı ${minutes(accidentDuration.medianDurationMin)} içinde kapanıyor`, `Half of all accidents close within ${minutes(accidentDuration.medianDurationMin)}`)}>
                    {t(
                      `Ama her dört kazadan biri ${minutes(accidentDuration.p75DurationMin)}, her on kazadan biri ${minutes(accidentDuration.p90DurationMin)} sürüyor. Uzun süren kazalar çoğunlukla yaralanmalı ve zincirleme kazalardır.`,
                      `But one accident in four lasts ${minutes(accidentDuration.p75DurationMin)} and one in ten ${minutes(accidentDuration.p90DurationMin)}. The long ones are mostly injury and pile-up accidents.`,
                    )}
                  </Finding>
                </div>
              ) : null}
            </div>
          </ReportSection>

          <ReportSection
            id="hava-kaza"
            lead={t(
              "Her saat hava koşuluna göre sınıflanır ve kaza sayısı, aynı ayın aynı saatindeki kuru saatlerin kaza oranıyla karşılaştırılır. 1,0 kuru hava kadar, 1,5 yüzde 50 daha fazla kaza demektir.",
              "Every hour is classed by weather, and its accidents are compared with the accident rate of dry hours in the same month and hour. 1.0 means as many as in dry weather, 1.5 means 50% more.",
            )}
            number={5}
            title={t("Yağmurda kaza artıyor mu?", "Are there more accidents in the rain?")}
          >
            <section aria-label={t("Hava koşuluna göre kaza oranı", "Accident rate by weather")} className="stats">
              <StatTile
                info={t("Saatte 0,1-1 mm yağış olan saatlerde kaza oranı, kuru saatlere göre.", "Accident rate in hours with 0.1-1 mm of rain, against dry hours.")}
                label={t("Hafif yağmur", "Light rain")}
                note={t(`${formatInteger(light?.hours ?? 0)} saat, ${formatInteger(light?.accidents ?? 0)} kaza`, `${formatInteger(light?.hours ?? 0)} hours, ${formatInteger(light?.accidents ?? 0)} accidents`)}
                value={ratioText(light?.rateRatio)}
              />
              <StatTile
                info={t("Saatte en az 1 mm yağış olan saatlerde kaza oranı.", "Accident rate in hours with at least 1 mm of rain.")}
                label={t("Kuvvetli yağmur", "Heavy rain")}
                note={t(`Ağır kaza oranı ${ratioText(heavy?.severeRateRatio)}`, `Serious accident rate ${ratioText(heavy?.severeRateRatio)}`)}
                value={ratioText(heavy?.rateRatio)}
              />
              <StatTile
                info={t("Kar yağan saatlerde kaza oranı. Karlı günlerde trafiğe çıkan araç sayısı belirgin şekilde düşer.", "Accident rate in hours with snowfall. Far fewer vehicles are on the road on snowy days.")}
                label={t("Kar", "Snow")}
                note={t(`${formatInteger(snow?.hours ?? 0)} saat`, `${formatInteger(snow?.hours ?? 0)} hours`)}
                value={ratioText(snow?.rateRatio)}
              />
              <StatTile
                info={t(
                  "Karşılaştırmanın dayandığı kuru saatler. Kuru saatlerin oranı tanım gereği 1,0'dır.",
                  "The dry hours the comparison rests on. Their ratio is 1.0 by definition.",
                )}
                label={t("Kuru hava", "Dry weather")}
                note={t(`${formatInteger(rate("dry")?.accidents ?? 0)} kaza`, `${formatInteger(rate("dry")?.accidents ?? 0)} accidents`)}
                value={t(`${formatInteger(rate("dry")?.hours ?? 0)} saat`, `${formatInteger(rate("dry")?.hours ?? 0)} hours`)}
              />
            </section>
            <div className="findings-grid">
              <Finding
                title={
                  (heavy?.rateRatio ?? 1) < 1.1
                    ? t("Yağmur kaza sayısını belirgin şekilde artırmıyor", "Rain does not clearly raise the number of accidents")
                    : t(`Kuvvetli yağmurda kaza ${ratioText(heavy?.rateRatio)}`, `Heavy rain: ${ratioText(heavy?.rateRatio)} accidents`)
                }
              >
                {t(
                  "Bu, duyurulan kazalara dayanır. Yağmurda trafik yavaşladığı (ortalama 2 km/sa) ve bazı sürücüler yola çıkmadığı için küçük kazalar artmamış olabilir; ayrıca küçük kazaların hepsi duyurulmaz.",
                  "This rests on announced accidents. Traffic slows in the rain (about 2 km/h on average) and some drivers stay home, so minor accidents may not rise; not every minor accident is announced either.",
                )}
              </Finding>
              <Finding title={t(`Karda kaza ${ratioText(snow?.rateRatio)}`, `Snow: ${ratioText(snow?.rateRatio)} accidents`)}>
                {t(
                  "Karlı saatlerde daha az kaza duyuruluyor. En olası neden, kar uyarılarıyla birlikte yola çıkan araç sayısının düşmesi.",
                  "Fewer accidents are announced in snowy hours, most likely because fewer vehicles are on the road after snow warnings.",
                )}
              </Finding>
            </div>
          </ReportSection>

          <ReportSection
            id="trafik-etkisi"
            lead={t(
              `Trafik hızı verisinin olduğu ${impact.from ? formatLongDate(impact.from) : ""} - ${impact.to ? formatLongDate(impact.to) : ""} döneminde ${formatInteger(impact.matchedIncidents)} kaza, arıza ve araç yangını, gerçekleştiği hücrenin saatlik hızıyla birleştirildi. Her saat, aynı hücrenin aynı ay, saat ve gün tipindeki olağan hızıyla karşılaştırılır.`,
              `For ${impact.from ? formatLongDate(impact.from) : ""} - ${impact.to ? formatLongDate(impact.to) : ""}, when speed data exists, ${formatInteger(impact.matchedIncidents)} accidents, breakdowns and vehicle fires were joined with the hourly speed of their cell. Each hour is compared with the same cell's usual speed in the same month, hour and day type.`,
            )}
            number={6}
            title={t("Bir kaza trafiği ne kadar yavaşlatıyor?", "How much does an accident slow traffic?")}
          >
            <div className="grid">
              <ChartCard
                className="span-8"
                info={
                  <>
                    <p>
                      {t(
                        "Olaydan bir saat önce, olay saatinde ve sonraki üç saatte hücrenin hızı ile olağan hızı arasındaki fark. Çizgi sıfıra döndüğünde trafik toparlanmış demektir.",
                        "The difference between the cell's speed and its usual speed from one hour before to three hours after the incident. When the line returns to zero, traffic has recovered.",
                      )}
                    </p>
                    <p>
                      {t(
                        "Olaydan bir saat önce de hız biraz düşüktür: kazalar zaten sıkışık trafikte daha sık olur ve duyurular olaydan biraz sonra açılır.",
                        "Speed is a little low an hour before as well: accidents happen more often in congested traffic, and announcements open a little after the event.",
                      )}
                    </p>
                  </>
                }
                subtitle={t(`Hücrenin olağan hızına göre fark (${speedUnit})`, `Difference from the cell's usual speed (${speedUnit})`)}
                table={
                  <DataTable
                    columns={[t("Olay", "Incident"), t("1 sa önce", "1 h before"), t("Olay saati", "Hour of incident"), "+1", "+2", "+3"]}
                    rows={recovery.map(({ group, values }) => [recoveryLabel(group, locale), ...values.map((value) => (value === null ? "-" : formatSigned(value)))])}
                  />
                }
                title={t("Kazadan sonra trafik ne zaman toparlanıyor?", "When does traffic recover after an accident?")}
              >
                <SeriesChart
                  ariaLabel={t("Olay türüne göre hız farkının saatlere göre seyri", "Speed difference over the hours around an incident, by type")}
                  labels={[t("1 sa önce", "1 h before"), t("Olay saati", "Incident hour"), t("+1 saat", "+1 hour"), t("+2 saat", "+2 hours"), t("+3 saat", "+3 hours")]}
                  series={recovery.map(({ group, values }, index) => ({ id: group, label: recoveryLabel(group, locale), color: SERIES[index] ?? "var(--series-1)", values }))}
                  ticks={[0, 1, 2, 3, 4].map((index) => ({ index, label: [t("−1 sa", "−1 h"), t("Olay", "Incident"), "+1", "+2", "+3"][index] ?? "" }))}
                  unit="speed"
                />
              </ChartCard>
              <div className="span-4 stack">
                {fatalSeries[1] != null ? (
                  <Finding title={t(`Ölümlü kaza: ${formatSigned(fatalSeries[1] ?? 0)} km/sa`, `Fatal accident: ${formatSigned(fatalSeries[1] ?? 0)} km/h`)}>
                    {t(
                      `Bir saat sonra fark hâlâ ${formatSigned(fatalSeries[2] ?? 0)} km/sa; üç saat sonra bile ${formatSigned(fatalSeries[4] ?? 0)} km/sa. Hasarlı bir kazada trafik ${recoveryHours(damageSeries) ?? 3} saatte toparlanıyor.`,
                      `An hour later the gap is still ${formatSigned(fatalSeries[2] ?? 0)} km/h and three hours later ${formatSigned(fatalSeries[4] ?? 0)} km/h. After a damage-only accident traffic recovers in ${recoveryHours(damageSeries) ?? 3} hours.`,
                    )}
                  </Finding>
                ) : null}
                {impact.lanes.length > 1 ? (
                  <ChartCard
                    info={t(
                      "Olay saatinde kapatılan şerit sayısına göre hız farkı. Şerit sayısı kaydı tutulmayan kazalar ayrıca gösterilir.",
                      "Speed difference in the incident hour by the number of closed lanes. Accidents without a lane count are shown separately.",
                    )}
                    title={t("Kapanan şerit", "Closed lanes")}
                  >
                    <DivergingBars
                      items={impact.lanes.map((lane) => ({
                        label: lane.closedLanes === null ? t("Bilinmiyor", "Unknown") : t(`${lane.closedLanes} şerit`, `${lane.closedLanes} lanes`),
                        note: t(`${formatInteger(lane.accidents)} kaza`, `${formatInteger(lane.accidents)} accidents`),
                        value: lane.speedChangeKmh,
                        display: formatSigned(lane.speedChangeKmh),
                      }))}
                      negativeLabel={t("Daha yavaş", "Slower")}
                      positiveLabel={t("Daha hızlı", "Faster")}
                    />
                  </ChartCard>
                ) : null}
              </div>
              {explanation ? (
                <div className="span-12 findings-grid">
                  <Finding title={t("En kötü akşamların nedeni çoğu zaman yağmur", "The worst evenings are mostly rainy ones")}>
                    {t(
                      `Şehrin en yavaş %10'luk iş günü akşamlarının ${suffix(formatPercent(explanation.slowWithRainPct), "possessiveLocative")} 17:00-19:59 arasında en az 1 mm yağmur yağdı; tüm akşamlarda bu oran ${formatPercent(explanation.allWithRainPct)}.`,
                      `${formatPercent(explanation.slowWithRainPct)} of the slowest 10% of workday evenings had at least 1 mm of rain between 17:00 and 19:59, against ${formatPercent(explanation.allWithRainPct)} of all evenings.`,
                    )}
                  </Finding>
                  <Finding title={t("Ağır kaza tek başına açıklamıyor", "Serious accidents alone do not explain them")}>
                    {t(
                      `En yavaş akşamların ${suffix(formatPercent(explanation.slowWithSevereAccidentPct), "possessiveLocative")} ağır kaza vardı, ama tüm akşamlarda da oran ${formatPercent(explanation.allWithSevereAccidentPct)}. Ağır kazalar her akşam bir yerlerde oluyor; şehir genelini yavaşlatan, yağmur gibi her yeri aynı anda etkileyen koşullar.`,
                      `${formatPercent(explanation.slowWithSevereAccidentPct)} of the slowest evenings had a serious accident, but so did ${formatPercent(explanation.allWithSevereAccidentPct)} of all evenings. Serious accidents happen somewhere almost every evening; what slows the whole city are conditions, like rain, that hit everywhere at once.`,
                    )}
                  </Finding>
                </div>
              ) : null}
              <ChartCard
                className="span-12"
                info={t(
                  "Ayın diğer iş günü akşamlarına göre en yavaş 15 akşam, o akşamki kaza sayısı, yağış ve en ağır olay.",
                  "The 15 slowest evenings against the other workday evenings of the month, with that evening's accidents, rain and most serious incident.",
                )}
                subtitle={t("İş günleri, 17:00-19:59, aynı ayın akşamlarına göre", "Workdays, 17:00-19:59, against the same month's evenings")}
                title={t("En yavaş akşamlar ve o akşam olanlar", "The slowest evenings and what happened")}
              >
                <DataTable
                  columns={[t("Tarih", "Date"), t("Gün", "Day"), t("Fark", "Change"), t("Yağış (mm)", "Rain (mm)"), t("Kaza", "Accidents"), t("Ağır", "Serious"), t("En ağır olay", "Most serious incident")]}
                  rows={impact.slowestEvenings.map((evening) => [
                    formatLongDate(evening.date),
                    dayName(evening.dayName, locale),
                    `${formatSigned(evening.speedChangeKmh)} ${speedUnit}`,
                    evening.rainMm === null ? "-" : formatDecimal(evening.rainMm),
                    formatInteger(evening.accidents),
                    formatInteger(evening.severeAccidents),
                    evening.largestIncident ?? "-",
                  ])}
                />
                <p className="card-subtitle" style={{ marginTop: 12 }}>
                  {t("Trafik hızlarının tamamı için ", "For all traffic speeds see the ")}
                  <Link href="/harita">{t("tıkanıklık haritasına", "congestion map")}</Link>
                  {t(" bakın; orada \"Kazalar\" katmanı da var.", ", which also has an \"Accidents\" layer.")}
                </p>
              </ChartCard>
            </div>
          </ReportSection>
        </div>
      </IncidentFilters>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { LocationHourlyChart } from "@/components/charts/LocationHourlyChart";
import { FilterFrame } from "@/components/FilterFrame";
import { TrafficMap, type MapMode } from "@/components/charts/TrafficMap";
import { ChartCard, EmptyState, InfoTip } from "@/components/ui";
import { getCongestionMap, getIncidentCells, getLocationProfile, getMetadata, getSlowestLocations } from "@/lib/api";
import { countThresholds } from "@/lib/incidents";
import { buildRange, parseFilter, parseGeohash, toSearchParams, type RawSearchParams } from "@/lib/filters";
import { makeFormat } from "@/lib/format";
import { translator, type Translate } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { quantileThresholds } from "@/lib/map";
import { placeLabel, summarizeDistricts } from "@/lib/places";
import { classOf, congestionClass, heatClass } from "@/lib/scale";

function mapModes(t: Translate): MapMode[] {
  return [
    {
      id: "congestion",
      label: t("Tıkanıklık", "Congestion"),
      palette: "div",
      legend: { low: t("Akşam daha hızlı", "Faster in the evening"), high: t("Akşam hızı yarıdan fazla düşük", "Evening speed less than half") },
      extrude: "ascending",
    },
    {
      id: "speed",
      label: t("Akşam hızı", "Evening speed"),
      palette: "heat",
      legend: { low: t("45 km/sa altı", "below 45 km/h"), high: t("70 km/sa üstü", "above 70 km/h") },
      extrude: "descending",
    },
    {
      id: "volume",
      label: t("Araç yoğunluğu", "Traffic volume"),
      palette: "heat",
      legend: { low: t("En çok araç", "Most vehicles"), high: t("En az araç", "Fewest vehicles") },
      extrude: "descending",
    },
    {
      id: "accidents",
      label: t("Kazalar", "Accidents"),
      palette: "heat",
      legend: { low: t("En çok kaza", "Most accidents"), high: t("Kaza yok", "No accidents") },
      extrude: "descending",
    },
  ];
}

/** Districts shown in the ranking, split into two columns. */
const RANKED_DISTRICTS = 14;

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale());
  return { title: t("Tıkanıklık haritası", "Congestion map") };
}

export const dynamic = "force-dynamic";

export default async function MapPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const locale = await getLocale();
  const t = translator(locale);
  const { formatDecimal, formatIndex, formatInteger, formatLongDate, formatSpeed, speedUnit, noData } = makeFormat(locale);

  const dataset = await getMetadata();
  if (!dataset.firstDate || !dataset.lastDate) {
    return (
      <EmptyState
        title={t("Henüz veri yüklenmedi", "No data loaded yet")}
        message={t("Harita için önce bir ayı PostgreSQL'e yükleyin.", "Load at least one month into PostgreSQL to see the map.")}
      />
    );
  }

  const range = buildRange(dataset.firstDate, dataset.lastDate);
  const params = await searchParams;
  const filter = { ...parseFilter(params, range), dayType: "all" as const };
  // Accidents announced by the Traffic Management Centre in the same period, joined by cell.
  const [points, slowest, accidentCells] = await Promise.all([
    getCongestionMap(filter),
    getSlowestLocations(filter, 15),
    getIncidentCells({ from: filter.from, to: filter.to, category: "accident" }).catch(() => []),
  ]);
  const accidentsByCell = new Map(accidentCells.map((cell) => [cell.geohash, cell]));
  const accidentThresholds = countThresholds(points.map((point) => accidentsByCell.get(point.geohash)?.accidents ?? 0));
  const accidentLevel = (count: number) => (count <= 0 ? 7 : 8 - classOf(count, accidentThresholds));

  const selected = parseGeohash(params) ?? slowest[0]?.geohash ?? points[0]?.geohash ?? null;
  const profile = selected ? await getLocationProfile(selected, filter) : null;
  const cellAccidents = selected ? (accidentsByCell.get(selected)?.accidents ?? 0) : 0;
  const selectedPoint = points.find((point) => point.geohash === selected);
  const volumeThresholds = quantileThresholds(points.map((point) => point.averagePeakVehicleCount));
  const districts = summarizeDistricts(points).slice(0, RANKED_DISTRICTS);
  const maxDistrictIndex = Math.max(...districts.map((district) => district.congestionIndex), 0.01);
  const half = Math.ceil(districts.length / 2);
  const cellHref = (geohash: string) => `/harita?${toSearchParams(filter, range, { cell: geohash })}`;
  const selectedPlace = profile ? placeLabel(profile.location, locale) : null;

  return (
    <>
      <header className="page-title compact">
        <p className="eyebrow">{t("Harita", "Map")}</p>
        <h1>{t("İstanbul akşam trafiğinin haritası", "A map of Istanbul's evening traffic")}</h1>
        <p>
          {t(
            "Her kare yaklaşık 610 m x 920 m genişliğinde bir hücredir. Renk, hafta içi 17:00-19:59 hızının aynı hücrenin gece 01:00-04:59 hızına göre ne kadar düştüğünü gösterir. Bir semt arayın, üzerine gelin ya da tıklayın.",
            "Each square is a cell of about 610 m x 920 m. Its color shows how much the weekday 17:00-19:59 speed drops compared with the same cell's 01:00-04:59 night speed. Search a neighbourhood, hover or click a cell.",
          )}
        </p>
      </header>

      <FilterFrame filter={filter} months={dataset.loadedMonths} range={range} showDayType={false}>
        {points.length === 0 ? (
          <EmptyState
            resetHref="/harita"
            title={t("Harita için yeterli gözlem yok", "Not enough readings for the map")}
            message={t(
              "Bir hücrenin gösterilmesi için gece ve akşam saatlerinde en az 30'ar gözlem gerekir. Daha geniş bir tarih aralığı seçin.",
              "A cell needs at least 30 readings at night and in the evening to be shown. Choose a wider date range.",
            )}
          />
        ) : (
          <div className="stack">
            <TrafficMap
              ariaLabel={t(
                "İstanbul akşam tıkanıklığı haritası. Fare ya da klavye ile kaydırıp yakınlaştırabilirsiniz. Semt aramak için arama kutusunu, hücre seçmek için aşağıdaki tabloları da kullanabilirsiniz.",
                "Map of Istanbul's evening congestion. Pan and zoom with the mouse or keyboard. Use the search box to find a place, or the tables below to choose a cell.",
              )}
              cells={points.map((point) => {
                const place = placeLabel(point, locale);
                return {
                  id: point.geohash,
                  title: place.title,
                  subtitle: place.subtitle,
                  isDistrictOnly: !point.neighborhood,
                  latitude: point.latitude,
                  longitude: point.longitude,
                  levels: [
                    congestionClass(point.congestionIndex),
                    heatClass(point.peakSpeedKmh),
                    8 - classOf(point.averagePeakVehicleCount, volumeThresholds),
                    accidentLevel(accidentsByCell.get(point.geohash)?.accidents ?? 0),
                  ],
                  lines: [
                    { value: formatIndex(point.congestionIndex), label: t("tıkanıklık endeksi", "congestion index") },
                    { value: formatSpeed(point.peakSpeedKmh), label: t("akşam zirvesi", "evening peak") },
                    { value: formatSpeed(point.freeFlowSpeedKmh), label: t("gece", "night") },
                    { value: formatDecimal(point.averagePeakVehicleCount), label: t("araç / saat, akşam", "vehicles / hour, evening") },
                    { value: formatInteger(accidentsByCell.get(point.geohash)?.accidents ?? 0), label: t("kaza, dönemde", "accidents in period") },
                  ],
                };
              })}
              key={locale}
              modes={mapModes(t)}
              note={t(
                `${formatInteger(points.length)} hücre · ${formatLongDate(filter.from)} - ${formatLongDate(filter.to)}`,
                `${formatInteger(points.length)} cells · ${formatLongDate(filter.from)} - ${formatLongDate(filter.to)}`,
              )}
              panel={
                profile && selectedPlace ? (
                  <>
                    <p className="eyebrow">{t("Seçili semt", "Selected place")}</p>
                    <h2 className="panel-place">{selectedPlace.title}</h2>
                    <div className="panel-district">
                      <span>{selectedPlace.subtitle}</span>
                      <span className="chip mono">{profile.location.geohash}</span>
                    </div>
                    <dl className="details">
                      <div>
                        <dt>{t("Tıkanıklık endeksi", "Congestion index")}</dt>
                        <dd>{selectedPoint ? formatIndex(selectedPoint.congestionIndex) : noData}</dd>
                      </div>
                      <div>
                        <dt>{t("Akşam zirvesi", "Evening peak")}</dt>
                        <dd>{formatSpeed(selectedPoint?.peakSpeedKmh)}</dd>
                      </div>
                      <div>
                        <dt>{t("Gece", "Night")}</dt>
                        <dd>{formatSpeed(selectedPoint?.freeFlowSpeedKmh)}</dd>
                      </div>
                      <div>
                        <dt>{t("Araç-hız korelasyonu", "Vehicle-speed correlation")}</dt>
                        <dd>
                          {profile.location.vehicleSpeedCorrelation === null ? noData : formatIndex(profile.location.vehicleSpeedCorrelation)}
                        </dd>
                      </div>
                    </dl>
                    {selected ? (
                      <p className={cellAccidents > 0 ? "panel-incidents" : "panel-incidents quiet"}>
                        {cellAccidents > 0
                          ? t(
                              `Bu dönemde bu hücrede ${formatInteger(cellAccidents)} kaza duyuruldu.`,
                              cellAccidents === 1
                                ? "1 accident was announced in this cell in the period."
                                : `${formatInteger(cellAccidents)} accidents were announced in this cell in the period.`,
                            )
                          : t("Bu dönemde bu hücrede duyurulan kaza yok.", "No accidents were announced in this cell in the period.")}{" "}
                        <Link href={`/olaylar?from=${filter.from}&to=${filter.to}&cell=${selected}#harita`}>{t("Olayları gör", "See incidents")}</Link>
                      </p>
                    ) : null}
                    <p className="card-subtitle">{t("Saatlik hız profili, seçili dönemin tüm günleri", "Hourly speed, all days of the selected period")}</p>
                    <LocationHourlyChart points={profile.hourlyProfile} />
                    <div className="panel-help">
                      <InfoTip title={t("Bu panel nasıl okunur?", "How to read this panel")}>
                        <p>
                          {t(
                            "Tıkanıklık endeksi = 1 - akşam hızı / gece hızı. 0 akşamın gece kadar rahat olduğunu, 0,5 akşam hızının gecenin yarısına indiğini gösterir.",
                            "Congestion index = 1 - evening speed / night speed. 0 means the evening is as free as the night; 0.5 means the evening speed is half the night speed.",
                          )}
                        </p>
                        <p>
                          {t(
                            "Araç-hız korelasyonu -1'e yaklaştıkça bu noktada araç arttıkça hızın düştüğü, yani yolun kapasitesine yaklaştığı anlaşılır.",
                            "The closer the vehicle-speed correlation is to -1, the more speed falls as vehicles increase here, meaning the road runs near capacity.",
                          )}
                        </p>
                      </InfoTip>
                      <span>{t("Değerler nasıl okunur?", "How to read these values")}</span>
                    </div>
                  </>
                ) : (
                  <p className="card-subtitle">{t("Bu hücre için veri bulunamadı.", "No data was found for this cell.")}</p>
                )
              }
              searchable
              selectParam="cell"
              selected={selected}
            />

            {districts.length > 0 ? (
              <ChartCard
                info={t(
                  "Her ilçenin akşam ve gece hızları, hücrelerinden geçen araç sayısıyla ağırlıklandırılarak hesaplanır. Endeks yükseldikçe akşam trafiği geceye göre daha çok yavaşlar. En az 5 hücresi olan ilçeler sıralanır.",
                  "Each district's evening and night speeds are weighted by the vehicles passing its cells. The higher the index, the more the evening slows down compared with the night. Only districts with at least 5 cells are ranked.",
                )}
                subtitle={t(
                  "Tıkanıklık endeksine göre. Bir ilçeye tıklayınca en yavaş semti haritada açılır.",
                  "By congestion index. Click a district to open its slowest place on the map.",
                )}
                title={t("İlçelere göre akşam tıkanıklığı", "Evening congestion by district")}
              >
                <div className="ranking-columns">
                  {[districts.slice(0, half), districts.slice(half)].map((column, columnIndex) => (
                    <ol className="place-ranking" key={columnIndex} start={columnIndex * half + 1}>
                      {column.map((district, index) => (
                        <li key={district.district}>
                          <span className="rank">{columnIndex * half + index + 1}</span>
                          <Link className="place-name" href={cellHref(district.slowest.geohash)} scroll={false}>
                            <strong>{district.district}</strong>
                            <span>
                              {t("En yavaş", "Slowest")}: {district.slowest.neighborhood ?? district.slowest.geohash},{" "}
                              {formatSpeed(district.slowest.peakSpeedKmh)}
                            </span>
                          </Link>
                          <span aria-hidden="true" className="rank-track">
                            <span
                              className="rank-fill"
                              style={{
                                width: `${(Math.max(district.congestionIndex, 0) / maxDistrictIndex) * 100}%`,
                                background: `var(--div-${Math.min(7, Math.max(4, congestionClass(district.congestionIndex)))})`,
                              }}
                            />
                          </span>
                          <span className="value">{formatIndex(district.congestionIndex)}</span>
                        </li>
                      ))}
                    </ol>
                  ))}
                </div>
              </ChartCard>
            ) : null}

            <ChartCard
              info={t(
                "Hafta içi akşam zirvesinde ortalama hızı en düşük 15 hücre. Yalnızca en az 30 saat güvenilir ölçümü olan hücreler sıralanır, böylece tek tük ölçülen yerler listeyi bozmaz. Bir satıra tıklayınca harita o semte gider.",
                "The 15 cells with the lowest average speed in the weekday evening peak. Only cells with at least 30 reliable hours are ranked, so rarely measured places do not distort the list. Click a row to fly the map there.",
              )}
              subtitle={t("Hafta içi 17:00-19:59, en az 30 saat güvenilir gözlem", "Weekdays 17:00-19:59, at least 30 reliable hours")}
              title={t("Akşam zirvesinin en yavaş 15 semti", "The 15 slowest places in the evening peak")}
            >
              <div className="table-wrap tall">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t("Sıra", "Rank")}</th>
                      <th scope="col">{t("Semt", "Place")}</th>
                      <th scope="col" className="num">{t(`Hız (${speedUnit})`, `Speed (${speedUnit})`)}</th>
                      <th scope="col" className="num">{t("Ortalama araç", "Average vehicles")}</th>
                      <th scope="col" className="num">{t("Gözlenen saat", "Hours measured")}</th>
                      <th scope="col">{t("Hücre", "Cell")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slowest.map((location) => {
                      const place = placeLabel(location, locale);
                      return (
                        <tr key={location.geohash} data-selected={location.geohash === selected}>
                          <td>{location.rank}</td>
                          <td>
                            <Link className="row-link place-name" href={cellHref(location.geohash)} scroll={false}>
                              <strong>{place.title}</strong>
                              <span>{place.subtitle}</span>
                            </Link>
                          </td>
                          <td className="num">{formatDecimal(location.weightedAverageSpeedKmh)}</td>
                          <td className="num">{formatDecimal(location.averageVehicleCount)}</td>
                          <td className="num">{formatInteger(location.observedHours)}</td>
                          <td className="mono">{location.geohash}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </div>
        )}
      </FilterFrame>
    </>
  );
}

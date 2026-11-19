import type { Metadata } from "next";
import Link from "next/link";
import { CellMap } from "@/components/charts/CellMap";
import { LocationHourlyChart } from "@/components/charts/LocationHourlyChart";
import { FilterFrame } from "@/components/FilterFrame";
import { ChartCard, EmptyState } from "@/components/ui";
import { getCongestionMap, getLocationProfile, getMetadata, getSlowestLocations } from "@/lib/api";
import { buildRange, parseFilter, parseGeohash, toSearchParams, type RawSearchParams } from "@/lib/filters";
import { formatDecimal, formatIndex, formatInteger, formatLongDate, formatSpeed } from "@/lib/format";
import { congestionClass } from "@/lib/scale";

export const metadata: Metadata = { title: "Tıkanıklık haritası" };
export const dynamic = "force-dynamic";

export default async function MapPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const dataset = await getMetadata();
  if (!dataset.firstDate || !dataset.lastDate) {
    return <EmptyState title="Henüz veri yüklenmedi" message="Harita için önce bir ayı PostgreSQL'e yükleyin." />;
  }

  const range = buildRange(dataset.firstDate, dataset.lastDate);
  const params = await searchParams;
  const filter = { ...parseFilter(params, range), dayType: "all" as const };
  const [points, slowest] = await Promise.all([getCongestionMap(filter), getSlowestLocations(filter, 15)]);

  const selected = parseGeohash(params) ?? slowest[0]?.geohash ?? points[0]?.geohash ?? null;
  const profile = selected ? await getLocationProfile(selected, filter) : null;
  const selectedPoint = points.find((point) => point.geohash === selected);

  return (
    <>
      <header className="page-title">
        <p className="eyebrow">Harita</p>
        <h1>Akşam tıkanıklığı haritası</h1>
        <p>
          Her kare yaklaşık 610 m x 920 m genişliğinde bir hücredir. Renk, hafta içi 17:00-19:59 hızının aynı hücrenin
          gece 01:00-04:59 hızına göre ne kadar düştüğünü gösterir.
        </p>
      </header>

      <FilterFrame filter={filter} months={dataset.loadedMonths} range={range} showDayType={false}>
        {points.length === 0 ? (
          <EmptyState
            resetHref="/harita"
            title="Harita için yeterli gözlem yok"
            message="Bir hücrenin gösterilmesi için gece ve akşam saatlerinde en az 30'ar gözlem gerekir. Daha geniş bir tarih aralığı seçin."
          />
        ) : (
          <div className="map-layout">
            <ChartCard
              title="Tıkanıklık endeksi"
              subtitle={`${formatInteger(points.length)} hücre, ${formatLongDate(filter.from)} ile ${formatLongDate(filter.to)} arası`}
            >
              <CellMap
                ariaLabel="İstanbul tıkanıklık haritası. Hücre seçmek için aşağıdaki en yavaş hücreler tablosunu da kullanabilirsiniz."
                cells={points.map((point) => ({
                  id: point.geohash,
                  latitude: point.latitude,
                  longitude: point.longitude,
                  level: congestionClass(point.congestionIndex),
                  lines: [
                    { value: formatIndex(point.congestionIndex), label: "tıkanıklık endeksi" },
                    { value: formatSpeed(point.peakSpeedKmh), label: "akşam" },
                    { value: formatSpeed(point.freeFlowSpeedKmh), label: "gece" },
                  ],
                }))}
                legend={{ low: "Akşam daha hızlı", high: "Akşam hızı yarıdan fazla düşük" }}
                selectParam="cell"
                selected={selected}
              />
            </ChartCard>

            <ChartCard
              title={profile ? `Hücre ${profile.location.geohash}` : "Seçili hücre"}
              subtitle="Hafta içi saatlik profil. Haritadan başka bir hücre seçebilirsiniz."
            >
              {profile ? (
                <>
                  <dl className="details">
                    <div>
                      <dt>Tıkanıklık endeksi</dt>
                      <dd>{selectedPoint ? formatIndex(selectedPoint.congestionIndex) : "Veri yok"}</dd>
                    </div>
                    <div>
                      <dt>Akşam zirvesi hızı</dt>
                      <dd>{formatSpeed(selectedPoint?.peakSpeedKmh)}</dd>
                    </div>
                    <div>
                      <dt>Gece hızı</dt>
                      <dd>{formatSpeed(selectedPoint?.freeFlowSpeedKmh)}</dd>
                    </div>
                    <div>
                      <dt>Araç-hız korelasyonu</dt>
                      <dd>
                        {profile.location.vehicleSpeedCorrelation === null
                          ? "Veri yok"
                          : formatIndex(profile.location.vehicleSpeedCorrelation)}
                      </dd>
                    </div>
                  </dl>
                  <LocationHourlyChart points={profile.hourlyProfile} />
                </>
              ) : (
                <p className="card-subtitle">Bu hücre için veri bulunamadı.</p>
              )}
            </ChartCard>

            <section className="card" style={{ gridColumn: "1 / -1" }}>
              <h2>Akşam zirvesinin en yavaş 15 hücresi</h2>
              <p className="card-subtitle">Hafta içi 17:00-19:59, en az 30 saat güvenilir gözlem</p>
              <div className="card-body">
                <div className="table-wrap tall">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Sıra</th>
                        <th scope="col">Hücre</th>
                        <th scope="col" className="num">Hız (km/sa)</th>
                        <th scope="col" className="num">Ortalama araç</th>
                        <th scope="col" className="num">Gözlenen saat</th>
                        <th scope="col" className="num">Enlem</th>
                        <th scope="col" className="num">Boylam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slowest.map((location) => (
                        <tr key={location.geohash} data-selected={location.geohash === selected}>
                          <td>{location.rank}</td>
                          <td>
                            <Link
                              className="row-link mono"
                              href={`/harita?${toSearchParams(filter, range, { cell: location.geohash })}`}
                              scroll={false}
                            >
                              {location.geohash}
                            </Link>
                          </td>
                          <td className="num">{formatDecimal(location.weightedAverageSpeedKmh)}</td>
                          <td className="num">{formatDecimal(location.averageVehicleCount)}</td>
                          <td className="num">{formatInteger(location.observedHours)}</td>
                          <td className="num">{location.latitude.toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                          <td className="num">{location.longitude.toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        )}
      </FilterFrame>
    </>
  );
}

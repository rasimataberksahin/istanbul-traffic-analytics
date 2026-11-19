import type { Metadata } from "next";
import { ChartCard, ColumnBars, DataTable, EmptyState, HorizontalBars, StatTile } from "@/components/ui";
import { getDataSources, getImportRuns, getMonthlyInsights } from "@/lib/api";
import { formatCompact, formatDateTime, formatDecimal, formatInteger, formatMonth, formatPercent, formatShortMonth } from "@/lib/format";

export const metadata: Metadata = { title: "Veri hattı" };
export const dynamic = "force-dynamic";

const QUALITY_LABELS: Record<string, string> = {
  analysis_eligible: "Analize uygun",
  low_sample: "Düşük örneklem",
  public_holiday: "Resmî tatil",
  partial_hour: "Kısmi saat",
  max_speed_suspect: "Şüpheli maksimum hız",
  speed_outlier: "Aykırı ortalama hız",
};

export default async function PipelinePage() {
  const [sources, runs, monthly] = await Promise.all([getDataSources(), getImportRuns(), getMonthlyInsights()]);
  const latest = runs[0];
  const source = sources[0];
  const totalRows = runs.reduce((sum, run) => sum + run.rowCount, 0);
  const partialHours = monthly.reduce((sum, month) => sum + month.partialHours, 0);
  const lowestCoverage = monthly.reduce<(typeof monthly)[number] | null>(
    (lowest, month) => (lowest === null || month.coveragePct < lowest.coveragePct ? month : lowest),
    null,
  );

  return (
    <>
      <header className="page-title">
        <p className="eyebrow">Veri hattı</p>
        <h1>Veri hattı ve kalite</h1>
        <p>Dashboard&apos;daki sayıların hangi dosyadan geldiği ve analize girmeden önce hangi kontrollerden geçtiği.</p>
      </header>

      {!latest ? (
        <EmptyState
          title="Yükleme kaydı bulunamadı"
          message="Veri hattı geçmişini görmek için API'nin eşitleme endpoint'ini çalıştırın."
        />
      ) : (
        <>
          <section className="stats" aria-label="Son yükleme">
            <StatTile
              label="Yüklenen ay"
              value={formatInteger(runs.length)}
              note={`${formatMonth(runs.at(-1)?.month ?? latest.month)} - ${formatMonth(latest.month)}`}
            />
            <StatTile label="Toplam satır" value={formatCompact(totalRows)} note={`${formatInteger(totalRows)} saatlik ölçüm`} />
            <StatTile
              label="Kesintili saat"
              value={formatInteger(partialHours)}
              note={`${formatInteger(monthly.reduce((sum, month) => sum + month.daysInMonth * 24, 0))} saatin içinde`}
            />
            <StatTile
              label="En düşük kapsama"
              value={lowestCoverage ? formatPercent(lowestCoverage.coveragePct) : "Veri yok"}
              note={lowestCoverage ? formatMonth(lowestCoverage.month) : undefined}
            />
          </section>

          <div className="grid">
            <ChartCard
              className="span-7"
              title="Kalite işaretleri"
              subtitle={`${formatMonth(latest.month)} satırlarının payı. Bir satır birden fazla işaret taşıyabilir.`}
              table={
                <DataTable
                  columns={["İşaret", "Satır", "Pay"]}
                  rows={latest.qualityResults.map((result) => [
                    QUALITY_LABELS[result.metric] ?? result.metric,
                    formatInteger(result.rowCount),
                    formatPercent(result.sharePct),
                  ])}
                />
              }
            >
              <HorizontalBars
                items={[...latest.qualityResults]
                  .sort((a, b) => b.rowCount - a.rowCount)
                  .map((result) => ({
                    label: QUALITY_LABELS[result.metric] ?? result.metric,
                    value: result.sharePct,
                    display: result.sharePct > 0 && result.sharePct < 0.05 ? "<%0,1" : formatPercent(result.sharePct),
                  }))}
              />
            </ChartCard>

            <ChartCard className="span-5" title="Analiz kuralları" subtitle="Tüm ekranlarda aynı kurallar geçerlidir">
              <ul className="notes">
                <li>Veri kesintisi olan saatler ve 150 km/sa üzerindeki ortalama hızlar analize girmez.</li>
                <li>Şehir geneli hızlar araç sayısına göre ağırlıklandırılır.</li>
                <li>5 aracın altındaki ölçümler konum sıralamalarında kullanılmaz.</li>
                <li>Hücreler yol segmenti değildir, aynı hücrede farklı yollar bulunabilir.</li>
              </ul>
            </ChartCard>

            <ChartCard
              className="span-12"
              title="Aylık veri kapsamı"
              subtitle="Analize uygun verisi olan saatlerin ayın tüm saatlerine oranı. Kesintili saatler ETL'de işaretlenir."
              table={
                <DataTable
                  columns={["Ay", "Kapsama", "Kesintili saat", "Satır", "Hücre", "Hücre başına araç"]}
                  rows={monthly.map((month) => [
                    formatMonth(month.month),
                    formatPercent(month.coveragePct),
                    formatInteger(month.partialHours),
                    formatInteger(month.rowCount),
                    formatInteger(month.locationCount),
                    formatDecimal(month.averageVehicleCount),
                  ])}
                />
              }
            >
              <ColumnBars
                formatValue={(value) => `%${Math.round(value)}`}
                items={monthly.map((month) => ({
                  key: month.month,
                  label: formatShortMonth(month.month),
                  value: month.coveragePct,
                  highlight: month.coveragePct < 95,
                  title: `${formatMonth(month.month)}: ${formatPercent(month.coveragePct)} kapsama, ${month.partialHours} kesintili saat`,
                }))}
              />
            </ChartCard>

            <ChartCard className="span-12" title="Yükleme geçmişi" subtitle="ETL hattının PostgreSQL'e aktardığı aylar">
              <DataTable
                columns={["Ay", "Dosya", "Satır", "Konum", "Yüklenme zamanı", "SHA-256"]}
                rows={runs.map((run) => [
                  formatMonth(run.month),
                  run.sourceFile,
                  formatInteger(run.rowCount),
                  formatInteger(run.locationCount),
                  formatDateTime(run.loadedAt),
                  `${run.sourceSha256.slice(0, 12)}...`,
                ])}
              />
              {source ? (
                <p className="card-subtitle" style={{ marginTop: 12 }}>
                  Kaynak: <a href={source.url} rel="noreferrer" target="_blank">{source.name}</a>. Lisans: {source.license}.
                </p>
              ) : null}
            </ChartCard>
          </div>
        </>
      )}
    </>
  );
}

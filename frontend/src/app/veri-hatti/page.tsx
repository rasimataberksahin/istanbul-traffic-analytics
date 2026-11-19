import type { Metadata } from "next";
import { ChartCard, ColumnBars, DataTable, EmptyState, HorizontalBars, StatTile } from "@/components/ui";
import { getDataSources, getImportRuns, getMonthlyInsights } from "@/lib/api";
import { makeFormat } from "@/lib/format";
import { translator } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale());
  return { title: t("Veri hattı", "Data pipeline") };
}

export const dynamic = "force-dynamic";

const QUALITY_LABELS: Record<string, [string, string]> = {
  analysis_eligible: ["Analize uygun", "Usable for analysis"],
  low_sample: ["Düşük örneklem", "Low sample"],
  public_holiday: ["Resmî tatil", "Public holiday"],
  partial_hour: ["Kısmi saat", "Partial hour"],
  max_speed_suspect: ["Şüpheli maksimum hız", "Suspicious maximum speed"],
  speed_outlier: ["Aykırı ortalama hız", "Average speed outlier"],
};

export default async function PipelinePage() {
  const locale = await getLocale();
  const t = translator(locale);
  const { formatLargeCount, formatDateTime, formatDecimal, formatInteger, formatMonth, formatPercent, formatShortMonth, noData } =
    makeFormat(locale);
  const quality = (metric: string) => {
    const labels = QUALITY_LABELS[metric];
    return labels ? t(labels[0], labels[1]) : metric;
  };

  const [sources, runs, monthly] = await Promise.all([getDataSources(), getImportRuns(), getMonthlyInsights()]);
  const latest = runs[0];
  const source = sources[0];
  const totalRows = runs.reduce((sum, run) => sum + run.rowCount, 0);
  const partialHours = monthly.reduce((sum, month) => sum + month.partialHours, 0);
  const lowestCoverage = monthly.reduce<(typeof monthly)[number] | null>(
    (lowest, month) => (lowest === null || month.coveragePct < lowest.coveragePct ? month : lowest),
    null,
  );
  const percent = (value: number) => (locale === "en" ? `${Math.round(value)}%` : `%${Math.round(value)}`);

  return (
    <>
      <header className="page-title">
        <p className="eyebrow">{t("Veri hattı", "Data pipeline")}</p>
        <h1>{t("Veri hattı ve kalite", "Pipeline and data quality")}</h1>
        <p>
          {t(
            "Dashboard'daki sayıların hangi dosyadan geldiği ve analize girmeden önce hangi kontrollerden geçtiği.",
            "Where the numbers on the dashboard come from and which checks they pass before they are analysed.",
          )}
        </p>
      </header>

      {!latest ? (
        <EmptyState
          title={t("Yükleme kaydı bulunamadı", "No load records found")}
          message={t(
            "Veri hattı geçmişini görmek için API'nin eşitleme endpoint'ini çalıştırın.",
            "Run the API's sync endpoint to see the pipeline history.",
          )}
        />
      ) : (
        <>
          <section className="stats" aria-label={t("Son yükleme", "Latest load")}>
            <StatTile
              info={t(
                "ETL hattının PostgreSQL'e yüklediği ay sayısı. Her ay İBB'den ayrı bir CSV dosyası olarak indirilir, temizlenir ve yüklenir.",
                "The number of months the ETL pipeline has loaded into PostgreSQL. Each month is downloaded from IMM as a separate CSV file, cleaned and loaded.",
              )}
              label={t("Yüklenen ay", "Months loaded")}
              note={`${formatMonth(runs.at(-1)?.month ?? latest.month)} - ${formatMonth(latest.month)}`}
              value={formatInteger(runs.length)}
            />
            <StatTile
              info={t(
                "Veritabanındaki toplam satır. Her satır, bir konum hücresinin bir saatlik ölçümüdür: ortalama, en düşük ve en yüksek hız ile geçen araç sayısı.",
                "Total rows in the database. Each row is one hour of one location cell: average, minimum and maximum speed and the number of vehicles.",
              )}
              label={t("Toplam satır", "Total rows")}
              note={t(`${formatInteger(totalRows)} saatlik ölçüm`, `${formatInteger(totalRows)} hourly readings`)}
              value={formatLargeCount(totalRows)}
            />
            <StatTile
              info={t(
                "Veri akışının kesildiği saatler. Bir saatin araç sayısı aynı gün ve saatin olağan düzeyinin yarısının altına düşerse ETL o saati kesintili sayar ve analizlerden çıkarır.",
                "Hours in which the data feed was interrupted. If an hour's vehicle count drops below half of its usual level, the ETL marks it as partial and leaves it out of the analysis.",
              )}
              label={t("Kesintili saat", "Partial hours")}
              note={t(
                `${formatInteger(monthly.reduce((sum, month) => sum + month.daysInMonth * 24, 0))} saatin içinde`,
                `out of ${formatInteger(monthly.reduce((sum, month) => sum + month.daysInMonth * 24, 0))} hours`,
              )}
              value={formatInteger(partialHours)}
            />
            <StatTile
              info={t(
                "Bir ayın kaç saatinde analize uygun veri olduğu. Kapsaması düşük aylarda sonuçlar daha az saate dayanır.",
                "The share of a month's hours that have usable data. Results for months with low coverage rest on fewer hours.",
              )}
              label={t("En düşük kapsama", "Lowest coverage")}
              note={lowestCoverage ? formatMonth(lowestCoverage.month) : undefined}
              value={lowestCoverage ? formatPercent(lowestCoverage.coveragePct) : noData}
            />
          </section>

          <div className="grid">
            <ChartCard
              className="span-7"
              info={
                <>
                  <p>{t("ETL her satırı kurallarla işaretler:", "The ETL flags every row with rules:")}</p>
                  <p>
                    {t(
                      "Düşük örneklem: 5'ten az araç, ortalama hız güvenilmez. Aykırı ortalama hız: 150 km/sa üstü. Şüpheli maksimum hız: 200 km/sa üstü. Kısmi saat: veri akışı kesilmiş. Resmî tatil: takvimden.",
                      "Low sample: fewer than 5 vehicles, so the average speed is unreliable. Speed outlier: above 150 km/h. Suspicious maximum: above 200 km/h. Partial hour: the feed was interrupted. Public holiday: from the calendar.",
                    )}
                  </p>
                  <p>{t("İşaretli satırlar silinmez, her analiz kendine uygun olanları seçer.", "Flagged rows are not deleted; each analysis picks the rows it needs.")}</p>
                </>
              }
              subtitle={t(
                `${formatMonth(latest.month)} satırlarının payı. Bir satır birden fazla işaret taşıyabilir.`,
                `Share of the rows of ${formatMonth(latest.month)}. A row can carry more than one flag.`,
              )}
              table={
                <DataTable
                  columns={[t("İşaret", "Flag"), t("Satır", "Rows"), t("Pay", "Share")]}
                  rows={latest.qualityResults.map((result) => [quality(result.metric), formatInteger(result.rowCount), formatPercent(result.sharePct)])}
                />
              }
              title={t("Kalite işaretleri", "Quality flags")}
            >
              <HorizontalBars
                items={[...latest.qualityResults]
                  .sort((a, b) => b.rowCount - a.rowCount)
                  .map((result) => ({
                    label: quality(result.metric),
                    value: result.sharePct,
                    display: result.sharePct > 0 && result.sharePct < 0.05 ? t("<%0,1", "<0.1%") : formatPercent(result.sharePct),
                  }))}
              />
            </ChartCard>

            <ChartCard
              className="span-5"
              info={t(
                "Bu kurallar API'deki tüm sorgularda ortaktır, bu yüzden genel bakış, rapor ve harita aynı sayıları üretir.",
                "These rules are shared by every query in the API, so the overview, the report and the map produce the same numbers.",
              )}
              subtitle={t("Tüm ekranlarda aynı kurallar geçerlidir", "The same rules apply on every screen")}
              title={t("Analiz kuralları", "Analysis rules")}
            >
              <ul className="notes">
                <li>{t("Veri kesintisi olan saatler ve 150 km/sa üzerindeki ortalama hızlar analize girmez.", "Hours with data outages and average speeds above 150 km/h are left out.")}</li>
                <li>{t("Şehir geneli hızlar araç sayısına göre ağırlıklandırılır.", "City-wide speeds are weighted by vehicle count.")}</li>
                <li>{t("5 aracın altındaki ölçümler konum sıralamalarında kullanılmaz.", "Readings with fewer than 5 vehicles are not used in location rankings.")}</li>
                <li>{t("Hücreler yol segmenti değildir, aynı hücrede farklı yollar bulunabilir.", "Cells are not road segments; one cell can contain several roads.")}</li>
              </ul>
            </ChartCard>

            <ChartCard
              className="span-12"
              info={t(
                "Her çubuk bir aydır ve yüksekliği o ayın saatlerinin yüzde kaçında analize uygun veri olduğunu gösterir. Turuncu çubuklar %95'in altında kalan aylardır.",
                "Each bar is a month; its height is the share of hours with usable data. Orange bars are months below 95%.",
              )}
              subtitle={t(
                "Analize uygun verisi olan saatlerin ayın tüm saatlerine oranı. Kesintili saatler ETL'de işaretlenir.",
                "Hours with usable data as a share of all hours in the month. Partial hours are flagged by the ETL.",
              )}
              table={
                <DataTable
                  columns={[t("Ay", "Month"), t("Kapsama", "Coverage"), t("Kesintili saat", "Partial hours"), t("Satır", "Rows"), t("Hücre", "Cells"), t("Hücre başına araç", "Vehicles per cell")]}
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
              title={t("Aylık veri kapsamı", "Monthly data coverage")}
            >
              <ColumnBars
                formatValue={percent}
                items={monthly.map((month) => ({
                  key: month.month,
                  label: formatShortMonth(month.month),
                  value: month.coveragePct,
                  highlight: month.coveragePct < 95,
                  title: t(
                    `${formatMonth(month.month)}: ${formatPercent(month.coveragePct)} kapsama, ${month.partialHours} kesintili saat`,
                    `${formatMonth(month.month)}: ${formatPercent(month.coveragePct)} coverage, ${month.partialHours} partial hours`,
                  ),
                }))}
              />
            </ChartCard>

            <ChartCard
              className="span-12"
              info={t(
                "Her satır bir yüklemedir. SHA-256, kaynak dosyanın parmak izidir: aynı dosya ikinci kez yüklenmez, dosya değişirse ay baştan yüklenir.",
                "Each row is one load. SHA-256 is the fingerprint of the source file: the same file is never loaded twice, and a changed file reloads the month.",
              )}
              subtitle={t("ETL hattının PostgreSQL'e aktardığı aylar", "Months the ETL pipeline loaded into PostgreSQL")}
              title={t("Yükleme geçmişi", "Load history")}
            >
              <DataTable
                columns={[t("Ay", "Month"), t("Dosya", "File"), t("Satır", "Rows"), t("Konum", "Locations"), t("Yüklenme zamanı", "Loaded at"), "SHA-256"]}
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
                  {t("Kaynak", "Source")}:{" "}
                  <a href={source.url} rel="noreferrer" target="_blank">
                    {t(source.name, "IMM Hourly Traffic Density Data Set")}
                  </a>
                  . {t("Lisans", "Licence")}: {t(source.license, "IMM Open Data Licence")}.
                </p>
              ) : null}
            </ChartCard>
          </div>
        </>
      )}
    </>
  );
}

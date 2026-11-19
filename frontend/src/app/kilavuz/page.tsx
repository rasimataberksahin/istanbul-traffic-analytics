import {
  Article,
  CalendarBlank,
  ChartLineUp,
  Cube,
  Database,
  Info,
  MagnifyingGlass,
  MapTrifold,
  MoonStars,
  Table,
  Translate as TranslateIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import { translator } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale());
  return { title: t("Kullanım kılavuzu", "User guide") };
}

export default async function GuidePage() {
  const t = translator(await getLocale());

  const sections = [
    { id: "baslarken", title: t("Başlarken", "Getting started") },
    { id: "sayfalar", title: t("Sayfalar", "Pages") },
    { id: "kontroller", title: t("Kontroller", "Controls") },
    { id: "kavramlar", title: t("Kavramlar", "Glossary") },
    { id: "veri", title: t("Veri ve sınırlar", "Data and limits") },
  ];

  const pages: { href: string; icon: Icon; title: string; text: string; items: string[] }[] = [
    {
      href: "/",
      icon: ChartLineUp,
      title: t("Genel bakış", "Overview"),
      text: t(
        "Seçtiğiniz dönemin özeti. Varsayılan olarak son yüklenen ayı gösterir ve her şeyi bir önceki yılın aynı tarihleriyle karşılaştırır.",
        "A summary of the period you choose. It opens on the latest loaded month and compares everything with the same dates a year earlier.",
      ),
      items: [
        t("Dört gösterge: ortalama hız, en yavaş ve en hızlı saat, hücre başına araç", "Four figures: average speed, slowest and fastest hour, vehicles per cell"),
        t("Hafta içi ve hafta sonunun saat saat hızı", "Hour-by-hour speed on weekdays and weekends"),
        t("Günlük trend ve gün x saat ısı haritası", "Daily trend and a day by hour heatmap"),
      ],
    },
    {
      href: "/analiz",
      icon: Article,
      title: t("Analiz raporu", "Analysis report"),
      text: t(
        "Yüklenen tüm ayları kapsayan 12 bölümlük uzun rapor. Metindeki bulgular veriden hesaplanır, yeni ay geldiğinde kendiliğinden değişir.",
        "A 12-section report over every loaded month. The findings are computed from the data and change by themselves when a new month arrives.",
      ),
      items: [
        t("Aylık ve yıllık trend, mevsimsellik", "Monthly and yearly trends, seasonality"),
        t("Okul, tatil, Ramazan ve bayram etkileri", "School, break, Ramadan and holiday effects"),
        t("Öngörülebilirlik ve bölgesel değişim haritası", "Predictability and a map of change by area"),
      ],
    },
    {
      href: "/harita",
      icon: MapTrifold,
      title: t("Harita", "Map"),
      text: t(
        "Şehrin akşam trafiğini semt semt gösterir. Bir semt arayın, karelerin üzerine gelin ya da tıklayın; sağdaki panel o semtin saatlik profilini açar.",
        "Shows the city's evening traffic place by place. Search a neighbourhood, hover or click a square; the panel on the right opens that place's hourly profile.",
      ),
      items: [
        t("Üç ölçü: tıkanıklık, akşam hızı, araç yoğunluğu", "Three measures: congestion, evening speed, traffic volume"),
        t("2B ve 3B görünüm, hızlı git düğmeleri", "2D and 3D views, quick jump buttons"),
        t("İlçe sıralaması ve en yavaş 15 semt", "District ranking and the 15 slowest places"),
      ],
    },
    {
      href: "/veri-hatti",
      icon: Database,
      title: t("Veri hattı", "Data pipeline"),
      text: t(
        "Sayıların nereden geldiğini ve hangi kontrollerden geçtiğini gösterir: yüklenen dosyalar, kalite işaretleri, aylık veri kapsamı.",
        "Shows where the numbers come from and which checks they pass: loaded files, quality flags and monthly data coverage.",
      ),
      items: [
        t("Her yüklemenin dosyası ve SHA-256 parmak izi", "The file and SHA-256 fingerprint of every load"),
        t("Kesintili saatler ve kapsama oranı", "Partial hours and coverage"),
        t("Tüm ekranlarda geçerli analiz kuralları", "Analysis rules shared by every screen"),
      ],
    },
  ];

  const controls: { icon: Icon; title: string; text: string }[] = [
    {
      icon: CalendarBlank,
      title: t("Dönem ve gün tipi", "Period and day type"),
      text: t(
        "Sayfanın üstündeki çubuk kaydırırken de görünür kalır. Son ay, son 3 ay ve son 12 ay düğmeleri, ay listesi ve tarih kutularıyla en fazla 366 günlük bir aralık seçebilirsiniz. Seçim adres çubuğuna yazılır, bağlantıyı paylaşan kişi aynı görünümü açar.",
        "The bar at the top stays visible while you scroll. Pick up to 366 days with the last month, last 3 months and last 12 months buttons, the month list or the date boxes. The choice is written into the address, so a shared link opens the same view.",
      ),
    },
    {
      icon: Info,
      title: t("Bilgi düğmesi", "Info button"),
      text: t(
        "Kartların sağ üst köşesindeki küçük \"i\" düğmesi, o kartın neyi gösterdiğini ve nasıl okunacağını anlatır. Kapatmak için dışarı tıklayın ya da Esc'ye basın.",
        "The small \"i\" button in the top-right corner of a card explains what it shows and how to read it. Click outside or press Esc to close it.",
      ),
    },
    {
      icon: Table,
      title: t("Tabloyu göster", "Show table"),
      text: t(
        "Grafiklerin altındaki bu düğme aynı değerleri tablo olarak açar. Grafiklerde değerleri okumak için fareyi gezdirebilir ya da grafiğe odaklanıp sol ve sağ ok tuşlarını kullanabilirsiniz.",
        "This button under a chart opens the same values as a table. On charts, move the mouse or focus the chart and use the left and right arrow keys to read values.",
      ),
    },
    {
      icon: MagnifyingGlass,
      title: t("Haritada arama", "Map search"),
      text: t(
        "Arama kutusuna semt ya da ilçe adı yazın; Türkçe karakter gerekmez, \"kadikoy\" yazmak Kadıköy'ü bulur. Bir sonuç seçince harita oraya yaklaşır ve o bölgenin en belirgin hücresini açar.",
        "Type a neighbourhood or district into the search box; Turkish letters are optional, \"kadikoy\" finds Kadıköy. Choosing a result flies the map there and opens the most notable cell of that area.",
      ),
    },
    {
      icon: Cube,
      title: t("2B ve 3B", "2D and 3D"),
      text: t(
        "3B görünümde her hücre bir sütuna dönüşür ve yüksekliği seçili ölçüyü gösterir. Haritayı sağ tıkla sürükleyerek ya da sağ üstteki pusulayla döndürebilirsiniz. Tam ekran düğmesi haritayı büyütür.",
        "In 3D each cell becomes a column whose height shows the selected measure. Rotate the map by right-dragging or with the compass in the top-right corner. The full-screen button enlarges the map.",
      ),
    },
    {
      icon: TranslateIcon,
      title: t("Dil", "Language"),
      text: t(
        "Üst menüdeki TR / EN düğmesi tüm sayfaları, tarihleri ve sayı biçimlerini değiştirir. Seçiminiz bu tarayıcıda hatırlanır.",
        "The TR / EN switch in the top menu changes every page, date and number format. Your choice is remembered in this browser.",
      ),
    },
    {
      icon: MoonStars,
      title: t("Tema", "Theme"),
      text: t(
        "Güneş açık temayı, ay koyu temayı, ekran simgesi cihazınızın ayarını kullanır. Harita altlığı da temayla birlikte değişir.",
        "The sun selects the light theme, the moon the dark theme and the screen icon follows your device setting. The base map changes with the theme.",
      ),
    },
  ];

  const glossary: { term: string; text: string }[] = [
    {
      term: t("Hücre", "Cell"),
      text: t(
        "Verideki konum birimi: yaklaşık 610 m x 920 m büyüklüğünde bir geohash karesi. Bir hücrede birden fazla yol olabilir, sonuçlar yol segmenti düzeyinde değildir. Hücrelerin semt ve ilçe adları OpenStreetMap sınırlarından gelir.",
        "The location unit of the data: a geohash square of about 610 m x 920 m. A cell can contain several roads, so results are not at road-segment level. Neighbourhood and district names come from OpenStreetMap boundaries.",
      ),
    },
    {
      term: t("Araç ağırlıklı hız", "Vehicle-weighted speed"),
      text: t(
        "Her ölçümün hızı o saatte geçen araç sayısıyla çarpılır ve toplam araca bölünür. Böylece yoğun bir otoyol ile boş bir ara sokak ortalamaya eşit katkı yapmaz.",
        "Each reading's speed is multiplied by the vehicles that passed in that hour and divided by the total. A busy motorway and an empty side street therefore do not count equally.",
      ),
    },
    {
      term: t("Akşam zirvesi", "Evening peak"),
      text: t("Hafta içi, resmî tatil olmayan günlerin 17:00-19:59 arası.", "17:00-19:59 on weekdays that are not public holidays."),
    },
    {
      term: t("Gece hızı (serbest akış)", "Night speed (free flow)"),
      text: t(
        "01:00-04:59 arasındaki hız. Yollar boşken araçların gidebildiği hızı temsil eder ve diğer saatler için referanstır.",
        "The speed between 01:00 and 04:59. It stands for how fast vehicles move on empty roads and is the reference for other hours.",
      ),
    },
    {
      term: t("Tıkanıklık endeksi", "Congestion index"),
      text: t(
        "1 - akşam hızı / gece hızı. 0 akşamın gece kadar rahat olduğunu, 0,50 akşam hızının gecenin yarısına indiğini gösterir. Her yer kendi gecesiyle kıyaslandığı için otoyol ile şehir içi yol adil karşılaştırılır.",
        "1 - evening speed / night speed. 0 means the evening is as free as the night, 0.50 means the evening speed is half the night speed. Every place is compared with its own night, so motorways and city streets are compared fairly.",
      ),
    },
    {
      term: t("Yoğun saat", "Congested hour"),
      text: t("Şehir hızının gece hızının %75'inin altında kaldığı saat.", "An hour in which the city speed stays below 75% of its night speed."),
    },
    {
      term: t("Hücre başına araç", "Vehicles per cell"),
      text: t(
        "Bir hücreden bir saatte geçen ortalama araç. Veri gönderen hücre sayısı saatten saate değiştiği için toplam araç yerine bu oran karşılaştırılır.",
        "The average number of vehicles passing one cell in one hour. The number of reporting cells changes from hour to hour, so this rate is compared instead of a total.",
      ),
    },
    {
      term: t("Sayım kırılması", "Counting break"),
      text: t(
        "Ocak 2024'te hücre başına araç bir anda yaklaşık 1,7 katına çıktı ve öyle kaldı. Hızda karşılığı olmadığı için bu, İBB'nin araç sayım yöntemindeki bir değişiklik olarak yorumlanır ve bu tarihin iki yanı hacim açısından karşılaştırılmaz.",
        "In January 2024 vehicles per cell jumped to about 1.7 times their earlier level and stayed there. Speed shows no matching change, so this is read as a change in IMM's vehicle counting and volumes are not compared across that date.",
      ),
    },
    {
      term: t("Kısmi saat ve kapsama", "Partial hour and coverage"),
      text: t(
        "Veri akışı kesilen saatler kısmi saat olarak işaretlenir ve analizden çıkarılır. Kapsama, bir ayın saatlerinin yüzde kaçında kullanılabilir veri olduğudur.",
        "Hours in which the data feed was interrupted are flagged as partial and left out. Coverage is the share of a month's hours with usable data.",
      ),
    },
    {
      term: t("Yüzdelik (10. ve 90.)", "Percentile (10th and 90th)"),
      text: t(
        "Öngörülebilirlik grafiğinde 10. yüzdelik kötü bir günü (günlerin yalnızca %10'u daha yavaş), 90. yüzdelik iyi bir günü temsil eder.",
        "In the predictability chart the 10th percentile stands for a bad day (only 10% of days are slower) and the 90th for a good day.",
      ),
    },
  ];

  return (
    <>
      <header className="page-title">
        <p className="eyebrow">{t("Kullanım kılavuzu", "User guide")}</p>
        <h1>{t("Nerede ne var, nasıl okunur?", "What is where and how to read it")}</h1>
        <p>
          {t(
            "Bu dashboard, İstanbul Büyükşehir Belediyesi'nin yayımladığı saatlik trafik ölçümlerini analiz eder. Bu sayfa her ekranın ne gösterdiğini, kontrollerin nasıl kullanıldığını ve grafiklerde geçen kavramların anlamını özetler.",
            "This dashboard analyses the hourly traffic measurements published by Istanbul Metropolitan Municipality. This page explains what each screen shows, how the controls work and what the terms on the charts mean.",
          )}
        </p>
      </header>

      <div className="report">
        <nav aria-label={t("Kılavuz bölümleri", "Guide sections")} className="report-nav">
          <p className="report-nav-title">{t("İçindekiler", "Contents")}</p>
          <ol>
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="report-body guide">
          <section aria-labelledby="baslarken-baslik" className="report-section" id="baslarken">
            <h2 className="guide-heading" id="baslarken-baslik">
              {t("Başlarken", "Getting started")}
            </h2>
            <ol className="guide-steps">
              <li>
                <strong>{t("Bir dönem seçin", "Pick a period")}</strong>
                <span>
                  {t(
                    "Genel bakışta üstteki çubuktan ay ya da tarih aralığı seçin. Her şey seçtiğiniz döneme göre yeniden hesaplanır.",
                    "On the overview, choose a month or date range in the bar at the top. Everything is recalculated for that period.",
                  )}
                </span>
              </li>
              <li>
                <strong>{t("Göstergeleri okuyun", "Read the figures")}</strong>
                <span>
                  {t(
                    "Kartların altındaki oklar bir önceki yıla göre değişimi gösterir. Bir kartın ne anlattığından emin değilseniz sağ üstteki \"i\" düğmesine tıklayın.",
                    "The arrows under the cards show the change against the previous year. If you are unsure what a card says, click the \"i\" button in its top-right corner.",
                  )}
                </span>
              </li>
              <li>
                <strong>{t("Haritada keşfedin", "Explore on the map")}</strong>
                <span>
                  {t(
                    "Kendi semtinizi arayın, akşam trafiğinin gece hızına göre ne kadar yavaşladığına ve saat saat profiline bakın.",
                    "Search your own neighbourhood and see how much its evening traffic slows against the night and how it changes hour by hour.",
                  )}
                </span>
              </li>
            </ol>
          </section>

          <section aria-labelledby="sayfalar-baslik" className="report-section" id="sayfalar">
            <h2 className="guide-heading" id="sayfalar-baslik">
              {t("Sayfalar", "Pages")}
            </h2>
            <div className="guide-pages">
              {pages.map(({ href, icon: PageIcon, title, text, items }) => (
                <Link className="guide-page card" href={href} key={href}>
                  <span aria-hidden="true" className="guide-icon">
                    <PageIcon size={20} weight="duotone" />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <ul>
                    {items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <span className="guide-open">{t("Sayfayı aç →", "Open page →")}</span>
                </Link>
              ))}
            </div>
          </section>

          <section aria-labelledby="kontroller-baslik" className="report-section" id="kontroller">
            <h2 className="guide-heading" id="kontroller-baslik">
              {t("Kontroller", "Controls")}
            </h2>
            <div className="guide-controls">
              {controls.map(({ icon: ControlIcon, title, text }) => (
                <div className="guide-control" key={title}>
                  <span aria-hidden="true" className="guide-icon small">
                    <ControlIcon size={17} weight="duotone" />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="kavramlar-baslik" className="report-section" id="kavramlar">
            <h2 className="guide-heading" id="kavramlar-baslik">
              {t("Kavramlar", "Glossary")}
            </h2>
            <dl className="glossary card">
              {glossary.map((item) => (
                <div key={item.term}>
                  <dt>{item.term}</dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="veri-baslik" className="report-section" id="veri">
            <h2 className="guide-heading" id="veri-baslik">
              {t("Veri ve sınırlar", "Data and limits")}
            </h2>
            <div className="card guide-data">
              <p>
                {t(
                  "Ham veri İBB Açık Veri Portalı'ndaki Saatlik Trafik Yoğunluk Veri Seti'dir. Python ile yazılmış ETL hattı her ayı indirir, doğrular ve temizler, PostgreSQL'e yükler. .NET API veriyi analiz eder, bu dashboard da API'den okur.",
                  "The raw data is the Hourly Traffic Density data set on the IMM Open Data Portal. A Python ETL pipeline downloads, validates and cleans each month and loads it into PostgreSQL. A .NET API analyses the data and this dashboard reads from the API.",
                )}
              </p>
              <ul className="notes">
                <li>{t("Ölçümler saatliktir; saat içindeki dalgalanmalar görünmez.", "Readings are hourly; changes within an hour are not visible.")}</li>
                <li>{t("Hücreler yol değildir, aynı hücrede farklı hızlarda yollar olabilir.", "Cells are not roads; one cell can hold roads with different speeds.")}</li>
                <li>{t("Her saatte veri gönderen hücre sayısı değişir, bu yüzden toplamlar yerine oranlar karşılaştırılır.", "The number of reporting cells changes every hour, so rates are compared instead of totals.")}</li>
                <li>{t("Semt adları hücrenin merkez noktasına göre verilir; sınırdaki hücreler komşu semtin adını taşıyabilir.", "Place names follow the centre of each cell, so cells on a border may carry the neighbouring place's name.")}</li>
              </ul>
              <p className="card-subtitle">
                {t("Kaynak kodu ve teknik belgeler ", "Source code and technical documents are ")}
                <a href="https://github.com/rasimataberksahin/istanbul-traffic-analytics" rel="noreferrer">
                  {t("GitHub'dadır", "on GitHub")}
                </a>
                .
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

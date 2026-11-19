# SQL Analizi: Ekim 2024

13 sorgu [`database/analysis`](../database/analysis) klasöründedir, sonuçları [`analysis-results`](analysis-results) altında CSV olarak bulunur.

```bash
python -m traffic_etl.analyze
```

**Yöntem:** Aksi belirtilmedikçe kısmi saatler ve hız aykırıları çıkarılır, ortalamalar araç ağırlıklıdır. Konumlar yol değil, yaklaşık 610 m × 920 m boyutunda geohash hücreleridir.

## Öne çıkan bulgular

1. **Şehrin en yavaş saati 18:00.** Ortalama hız 45,47 km/sa. En hızlı saat olan 04:00'te 71,72 km/sa.
2. **Sabah zirvesi hafta sonu kayboluyor.** 07:00'de hafta sonu hafta içinden 15,24 km/sa daha hızlı.
3. **Trafik 06:00'da sertçe başlıyor.** Hafta içi araç gözlemi bir saatte %135,3 artıyor, hız 10,39 km/sa düşüyor.
4. **Hafta içi günler neredeyse aynı.** Günlük ortalamalar 52,98-54,13 km/sa aralığında. Pazar 59,98 km/sa ile en hızlı gün.
5. **29 Ekim tatili sabah zirvesini siliyor.** 08:00'de hız normal salılara göre 16,30 km/sa yüksek, araç gözlemi %32,4 düşük.
6. **Araç gözlemlerinin %35,77'si 40 km/sa altında.** 20 km/sa altındaki pay %3,55.
7. **Toplu korelasyon gerçek ilişkiyi gizliyor.** Tüm hücre-saatlerde korelasyon -0,059'dur. Hücreler kendi içinde incelendiğinde medyan korelasyon -0,451'e iner, ayrıntılar [EDA raporundadır](eda-report-2024-10.md).

## Sorgular

| # | Soru | SQL teknikleri | Sonuç |
|---:|---|---|---|
| [01](../database/analysis/01_city_kpis.sql) | Genel göstergeler | `FILTER` | Ağırlıklı ortalama 54,31 km/sa, basit ortalama 56,42 km/sa |
| [02](../database/analysis/02_hourly_profile.sql) | En yavaş saatler | CTE, `RANK` | Sıralama: 18:00, 17:00, 19:00 |
| [03](../database/analysis/03_weekday_vs_weekend.sql) | Hafta içi ve hafta sonu | CTE, `FILTER` | En büyük fark 07:00 ve 08:00'de, yaklaşık 15 km/sa |
| [04](../database/analysis/04_day_of_week.sql) | Haftanın günleri | `JOIN`, `FILTER` | En yavaş gün salı, 52,98 km/sa |
| [05](../database/analysis/05_slowest_locations.sql) | Akşam zirvesinin en yavaş hücreleri | `JOIN`, `HAVING`, `ROW_NUMBER` | En yavaş hücre `sxk973`, 10,28 km/sa |
| [06](../database/analysis/06_congestion_index.sql) | Tıkanıklık endeksi | Çoklu CTE, `JOIN`, `HAVING` | En yüksek `sxk9gf`: 85,78 km/sa'ten 19,91 km/sa'e, endeks 0,768 |
| [07](../database/analysis/07_daily_trend.sql) | Günlük trend | `LAG`, hareketli ortalama | En yavaş gün 17 Ekim (51,75), en hızlı gün 27 Ekim (60,58) |
| [08](../database/analysis/08_hourly_change.sql) | Saatlik değişim | CTE, `LAG` | En sert düşüş 06:00, en güçlü toparlanma 20:00 (+8,63 km/sa) |
| [09](../database/analysis/09_holiday_effect.sql) | Tatil etkisi | Çoklu CTE, `LEFT JOIN`, `FILTER` | En yüksek hız kazancı 08:00'de, 16,30 km/sa |
| [10](../database/analysis/10_speed_bands.sql) | Hız bantları | `CASE`, pencere fonksiyonu | En büyük pay 20-39 km/sa bandında, %32,22 |
| [11](../database/analysis/11_volume_vs_speed.sql) | Araç sayısı ve hız | `NTILE`, `CORR`, `CROSS JOIN` | En kalabalık dilimde hız 50,42 km/sa |
| [12](../database/analysis/12_chronic_congestion.sql) | Kronik tıkanıklık | Çoklu CTE, `PERCENTILE_CONT`, `DENSE_RANK` | `sxkbd0`, zirve saatlerinin %99,2'sinde serbest akış hızının yarısının altında |
| [13](../database/analysis/13_quality_flags.sql) | Kalite işaretleri | `CROSS JOIN LATERAL` | Satırların %99,461'i analize uygun |

## Metrik tanımları

| Metrik | Tanım |
|---|---|
| Ağırlıklı ortalama hız | `SUM(avg_speed_kmh × vehicle_count) / SUM(vehicle_count)` |
| Serbest akış hızı | Hücrenin 01:00-04:59 arasındaki ağırlıklı ortalama hızı |
| Tıkanıklık endeksi | `1 - (hafta içi 17:00-19:59 hızı / serbest akış hızı)` |
| Tıkalı saat | Ortalama hızın serbest akış hızının yarısından düşük olduğu saat |

## Sınırlamalar

- Sonuçlar tek aya aittir, mevsimsel genelleme yapılamaz.
- Veri, İBB'nin topladığı araç örneklemini yansıtır. Araç sayıları şehirdeki gerçek trafik hacmi değildir.
- Hücreler bir yol segmentine karşılık gelmez, aynı hücrede farklı hızlardaki yollar bulunabilir.
- Korelasyon nedensellik göstermez.

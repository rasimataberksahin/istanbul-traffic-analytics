# Veri Sözlüğü: Saatlik Trafik Yoğunluğu

| Bilgi | Değer |
|---|---|
| Kaynak | [İBB Açık Veri Portalı, Hourly Traffic Density Data Set](https://data.ibb.gov.tr/dataset/hourly-traffic-density-data-set) |
| Lisans | İBB Açık Veri Lisansı |
| İncelenen dosya | `traffic_density_202410.csv` (Ekim 2024) |
| Boyut | 142.084.788 bayt (142,1 MB) |
| Satır / sütun | 1.769.643 / 8 |
| Biçim | UTF-8, BOM yok, CRLF satır sonu, virgül ayraçlı |
| Tanecik (grain) | **1 satır = 1 saat + 1 geohash hücresi** |
| Doğal anahtar | `(DATE_TIME, GEOHASH)`, dosyada tekrar eden anahtar yok |

## Sütunlar

İstatistikler dosyanın tamamından hesaplanmıştır. Hiçbir sütunda boş veya ayrıştırılamayan değer yoktur.

| Kaynak sütun | Hedef sütun | Ham tip | PostgreSQL önerisi | Birim | Açıklama | Gözlenen aralık |
|---|---|---|---|---|---|---|
| `DATE_TIME` | `observed_at` | Metin (`YYYY-MM-DD HH:MM:SS`) | `TIMESTAMP` | Saat | Ölçüm saatinin başlangıcı | 2024-10-01 00:00 → 2024-10-31 23:00 |
| `LATITUDE` | `latitude` | Ondalık metin | `DOUBLE PRECISION` | Derece | Geohash hücresinin merkez enlemi | 40,767517 → 41,344299 |
| `LONGITUDE` | `longitude` | Ondalık metin | `DOUBLE PRECISION` | Derece | Geohash hücresinin merkez boylamı | 27,965698 → 29,635620 |
| `GEOHASH` | `geohash` | 6 karakter metin | `CHAR(6)` | Yok | Konum hücresi kimliği | 2.458 farklı hücre |
| `MINIMUM_SPEED` | `min_speed_kmh` | Tam sayı | `SMALLINT` | km/sa | Hücrede o saatteki en düşük hız | 1 → 199, medyan 10 |
| `MAXIMUM_SPEED` | `max_speed_kmh` | Tam sayı | `SMALLINT` | km/sa | Hücrede o saatteki en yüksek hız | 1 → 250, medyan 101 |
| `AVERAGE_SPEED` | `avg_speed_kmh` | Tam sayı | `SMALLINT` | km/sa | Hücrede o saatteki ortalama hız | 1 → 199, medyan 54 |
| `NUMBER_OF_VEHICLES` | `vehicle_count` | Tam sayı | `INTEGER` | Araç | Hücrede o saatte görülen tekil araç sayısı | 1 → 1.679, medyan 62 |

## Dağılımlar

| Sütun | Ort. | %1 | %25 | Medyan | %75 | %99 |
|---|---:|---:|---:|---:|---:|---:|
| `MINIMUM_SPEED` | 22,7 | 1 | 3 | 10 | 42 | 84 |
| `MAXIMUM_SPEED` | 102,6 | 35 | 72 | 101 | 131 | 185 |
| `AVERAGE_SPEED` | 56,4 | 16 | 33 | 54 | 80 | 106 |
| `NUMBER_OF_VEHICLES` | 113,9 | 1 | 22 | 62 | 147 | 696 |

## Yorumlama kuralları

1. **Geohash hücresi yaklaşık 610 m × 920 m boyutundadır.** Veri yol segmenti değil, alan bazlıdır. Bir hücrede birden fazla yol bulunabilir.
2. **Koordinatlar ölçüm noktası değildir.** Her satırdaki enlem ve boylam, geohash hücresinin tam merkezidir. Bu nedenle konumlar ayrı bir boyut tablosuna taşınabilir.
3. **Şehir ortalaması araç ağırlıklı hesaplanmalıdır.** Basit ortalama her hücreye eşit ağırlık verir: Ekim genelinde basit ortalama 56,41 km/sa, araç ağırlıklı ortalama 54,30 km/sa'dir.
4. **`NUMBER_OF_VEHICLES` hücreler arasında toplanamaz.** Aynı araç bir saatte birden fazla hücreden geçebilir. Toplam, tekil araç sayısı değil yoğunluk göstergesidir.
5. **Saat dilimi kaynakta belirtilmemiştir.** Trafik örüntüsü yerel saati (UTC+3) işaret eder: en düşük araç sayısı 03:00'te, en düşük hız 18:00'dedir. Proje değerleri `Europe/Istanbul` yerel saati olarak kabul eder.

## Kaynakta tanımlanmayan noktalar

Aşağıdaki konular İBB dokümantasyonunda açıklanmamıştır. Bu projede varsayım olarak ele alınır:

- Ortalama hızın araç bazlı mı yoksa GPS sinyali bazlı mı hesaplandığı.
- Verinin hangi araç filolarından toplandığı.
- Sıfır hız değerinin neden hiç bulunmadığı. Duran araçlar filtrelenmiş olabilir.

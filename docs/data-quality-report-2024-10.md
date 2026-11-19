# İlk Veri Kalite Raporu: Ekim 2024

**Kapsam:** `traffic_density_202410.csv` dosyasının 1.769.643 satırının tamamı tarandı, örneklem kullanılmadı.
**Ham sonuçlar:** [`profiles/traffic_density_202410.profile.json`](profiles/traffic_density_202410.profile.json)
**Dosya özeti (SHA-256):** `16f1a2383445d5939769c31ae0cd007b69d171acb195e175bb2110607970c1ca`

## Sonuç

Dosya yapısal olarak temizdir: eksik değer, tekrar eden kayıt, hatalı tarih veya geçersiz koordinat yoktur. Asıl riskler **analitik** niteliktedir. Veri kesintileri, düşük örneklemli hücreler ve ortalama hesaplama yöntemi sonuçları yanıltabilir.

## Geçen kontroller

| Kontrol | Sonuç | İhlal |
|---|---|---:|
| Başlık beklenen 8 sütunla aynı | Geçti | 0 |
| Eksik veya boş değer | Geçti | 0 |
| Ayrıştırılamayan tarih veya sayı | Geçti | 0 |
| Tam sayı olmayan hız veya araç değeri | Geçti | 0 |
| Birebir tekrar eden satır | Geçti | 0 |
| Tekrar eden `(DATE_TIME, GEOHASH)` anahtarı | Geçti | 0 |
| Ay dışında kalan veya tam saat olmayan zaman | Geçti | 0 |
| Eksik saat (744 saatin tamamı mevcut) | Geçti | 0 |
| `MINIMUM_SPEED > MAXIMUM_SPEED` | Geçti | 0 |
| Ortalama hızın min-maks aralığı dışında olması | Geçti | 0 |
| Negatif veya sıfır hız | Geçti | 0 |
| Sıfır veya negatif araç sayısı | Geçti | 0 |
| İstanbul sınırları dışında koordinat | Geçti | 0 |
| Geçersiz veya 6 karakter olmayan geohash | Geçti | 0 |
| Koordinatın geohash hücre merkeziyle uyuşmaması | Geçti | 0 |

## Bulgular ve Aşama 2 kararları

| # | Önem | Bulgu | Etki | Aşama 2 kararı |
|---|---|---|---|---|
| K1 | Yüksek | **Ay içinde 5 saatte veri kesintisi var.** En belirgini 10 Ekim 10:00'dır: yalnızca 35 hücre ve 275 araç. 10 Ekim 09:00, 4 Ekim 23:00, 21 Ekim 18:00 ve 24 Ekim 16:00'da satır sayısı normal, araç sayısı ise normalin %30-45'i kadardır. | Saatlik trendi bozar. Yalnızca satır sayısına bakan kontrol 5 saatin 4'ünü kaçırır. | Satırlar silinmez, `is_partial_hour` ile işaretlenir ve trend hesaplarından çıkarılır. Tespit yöntemi [ETL dokümanındadır](etl-pipeline.md). |
| K2 | Yüksek | **Basit ve ağırlıklı ortalama belirgin ayrışıyor.** 18:00'de basit ortalama 52,0 km/sa, araç ağırlıklı ortalama 45,7 km/sa. | Basit ortalama yoğun saat tıkanıklığını olduğundan hafif gösterir. | Şehir geneli metrikleri `SUM(avg × araç) / SUM(araç)` ile hesaplanır. |
| K3 | Orta | **113.575 satırda (%6,42) 5'ten az araç var.** 32.198 satır (%1,82) tek araçlıdır. | Küçük örneklem hız değerlerini oynak yapar. | `is_low_sample` işareti eklenir. En yavaş bölge sıralamalarında alt sınır uygulanır. |
| K4 | Orta | **49 satırda ortalama hız 150 km/sa üzerinde.** Bu satırların tamamında araç sayısı 5'in altındadır. | Az sayıda satır olsa da en yüksek hız metriklerini bozar. | `is_speed_outlier` ile işaretlenir ve analizlerden çıkarılır. |
| K5 | Orta | **3.063 satırda (%0,17) maksimum hız 200 km/sa üzerinde.** En yüksek değer 250 km/sa'dir. | Maksimum hız tek bir hatalı GPS sinyalinden etkilenebilir. | Ortalama hız korunur. Maksimum hız dashboard'da ana metrik olarak kullanılmaz. |
| K6 | Düşük | **Beklenen hücre-saat kombinasyonlarının %96,77'si mevcut.** 1.828.752 olası kombinasyondan 59.109'u yok. 25 hücre, saatlerin %10'undan azında görülüyor. | Seyrek hücreler sıralamalarda yanıltıcı olabilir. | Eksik saatler doldurulmaz. Sıralamalar için asgari gözlem sayısı uygulanır. |
| K7 | Düşük | **Tek araçlı 12.357 satırda minimum ve maksimum hız farklı.** | Tek aracın birden fazla sinyal üretmesiyle açıklanabilir, tek başına hata sayılmaz. | Satırlar korunur, K3 kapsamında değerlendirilir. |
| K8 | Bilgi | **29 Ekim Cumhuriyet Bayramı salı gününe denk geliyor, 28 Ekim öğleden sonra yarım gün tatil.** | Hafta içi ortalamalarını aşağı veya yukarı çekebilir. | Takvim boyutuna `is_public_holiday` alanı eklenir. |

## Saatlik örüntü

Araç ağırlıklı ortalama hız, trafik verisinden beklenen günlük döngüyü gösterir:

| Saat | Satır | Araç | Basit ort. (km/sa) | Ağırlıklı ort. (km/sa) |
|---:|---:|---:|---:|---:|
| 03:00 | 70.277 | 2.031.919 | 61,0 | 70,2 |
| 08:00 | 74.544 | 11.126.093 | 55,2 | 49,5 |
| 13:00 | 74.708 | 10.617.943 | 54,5 | 52,9 |
| 18:00 | 74.551 | 11.382.179 | 52,0 | **45,7** |
| 22:00 | 73.951 | 6.474.820 | 57,4 | 61,2 |

Hafta içi ve hafta sonu farkı 08:00'de 14,6 km/sa, 18:00'de 8,0 km/sa'dir:

| Saat | Hafta içi (km/sa) | Hafta sonu (km/sa) |
|---:|---:|---:|
| 08:00 | 46,9 | 61,5 |
| 18:00 | 44,3 | 52,3 |

> Bu tablolar ilk kalite kontrolü içindir. K1 kesintisi ve K8 tatil etkisi henüz ayıklanmamıştır, kesin analizler Aşama 3 ve 4'te yapılacaktır.

## Doğrulama

Profil sonuçları, pandas kullanmayan ayrı bir tarama ile karşılaştırıldı. Satır sayısı (1.769.643), tekil anahtar sayısı (1.769.643), geohash sayısı (2.458) ve dosya özeti eşleşti. Her satırda 8 alan bulundu.

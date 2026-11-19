# Dashboard

Next.js ve TypeScript ile geliştirilen arayüz, ASP.NET Core API'den gelen trafik analizlerini dört ekranda sunar.

```bash
cd frontend
```

```bash
npm ci
```

```bash
npm run dev
```

Uygulama `http://localhost:3000` adresinde açılır. API'nin `http://127.0.0.1:5088` adresinde çalışıyor olması gerekir. Farklı bir adres için `API_BASE_URL` ortam değişkeni kullanılır. Tüm sistemi tek komutla başlatmak için kök dizindeki README'ye bakın.

## Ekranlar

| Yol | Ekran | İçerik |
|---|---|---|
| `/` | Genel bakış | Seçilen dönemin göstergeleri ve bir önceki yılın aynı tarihleriyle farkı, saatlik hız, hız bantları, günlük trend, gün ve saat ısı haritası |
| `/analiz` | Analiz raporu | Tüm ayları kapsayan 12 bölümlük uzun rapor |
| `/harita` | Tıkanıklık haritası | Gerçek harita altlığı üzerinde hücre bazında tıkanıklık, akşam hızı ve araç yoğunluğu; 2B/3B görünüm, hızlı git düğmeleri, seçili hücrenin saatlik profili, en yavaş 15 hücre |
| `/veri-hatti` | Veri hattı | Yüklenen aylar, aylık veri kapsamı, kalite işaretleri, yükleme geçmişi |

### Analiz raporu bölümleri

| No | Bölüm | Grafik |
|---:|---|---|
| 1 | Dönemin özeti | Yıllık göstergeler ve otomatik bulgular |
| 2 | Aylar boyunca hız | Gece, gün geneli, sabah ve akşam zirvesi çizgileri |
| 3 | Yıllık karşılaştırma | Aynı ayın iki yılı ve aylık fark çubukları |
| 4 | Tıkanıklık ve yoğun saatler | Aylık tıkanıklık endeksi ve iş günü başına yoğun saat |
| 5 | Ay ve saate göre hız | Ay x saat ısı haritası |
| 6 | Haftanın günleri | Gün x saat ısı haritası |
| 7 | Takvim | Her günün akşam hızını gösteren takvim, en yavaş ve en hızlı 10 gün |
| 8 | Okul, tatil ve Ramazan | Dönemlere göre saatlik hız ve hacim |
| 9 | Bayramlar ve resmî tatiller | Tatil günlerinin olağan günlere göre farkı |
| 10 | Öngörülebilirlik | Saatlik günlük hızın 10-90 ve 25-75 yüzdelik bantları |
| 11 | Hangi bölgeler yavaşladı? | Son 12 ay ile önceki 12 ayın hücre bazında değişim haritası |
| 12 | Veri kapsamı ve yöntem | Aylık kapsama ve analiz kuralları |

Rapordaki bulgu kutuları sabit metin değildir. [`src/lib/insights.ts`](../frontend/src/lib/insights.ts) içindeki saf fonksiyonlar en yavaş ayı, yıllık farkı, Ramazan'daki zirve kaymasını ve benzeri sonuçları veriden hesaplar. Yeni bir ay yüklendiğinde metin de güncellenir. Bu fonksiyonlar Vitest ile test edilir.

## Mimari kararlar

| Karar | Gerekçe |
|---|---|
| Veriyi sunucu bileşenleri çeker | API adresi tarayıcıya açılmaz, CORS gerekmez |
| Filtreler URL'de tutulur | Bir görünüm bağlantı olarak paylaşılabilir ve geri tuşu çalışır |
| URL değerleri sunucuda doğrulanır | Geçersiz tarih API'ye ulaşmaz, aralık yüklü veriye ve en fazla 366 güne sınırlanır |
| Varsayılan dönem son yüklenen aydır | Her açılışta en güncel tablo görünür, uzun dönemler analiz raporundadır |
| Grafikler SVG ile yazıldı | Harici grafik kütüphanesi gerekmez, istemci paketi küçük kalır |
| Harita MapLibre GL ile çizilir | Açık kaynaklı, API anahtarı istemeyen OpenFreeMap vektör karoları kullanılır. Kütüphane yalnızca harita açıldığında yüklenir |
| Altlık erişilemezse hücreler yine çizilir | Karo servisi yanıt vermezse harita düz bir zemine geçer ve bunu lejantta belirtir |
| Renk sınıfları sunucuda hesaplanır | Haritaya her ölçü için yalnızca seviye ve ipucu metni gider, aynı bileşen iki farklı haritayı çizer. Renkler grafiklerle aynı tema değişkenlerinden okunur, koyu temada altlık da koyulaşır |
| 3B yükseklik yakınlaştıkça kısalır | Şehir ölçeğinde fark belirgin olur, sokak ölçeğinde sütunlar yolu kapatmaz |

## Veri gösterimi kuralları

| Bulgu | Arayüzdeki karşılığı |
|---|---|
| Veri kesintileri trendi bozuyor | Kesintili saatler hesaba katılmaz, ısı haritalarında gri görünür |
| Basit ortalama yoğun saatleri hızlı gösteriyor | Ana metrik araç ağırlıklı ortalamadır |
| Her saatte veri gönderen hücre sayısı değişiyor | Hacim, toplam araç yerine hücre ve saat başına ortalama araçla karşılaştırılır |
| Mevsim etkisi yıllık farkı gizleyebilir | Yıllık karşılaştırma aynı ayın iki yılı arasında yapılır |
| Bölgesel değişim hücre karışımından etkilenebilir | Her hücre kendi geçmişiyle kıyaslanır |
| Takvim renkleri tek bir aya göre ayarlanırsa yanıltır | Takvim renk sınıfları tüm iş günlerinin dağılımından hesaplanır |

## Erişilebilirlik

- Grafiklerin tamamı tablo görünümüyle de okunabilir.
- Çizgi ve bant grafikleri klavyedeki sol ve sağ ok tuşlarıyla gezilebilir.
- Önceki yıla göre değişim, renge ek olarak ok yönü ve "iyileşme" veya "kötüleşme" kelimesiyle gösterilir.
- Harita klavyeyle kaydırılıp yakınlaştırılabilir. En yavaş 15 hücre tablodan seçilebilir, seçilen hücreye harita kendisi gider. Diğer hücreleri seçmek için fare veya dokunma gerekir.
- Açık ve koyu tema, işletim sistemi tercihini izler.
- Çizgi grafiklerin ilk dört rengi, komşu seriler için renk körlüğü kontrolünden geçmiş paletten alınır.

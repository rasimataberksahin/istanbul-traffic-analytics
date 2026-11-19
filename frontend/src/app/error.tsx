"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="empty" role="alert">
      <h2>Veriler yüklenemedi</h2>
      <p>Analiz servisine şu anda ulaşılamıyor. API&apos;nin çalıştığını kontrol edip yeniden deneyin.</p>
      <button className="button" type="button" onClick={reset}>
        Yeniden dene
      </button>
    </section>
  );
}

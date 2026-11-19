"use client";

import { useI18n } from "@/lib/i18n/client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <section className="empty" role="alert">
      <h2>{t("Veriler yüklenemedi", "The data could not be loaded")}</h2>
      <p>
        {t(
          "Analiz servisine şu anda ulaşılamıyor. API'nin çalıştığını kontrol edip yeniden deneyin.",
          "The analytics service cannot be reached right now. Check that the API is running and try again.",
        )}
      </p>
      <button className="button" type="button" onClick={reset}>
        {t("Yeniden dene", "Try again")}
      </button>
    </section>
  );
}

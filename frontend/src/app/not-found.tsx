import Link from "next/link";
import { translator } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = translator(await getLocale());
  return (
    <section className="empty">
      <h2>{t("Sayfa bulunamadı", "Page not found")}</h2>
      <p>{t("Aradığınız sayfa taşınmış veya hiç var olmamış olabilir.", "The page may have moved or never existed.")}</p>
      <Link className="button" href="/">
        {t("Genel bakışa dön", "Back to the overview")}
      </Link>
    </section>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <section className="empty">
      <h2>Sayfa bulunamadı</h2>
      <p>Aradığınız sayfa taşınmış veya hiç var olmamış olabilir.</p>
      <Link className="button" href="/">
        Genel bakışa dön
      </Link>
    </section>
  );
}

/** Shown at once while a page's data loads, in the shape of the page that is coming. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="skeleton-page">
      <span className="visually-hidden">Yükleniyor / Loading</span>
      <div className="skeleton skeleton-eyebrow" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
      <div className="skeleton skeleton-filters" />
      <div className="skeleton-stats">
        {[0, 1, 2, 3].map((index) => (
          <div className="skeleton skeleton-stat" key={index} />
        ))}
      </div>
      <div className="skeleton-grid">
        <div className="skeleton skeleton-card wide" />
        <div className="skeleton skeleton-card" />
      </div>
    </div>
  );
}

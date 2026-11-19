import Link from "next/link";
import type { ReactNode } from "react";

export interface StatDelta {
  text: string;
  /** Direction of the number. The arrow follows it. */
  direction: "up" | "down" | "flat";
  /** Whether the change is good news. A word is added, so meaning never depends on color alone. */
  tone: "better" | "worse" | "neutral";
}

const TONE_WORDS = { better: "iyileşme", worse: "kötüleşme", neutral: "" } as const;
const ARROWS = { up: "▲", down: "▼", flat: "●" } as const;

/** Builds a delta for a change whose good direction is known. */
export function makeDelta(change: number, text: string, higherIsBetter: boolean | null, epsilon = 0.05): StatDelta {
  const direction = Math.abs(change) < epsilon ? "flat" : change > 0 ? "up" : "down";
  const tone =
    direction === "flat" || higherIsBetter === null ? "neutral" : (direction === "up") === higherIsBetter ? "better" : "worse";
  return { text, direction, tone };
}

export function StatTile({ label, value, note, delta }: { label: string; value: string; note?: string; delta?: StatDelta }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note ? <div className="stat-note">{note}</div> : null}
      {delta ? (
        <div className="stat-delta" data-tone={delta.tone}>
          <span aria-hidden="true" className="delta-mark">
            {ARROWS[delta.direction]}
          </span>
          <span>{delta.text}</span>
          {delta.tone !== "neutral" ? <span className="delta-word">{TONE_WORDS[delta.tone]}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  className?: string;
  table?: ReactNode;
  children: ReactNode;
}

/** A titled chart with an optional table view of the same values. */
export function ChartCard({ title, subtitle, className = "", table, children }: ChartCardProps) {
  return (
    <section className={`card ${className}`}>
      <h2>{title}</h2>
      {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
      <div className="card-body">{children}</div>
      {table ? (
        <details className="table-toggle">
          <summary>Tabloyu göster</summary>
          {table}
        </details>
      ) : null}
    </section>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row[0] ?? rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={columns[cellIndex]}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HorizontalBars({ items }: { items: { label: string; value: number; display: string }[] }) {
  const maximum = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="bars">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <span className="bar-label">{item.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ display: "block", width: `${(item.value / maximum) * 100}%` }} />
          </span>
          <span className="bar-value">{item.display}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, message, resetHref }: { title: string; message: string; resetHref?: string }) {
  return (
    <section className="empty">
      <h2>{title}</h2>
      <p>{message}</p>
      {resetHref ? (
        <Link className="button" href={resetHref}>
          Filtreleri sıfırla
        </Link>
      ) : null}
    </section>
  );
}

interface ReportSectionProps {
  id: string;
  number: number;
  title: string;
  lead: string;
  children: ReactNode;
}

/** A numbered chapter of the long analysis report. */
export function ReportSection({ id, number, title, lead, children }: ReportSectionProps) {
  return (
    <section aria-labelledby={`${id}-baslik`} className="report-section" id={id}>
      <header className="report-section-header">
        <span className="report-number">{String(number).padStart(2, "0")}</span>
        <div>
          <h2 id={`${id}-baslik`}>{title}</h2>
          <p>{lead}</p>
        </div>
      </header>
      <div className="report-section-body">{children}</div>
    </section>
  );
}

/** A finding derived from the data shown next to it. */
export function Finding({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="finding">
      <div className="finding-label">Bulgu</div>
      <p className="finding-title">{title}</p>
      <div className="finding-text">{children}</div>
    </aside>
  );
}

export interface DivergingItem {
  label: string;
  value: number;
  display: string;
  note?: string;
}

/** Horizontal bars around zero. Positive values grow to the right in the first series color. */
export function DivergingBars({
  items,
  positiveLabel,
  negativeLabel,
}: {
  items: DivergingItem[];
  positiveLabel: string;
  negativeLabel: string;
}) {
  const maximum = Math.max(...items.map((item) => Math.abs(item.value)), 1);

  return (
    <div>
      <div className="diverging-axis" aria-hidden="true">
        <span>{negativeLabel}</span>
        <span>{positiveLabel}</span>
      </div>
      <div className="bars">
        {items.map((item) => {
          const share = (Math.abs(item.value) / maximum) * 50;
          return (
            <div className="bar-row diverging-row" key={item.label}>
              <span className="bar-label">
                {item.label}
                {item.note ? <span className="bar-note">{item.note}</span> : null}
              </span>
              <span className="diverging-track">
                <span
                  className="diverging-fill"
                  data-sign={item.value < 0 ? "negative" : "positive"}
                  style={item.value < 0 ? { right: "50%", width: `${share}%` } : { left: "50%", width: `${share}%` }}
                />
              </span>
              <span className="bar-value">{item.display}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Small vertical bars with a label under each bar, for monthly values. */
export function ColumnBars({
  items,
  formatValue,
}: {
  items: { key: string; label: string; value: number | null; highlight?: boolean; title: string }[];
  formatValue: (value: number) => string;
}) {
  const values = items.map((item) => item.value).filter((value): value is number => value !== null);
  const maximum = Math.max(...values, 0.0001);

  return (
    <div className="columns" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        <div className="column" key={item.key} title={item.title}>
          <span className="column-value">{item.value === null ? "-" : formatValue(item.value)}</span>
          <span className="column-track">
            <span
              className="column-fill"
              data-highlight={item.highlight ? "true" : undefined}
              style={{ height: `${item.value === null ? 0 : (item.value / maximum) * 100}%` }}
            />
          </span>
          <span className="column-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

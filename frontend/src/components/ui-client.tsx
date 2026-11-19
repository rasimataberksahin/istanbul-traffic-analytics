"use client";

import { Info, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { StatDelta } from "@/components/ui";

const ARROWS = { up: "▲", down: "▼", flat: "●" } as const;

/** A small "i" button that opens a short explanation of the card it sits on. */
export function InfoTip({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="info" ref={root}>
      <button
        aria-controls={id}
        aria-expanded={open}
        aria-label={t(`Açıklama: ${title}`, `About: ${title}`)}
        className="info-button"
        onClick={() => setOpen((value) => !value)}
        ref={button}
        type="button"
      >
        <Info aria-hidden="true" size={15} weight={open ? "fill" : "bold"} />
      </button>
      {open ? (
        <div aria-label={title} className="info-popover" id={id} role="dialog">
          <div className="info-popover-head">
            <strong>{title}</strong>
            <button aria-label={t("Kapat", "Close")} className="info-close" onClick={() => setOpen(false)} type="button">
              <X aria-hidden="true" size={13} weight="bold" />
            </button>
          </div>
          <div className="info-popover-body">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  note?: string;
  delta?: StatDelta;
  /** A small trend graphic shown beside the value. */
  chart?: ReactNode;
  /** What the number means, shown behind the "i" button. */
  info?: ReactNode;
}

export function StatTile({ label, value, note, delta, chart, info }: StatTileProps) {
  const { t } = useI18n();
  const toneWords = { better: t("iyileşme", "better"), worse: t("kötüleşme", "worse"), neutral: "" };
  return (
    <div className={info ? "stat has-info" : "stat"}>
      <div className="stat-label">{label}</div>
      {info ? <InfoTip title={label}>{info}</InfoTip> : null}
      <div className="stat-main">
        <div className="stat-value">{value}</div>
        {chart ? <div className="stat-chart">{chart}</div> : null}
      </div>
      {note ? <div className="stat-note">{note}</div> : null}
      {delta ? (
        <div className="stat-delta" data-tone={delta.tone}>
          <span aria-hidden="true" className="delta-mark">
            {ARROWS[delta.direction]}
          </span>
          <span>{delta.text}</span>
          {delta.tone !== "neutral" ? <span className="delta-word">{toneWords[delta.tone]}</span> : null}
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
  /** How to read the card, shown behind the "i" button. */
  info?: ReactNode;
  children: ReactNode;
}

/** A titled chart with an optional table view of the same values. */
export function ChartCard({ title, subtitle, className = "", table, info, children }: ChartCardProps) {
  const { t } = useI18n();
  return (
    <section className={`card ${info ? "has-info " : ""}${className}`}>
      <h2>{title}</h2>
      {info ? <InfoTip title={title}>{info}</InfoTip> : null}
      {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
      <div className="card-body">{children}</div>
      {table ? (
        <details className="table-toggle">
          <summary>{t("Tabloyu göster", "Show table")}</summary>
          {table}
        </details>
      ) : null}
    </section>
  );
}

export function EmptyState({ title, message, resetHref }: { title: string; message: string; resetHref?: string }) {
  const { t } = useI18n();
  return (
    <section className="empty">
      <h2>{title}</h2>
      <p>{message}</p>
      {resetHref ? (
        <Link className="button" href={resetHref}>
          {t("Filtreleri sıfırla", "Reset filters")}
        </Link>
      ) : null}
    </section>
  );
}

/** A finding derived from the data shown next to it. */
export function Finding({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <aside className="finding">
      <div className="finding-label">{t("Bulgu", "Finding")}</div>
      <p className="finding-title">{title}</p>
      <div className="finding-text">{children}</div>
    </aside>
  );
}

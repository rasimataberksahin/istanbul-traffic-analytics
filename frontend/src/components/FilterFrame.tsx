"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import {
  DAY_TYPE_OPTIONS,
  lastMonthsStart,
  MAX_RANGE_DAYS,
  monthEnd,
  monthStart,
  rangeDays,
  toSearchParams,
  type DashboardFilter,
  type DateRange,
} from "@/lib/filters";
import { formatMonth } from "@/lib/format";
import type { DayType } from "@/lib/types";

interface FilterFrameProps {
  filter: DashboardFilter;
  range: DateRange;
  months: string[];
  showDayType?: boolean;
  children: ReactNode;
}

const PRESET_MONTHS = [
  { label: "Son ay", months: 1 },
  { label: "Son 3 ay", months: 3 },
  { label: "Son 12 ay", months: 12 },
];

/** One filter row that scopes everything below it and keeps the old view visible while loading. */
export function FilterFrame({ filter, range, months, showDayType = true, children }: FilterFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectedMonth =
    filter.from === monthStart(filter.from) &&
    (filter.to === monthEnd(filter.from) || (filter.to === range.lastDate && monthStart(filter.to) === filter.from))
      ? filter.from.slice(0, 7)
      : "";

  function apply(next: DashboardFilter) {
    const query = toSearchParams(next, range, { cell: currentParams.get("cell") });
    const suffix = query.size > 0 ? `?${query}` : "";
    startTransition(() => router.replace(`${pathname}${suffix}`, { scroll: false }));
  }

  function changeDate(field: "from" | "to", value: string) {
    if (!value) {
      return;
    }
    const next = { ...filter, [field]: value };
    if (next.from <= next.to && rangeDays(next.from, next.to) <= MAX_RANGE_DAYS) {
      apply(next);
    }
  }

  function chooseMonth(value: string) {
    if (!value) {
      return;
    }
    const from = `${value}-01`;
    const end = monthEnd(from);
    apply({ ...filter, from, to: end > range.lastDate ? range.lastDate : end });
  }

  return (
    <>
      <form className="filters" aria-label="Filtreler" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <span className="field-label" id="donem-etiketi">Dönem</span>
          <div className="presets" role="group" aria-labelledby="donem-etiketi">
            {PRESET_MONTHS.map((preset) => {
              const from = lastMonthsStart(preset.months, range);
              return (
                <button
                  key={preset.label}
                  aria-pressed={filter.from === from && filter.to === range.lastDate}
                  type="button"
                  onClick={() => apply({ ...filter, from, to: range.lastDate })}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="field">
          Ay
          <select name="month" value={selectedMonth} onChange={(event) => chooseMonth(event.target.value)}>
            <option value="">Özel aralık</option>
            {[...months].reverse().map((month) => (
              <option key={month} value={month.slice(0, 7)}>
                {formatMonth(month)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Başlangıç
          <input
            max={filter.to}
            min={range.firstDate}
            name="from"
            type="date"
            value={filter.from}
            onChange={(event) => changeDate("from", event.target.value)}
          />
        </label>

        <label className="field">
          Bitiş
          <input
            max={range.lastDate}
            min={filter.from}
            name="to"
            type="date"
            value={filter.to}
            onChange={(event) => changeDate("to", event.target.value)}
          />
        </label>

        {showDayType ? (
          <label className="field">
            Gün tipi
            <select
              name="dayType"
              value={filter.dayType}
              onChange={(event) => apply({ ...filter, dayType: event.target.value as DayType })}
            >
              {DAY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <span className="filter-status" role="status">
          {isPending ? "Güncelleniyor..." : `En fazla ${MAX_RANGE_DAYS} gün seçilebilir`}
        </span>
      </form>

      <div className="frame" aria-busy={isPending}>
        {children}
      </div>
    </>
  );
}

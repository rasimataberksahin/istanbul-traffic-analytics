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
import { useI18n } from "@/lib/i18n/client";
import type { DayType } from "@/lib/types";

interface FilterFrameProps {
  filter: DashboardFilter;
  range: DateRange;
  months: string[];
  showDayType?: boolean;
  children: ReactNode;
}

const PRESET_MONTHS = [
  { label: "Son ay", labelEn: "1 month", months: 1 },
  { label: "Son 3 ay", labelEn: "3 months", months: 3 },
  { label: "Son 12 ay", labelEn: "12 months", months: 12 },
];

/** One filter row that scopes everything below it and keeps the old view visible while loading. */
export function FilterFrame({ filter, range, months, showDayType = true, children }: FilterFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { locale, t, f } = useI18n();

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
      <form className="filters" aria-label={t("Filtreler", "Filters")} onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <span className="field-label" id="donem-etiketi">{t("Dönem", "Period")}</span>
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
                  {t(preset.label, preset.labelEn)}
                </button>
              );
            })}
          </div>
        </div>

        <label className="field">
          {t("Ay", "Month")}
          <select name="month" value={selectedMonth} onChange={(event) => chooseMonth(event.target.value)}>
            <option value="">{t("Özel aralık", "Custom range")}</option>
            {[...months].reverse().map((month) => (
              <option key={month} value={month.slice(0, 7)}>
                {f.formatMonth(month)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          {t("Başlangıç", "From")}
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
          {t("Bitiş", "To")}
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
            {t("Gün tipi", "Day type")}
            <select
              name="dayType"
              value={filter.dayType}
              onChange={(event) => apply({ ...filter, dayType: event.target.value as DayType })}
            >
              {DAY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {locale === "en" ? option.labelEn : option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <span className="filter-status" role="status">
          {isPending
            ? t("Güncelleniyor...", "Updating...")
            : t(`En fazla ${MAX_RANGE_DAYS} gün seçilebilir`, `Up to ${MAX_RANGE_DAYS} days`)}
        </span>
      </form>

      <div className="frame" aria-busy={isPending}>
        {children}
      </div>
    </>
  );
}

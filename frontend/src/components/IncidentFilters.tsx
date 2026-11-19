"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { categoryLabel, FILTER_CATEGORIES, type PeriodOption } from "@/lib/incidents";
import type { IncidentCategory } from "@/lib/types";

interface IncidentFiltersProps {
  options: PeriodOption[];
  activeKey: string | null;
  category: IncidentCategory | null;
  /** Shown at the end of the bar, such as the period the page covers. */
  status: string;
  children: ReactNode;
}

const QUICK = new Set(["30d", "12m", "all"]);

/** Period and category for the incidents page. Choices live in the URL so a view can be shared. */
export function IncidentFilters({ options, activeKey, category, status, children }: IncidentFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { locale, t } = useI18n();

  function apply(changes: Record<string, string | null>) {
    const query = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
    const suffix = query.size > 0 ? `?${query}` : "";
    startTransition(() => router.replace(`${pathname}${suffix}`, { scroll: false }));
  }

  function choosePeriod(option: PeriodOption | undefined) {
    if (option) {
      apply({ from: option.from ?? null, to: option.to ?? null });
    }
  }

  const years = options.filter((option) => !QUICK.has(option.key));
  const label = (option: PeriodOption) => t(option.labelTr, option.labelEn);

  return (
    <>
      <form aria-label={t("Filtreler", "Filters")} className="filters incident-filters" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <span className="field-label" id="olay-donem">
            {t("Dönem", "Period")}
          </span>
          <div aria-labelledby="olay-donem" className="presets" role="group">
            {options
              .filter((option) => QUICK.has(option.key))
              .map((option) => (
                <button aria-pressed={activeKey === option.key} key={option.key} onClick={() => choosePeriod(option)} type="button">
                  {label(option)}
                </button>
              ))}
          </div>
        </div>

        <label className="field">
          {t("Yıl", "Year")}
          <select
            onChange={(event) => choosePeriod(years.find((option) => option.key === event.target.value))}
            value={years.some((option) => option.key === activeKey) ? (activeKey ?? "") : ""}
          >
            <option value="">{t("Seçin", "Choose")}</option>
            {years.map((option) => (
              <option key={option.key} value={option.key}>
                {label(option)}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="field-label" id="olay-tur">
            {t("Olay türü", "Incident type")}
          </span>
          <div aria-labelledby="olay-tur" className="presets wrap" role="group">
            <button aria-pressed={category === null} onClick={() => apply({ category: null })} type="button">
              {t("Tümü", "All")}
            </button>
            {FILTER_CATEGORIES.map((item) => (
              <button aria-pressed={category === item} key={item} onClick={() => apply({ category: item })} type="button">
                {categoryLabel(item, locale)}
              </button>
            ))}
          </div>
        </div>

        <span className="filter-status" role="status">
          {isPending ? t("Güncelleniyor...", "Updating...") : status}
        </span>
      </form>

      <div aria-busy={isPending} className="frame">
        {children}
      </div>
    </>
  );
}

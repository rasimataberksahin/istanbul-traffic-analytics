"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeFormat } from "@/lib/format";
import { DEFAULT_LOCALE, translator, type Locale } from "@/lib/i18n/locale";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Active language with its translator and formatters, for client components. */
export function useI18n() {
  const locale = useContext(LocaleContext);
  return useMemo(() => ({ locale, t: translator(locale), f: makeFormat(locale) }), [locale]);
}

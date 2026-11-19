export type Locale = "tr" | "en";
export type Theme = "light" | "dark" | "system";

export const LOCALES: Locale[] = ["tr", "en"];
export const DEFAULT_LOCALE: Locale = "tr";
export const LOCALE_COOKIE = "lang";
export const THEME_COOKIE = "theme";
/** One year: the choice should survive normal use. */
export const PREFERENCE_MAX_AGE = 60 * 60 * 24 * 365;

export const isLocale = (value: unknown): value is Locale => value === "tr" || value === "en";
export const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark" || value === "system";

/** The text for the active language. Both languages sit side by side where they are used. */
export function pick<T>(locale: Locale, tr: T, en: T): T {
  return locale === "en" ? en : tr;
}

/** A translator bound to one language, used as `t("Türkçe", "English")`. */
export function translator(locale: Locale) {
  return <T,>(tr: T, en: T): T => pick(locale, tr, en);
}

export type Translate = ReturnType<typeof translator>;

/** BCP 47 tag for Intl formatters. */
export const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "tr-TR");

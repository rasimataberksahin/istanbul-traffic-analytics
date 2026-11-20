import { LOCALE_COOKIE, PREFERENCE_MAX_AGE, THEME_COOKIE, type Locale, type Theme } from "@/lib/i18n/locale";

/** Fired on window when a theme is chosen outside the header, so its switch can follow. */
export const THEME_EVENT = "itr:theme";
/** Fired on window to ask the header to change the language (it owns the refresh). */
export const LOCALE_EVENT = "itr:locale";

export function remember(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${PREFERENCE_MAX_AGE}; samesite=lax`;
}

/** An explicit theme goes on <html data-theme>; "system" removes it so the media query decides. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function saveTheme(theme: Theme) {
  remember(THEME_COOKIE, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
}

export function requestLocale(locale: Locale) {
  window.dispatchEvent(new CustomEvent<Locale>(LOCALE_EVENT, { detail: locale }));
}

export function saveLocale(locale: Locale) {
  remember(LOCALE_COOKIE, locale);
  document.documentElement.setAttribute("lang", locale);
}

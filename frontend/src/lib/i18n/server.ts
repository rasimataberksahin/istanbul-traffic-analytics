import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, isTheme, LOCALE_COOKIE, THEME_COOKIE, type Locale, type Theme } from "@/lib/i18n/locale";

/** Language chosen in the header, from its cookie. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Light, dark or follow the system, from its cookie. */
export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : "system";
}

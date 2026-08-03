import { en } from "./locales/en";
import { ur } from "./locales/ur";
import { ne } from "./locales/ne";
import type { Locale, Translations } from "./types";

export type { Locale, Translations, TranslationKeys } from "./types";

const locales: Record<Locale, Translations> = {
  en,
  ur,
  ne,
};

export function getTranslations(locale: Locale): Translations {
  return locales[locale] ?? en;
}

export function getDirection(locale: Locale): "ltr" | "rtl" {
  return locale === "ur" ? "rtl" : "ltr";
}

export { en, ur, ne };
import english from './locales/en.json';
import translated from './locales/translations.json';

export type EnchanterCopy = typeof english.controls;
export type EnchanterInformationCopy = typeof english.information;
type Translation = { controls: EnchanterCopy; information: EnchanterInformationCopy };
const translations: Readonly<Record<string, Translation>> = translated;
// Regional tags reuse the corresponding authored language.
const regionalSources: Readonly<Record<string, string>> = {
  'en-GB': 'en', 'de-CH': 'de', 'pt-BR': 'pt', 'es-419': 'es'
};
export const enchanterSupportedLanguages = ['en', ...Object.keys(translations), ...Object.keys(regionalSources)];

export function enchanterLanguage(language: string): string {
  if (language === 'en' || translations[language] || regionalSources[language]) return language;
  const base = language.split('-')[0]!;
  return translations[base] ? base : 'en';
}
export function enchanterDirection(language: string): 'ltr' | 'rtl' {
  return /^(ar|fa|ur|ps)(?:-|$)/u.test(language) ? 'rtl' : 'ltr';
}
function translation(language: string): Translation {
  const normalized = enchanterLanguage(language);
  const source = regionalSources[normalized] ?? normalized;
  return source === 'en' ? english : translations[source] ?? english;
}
/** Product-name meaning: an agent that enchants. Use an agent noun or explicit
 * "one who enchants" noun phrase, never a quality, action, or generic wizard. */
export function enchanterCopy(language: string): EnchanterCopy {
  return translation(language).controls;
}
export function enchanterInformationCopy(language: string): EnchanterInformationCopy {
  return translation(language).information;
}

/** Canonical English legal description; the license terms remain in English. */
export const enchanterLicense = english.legal;

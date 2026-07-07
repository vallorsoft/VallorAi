'use client'

import { useLocaleStore } from '@/store/locale.store'
import { dictionaries } from '@/locales'

// All user-facing strings go through this hook instead of being hardcoded
// in components. See CLAUDE.md's i18n rule before adding new UI text.
export function useTranslation() {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  return { t: dictionaries[locale], locale, setLocale }
}

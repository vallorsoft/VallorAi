'use client'

import { LOCALES, type Locale } from '@/locales'
import { useTranslation } from '@/lib/useTranslation'
import { useAuthStore } from '@/store/auth.store'
import { api } from '@/lib/api'

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation()
  const accessToken = useAuthStore((s) => s.accessToken)

  const handleChange = (next: Locale) => {
    setLocale(next)

    // Best-effort sync so server-rendered content (e.g. the AI assistant's
    // system prompt, which reads User.language) follows the same language.
    // Not awaited/blocking — a failed sync just means the preference stays
    // client-only until the next successful save.
    if (accessToken) {
      api.patch('/users/me', { language: next }).catch(() => {})
    }
  }

  return (
    <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50" role="group" aria-label="Language">
      {LOCALES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => handleChange(code)}
          aria-pressed={locale === code}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            locale === code
              ? 'bg-white text-brand-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

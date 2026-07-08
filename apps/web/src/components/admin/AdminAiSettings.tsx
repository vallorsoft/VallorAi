'use client'

import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAiSettings, useUpdateAiSettings } from '@/hooks/useAiSettings'
import { useTranslation } from '@/lib/useTranslation'

export function AdminAiSettings() {
  const { t } = useTranslation()
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const { data: settings, isLoading: settingsLoading } = useAiSettings()
  const updateSettings = useUpdateAiSettings()

  if (userLoading) return null

  if (currentUser?.role !== 'SUPERADMIN') {
    return <div className="p-6 text-gray-500 text-sm">{t.adminAiSettings.accessDenied}</div>
  }

  const allowPaidAiProviders = settings?.allowPaidAiProviders ?? false

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">{t.adminAiSettings.title}</h1>
      <p className="text-gray-500 text-sm mb-6">{t.adminAiSettings.description}</p>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-gray-900">{t.adminAiSettings.toggleLabel}</span>
          <button
            role="switch"
            aria-checked={allowPaidAiProviders}
            disabled={settingsLoading || updateSettings.isPending}
            onClick={() => updateSettings.mutate(!allowPaidAiProviders)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              allowPaidAiProviders ? 'bg-brand-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                allowPaidAiProviders ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          {allowPaidAiProviders ? t.adminAiSettings.toggleHintOn : t.adminAiSettings.toggleHintOff}
        </p>
        {updateSettings.isPending && (
          <p className="text-xs text-gray-400 mt-2">{t.adminAiSettings.saving}</p>
        )}
      </div>
    </div>
  )
}

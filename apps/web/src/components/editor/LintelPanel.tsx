'use client'

import { useProjectStore } from '@/store/project.store'
import { useLintel } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

/**
 * Opening-scoped lintel (buiandrug) inspector — shown when an opening is
 * selected. The API auto-provisions a prefabricated default on first read
 * (HousesService.getLintel). Read-only.
 */
export function LintelPanel() {
  const { t } = useTranslation()
  const { selectedOpeningId } = useProjectStore()
  const { data: lintel, isLoading } = useLintel(selectedOpeningId)

  if (!selectedOpeningId) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.structuralInspector.lintel.selectOpeningHint}
      </div>
    )
  }

  if (isLoading || !lintel) {
    return <div className="p-4 text-sm text-gray-400 text-center py-8">{t.editor.structuralInspector.loading}</div>
  }

  const priceUnverified = lintel.material?.specSheet.priceVerified === false

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {t.editor.structuralInspector.lintel.title}
      </p>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-500">{t.editor.structuralInspector.lintel.material}</dt>
          <dd className="font-medium text-gray-900 text-right">{lintel.material?.name ?? '—'}</dd>
        </div>
        {lintel.material?.standardRef && (
          <div className="flex justify-between">
            <dt className="text-gray-500">{t.editor.layerPanel.standardColumn}</dt>
            <dd className="text-gray-900 text-right">{lintel.material.standardRef}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-gray-500">{t.editor.structuralInspector.lintel.length}</dt>
          <dd className="font-medium text-gray-900">{lintel.lengthMm} mm</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">{t.editor.structuralInspector.lintel.width}</dt>
          <dd className="font-medium text-gray-900">{lintel.widthMm} mm</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">{t.editor.structuralInspector.lintel.bearingLength}</dt>
          <dd className="font-medium text-gray-900">{lintel.bearingLengthMm} mm</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">{t.editor.structuralInspector.lintel.prefabricated}</dt>
          <dd className="font-medium text-gray-900">
            {lintel.prefabricated
              ? t.editor.structuralInspector.lintel.yes
              : t.editor.structuralInspector.lintel.no}
          </dd>
        </div>
      </dl>

      {priceUnverified && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {t.editor.layerPanel.priceUnverifiedNotice}
        </p>
      )}
    </div>
  )
}

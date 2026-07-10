'use client'

import { useProjectStore } from '@/store/project.store'
import { useTieColumns } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

/**
 * House-level tie-column (stâlpișor) inspector — one row per TieColumn,
 * grouped by floor for readability. Read-only in this pass; the API
 * auto-provisions S1/S2/S3 placements on first read
 * (HousesService.getTieColumns).
 */
export function TieColumnsPanel() {
  const { t } = useTranslation()
  const { house } = useProjectStore()
  const { data: tieColumns, isLoading } = useTieColumns(house?.id)

  if (!house) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.emptyCanvasHint}
      </div>
    )
  }

  if (isLoading || !tieColumns) {
    return <div className="p-4 text-sm text-gray-400 text-center py-8">{t.editor.structuralInspector.loading}</div>
  }

  if (tieColumns.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {t.editor.structuralInspector.tieColumns.title}
        </p>
        <p className="text-sm text-gray-500">{t.editor.structuralInspector.tieColumns.empty}</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {t.editor.structuralInspector.tieColumns.title}
      </p>

      <div className="space-y-2">
        {tieColumns.map((tc) => (
          <div key={tc.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-100">
                {tc.category}
              </span>
              <span className="text-xs text-gray-400">
                {t.editor.structuralInspector.tieColumns.floor} {tc.floor}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
              <dt>{t.editor.structuralInspector.tieColumns.crossSection}</dt>
              <dd className="text-right text-gray-900">{tc.crossSectionMm}×{tc.crossSectionMm} mm</dd>
              <dt>{t.editor.structuralInspector.concreteClass}</dt>
              <dd className="text-right text-gray-900">{tc.concreteClass}</dd>
            </dl>
            {tc.reinforcementSpecs.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                {tc.reinforcementSpecs.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{t.editor.structuralInspector.role[r.role]}</span>
                    <span className="text-gray-900">
                      {r.barCount != null ? `${r.barCount} × ` : ''}Ø{r.barDiameterMm} mm
                      {r.barCount == null ? ` @ ${r.spacingMm} mm` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

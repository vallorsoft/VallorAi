'use client'

import { useProjectStore } from '@/store/project.store'
import { useCenturi } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

/**
 * House-level ring-beam (centură) inspector — one row per Centura, showing
 * the wall it follows, its level, cross-section and reinforcement. Read-only.
 * The API auto-provisions rings for load-bearing walls on first read
 * (HousesService.getCenturi).
 */
export function CenturiPanel() {
  const { t } = useTranslation()
  const { house } = useProjectStore()
  const { data: centuri, isLoading } = useCenturi(house?.id)

  if (!house) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.emptyCanvasHint}
      </div>
    )
  }

  if (isLoading || !centuri) {
    return <div className="p-4 text-sm text-gray-400 text-center py-8">{t.editor.structuralInspector.loading}</div>
  }

  if (centuri.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {t.editor.structuralInspector.centuri.title}
        </p>
        <p className="text-sm text-gray-500">{t.editor.structuralInspector.centuri.empty}</p>
      </div>
    )
  }

  // Present each wall's ring beams together — walls can carry two rows (own
  // level + above-top-floor); grouping is clearer than a flat list.
  const wallMap = new Map(house.walls.map((w, i) => [w.id, i + 1]))

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {t.editor.structuralInspector.centuri.title}
      </p>

      <div className="space-y-2">
        {centuri.map((c) => (
          <div key={c.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-700">
                {t.editor.structuralInspector.centuri.wall} #{wallMap.get(c.wallId) ?? '?'}
              </span>
              <span className="text-xs text-gray-400">
                {t.editor.structuralInspector.centuri.level} {c.level}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
              <dt>{t.editor.structuralInspector.centuri.height}</dt>
              <dd className="text-right text-gray-900">{c.heightMm} mm</dd>
              <dt>{t.editor.structuralInspector.centuri.width}</dt>
              <dd className="text-right text-gray-900">{c.widthMm} mm</dd>
              <dt>{t.editor.structuralInspector.concreteClass}</dt>
              <dd className="text-right text-gray-900">{c.concreteClass}</dd>
            </dl>
            {c.reinforcementSpecs.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                {c.reinforcementSpecs.map((r) => (
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

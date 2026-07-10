'use client'

import { useProjectStore } from '@/store/project.store'
import { useFoundation } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

/**
 * House-level Foundation inspector — mirrors WallLayerPanel's structure:
 * standards-cited defaults are marked "verified" with a small badge, and
 * anything convention-only surfaces the shared unverified disclosure text.
 * Read-only in this pass. The API auto-provisions the row on first read
 * (HousesService.getFoundation) so there is no explicit "create" step.
 */
export function FoundationPanel() {
  const { t } = useTranslation()
  const { house } = useProjectStore()
  const { data: foundation, isLoading } = useFoundation(house?.id)

  if (!house) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.emptyCanvasHint}
      </div>
    )
  }

  if (isLoading || !foundation) {
    return <div className="p-4 text-sm text-gray-400 text-center py-8">{t.editor.structuralInspector.loading}</div>
  }

  const hasUnverifiedPrice =
    foundation.assemblyLayers.some((l) => l.material.specSheet.priceVerified === false)

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {t.editor.structuralInspector.foundation.title}
      </p>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <dt className="text-gray-500">{t.editor.structuralInspector.foundation.depth}</dt>
          <dd className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{foundation.depthMm} mm</span>
            <VerifiedBadge verified={foundation.depthVerified} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">{t.editor.structuralInspector.foundation.width}</dt>
          <dd className="font-medium text-gray-900">{foundation.widthMm} mm</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">{t.editor.structuralInspector.concreteClass}</dt>
          <dd className="font-medium text-gray-900">{foundation.concreteClass}</dd>
        </div>
      </dl>

      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          {t.editor.structuralInspector.foundation.assemblyTitle}
        </p>
        <div className="space-y-2">
          {foundation.assemblyLayers.map((layer) => (
            <div key={layer.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700">
                  {t.editor.layerPanel.functionLabels[layer.function]}
                </span>
                <span className="text-xs text-gray-400">{layer.thicknessMm} mm</span>
              </div>
              <p className="text-sm font-medium text-gray-900">{layer.material.name}</p>
              {layer.material.standardRef && (
                <p className="text-xs text-gray-500">
                  {t.editor.layerPanel.standardColumn}: {layer.material.standardRef}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          {t.editor.structuralInspector.foundation.reinforcementTitle}
        </p>
        <div className="space-y-2">
          {foundation.reinforcementSpecs.map((r) => (
            <div key={r.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700">
                  {t.editor.structuralInspector.role[r.role]}
                </span>
                <span className="text-xs text-gray-400">Ø{r.barDiameterMm} mm</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                <dt>{t.editor.structuralInspector.barSpacing}</dt>
                <dd className="text-right text-gray-900">{r.spacingMm} mm</dd>
                <dt>{t.editor.structuralInspector.cover}</dt>
                <dd className="text-right text-gray-900">{r.coverMm} mm</dd>
              </dl>
            </div>
          ))}
        </div>
      </div>

      {(!foundation.depthVerified || hasUnverifiedPrice) && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {t.editor.structuralInspector.unverifiedNotice}
        </p>
      )}
    </div>
  )
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  const { t } = useTranslation()
  if (verified) {
    return (
      <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
        {t.editor.structuralInspector.verified}
      </span>
    )
  }
  return (
    <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
      {t.editor.structuralInspector.unverified}
    </span>
  )
}

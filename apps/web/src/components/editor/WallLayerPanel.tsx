'use client'

import { useProjectStore } from '@/store/project.store'
import { useWallLayers } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

export function WallLayerPanel() {
  const { selectedWallId } = useProjectStore()
  const { t } = useTranslation()
  const { data: layers, isLoading } = useWallLayers(selectedWallId)

  if (!selectedWallId) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.layerPanel.selectWallHint}
      </div>
    )
  }

  if (isLoading || !layers) {
    return <div className="p-4 text-sm text-gray-400 text-center py-8">{t.editor.layerPanel.loading}</div>
  }

  const hasUnverifiedPrice = layers.some((l) => l.material.specSheet.priceVerified === false)

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {t.editor.layerPanel.title}
      </p>

      <div className="space-y-2">
        {layers.map((layer) => (
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
            <p className="text-xs text-gray-500">
              {t.editor.layerPanel.priceColumn}: {layer.material.unitCostRON} RON/{layer.material.unit}
            </p>
          </div>
        ))}
      </div>

      {hasUnverifiedPrice && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {t.editor.layerPanel.priceUnverifiedNotice}
        </p>
      )}
    </div>
  )
}

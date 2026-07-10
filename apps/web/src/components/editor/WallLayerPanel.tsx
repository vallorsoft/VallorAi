'use client'

import { useState } from 'react'
import { useProjectStore } from '@/store/project.store'
import { useWallLayers, useWallReinforcement } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

/**
 * Wall inspector. Two tabs — the auto-provisioned layer stack (default) and
 * the reinforcement mats read from `GET /houses/walls/:id/reinforcement`.
 * Reinforcement is NOT auto-provisioned by the API (Key rule 7 — masonry
 * walls carry no rebar by default, invented structural defaults are not
 * allowed), so the reinforcement tab shows a deliberate empty state for
 * every ordinary wall until a spec is seeded / added via a future editor.
 */
export function WallLayerPanel() {
  const { selectedWallId } = useProjectStore()
  const { t } = useTranslation()
  const [tab, setTab] = useState<'layers' | 'reinforcement'>('layers')

  if (!selectedWallId) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.layerPanel.selectWallHint}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex border-b border-gray-100">
        <TabButton active={tab === 'layers'} onClick={() => setTab('layers')}>
          {t.editor.layerPanel.tabLayers}
        </TabButton>
        <TabButton
          active={tab === 'reinforcement'}
          onClick={() => setTab('reinforcement')}
        >
          {t.editor.layerPanel.tabReinforcement}
        </TabButton>
      </div>
      {tab === 'layers' ? (
        <LayersTab wallId={selectedWallId} />
      ) : (
        <ReinforcementTab wallId={selectedWallId} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? 'border-brand-500 text-brand-700'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function LayersTab({ wallId }: { wallId: string }) {
  const { t } = useTranslation()
  const { data: layers, isLoading } = useWallLayers(wallId)

  if (isLoading || !layers) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.layerPanel.loading}
      </div>
    )
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

/**
 * Wall reinforcement tab. Reads from GET /houses/walls/:id/reinforcement,
 * which deliberately DOES NOT auto-provision (Key rule 7). Empty state is
 * the norm for masonry walls — flagged with a plain informational line, not
 * an error.
 */
function ReinforcementTab({ wallId }: { wallId: string }) {
  const { t } = useTranslation()
  const { data: specs, isLoading } = useWallReinforcement(wallId)

  if (isLoading || !specs) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.structuralInspector.loading}
      </div>
    )
  }

  if (specs.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {t.editor.wallReinforcement.title}
        </p>
        <p className="text-sm text-gray-500">{t.editor.wallReinforcement.empty}</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {t.editor.wallReinforcement.title}
      </p>
      <div className="space-y-2">
        {specs.map((r) => (
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
              <dt>{t.editor.structuralInspector.concreteClass}</dt>
              <dd className="text-right text-gray-900">{r.concreteClass}</dd>
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}

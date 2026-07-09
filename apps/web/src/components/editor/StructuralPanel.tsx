'use client'

import { useProjectStore } from '@/store/project.store'
import {
  useCenturi,
  useFoundation,
  useTieColumns,
  type StructuralReinforcementSpec,
} from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

/** "4×Ø14 mm" for fixed-count arrangements, "Ø6 / 150 mm" for spaced ones. */
function formatBars(spec: StructuralReinforcementSpec): string {
  return spec.barCount
    ? `${spec.barCount}×Ø${spec.barDiameterMm} mm`
    : `Ø${spec.barDiameterMm} / ${spec.spacingMm} mm`
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-800 text-right">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-1.5">
      <p className="text-xs font-semibold text-gray-700">{title}</p>
      {children}
    </div>
  )
}

/**
 * Read-only inspector for the house's auto-provisioned structural elements
 * (law modules 1-3): strip footing, tie-columns and ring beams, with their
 * standards-cited constructive minimums. Mirrors WallLayerPanel's visual
 * language; every value comes from the API rows, nothing is computed here.
 */
export function StructuralPanel() {
  const { t } = useTranslation()
  const { house } = useProjectStore()
  const houseId = house?.id ?? null
  const { data: foundation, isLoading: loadingFoundation } = useFoundation(houseId)
  const { data: tieColumns, isLoading: loadingTieColumns } = useTieColumns(houseId)
  const { data: centuri, isLoading: loadingCenturi } = useCenturi(houseId)

  if (!houseId) return null

  const p = t.editor.structuralPanel
  if (loadingFoundation || loadingTieColumns || loadingCenturi) {
    return <div className="p-4 text-sm text-gray-400 text-center py-6">{p.loading}</div>
  }

  const foundationTransverse = foundation?.reinforcementSpecs.find((s) => s.role === 'TRANSVERSE')
  const foundationLongitudinal = foundation?.reinforcementSpecs.find(
    (s) => s.role === 'LONGITUDINAL',
  )
  const leanLayer = foundation?.assemblyLayers.find((l) => l.order === 1)

  const tieCount = (category: 'S1' | 'S2' | 'S3') =>
    (tieColumns ?? []).filter((c) => c.category === category).length
  const tieSample = tieColumns?.[0]
  const tieLongitudinal = tieSample?.reinforcementSpecs.find((s) => s.role === 'LONGITUDINAL')
  const tieStirrup = tieSample?.reinforcementSpecs.find((s) => s.role === 'STIRRUP')

  const centuraSample = centuri?.[0]
  const centuraLongitudinal = centuraSample?.reinforcementSpecs.find(
    (s) => s.role === 'LONGITUDINAL',
  )
  const centuraStirrup = centuraSample?.reinforcementSpecs.find((s) => s.role === 'STIRRUP')
  const centuraHeights = [...new Set((centuri ?? []).map((c) => c.heightMm))].sort((a, b) => a - b)

  return (
    <div className="p-4 space-y-3 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{p.title}</p>

      {foundation && (
        <Section title={p.foundationTitle}>
          <SpecRow label={p.depthLabel} value={`${foundation.depthMm} mm`} />
          <SpecRow label={p.widthLabel} value={`${foundation.widthMm} mm`} />
          <SpecRow label={p.concreteLabel} value={foundation.concreteClass} />
          {leanLayer && (
            <SpecRow
              label={p.leanConcreteLabel}
              value={`${leanLayer.material.name.replace('Beton de egalizare ', '')} · ${leanLayer.thicknessMm} mm`}
            />
          )}
          {foundationTransverse && (
            <SpecRow label={p.transverseLabel} value={formatBars(foundationTransverse)} />
          )}
          {foundationLongitudinal && (
            <SpecRow label={p.longitudinalLabel} value={formatBars(foundationLongitudinal)} />
          )}
          {foundationTransverse && (
            <SpecRow label={p.coverLabel} value={`${foundationTransverse.coverMm} mm`} />
          )}
          {!foundation.depthVerified && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 mt-1">
              {p.depthUnverifiedNotice}
            </p>
          )}
        </Section>
      )}

      {tieColumns && tieColumns.length > 0 && tieSample && (
        <Section title={p.tieColumnsTitle}>
          <SpecRow label={p.categoryS1} value={String(tieCount('S1'))} />
          <SpecRow label={p.categoryS2} value={String(tieCount('S2'))} />
          <SpecRow label={p.categoryS3} value={String(tieCount('S3'))} />
          <SpecRow
            label={p.crossSectionLabel}
            value={`${tieSample.crossSectionMm}×${tieSample.crossSectionMm} mm`}
          />
          <SpecRow label={p.concreteLabel} value={tieSample.concreteClass} />
          {tieLongitudinal && (
            <SpecRow label={p.reinforcementLabel} value={formatBars(tieLongitudinal)} />
          )}
          {tieStirrup && <SpecRow label={p.stirrupLabel} value={formatBars(tieStirrup)} />}
        </Section>
      )}

      {centuri && centuri.length > 0 && centuraSample && (
        <Section title={p.centuriTitle}>
          <SpecRow label={p.countLabel} value={String(centuri.length)} />
          <p className="text-[11px] text-gray-400 leading-snug">{p.perWallNote}</p>
          <SpecRow
            label={p.heightLabel}
            value={centuraHeights.map((h) => `${h} mm`).join(' / ')}
          />
          <SpecRow label={p.concreteLabel} value={centuraSample.concreteClass} />
          {centuraLongitudinal && (
            <SpecRow label={p.reinforcementLabel} value={formatBars(centuraLongitudinal)} />
          )}
          {centuraStirrup && <SpecRow label={p.stirrupLabel} value={formatBars(centuraStirrup)} />}
        </Section>
      )}

      <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        {p.engineerNotice}
      </p>
    </div>
  )
}

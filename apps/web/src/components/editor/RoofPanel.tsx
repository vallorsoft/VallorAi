'use client'

import { useEffect, useState } from 'react'
import { useProjectStore } from '@/store/project.store'
import { useEditorRoof, useUpdateRoof, type EditorRoofType } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

const ROOF_TYPES: EditorRoofType[] = ['GABLED', 'HIPPED', 'FLAT', 'MONOSLOPE']

/**
 * House-level Roof inspector. Interactive per the task spec: type dropdown
 * PATCHes on change, pitch/overhang inputs PATCH on blur. Verified badges
 * mirror WallLayerPanel's unverified-price pattern — a user drift off the
 * standards-cited pitch default flips the badge to unverified (server-side
 * logic in HousesService.updateRoof).
 */
export function RoofPanel() {
  const { t } = useTranslation()
  const { house } = useProjectStore()
  const { data: roof, isLoading } = useEditorRoof(house?.id)
  const updateRoof = useUpdateRoof(house?.id)

  const [pitchInput, setPitchInput] = useState('')
  const [overhangInput, setOverhangInput] = useState('')

  useEffect(() => {
    if (roof) {
      setPitchInput(String(roof.pitchDeg))
      setOverhangInput(String(roof.overhangM))
    }
  }, [roof])

  if (!house) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.emptyCanvasHint}
      </div>
    )
  }

  if (isLoading || !roof) {
    return <div className="p-4 text-sm text-gray-400 text-center py-8">{t.editor.structuralInspector.loading}</div>
  }

  const isFlat = roof.type === 'FLAT'

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextType = e.target.value as EditorRoofType
    if (nextType === roof.type) return
    updateRoof.mutate({ type: nextType })
  }

  const commitPitch = () => {
    const n = Number(pitchInput)
    if (!Number.isFinite(n) || n < 0 || n > 89) {
      setPitchInput(String(roof.pitchDeg))
      return
    }
    if (n === roof.pitchDeg) return
    updateRoof.mutate({ pitchDeg: n })
  }

  const commitOverhang = () => {
    const n = Number(overhangInput)
    if (!Number.isFinite(n) || n < 0 || n > 3) {
      setOverhangInput(String(roof.overhangM))
      return
    }
    if (n === roof.overhangM) return
    updateRoof.mutate({ overhangM: n })
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {t.editor.structuralInspector.roof.title}
        </p>
        {updateRoof.isPending && (
          <span className="text-[10px] text-gray-400">{t.editor.structuralInspector.roof.saving}</span>
        )}
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-gray-500">{t.editor.structuralInspector.roof.typeLabel}</span>
        <select
          value={roof.type}
          onChange={handleTypeChange}
          disabled={updateRoof.isPending}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50"
        >
          {ROOF_TYPES.map((rt) => (
            <option key={rt} value={rt}>
              {t.editor.structuralInspector.roof.types[rt]}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="flex items-center justify-between text-xs text-gray-500">
          <span>{t.editor.structuralInspector.roof.pitch}</span>
          <VerifiedBadge verified={roof.pitchVerified} />
        </span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={89}
            step={1}
            value={isFlat ? 0 : pitchInput}
            onChange={(e) => setPitchInput(e.target.value)}
            onBlur={commitPitch}
            disabled={updateRoof.isPending || isFlat}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50 disabled:bg-gray-50"
          />
          <span className="text-xs text-gray-500">°</span>
        </div>
        <p className="text-[11px] text-gray-400 leading-snug">
          {t.editor.structuralInspector.roof.pitchDefaultHint}
        </p>
      </label>

      <label className="block space-y-1">
        <span className="flex items-center justify-between text-xs text-gray-500">
          <span>{t.editor.structuralInspector.roof.overhang}</span>
          <VerifiedBadge verified={roof.overhangVerified} />
        </span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={3}
            step={0.05}
            value={overhangInput}
            onChange={(e) => setOverhangInput(e.target.value)}
            onBlur={commitOverhang}
            disabled={updateRoof.isPending}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50"
          />
          <span className="text-xs text-gray-500">m</span>
        </div>
        <p className="text-[11px] text-gray-400 leading-snug">
          {t.editor.structuralInspector.roof.overhangDefaultHint}
        </p>
      </label>

      <dl className="space-y-2 text-sm border-t border-gray-100 pt-3">
        <div className="flex justify-between">
          <dt className="text-gray-500">{t.editor.structuralInspector.roof.ridgeHeight}</dt>
          <dd className="font-medium text-gray-900">{roof.ridgeHeightM.toFixed(2)} m</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">{t.editor.structuralInspector.roof.material}</dt>
          <dd className="font-medium text-gray-900 text-right">{roof.material?.name ?? '—'}</dd>
        </div>
        {roof.material?.standardRef && (
          <div className="flex justify-between">
            <dt className="text-gray-500">{t.editor.layerPanel.standardColumn}</dt>
            <dd className="text-gray-900 text-right">{roof.material.standardRef}</dd>
          </div>
        )}
      </dl>

      {(!roof.pitchVerified || !roof.overhangVerified) && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {t.editor.structuralInspector.unverifiedNotice}
        </p>
      )}
    </div>
  )
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  const { t } = useTranslation()
  return verified ? (
    <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
      {t.editor.structuralInspector.verified}
    </span>
  ) : (
    <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
      {t.editor.structuralInspector.unverified}
    </span>
  )
}

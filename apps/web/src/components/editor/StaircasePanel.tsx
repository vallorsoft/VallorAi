'use client'

import { useProjectStore } from '@/store/project.store'
import { useStaircases, useCreateStaircase, useDeleteStaircase, type StaircaseRow } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'
import { BLONDEL_TARGET_MM } from '@ai-home-designer/bim-engine'

/**
 * Staircase inspector panel — lists every staircase in the house and lets the
 * user add/delete entries. No auto-provisioning: a single-storey house needs
 * no staircase, so the API never creates one silently.
 */
export function StaircasePanel() {
  const { t } = useTranslation()
  const { house } = useProjectStore()
  const { data: staircases, isLoading } = useStaircases(house?.id ?? null)
  const createMutation = useCreateStaircase(house?.id ?? '')
  const deleteMutation = useDeleteStaircase(house?.id ?? '')

  if (!house) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.emptyCanvasHint}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.structuralInspector.staircase.loading}
      </div>
    )
  }

  const floors = house.floors ?? 1
  const topFloor = Math.max(0, floors - 1)

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {t.editor.structuralInspector.staircase.title}
      </p>

      {!staircases || staircases.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">
          {t.editor.structuralInspector.staircase.empty}
        </p>
      ) : (
        <div className="space-y-3">
          {staircases.map((s) => (
            <StaircaseCard
              key={s.id}
              staircase={s}
              onDelete={() => deleteMutation.mutate(s.id)}
            />
          ))}
        </div>
      )}

      {/* Only show "add" for multi-storey houses (they need at least one flight). */}
      {floors > 1 && (
        <button
          type="button"
          disabled={createMutation.isPending}
          onClick={() =>
            createMutation.mutate({
              floor: Math.max(0, topFloor - 1),
              floorHeightMm: 2700,
            })
          }
          className="w-full text-sm rounded-lg border border-dashed border-gray-300 py-2 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
        >
          {t.editor.structuralInspector.staircase.addButton}
        </button>
      )}
    </div>
  )
}

function StaircaseCard({
  staircase,
  onDelete,
}: {
  staircase: StaircaseRow
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const si = t.editor.structuralInspector.staircase

  const blondelMm = 2 * staircase.riserHeightMm + staircase.treadDepthMm
  const blondelOk = Math.abs(blondelMm - BLONDEL_TARGET_MM) < 5
  const treadOk = staircase.treadDepthMm >= 250
  const riserOk = staircase.riserHeightMm <= 200
  const meetsCode = treadOk && riserOk

  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">
          {si.floor} {staircase.floor}
        </span>
        <span
          className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded border ${
            meetsCode
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-red-50 text-red-700 border-red-100'
          }`}
        >
          {meetsCode ? si.codeCompliant : si.codeViolation}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
        <dt>{si.width}</dt>
        <dd className="text-right text-gray-900">{(staircase.widthM * 1000).toFixed(0)} mm</dd>

        <dt>{si.riserCount}</dt>
        <dd className="text-right text-gray-900">{staircase.riserCount}</dd>

        <dt>{si.riserHeight}</dt>
        <dd className="text-right text-gray-900">{staircase.riserHeightMm.toFixed(1)} mm</dd>

        <dt>{si.treadDepth}</dt>
        <dd className="text-right text-gray-900">{staircase.treadDepthMm.toFixed(1)} mm</dd>

        <dt>{si.horizontalRun}</dt>
        <dd className="text-right text-gray-900">{(staircase.lengthM * 1000).toFixed(0)} mm</dd>

        <dt>{si.blondelCheck}</dt>
        <dd className={`text-right font-medium ${blondelOk ? 'text-emerald-700' : 'text-amber-600'}`}>
          {blondelMm.toFixed(0)} mm
        </dd>

        <dt>{si.handedness}</dt>
        <dd className="text-right text-gray-900">
          {staircase.handedness === 'RIGHT' ? si.handednessRight : si.handednessLeft}
        </dd>
      </dl>

      <p className="text-[10px] text-gray-400">{si.blondelTarget}</p>

      <button
        type="button"
        onClick={onDelete}
        className="w-full text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded py-1 transition-colors"
      >
        {si.deleteButton}
      </button>
    </div>
  )
}

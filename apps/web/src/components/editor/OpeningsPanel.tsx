'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useProjectStore, type Opening, type Wall } from '@/store/project.store'
import { useAddOpening, useDeleteOpening, useLintel } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

// Editable starting values for the add-opening form — UI conveniences the
// user adjusts before submitting, not standards-derived specs.
const DOOR_DEFAULTS = { width: 0.9, height: 2.1, sillHeight: 0 }
const WINDOW_DEFAULTS = { width: 1.2, height: 1.2, sillHeight: 0.9 }

function OpeningRow({
  opening,
  onDelete,
  deleting,
}: {
  opening: Opening
  onDelete: () => void
  deleting: boolean
}) {
  const { t } = useTranslation()
  const p = t.editor.openingsPanel
  // Auto-provisions the prefabricated lintel on first read (CR6-2013 module).
  const { data: lintel } = useLintel(opening.id)

  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">
          {opening.type === 'DOOR' ? p.typeDoor : p.typeWindow}
        </span>
        <button
          onClick={onDelete}
          disabled={deleting}
          title={p.deleteLabel}
          className="text-gray-400 hover:text-red-600 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-sm font-medium text-gray-900">
        {opening.width.toFixed(2)} × {opening.height.toFixed(2)} m
      </p>
      <p className="text-xs text-gray-500">
        {p.positionLabel}: {opening.position.toFixed(2)}
        {opening.sillHeight > 0 && (
          <>
            {' '}
            · {p.sillLabel}: {opening.sillHeight.toFixed(2)}
          </>
        )}
      </p>
      {lintel && (
        <p className="text-xs text-gray-500 mt-0.5">
          {p.lintelLabel}: {lintel.material.name} · {Math.round(lintel.lengthMm)} mm (
          {p.lintelBearingNote} {Math.round(lintel.bearingLengthMm)} mm)
        </p>
      )}
    </div>
  )
}

/**
 * Openings (doors/windows) of the selected wall: list with per-opening
 * auto-provisioned lintel spec, plus an add form. Shown inside the wall
 * inspector under the layer stack.
 */
export function OpeningsPanel({ wall }: { wall: Wall }) {
  const { t } = useTranslation()
  const p = t.editor.openingsPanel
  const { house, activeProjectId } = useProjectStore()
  const addOpening = useAddOpening(activeProjectId)
  const deleteOpening = useDeleteOpening(activeProjectId)

  const [type, setType] = useState<'DOOR' | 'WINDOW'>('WINDOW')
  const defaults = type === 'DOOR' ? DOOR_DEFAULTS : WINDOW_DEFAULTS
  const [width, setWidth] = useState(String(WINDOW_DEFAULTS.width))
  const [height, setHeight] = useState(String(WINDOW_DEFAULTS.height))
  const [sillHeight, setSillHeight] = useState(String(WINDOW_DEFAULTS.sillHeight))
  const [position, setPosition] = useState('1')
  const [positionError, setPositionError] = useState(false)

  const openings = (house?.openings ?? []).filter((o) => o.wallId === wall.id)
  const wallLengthM = Math.hypot(wall.endX - wall.startX, wall.endY - wall.startY)

  const switchType = (next: 'DOOR' | 'WINDOW') => {
    setType(next)
    const d = next === 'DOOR' ? DOOR_DEFAULTS : WINDOW_DEFAULTS
    setWidth(String(d.width))
    setHeight(String(d.height))
    setSillHeight(String(d.sillHeight))
  }

  const submit = () => {
    if (!house) return
    const w = parseFloat(width)
    const h = parseFloat(height)
    const pos = parseFloat(position)
    const sill = parseFloat(sillHeight)
    if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(pos) || w <= 0 || h <= 0)
      return
    if (pos < 0 || pos + w > wallLengthM) {
      setPositionError(true)
      return
    }
    setPositionError(false)
    addOpening.mutate({
      houseId: house.id,
      wallId: wall.id,
      type,
      position: pos,
      width: w,
      height: h,
      sillHeight: Number.isFinite(sill) ? sill : defaults.sillHeight,
    })
  }

  const numberInput = (
    label: string,
    value: string,
    onChange: (v: string) => void,
  ) => (
    <label className="block">
      <span className="text-[11px] text-gray-500">{label}</span>
      <input
        type="number"
        step="0.1"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
      />
    </label>
  )

  return (
    <div className="space-y-3 pt-3 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{p.title}</p>

      {openings.length === 0 ? (
        <p className="text-xs text-gray-400">{p.empty}</p>
      ) : (
        <div className="space-y-2">
          {openings.map((opening) => (
            <OpeningRow
              key={opening.id}
              opening={opening}
              onDelete={() => deleteOpening.mutate(opening.id)}
              deleting={deleteOpening.isPending}
            />
          ))}
        </div>
      )}

      <div className="border border-gray-100 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          {(['WINDOW', 'DOOR'] as const).map((option) => (
            <button
              key={option}
              onClick={() => switchType(option)}
              className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                type === option
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {option === 'DOOR' ? p.typeDoor : p.typeWindow}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {numberInput(p.widthLabel, width, setWidth)}
          {numberInput(p.heightLabel, height, setHeight)}
          {numberInput(p.positionLabel, position, setPosition)}
          {type === 'WINDOW' && numberInput(p.sillLabel, sillHeight, setSillHeight)}
        </div>
        {positionError && <p className="text-xs text-red-600">{p.positionError}</p>}
        <button
          onClick={submit}
          disabled={addOpening.isPending}
          className="w-full rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {addOpening.isPending ? p.adding : type === 'DOOR' ? p.addDoor : p.addWindow}
        </button>
      </div>
    </div>
  )
}

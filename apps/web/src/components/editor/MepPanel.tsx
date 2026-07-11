'use client'

import { useProjectStore } from '@/store/project.store'
import { useMepPoints, useRegenerateMep, type MepPointRow } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

/**
 * MEP (Mechanical, Electrical, Plumbing) inspector panel.
 *
 * Lists every MepPoint row grouped by room. Points are auto-provisioned by
 * HousesService.getMepPoints on first GET — the panel just renders whatever
 * the API returns. The "Regenerate" button calls POST /houses/:id/mep/regenerate
 * to delete and re-derive after room type changes.
 *
 * Standards: I 9-2015 (water/drain counts), NTE 007/08/00 + PE 155/92
 * (electrical counts). Every point row carries its normative reference in
 * `standard` — shown in the panel so the user can trace the number to the source.
 */
export function MepPanel() {
  const { t } = useTranslation()
  const { house } = useProjectStore()
  const { data: mepPoints, isLoading } = useMepPoints(house?.id)
  const regenerateMutation = useRegenerateMep(house?.id)

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
        {t.mep.loading}
      </div>
    )
  }

  if (!mepPoints || mepPoints.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-sm text-gray-400 text-center py-6">{t.mep.empty}</p>
        <button
          onClick={() => regenerateMutation.mutate()}
          disabled={regenerateMutation.isPending}
          className="w-full px-3 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {regenerateMutation.isPending ? t.mep.regenerating : t.mep.regenerateButton}
        </button>
      </div>
    )
  }

  // Group points by roomId
  const byRoom = new Map<string | null, MepPointRow[]>()
  for (const pt of mepPoints) {
    const key = pt.roomId ?? null
    if (!byRoom.has(key)) byRoom.set(key, [])
    byRoom.get(key)!.push(pt)
  }

  // Determine room name from the house store rooms by id
  const roomById = new Map<string, { type: string; name: string }>(
    (house.rooms ?? []).map((r: { id: string; type: string; name: string }) => [r.id, r]),
  )

  // Separate water/drain from electrical for color-coding
  const waterTypes = new Set(['WATER_SUPPLY', 'HOT_WATER_SUPPLY', 'DRAIN'])
  const electricalTypes = new Set(['ELECTRICAL_OUTLET', 'SWITCH', 'LIGHTING_POINT'])

  function typeBadgeClass(type: MepPointRow['type']): string {
    if (waterTypes.has(type)) return 'bg-blue-100 text-blue-700'
    if (electricalTypes.has(type)) return 'bg-yellow-100 text-yellow-700'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="p-4 space-y-4">
      {/* Regenerate button */}
      <button
        onClick={() => regenerateMutation.mutate()}
        disabled={regenerateMutation.isPending}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {regenerateMutation.isPending ? t.mep.regenerating : t.mep.regenerateButton}
      </button>

      {/* Per-room groups */}
      {[...byRoom.entries()].map(([roomId, pts]) => {
        const room = roomId ? roomById.get(roomId) : undefined
        const roomLabel = room
          ? `${t.mep.roomLabel}: ${room.name || room.type}`
          : t.mep.unknownRoom

        return (
          <div key={roomId ?? 'no-room'} className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {roomLabel}
            </h4>
            <div className="overflow-hidden rounded-lg border border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-2 py-1.5 text-left font-medium text-gray-500">
                      {/* type + notes inline */}
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium text-gray-500">
                      {t.mep.countColumn}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pts.map((pt) => (
                    <tr key={pt.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2 space-y-0.5">
                        <div className="flex flex-wrap gap-1">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${typeBadgeClass(pt.type)}`}
                          >
                            {t.mep.typeLabels[pt.type]}
                          </span>
                          {pt.notes && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-600">
                              {pt.notes}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">{pt.standard}</p>
                      </td>
                      <td className="px-2 py-2 text-right font-medium text-gray-700">
                        {pt.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

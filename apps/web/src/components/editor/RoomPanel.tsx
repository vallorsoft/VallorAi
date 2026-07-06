'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useProjectStore } from '@/store/project.store'
import { api } from '@/lib/api'

export function RoomPanel({ projectId }: { projectId: string }) {
  const { house, selectedRoomId, selectRoom } = useProjectStore()
  const qc = useQueryClient()

  const room = house?.rooms.find((r) => r.id === selectedRoomId)

  const deleteRoom = useMutation({
    mutationFn: async (roomId: string) => api.delete(`/houses/rooms/${roomId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['houses', projectId] })
      selectRoom(null)
    },
  })

  if (!room) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        Selectează o cameră pe plan
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Cameră selectată</p>
        <h4 className="font-semibold text-gray-900">{room.name}</h4>
        <p className="text-xs text-gray-500">{room.type}</p>
      </div>

      <dl className="space-y-2 text-sm">
        {[
          ['Suprafață', `${room.area} m²`],
          ['Lățime', `${room.width} m`],
          ['Înălțime', `${room.height} m`],
          ['Etaj', `${room.floor}`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-gray-500">{k}</dt>
            <dd className="font-medium text-gray-900">{v}</dd>
          </div>
        ))}
      </dl>

      <button
        onClick={() => deleteRoom.mutate(room.id)}
        disabled={deleteRoom.isPending}
        className="w-full px-3 py-2 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        {deleteRoom.isPending ? 'Se șterge...' : 'Șterge camera'}
      </button>
    </div>
  )
}

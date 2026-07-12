'use client'

import { useRef, useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useTranslation } from '@/lib/useTranslation'

interface Props {
  projectId: string
  onClose: () => void
}

export function ImportFloorPlanModal({ projectId, onClose }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [result, setResult] = useState<{ roomsCreated: number; message: string } | null>(null)

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const imageBase64 = await fileToBase64(file)
      const res = await api.post('/imports/floor-plan', {
        imageBase64,
        mimeType: file.type,
        projectId,
      })
      return res.data.data as { roomsCreated: number; message: string }
    },
    onSuccess: (data) => {
      setResult(data)
      // Invalidate house + rooms queries so the editor reloads
      qc.invalidateQueries({ queryKey: ['house'] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      importMutation.mutate(file)
    },
    [importMutation],
  )

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{t.floorPlanImport.modalTitle}</h2>
        <p className="text-sm text-gray-500 mb-5">{t.floorPlanImport.modalSubtitle}</p>

        {!result && !importMutation.isPending && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-brand-400 bg-brand-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <p className="text-sm text-gray-500">
              {dragActive ? t.floorPlanImport.dropzoneActive : t.floorPlanImport.dropzone}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </div>
        )}

        {importMutation.isPending && (
          <div className="text-center py-8">
            <div className="inline-block w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-500">{t.floorPlanImport.importing}</p>
          </div>
        )}

        {result && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
            <p className="font-semibold text-green-800 text-sm">{t.floorPlanImport.success}</p>
            <p className="text-green-700 text-xs mt-1">
              {result.roomsCreated} {t.floorPlanImport.roomsCreated}
            </p>
            {result.message && (
              <p className="text-green-600 text-xs mt-1 italic">{result.message}</p>
            )}
          </div>
        )}

        {importMutation.isError && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-center">
            <p className="text-red-700 text-xs">{t.floorPlanImport.error}</p>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {t.floorPlanImport.close}
          </button>
        </div>
      </div>
    </div>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip data URL prefix: "data:image/jpeg;base64,..."
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

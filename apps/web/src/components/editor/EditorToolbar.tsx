'use client'

import { useProjectStore } from '@/store/project.store'

const tools = [
  { mode: 'select' as const, label: 'Selectare', icon: '↖' },
  { mode: 'add-room' as const, label: 'Adaugă cameră', icon: '⬜' },
  { mode: 'add-wall' as const, label: 'Adaugă perete', icon: '—' },
]

export function EditorToolbar() {
  const { editorMode, setEditorMode } = useProjectStore()

  return (
    <div className="h-12 bg-white border-b border-gray-200 flex items-center gap-1 px-4">
      {tools.map((t) => (
        <button
          key={t.mode}
          onClick={() => setEditorMode(t.mode)}
          title={t.label}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            editorMode === t.mode
              ? 'bg-brand-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span className="mr-1.5">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  )
}

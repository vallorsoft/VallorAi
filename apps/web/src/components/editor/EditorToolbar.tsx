'use client'

import { useProjectStore } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'

export function EditorToolbar() {
  const { t } = useTranslation()
  const { editorMode, setEditorMode } = useProjectStore()

  const tools = [
    { mode: 'select' as const, label: t.editor.toolSelect, icon: '↖' },
    { mode: 'add-room' as const, label: t.editor.toolAddRoom, icon: '⬜' },
    { mode: 'add-wall' as const, label: t.editor.toolAddWall, icon: '—' },
  ]

  return (
    <div className="h-12 bg-white border-b border-gray-200 flex items-center gap-1 px-4">
      {tools.map((tool) => (
        <button
          key={tool.mode}
          onClick={() => setEditorMode(tool.mode)}
          title={tool.label}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            editorMode === tool.mode
              ? 'bg-brand-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span className="mr-1.5">{tool.icon}</span>
          {tool.label}
        </button>
      ))}
    </div>
  )
}

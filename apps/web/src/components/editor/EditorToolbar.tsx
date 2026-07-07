'use client'

import { useProjectStore } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'

export function EditorToolbar() {
  const { t } = useTranslation()
  const { editorMode, setEditorMode, viewMode, setViewMode } = useProjectStore()

  const tools = [
    { mode: 'select' as const, label: t.editor.toolSelect, icon: '↖' },
    { mode: 'add-room' as const, label: t.editor.toolAddRoom, icon: '⬜' },
    { mode: 'add-wall' as const, label: t.editor.toolAddWall, icon: '—' },
  ]

  const views = [
    { mode: '2d' as const, label: t.editor.toolView2d },
    { mode: '3d' as const, label: t.editor.toolView3d },
  ]

  return (
    <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between gap-1 px-4">
      <div className="flex items-center gap-1">
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

      <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
        {views.map((view) => (
          <button
            key={view.mode}
            onClick={() => setViewMode(view.mode)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              viewMode === view.mode
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>
    </div>
  )
}

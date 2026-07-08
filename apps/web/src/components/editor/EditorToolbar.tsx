'use client'

import { useProjectStore } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'
import type { Dictionary } from '@/locales'

function floorLabel(floor: number, t: Dictionary) {
  if (floor === 0) return t.editor.floorGround
  if (floor < 0) return floor === -1 ? t.editor.floorBasement : `${t.editor.floorBasement} ${-floor}`
  return `${t.editor.floorUpper} ${floor}`
}

export function EditorToolbar() {
  const { t } = useTranslation()
  const { editorMode, setEditorMode, viewMode, setViewMode, house, activeFloor, setActiveFloor } =
    useProjectStore()

  const tools = [
    { mode: 'select' as const, label: t.editor.toolSelect, icon: '↖' },
    { mode: 'add-room' as const, label: t.editor.toolAddRoom, icon: '⬜' },
    { mode: 'add-wall' as const, label: t.editor.toolAddWall, icon: '—' },
  ]

  const views = [
    { mode: '2d' as const, label: t.editor.toolView2d },
    { mode: '3d' as const, label: t.editor.toolView3d },
  ]

  const floors = [
    ...new Set([
      ...(house?.rooms.map((r) => r.floor) ?? []),
      ...(house?.walls.map((w) => w.floor) ?? []),
    ]),
  ].sort((a, b) => a - b)

  return (
    <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between gap-2 px-2 sm:px-4 overflow-x-auto">
      <div className="flex items-center gap-1">
        {tools.map((tool) => (
          <button
            key={tool.mode}
            onClick={() => setEditorMode(tool.mode)}
            title={tool.label}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
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

      <div className="flex items-center gap-2 shrink-0">
        {/* Floor switcher — 2D shows one level at a time; 3D stacks them all. */}
        {viewMode === '2d' && floors.length > 1 && (
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            {floors.map((floor) => (
              <button
                key={floor}
                onClick={() => setActiveFloor(floor)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  activeFloor === floor
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {floorLabel(floor, t)}
              </button>
            ))}
          </div>
        )}

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
    </div>
  )
}

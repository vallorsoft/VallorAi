'use client'

import { useState } from 'react'
import { useProjectStore } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'
import type { Dictionary } from '@/locales'
import { ImportFloorPlanModal } from './ImportFloorPlanModal'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

function floorLabel(floor: number, t: Dictionary) {
  if (floor === 0) return t.editor.floorGround
  if (floor < 0) return floor === -1 ? t.editor.floorBasement : `${t.editor.floorBasement} ${-floor}`
  return `${t.editor.floorUpper} ${floor}`
}

export function EditorToolbar() {
  const { t } = useTranslation()
  const {
    editorMode,
    setEditorMode,
    viewMode,
    setViewMode,
    house,
    activeFloor,
    setActiveFloor,
    structuralPanel,
    setStructuralPanel,
    activeProjectId,
  } = useProjectStore()

  const [pdfLoading, setPdfLoading] = useState(false)
  const [ifcLoading, setIfcLoading] = useState(false)
  const [permitDocLoading, setPermitDocLoading] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  const handleDownloadPdf = async () => {
    if (!activeProjectId || pdfLoading) return
    setPdfLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
      const response = await fetch(
        `${BASE_URL}/exports/projects/${activeProjectId}/floor-plan-pdf`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      )
      if (!response.ok) throw new Error('PDF generation failed')
      const blob = await response.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = 'alaprajz.pdf'
      a.click()
      URL.revokeObjectURL(objUrl)
    } finally {
      setPdfLoading(false)
    }
  }

  const handleDownloadIfc = async () => {
    if (!activeProjectId || ifcLoading) return
    setIfcLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
      const response = await fetch(
        `${BASE_URL}/exports/projects/${activeProjectId}/ifc`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      )
      if (!response.ok) throw new Error('IFC generation failed')
      const blob = await response.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = 'model.ifc'
      a.click()
      URL.revokeObjectURL(objUrl)
    } finally {
      setIfcLoading(false)
    }
  }

  const handleDownloadPermitDoc = async () => {
    if (!activeProjectId || permitDocLoading) return
    setPermitDocLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
      const response = await fetch(
        `${BASE_URL}/exports/projects/${activeProjectId}/permit-doc`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      )
      if (!response.ok) throw new Error('DTAC PDF generation failed')
      const blob = await response.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = 'dtac-rezumat.pdf'
      a.click()
      URL.revokeObjectURL(objUrl)
    } finally {
      setPermitDocLoading(false)
    }
  }

  const tools = [
    { mode: 'select' as const, label: t.editor.toolSelect, icon: '↖' },
    { mode: 'add-room' as const, label: t.editor.toolAddRoom, icon: '⬜' },
    { mode: 'add-wall' as const, label: t.editor.toolAddWall, icon: '—' },
  ]

  const structuralTools = [
    { panel: 'foundation' as const, label: t.editor.structuralInspector.toolFoundation },
    { panel: 'tie-columns' as const, label: t.editor.structuralInspector.toolTieColumns },
    { panel: 'centuri' as const, label: t.editor.structuralInspector.toolCenturi },
    { panel: 'roof' as const, label: t.editor.structuralInspector.toolRoof },
    { panel: 'staircase' as const, label: t.editor.structuralInspector.toolStaircase },
    { panel: 'mep' as const, label: t.mep.toolMep },
    { panel: 'cost-boq' as const, label: t.editor.toolCostBoq },
    { panel: 'collaboration' as const, label: t.collaboration.toolCollab },
    { panel: 'tasks' as const, label: t.tasks.toolTasks },
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
      <div className="flex items-center gap-1 flex-wrap">
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
        {/* Structural-inspector triggers — toggle any of these to swap the
            right-side panel to the matching house-level spec (Foundation /
            TieColumns / Centuri / Roof). Click the active one again to
            clear back to the Room panel. */}
        <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden />
        {structuralTools.map((tool) => (
          <button
            key={tool.panel}
            onClick={() => setStructuralPanel(structuralPanel === tool.panel ? null : tool.panel)}
            title={tool.label}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              structuralPanel === tool.panel
                ? 'bg-brand-500 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tool.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden />
        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
          title={t.editor.toolExportPdf}
          className="px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pdfLoading ? t.editor.exportPdfLoading : t.editor.toolExportPdf}
        </button>
        <button
          onClick={handleDownloadIfc}
          disabled={ifcLoading}
          title={t.editor.toolExportIfc}
          className="px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {ifcLoading ? t.editor.exportIfcLoading : t.editor.toolExportIfc}
        </button>
        <button
          onClick={handleDownloadPermitDoc}
          disabled={permitDocLoading}
          title={t.editor.toolExportPermitDoc}
          className="px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {permitDocLoading ? t.editor.exportPermitDocLoading : t.editor.toolExportPermitDoc}
        </button>
        <button
          onClick={() => setShowImportModal(true)}
          title={t.floorPlanImport.toolImport}
          className="px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors text-gray-600 hover:bg-gray-100"
        >
          {t.floorPlanImport.toolImport}
        </button>
      </div>

      {showImportModal && activeProjectId && (
        <ImportFloorPlanModal
          projectId={activeProjectId}
          onClose={() => setShowImportModal(false)}
        />
      )}

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

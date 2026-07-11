'use client'

import { useEffect, useState } from 'react'
import { FloorPlanCanvas } from './FloorPlanCanvas'
import { EditorToolbar } from './EditorToolbar'
import { RoomPanel } from './RoomPanel'
import { WallLayerPanel } from './WallLayerPanel'
import { FoundationPanel } from './FoundationPanel'
import { TieColumnsPanel } from './TieColumnsPanel'
import { CenturiPanel } from './CenturiPanel'
import { RoofPanel } from './RoofPanel'
import { LintelPanel } from './LintelPanel'
import { CostBoqPanel } from './CostBoqPanel'
import { StaircasePanel } from './StaircasePanel'
import { CollaborationPanel } from './CollaborationPanel'
import { Viewer3D } from '@/components/viewer3d/Viewer3D'
import { AiChat } from '@/components/ai/AiChat'
import { useHouse } from '@/hooks/useProjects'
import { useProjectStore } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'

type MobilePanel = 'chat' | 'plan' | 'properties'

export function EditorLayout({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: house } = useHouse(projectId)
  const {
    setHouse,
    setActiveProject,
    selectedWallId,
    selectedOpeningId,
    structuralPanel,
    viewMode,
  } = useProjectStore()
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('plan')

  useEffect(() => {
    setActiveProject(projectId)
    if (house) setHouse(house)
  }, [projectId, house, setActiveProject, setHouse])

  const mobileTabs: { panel: MobilePanel; label: string }[] = [
    { panel: 'chat', label: t.editor.mobileTabChat },
    { panel: 'plan', label: t.editor.mobileTabPlan },
    { panel: 'properties', label: t.editor.mobileTabProperties },
  ]

  return (
    <div className="flex flex-col h-full bg-gray-100 overflow-hidden">
      {/* Mobile panel switcher — the 3-column layout doesn't fit under lg */}
      <div className="lg:hidden flex bg-white border-b border-gray-200">
        {mobileTabs.map((tab) => (
          <button
            key={tab.panel}
            onClick={() => setMobilePanel(tab.panel)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              mobilePanel === tab.panel
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: AI Chat */}
        <div
          className={`${
            mobilePanel === 'chat' ? 'flex' : 'hidden'
          } lg:flex w-full lg:w-72 bg-white lg:border-r border-gray-200 flex-col overflow-hidden`}
        >
          <div className="hidden lg:block border-b border-gray-100 px-4 py-3">
            <h3 className="font-medium text-sm text-gray-700">{t.editor.aiAssistantTitle}</h3>
          </div>
          <AiChat projectId={projectId} />
        </div>

        {/* Center: Canvas */}
        <div
          className={`${
            mobilePanel === 'plan' ? 'flex' : 'hidden'
          } lg:flex flex-1 min-w-0 flex-col overflow-hidden`}
        >
          <EditorToolbar />
          <div className="flex-1 overflow-hidden">
            {viewMode === '3d' ? <Viewer3D /> : <FloorPlanCanvas />}
          </div>
        </div>

        {/* Right: Properties / wall-assembly panel */}
        <div
          className={`${
            mobilePanel === 'properties' ? 'block' : 'hidden'
          } lg:block w-full lg:w-64 bg-white lg:border-l border-gray-200 overflow-y-auto`}
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="font-medium text-sm text-gray-700">{panelTitle(t, {
              selectedWallId,
              selectedOpeningId,
              structuralPanel,
            })}</h3>
          </div>
          {renderRightPanel({
            selectedWallId,
            selectedOpeningId,
            structuralPanel,
            projectId,
          })}
        </div>
      </div>
    </div>
  )
}

interface PanelSelectionState {
  selectedWallId: string | null
  selectedOpeningId: string | null
  structuralPanel: ReturnType<typeof useProjectStore.getState>['structuralPanel']
}

/** Right-side panel header title. Precedence: structural inspector > opening > wall > default properties. */
function panelTitle(
  t: ReturnType<typeof useTranslation>['t'],
  { selectedWallId, selectedOpeningId, structuralPanel }: PanelSelectionState,
): string {
  if (structuralPanel === 'foundation') return t.editor.structuralInspector.foundation.title
  if (structuralPanel === 'tie-columns') return t.editor.structuralInspector.tieColumns.title
  if (structuralPanel === 'centuri') return t.editor.structuralInspector.centuri.title
  if (structuralPanel === 'roof') return t.editor.structuralInspector.roof.title
  if (structuralPanel === 'cost-boq') return t.editor.costBoqPanel.title
  if (structuralPanel === 'staircase') return t.editor.structuralInspector.staircase.title
  if (structuralPanel === 'collaboration') return t.collaboration.title
  if (selectedOpeningId) return t.editor.structuralInspector.lintel.title
  if (selectedWallId) return t.editor.layerPanel.title
  return t.editor.propertiesTitle
}

/** Which right-side panel to render. Same precedence as panelTitle. */
function renderRightPanel({
  selectedWallId,
  selectedOpeningId,
  structuralPanel,
  projectId,
}: PanelSelectionState & { projectId: string }) {
  if (structuralPanel === 'foundation') return <FoundationPanel />
  if (structuralPanel === 'tie-columns') return <TieColumnsPanel />
  if (structuralPanel === 'centuri') return <CenturiPanel />
  if (structuralPanel === 'roof') return <RoofPanel />
  if (structuralPanel === 'cost-boq') return <CostBoqPanel />
  if (structuralPanel === 'staircase') return <StaircasePanel />
  if (structuralPanel === 'collaboration') return <CollaborationPanel projectId={projectId} />
  if (selectedOpeningId) return <LintelPanel />
  if (selectedWallId) return <WallLayerPanel />
  return <RoomPanel projectId={projectId} />
}

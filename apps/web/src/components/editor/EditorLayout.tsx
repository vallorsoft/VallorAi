'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { EditorToolbar } from './EditorToolbar'
import { RoomPanel } from './RoomPanel'
import { WallLayerPanel } from './WallLayerPanel'
import { Viewer3D } from '@/components/viewer3d/Viewer3D'
import { AiChat } from '@/components/ai/AiChat'
import { useHouse } from '@/hooks/useProjects'
import { useProjectStore } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'

// react-konva's optional Node "canvas" dependency isn't installed, so a server render of
// FloorPlanCanvas throws on a hard/direct hit of the editor route — load it client-only.
const FloorPlanCanvas = dynamic(
  () => import('./FloorPlanCanvas').then((m) => m.FloorPlanCanvas),
  { ssr: false },
)

type MobilePanel = 'chat' | 'plan' | 'properties'

export function EditorLayout({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: house } = useHouse(projectId)
  const { setHouse, setActiveProject, selectedWallId, viewMode } = useProjectStore()
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
            <h3 className="font-medium text-sm text-gray-700">
              {selectedWallId ? t.editor.layerPanel.title : t.editor.propertiesTitle}
            </h3>
          </div>
          {selectedWallId ? <WallLayerPanel /> : <RoomPanel projectId={projectId} />}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect } from 'react'
import { FloorPlanCanvas } from './FloorPlanCanvas'
import { EditorToolbar } from './EditorToolbar'
import { RoomPanel } from './RoomPanel'
import { WallLayerPanel } from './WallLayerPanel'
import { AiChat } from '@/components/ai/AiChat'
import { useHouse } from '@/hooks/useProjects'
import { useProjectStore } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'

export function EditorLayout({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: house } = useHouse(projectId)
  const { setHouse, setActiveProject, selectedWallId } = useProjectStore()

  useEffect(() => {
    setActiveProject(projectId)
    if (house) setHouse(house)
  }, [projectId, house, setActiveProject, setHouse])

  return (
    <div className="flex h-full bg-gray-100 overflow-hidden">
      {/* Left: AI Chat */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-medium text-sm text-gray-700">{t.editor.aiAssistantTitle}</h3>
        </div>
        <AiChat projectId={projectId} />
      </div>

      {/* Center: Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <EditorToolbar />
        <div className="flex-1 overflow-hidden">
          <FloorPlanCanvas />
        </div>
      </div>

      {/* Right: Properties / wall-assembly panel */}
      <div className="w-64 bg-white border-l border-gray-200 overflow-y-auto">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-medium text-sm text-gray-700">
            {selectedWallId ? t.editor.layerPanel.title : t.editor.propertiesTitle}
          </h3>
        </div>
        {selectedWallId ? <WallLayerPanel /> : <RoomPanel projectId={projectId} />}
      </div>
    </div>
  )
}

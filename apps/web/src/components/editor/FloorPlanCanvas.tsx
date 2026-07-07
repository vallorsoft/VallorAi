'use client'

import { useRef } from 'react'
import { Stage, Layer, Rect, Line, Text, Group } from 'react-konva'
import { useProjectStore } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'

const SCALE = 40 // pixels per meter
const GRID = 1   // grid every 1m

const ROOM_COLORS: Record<string, string> = {
  LIVING_ROOM: '#dbeafe',
  BEDROOM: '#fae8ff',
  MASTER_BEDROOM: '#ede9fe',
  KITCHEN: '#fef9c3',
  BATHROOM: '#dcfce7',
  TOILET: '#d1fae5',
  CORRIDOR: '#f3f4f6',
  DEFAULT: '#f0f9ff',
}

export function FloorPlanCanvas() {
  const { house, selectRoom, selectedRoomId, selectWall, selectedWallId } = useProjectStore()
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const width = containerRef.current?.clientWidth ?? 800
  const height = containerRef.current?.clientHeight ?? 600

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-50">
      <Stage width={width} height={height}>
        {/* Grid layer */}
        <Layer>
          {Array.from({ length: Math.ceil(width / (GRID * SCALE)) }).map((_, i) => (
            <Line
              key={`vg${i}`}
              points={[i * GRID * SCALE, 0, i * GRID * SCALE, height]}
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: Math.ceil(height / (GRID * SCALE)) }).map((_, i) => (
            <Line
              key={`hg${i}`}
              points={[0, i * GRID * SCALE, width, i * GRID * SCALE]}
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
          ))}
        </Layer>

        {/* Rooms layer */}
        <Layer>
          {house?.rooms.map((room) => {
            const x = (room.posX ?? 0) * SCALE + 40
            const y = (room.posY ?? 0) * SCALE + 40
            const w = room.width * SCALE
            const h = (room.area / room.width) * SCALE
            const selected = selectedRoomId === room.id
            const fill = ROOM_COLORS[room.type] ?? ROOM_COLORS.DEFAULT

            return (
              <Group key={room.id} onClick={() => selectRoom(room.id)}>
                <Rect
                  x={x} y={y} width={w} height={h}
                  fill={fill}
                  stroke={selected ? '#0ea5e9' : '#94a3b8'}
                  strokeWidth={selected ? 2 : 1}
                  cornerRadius={2}
                />
                <Text
                  x={x + 4} y={y + 4}
                  text={room.name}
                  fontSize={11}
                  fill="#374151"
                />
                <Text
                  x={x + 4} y={y + h - 16}
                  text={`${room.area}m²`}
                  fontSize={10}
                  fill="#6b7280"
                />
              </Group>
            )
          })}
        </Layer>

        {/* Walls layer */}
        <Layer>
          {house?.walls.map((wall) => {
            const selected = selectedWallId === wall.id
            return (
              <Line
                key={wall.id}
                points={[
                  wall.startX * SCALE + 40,
                  wall.startY * SCALE + 40,
                  wall.endX * SCALE + 40,
                  wall.endY * SCALE + 40,
                ]}
                stroke={selected ? '#0ea5e9' : '#1e293b'}
                strokeWidth={wall.thickness ? wall.thickness * SCALE : 4}
                hitStrokeWidth={Math.max(20, wall.thickness ? wall.thickness * SCALE : 4)}
                lineCap="round"
                onClick={() => selectWall(wall.id)}
                onTap={() => selectWall(wall.id)}
              />
            )
          })}
        </Layer>
      </Stage>

      {!house && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none">
          {t.editor.emptyCanvasHint}
        </div>
      )}
    </div>
  )
}

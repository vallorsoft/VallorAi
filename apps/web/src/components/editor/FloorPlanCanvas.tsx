'use client'

import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Line, Text, Group, Circle } from 'react-konva'
import type Konva from 'konva'
import { useProjectStore } from '@/store/project.store'
import { useAddWall } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

const SCALE = 40 // pixels per meter
const GRID = 1   // grid every 1m
const CANVAS_ORIGIN_PX = 40 // world-origin offset inside the stage

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

/** Screen (canvas px) → world (m). Symmetric with `worldToPx` below. */
function pxToWorld(px: number): number {
  return (px - CANVAS_ORIGIN_PX) / SCALE
}

function worldToPx(world: number): number {
  return world * SCALE + CANVAS_ORIGIN_PX
}

export function FloorPlanCanvas() {
  const {
    house,
    activeProjectId,
    selectRoom,
    selectedRoomId,
    selectWall,
    selectedWallId,
    activeFloor,
    editorMode,
    setEditorMode,
    wallPlacementStart,
    setWallPlacementStart,
  } = useProjectStore()
  const { t } = useTranslation()
  const addWall = useAddWall(house?.id, activeProjectId)
  // One level at a time — the toolbar's floor switcher picks which; the 3D
  // view is the one that shows all floors (stacked by elevation).
  const rooms = house?.rooms.filter((room) => room.floor === activeFloor) ?? []
  const walls = house?.walls.filter((wall) => wall.floor === activeFloor) ?? []
  const containerRef = useRef<HTMLDivElement>(null)
  const [{ width, height }, setSize] = useState({ width: 800, height: 600 })
  const [cursorPx, setCursorPx] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setSize({ width: el.clientWidth, height: el.clientHeight })
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const addingWall = editorMode === 'add-wall'

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!addingWall || !house) return
    const stage = e.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
    const worldX = pxToWorld(pointer.x)
    const worldY = pxToWorld(pointer.y)

    if (!wallPlacementStart) {
      setWallPlacementStart({ x: worldX, y: worldY })
      return
    }
    // Second click: guard against a degenerate zero-length click (e.g. an
    // accidental double-click on the same pixel).
    const dx = worldX - wallPlacementStart.x
    const dy = worldY - wallPlacementStart.y
    if (Math.hypot(dx, dy) < 0.1) return

    addWall.mutate(
      {
        startX: wallPlacementStart.x,
        startY: wallPlacementStart.y,
        endX: worldX,
        endY: worldY,
        floor: activeFloor,
        // Interior partition is the safe default for a user-drawn wall — the
        // task explicitly allows a plain interior default rather than a
        // per-canvas exterior toggle. A user who wants an exterior wall can
        // switch its type in the wall inspector later.
        isExterior: false,
      },
      {
        onSuccess: () => {
          setWallPlacementStart(null)
          setEditorMode('select')
        },
      },
    )
  }

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!addingWall) return
    const stage = e.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
    setCursorPx({ x: pointer.x, y: pointer.y })
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-50 overflow-hidden">
      <Stage
        width={width}
        height={height}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onMouseMove={handleStageMouseMove}
        style={{ cursor: addingWall ? 'crosshair' : 'default' }}
      >
        {/* Grid layer */}
        <Layer listening={false}>
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
          {rooms.map((room) => {
            const x = (room.posX ?? 0) * SCALE + CANVAS_ORIGIN_PX
            const y = (room.posY ?? 0) * SCALE + CANVAS_ORIGIN_PX
            const w = room.width * SCALE
            const h = (room.area / room.width) * SCALE
            const selected = selectedRoomId === room.id
            const fill = ROOM_COLORS[room.type] ?? ROOM_COLORS.DEFAULT

            return (
              <Group key={room.id} onClick={() => !addingWall && selectRoom(room.id)}>
                <Rect
                  x={x} y={y} width={w} height={h}
                  fill={fill}
                  stroke={selected ? '#0ea5e9' : '#94a3b8'}
                  strokeWidth={selected ? 2 : 1}
                  cornerRadius={2}
                  listening={!addingWall}
                />
                <Text
                  x={x + 4} y={y + 4}
                  text={room.name}
                  fontSize={11}
                  fill="#374151"
                  listening={false}
                />
                <Text
                  x={x + 4} y={y + h - 16}
                  text={`${room.area}m²`}
                  fontSize={10}
                  fill="#6b7280"
                  listening={false}
                />
              </Group>
            )
          })}
        </Layer>

        {/* Walls layer */}
        <Layer>
          {walls.map((wall) => {
            const selected = selectedWallId === wall.id
            return (
              <Line
                key={wall.id}
                points={[
                  worldToPx(wall.startX),
                  worldToPx(wall.startY),
                  worldToPx(wall.endX),
                  worldToPx(wall.endY),
                ]}
                stroke={selected ? '#0ea5e9' : '#1e293b'}
                strokeWidth={wall.thickness ? wall.thickness * SCALE : 4}
                hitStrokeWidth={Math.max(20, wall.thickness ? wall.thickness * SCALE : 4)}
                lineCap="round"
                onClick={() => !addingWall && selectWall(wall.id)}
                onTap={() => !addingWall && selectWall(wall.id)}
                listening={!addingWall}
              />
            )
          })}
        </Layer>

        {/* Add-wall placement preview */}
        {addingWall && wallPlacementStart && (
          <Layer listening={false}>
            <Circle
              x={worldToPx(wallPlacementStart.x)}
              y={worldToPx(wallPlacementStart.y)}
              radius={4}
              fill="#0ea5e9"
            />
            {cursorPx && (
              <Line
                points={[
                  worldToPx(wallPlacementStart.x),
                  worldToPx(wallPlacementStart.y),
                  cursorPx.x,
                  cursorPx.y,
                ]}
                stroke="#0ea5e9"
                strokeWidth={2}
                dash={[6, 4]}
              />
            )}
          </Layer>
        )}
      </Stage>

      {addingWall && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none bg-white/95 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 shadow-sm">
          {wallPlacementStart
            ? t.editor.addWallHintSecondClick
            : t.editor.addWallHintFirstClick}
        </div>
      )}

      {!house && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none">
          {t.editor.emptyCanvasHint}
        </div>
      )}
    </div>
  )
}

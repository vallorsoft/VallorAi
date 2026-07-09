'use client'

import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Line, Text, Group } from 'react-konva'
import type Konva from 'konva'
import { useProjectStore } from '@/store/project.store'
import { useAddRoom, useAddWall } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

const SCALE = 40 // pixels per meter
const GRID = 1   // grid every 1m
const ORIGIN_PX = 40 // canvas offset of the plan origin
/** Drawing snap step, meters — half the visual grid. */
const SNAP_M = 0.5

// Default footprint for a room placed by hand in the editor (the AI flow
// sizes rooms from suggested_area_sqm instead) — a starting rectangle the
// user resizes in RoomPanel, not a spec value.
const NEW_ROOM_WIDTH_M = 4
const NEW_ROOM_DEPTH_M = 3

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

const snap = (m: number) => Math.round(m / SNAP_M) * SNAP_M
const toWorldM = (px: number) => (px - ORIGIN_PX) / SCALE

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
  } = useProjectStore()
  const { t } = useTranslation()
  const addWall = useAddWall(activeProjectId)
  const addRoom = useAddRoom(activeProjectId)
  // One level at a time — the toolbar's floor switcher picks which; the 3D
  // view is the one that shows all floors (stacked by elevation).
  const rooms = house?.rooms.filter((room) => room.floor === activeFloor) ?? []
  const walls = house?.walls.filter((wall) => wall.floor === activeFloor) ?? []
  const containerRef = useRef<HTMLDivElement>(null)
  const [{ width, height }, setSize] = useState({ width: 800, height: 600 })
  // In-progress wall: first click anchors the start, pointer previews the
  // run, second click commits.
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)

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

  // Esc cancels the in-progress wall (and leaves the drawing mode).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setWallStart(null)
      setEditorMode('select')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setEditorMode])

  // Leaving draw mode drops any half-drawn wall.
  useEffect(() => {
    if (editorMode !== 'add-wall') setWallStart(null)
  }, [editorMode])

  const stagePointer = (e: Konva.KonvaEventObject<MouseEvent | Event>) => {
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return null
    return { x: snap(toWorldM(pos.x)), y: snap(toWorldM(pos.y)) }
  }

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent | Event>) => {
    if (!house || addWall.isPending || addRoom.isPending) return
    const point = stagePointer(e)
    if (!point) return

    if (editorMode === 'add-wall') {
      if (!wallStart) {
        setWallStart(point)
        return
      }
      if (point.x === wallStart.x && point.y === wallStart.y) return
      addWall.mutate({
        houseId: house.id,
        startX: wallStart.x,
        startY: wallStart.y,
        endX: point.x,
        endY: point.y,
        floor: activeFloor,
      })
      // Chain: the finished wall's end anchors the next one.
      setWallStart(point)
      return
    }

    if (editorMode === 'add-room') {
      addRoom.mutate({
        houseId: house.id,
        type: 'BEDROOM',
        name: t.editor.newRoomName,
        floor: activeFloor,
        area: NEW_ROOM_WIDTH_M * NEW_ROOM_DEPTH_M,
        width: NEW_ROOM_WIDTH_M,
        height: 2.7,
        posX: point.x,
        posY: point.y,
      })
      setEditorMode('select')
    }
  }

  const drawing = editorMode !== 'select'
  const hint =
    editorMode === 'add-wall'
      ? t.editor.wallDrawHint
      : editorMode === 'add-room'
        ? t.editor.roomPlaceHint
        : null

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-gray-50 overflow-hidden ${drawing ? 'cursor-crosshair' : ''}`}
    >
      <Stage
        width={width}
        height={height}
        onClick={drawing ? handleStageClick : undefined}
        onTap={drawing ? handleStageClick : undefined}
        onMouseMove={
          editorMode === 'add-wall' && wallStart
            ? (e) => setPointer(stagePointer(e))
            : undefined
        }
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
        <Layer listening={!drawing}>
          {rooms.map((room) => {
            const x = (room.posX ?? 0) * SCALE + ORIGIN_PX
            const y = (room.posY ?? 0) * SCALE + ORIGIN_PX
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
        <Layer listening={!drawing}>
          {walls.map((wall) => {
            const selected = selectedWallId === wall.id
            return (
              <Line
                key={wall.id}
                points={[
                  wall.startX * SCALE + ORIGIN_PX,
                  wall.startY * SCALE + ORIGIN_PX,
                  wall.endX * SCALE + ORIGIN_PX,
                  wall.endY * SCALE + ORIGIN_PX,
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

        {/* In-progress wall preview */}
        {editorMode === 'add-wall' && wallStart && (
          <Layer listening={false}>
            <Line
              points={[
                wallStart.x * SCALE + ORIGIN_PX,
                wallStart.y * SCALE + ORIGIN_PX,
                (pointer ?? wallStart).x * SCALE + ORIGIN_PX,
                (pointer ?? wallStart).y * SCALE + ORIGIN_PX,
              ]}
              stroke="#0ea5e9"
              strokeWidth={0.3 * SCALE}
              opacity={0.5}
              lineCap="round"
              dash={[8, 6]}
            />
          </Layer>
        )}
      </Stage>

      {hint && house && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-gray-900/80 px-3 py-1.5 text-xs text-white pointer-events-none">
          {hint}
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

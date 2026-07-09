'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  generateCenturaStirrupInstances,
  generateTieColumnStirrupInstances,
} from '@ai-home-designer/bim-engine'
import {
  fetchCenturi,
  fetchTieColumns,
  type CenturaRow,
  type ElementReinforcementSpec,
  type TieColumnRow,
} from '@/hooks/useProjects'
import type { House } from '@/store/project.store'

/**
 * Vertical distance between floor levels — must match HouseScene's
 * LEVEL_HEIGHT_M so a stirrup pool at floor F lines up with the walls at
 * that floor. Kept in sync by copying the value; if this ever drifts,
 * both need to move together (a per-floor slab/storey model is the real
 * fix, still not built).
 */
const LEVEL_HEIGHT_M = 2.7
const MM_PER_M = 1000

/**
 * One instance pool per floor — every stirrup shares the same unit
 * cylinder + steel material, so draw calls stay bounded like the
 * longitudinal-rebar pools. Loop count / segment count live in the
 * per-instance matrices (4 segments per stirrup loop).
 */
export interface StirrupPool {
  key: string
  floor: number
  count: number
  matrices: Float32Array
}

export interface StirrupInstancesState {
  pools: StirrupPool[]
  computing: boolean
  totalLoops: number
  totalSegments: number
}

const EMPTY_STATE: StirrupInstancesState = {
  pools: [],
  computing: false,
  totalLoops: 0,
  totalSegments: 0,
}

function stirrupSpec(specs: ElementReinforcementSpec[] | undefined) {
  return specs?.find((s) => s.role === 'STIRRUP')
}

/**
 * Fetches every tie-column + centură on the house (auto-provisioned by
 * the API on first read) and derives per-floor stirrup instance-matrix
 * pools from their STIRRUP-role ReinforcementSpec rows via bim-engine.
 * Runs on the main thread — the total loop count for an ordinary house is
 * in the low hundreds (a stirrup every 150mm along each confining
 * element), well below the worker threshold the brick path needs. Same
 * activation latch as useRebarInstances: once detail tier has been
 * requested, data stays warm.
 */
export function useStirrupInstances(house: House | null, active: boolean): StirrupInstancesState {
  const [activated, setActivated] = useState(false)
  useEffect(() => {
    if (active) setActivated(true)
  }, [active])

  const houseId = house?.id ?? null
  const wallsById = useMemo(() => {
    const map = new Map<string, House['walls'][number]>()
    for (const wall of house?.walls ?? []) map.set(wall.id, wall)
    return map
  }, [house])

  const tieColumnsQuery = useQuery<TieColumnRow[]>({
    queryKey: ['tie-columns', houseId],
    queryFn: () => fetchTieColumns(houseId as string),
    enabled: activated && !!houseId,
    staleTime: 5 * 60 * 1000,
  })
  const centuriQuery = useQuery<CenturaRow[]>({
    queryKey: ['centuri', houseId],
    queryFn: () => fetchCenturi(houseId as string),
    enabled: activated && !!houseId,
    staleTime: 5 * 60 * 1000,
  })
  const loading =
    activated && (tieColumnsQuery.isLoading || centuriQuery.isLoading)

  return useMemo(() => {
    if (!activated) return EMPTY_STATE

    const perFloor = new Map<number, { count: number; loops: number; buffers: Float32Array[] }>()
    let totalLoops = 0
    let totalSegments = 0

    const pushBuffer = (floor: number, count: number, matrices: Float32Array) => {
      if (count === 0) return
      const pool = perFloor.get(floor) ?? { count: 0, loops: 0, buffers: [] }
      pool.count += count
      pool.loops += count / 4
      pool.buffers.push(matrices)
      perFloor.set(floor, pool)
      totalLoops += count / 4
      totalSegments += count
    }

    for (const column of tieColumnsQuery.data ?? []) {
      const spec = stirrupSpec(column.reinforcementSpecs)
      if (!spec) continue
      // Vertical tie-column spanning one storey. Pool at column.floor —
      // HouseScene wraps the pool in a floor-elevation group so matrices
      // are computed in floor-local coordinates (baseY = 0).
      const { count, matrices } = generateTieColumnStirrupInstances(
        {
          posXMm: column.posX * MM_PER_M,
          posZMm: column.posY * MM_PER_M,
          baseYMm: 0,
          lengthMm: LEVEL_HEIGHT_M * MM_PER_M,
          crossSectionAMm: column.crossSectionMm,
          crossSectionBMm: column.crossSectionMm,
        },
        {
          diameterMm: spec.barDiameterMm,
          spacingMm: spec.spacingMm,
          coverMm: spec.coverMm,
          role: spec.role,
        },
      )
      pushBuffer(column.floor, count, matrices)
    }

    for (const centura of centuriQuery.data ?? []) {
      const spec = stirrupSpec(centura.reinforcementSpecs)
      if (!spec) continue
      const wall = wallsById.get(centura.wallId)
      if (!wall) continue
      // Centura sits at the top of its level's wall: top Y at
      // (level + 1) × LEVEL_HEIGHT_M in absolute coords, i.e.
      // LEVEL_HEIGHT_M - heightMm from the pool's own base. Pool is keyed
      // by the centura's own level so the "above the top floor" extra
      // centură renders one storey higher than its host wall.
      const centuraTopInPoolM = LEVEL_HEIGHT_M
      const baseYMm = (centuraTopInPoolM - centura.heightMm / MM_PER_M) * MM_PER_M
      const { count, matrices } = generateCenturaStirrupInstances(
        {
          startXMm: wall.startX * MM_PER_M,
          startZMm: wall.startY * MM_PER_M,
          endXMm: wall.endX * MM_PER_M,
          endZMm: wall.endY * MM_PER_M,
          baseYMm,
          heightMm: centura.heightMm,
          thicknessMm: centura.widthMm,
          crossSectionHeightMm: centura.heightMm,
        },
        {
          diameterMm: spec.barDiameterMm,
          spacingMm: spec.spacingMm,
          coverMm: spec.coverMm,
          role: spec.role,
        },
      )
      pushBuffer(centura.level, count, matrices)
    }

    const pools: StirrupPool[] = []
    for (const [floor, { count, buffers }] of perFloor) {
      const matrices = new Float32Array(count * 16)
      let offset = 0
      for (const buffer of buffers) {
        matrices.set(buffer, offset)
        offset += buffer.length
      }
      pools.push({ key: `stirrup|${floor}`, floor, count, matrices })
    }

    return { pools, computing: loading, totalLoops, totalSegments }
  }, [activated, tieColumnsQuery.data, centuriQuery.data, wallsById, loading])
}

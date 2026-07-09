'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  composeSegmentInstanceMatrices,
  composeWorldBoxMatrices,
  generateColumnRebarSegments,
  generateRunLongitudinalSegments,
  generateRunStirrupSegments,
  type RebarSegmentMm,
  type WorldBoxMm,
} from '@ai-home-designer/bim-engine'
import { useCenturi, useTieColumns } from '@/hooks/useProjects'
import type { House } from '@/store/project.store'
import type { RebarPool } from './useRebarInstances'

/**
 * Confining-element concrete volumes (tie-column shafts, centură prisms) as
 * one unit-box InstancedMesh pool per floor — rendered translucent so the
 * rebar cages inside read (the usual BIM reinforcement-view convention,
 * same as WallMesh's translucent mode).
 */
export interface ConcretePool {
  key: string
  floor: number
  count: number
  matrices: Float32Array
}

export interface StructuralInstancesState {
  concretePools: ConcretePool[]
  /** Steel cage segments (bars + stirrup loop sides), pooled per floor. */
  steelPools: RebarPool[]
  computing: boolean
  tieColumnCount: number
  centuraCount: number
  /** Closed stirrup loops across all elements (each rendered as 4 segments). */
  stirrupCount: number
}

const EMPTY_STATE: StructuralInstancesState = {
  concretePools: [],
  steelPools: [],
  computing: false,
  tieColumnCount: 0,
  centuraCount: 0,
  stirrupCount: 0,
}

/** Matches HouseScene's LEVEL_HEIGHT_M placeholder stacking constant. */
const FALLBACK_LEVEL_HEIGHT_M = 2.7

/**
 * Fetches the house's auto-provisioned tie-columns + centuri and turns them
 * into per-floor concrete-box and steel-segment instance pools. Element
 * counts are tens, not thousands, so composition runs on the main thread
 * (same reasoning as useRebarInstances); the same activation latch keeps
 * data warm once detail tier has been requested.
 */
export function useStructuralInstances(
  house: House | null,
  active: boolean,
): StructuralInstancesState {
  const [activated, setActivated] = useState(false)
  useEffect(() => {
    if (active) setActivated(true)
  }, [active])

  const houseId = house?.id ?? null
  const tieColumnsQuery = useTieColumns(houseId, activated)
  const centuriQuery = useCenturi(houseId, activated)
  const loading = activated && (tieColumnsQuery.isLoading || centuriQuery.isLoading)
  const tieColumns = tieColumnsQuery.data
  const centuri = centuriQuery.data
  const walls = house?.walls

  return useMemo(() => {
    if (!activated || !walls) return EMPTY_STATE

    const wallById = new Map(walls.map((w) => [w.id, w]))
    // Column height per floor: the tallest wall standing on it.
    const floorHeightM = new Map<number, number>()
    for (const wall of walls) {
      floorHeightM.set(wall.floor, Math.max(floorHeightM.get(wall.floor) ?? 0, wall.height))
    }

    const boxesPerFloor = new Map<number, WorldBoxMm[]>()
    const segmentsPerFloor = new Map<number, RebarSegmentMm[]>()
    const pushBox = (floor: number, box: WorldBoxMm) => {
      const list = boxesPerFloor.get(floor) ?? []
      list.push(box)
      boxesPerFloor.set(floor, list)
    }
    const pushSegments = (floor: number, segs: RebarSegmentMm[]) => {
      const list = segmentsPerFloor.get(floor) ?? []
      list.push(...segs)
      segmentsPerFloor.set(floor, list)
    }

    let stirrupCount = 0

    for (const column of tieColumns ?? []) {
      const heightMm = (floorHeightM.get(column.floor) ?? FALLBACK_LEVEL_HEIGHT_M) * 1000
      const centerXMm = column.posX * 1000
      const centerZMm = column.posY * 1000
      pushBox(column.floor, {
        centerXMm,
        centerYMm: heightMm / 2,
        centerZMm,
        sizeXMm: column.crossSectionMm,
        sizeYMm: heightMm,
        sizeZMm: column.crossSectionMm,
        rotationYRad: 0,
      })

      const longitudinal = column.reinforcementSpecs.find((s) => s.role === 'LONGITUDINAL')
      const stirrup = column.reinforcementSpecs.find((s) => s.role === 'STIRRUP')
      if (!longitudinal || !stirrup) continue
      const segments = generateColumnRebarSegments(
        { centerXMm, centerZMm, baseYMm: 0, heightMm, crossSectionMm: column.crossSectionMm },
        {
          barCount: longitudinal.barCount ?? 4,
          diameterMm: longitudinal.barDiameterMm,
          coverMm: longitudinal.coverMm,
        },
        {
          diameterMm: stirrup.barDiameterMm,
          spacingMm: stirrup.spacingMm,
          coverMm: stirrup.coverMm,
        },
      )
      stirrupCount += segments.filter((s) => s.diameterMm === stirrup.barDiameterMm).length / 4
      pushSegments(column.floor, segments)
    }

    for (const centura of centuri ?? []) {
      const wall = wallById.get(centura.wallId)
      if (!wall) continue
      const wallHeightMm = wall.height * 1000
      // A centură at its wall's own level caps the wall (replaces the top
      // masonry band); the extra above-top-floor level sits on the wall top.
      const baseYMm = centura.level === wall.floor ? wallHeightMm - centura.heightMm : wallHeightMm
      const run = {
        startXMm: wall.startX * 1000,
        startZMm: wall.startY * 1000,
        endXMm: wall.endX * 1000,
        endZMm: wall.endY * 1000,
        baseYMm,
        heightMm: centura.heightMm,
        widthMm: centura.widthMm,
      }
      const dx = run.endXMm - run.startXMm
      const dz = run.endZMm - run.startZMm
      const lengthMm = Math.hypot(dx, dz)
      if (lengthMm === 0) continue
      pushBox(wall.floor, {
        centerXMm: (run.startXMm + run.endXMm) / 2,
        centerYMm: baseYMm + centura.heightMm / 2,
        centerZMm: (run.startZMm + run.endZMm) / 2,
        sizeXMm: lengthMm,
        sizeYMm: centura.heightMm,
        sizeZMm: centura.widthMm,
        rotationYRad: -Math.atan2(dz, dx),
      })

      const longitudinal = centura.reinforcementSpecs.find((s) => s.role === 'LONGITUDINAL')
      const stirrup = centura.reinforcementSpecs.find((s) => s.role === 'STIRRUP')
      if (!longitudinal || !stirrup) continue
      const longSegments = generateRunLongitudinalSegments(run, {
        barCount: longitudinal.barCount ?? 4,
        diameterMm: longitudinal.barDiameterMm,
        coverMm: longitudinal.coverMm,
      })
      const stirrupSegments = generateRunStirrupSegments(run, {
        diameterMm: stirrup.barDiameterMm,
        spacingMm: stirrup.spacingMm,
        coverMm: stirrup.coverMm,
      })
      stirrupCount += stirrupSegments.length / 4
      pushSegments(wall.floor, [...longSegments, ...stirrupSegments])
    }

    const concretePools: ConcretePool[] = []
    for (const [floor, boxes] of boxesPerFloor) {
      const { count, matrices } = composeWorldBoxMatrices(boxes)
      if (count > 0) concretePools.push({ key: `structural-concrete|${floor}`, floor, count, matrices })
    }
    const steelPools: RebarPool[] = []
    for (const [floor, segments] of segmentsPerFloor) {
      const { count, matrices } = composeSegmentInstanceMatrices(segments)
      if (count > 0) steelPools.push({ key: `structural-steel|${floor}`, floor, count, matrices })
    }

    return {
      concretePools,
      steelPools,
      computing: loading,
      tieColumnCount: tieColumns?.length ?? 0,
      centuraCount: centuri?.length ?? 0,
      stirrupCount: Math.round(stirrupCount),
    }
  }, [activated, walls, tieColumns, centuri, loading])
}

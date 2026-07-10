'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Matrix4, Vector3, Quaternion, Euler } from 'three'
import { fetchTieColumns, type TieColumnRow } from '@/hooks/useProjects'
import type { House } from '@/store/project.store'

/**
 * Vertical distance between floor levels — must match HouseScene's
 * LEVEL_HEIGHT_M so a tie-column pool at floor F lines up with the walls at
 * that floor. Same rendering-constant caveat as the stirrup pool: no per-
 * floor slab/storey model yet, so the two constants move together by copy.
 */
const LEVEL_HEIGHT_M = 2.7
const MM_PER_M = 1000

/**
 * One InstancedMesh per floor — every tie-column body shares one unit-box
 * geometry + one concrete material, so draw calls stay bounded like the
 * stirrup / rebar / brick pools. Cross-section and storey height live in the
 * per-instance matrix scales.
 */
export interface TieColumnPool {
  key: string
  floor: number
  count: number
  matrices: Float32Array
}

export interface TieColumnInstancesState {
  pools: TieColumnPool[]
  computing: boolean
  totalColumns: number
}

const EMPTY_STATE: TieColumnInstancesState = {
  pools: [],
  computing: false,
  totalColumns: 0,
}

/**
 * Fetches every tie-column on the house (auto-provisioned by the API on
 * first read — S1 corners/intersections + S2 mid-span + S3 large-opening
 * jambs per CR6-2013) and produces per-floor instance-matrix pools for
 * their concrete bodies. Same activation latch as the stirrup hook — once
 * this component has been rendered once (any LOD tier), data stays warm.
 *
 * Positioning: each column body is a unit box scaled to
 * `crossSectionMm × storeyHeight × crossSectionMm`, translated to
 * (posX, storeyHeight/2, posY) in the pool's floor-local frame. Rotation is
 * identity — S1/S2/S3 columns are all axis-aligned by construction (CR6-2013
 * detailing).
 */
export function useTieColumnInstances(
  house: House | null,
  active: boolean,
): TieColumnInstancesState {
  const [activated, setActivated] = useState(false)
  useEffect(() => {
    if (active) setActivated(true)
  }, [active])

  const houseId = house?.id ?? null
  const query = useQuery<TieColumnRow[]>({
    queryKey: ['tie-columns', houseId],
    queryFn: () => fetchTieColumns(houseId as string),
    enabled: activated && !!houseId,
    staleTime: 5 * 60 * 1000,
  })
  const loading = activated && query.isLoading

  return useMemo(() => {
    if (!activated) return EMPTY_STATE

    const perFloor = new Map<number, { count: number; matrices: number[] }>()
    let totalColumns = 0

    const scratchMatrix = new Matrix4()
    const scratchPos = new Vector3()
    const scratchQuat = new Quaternion().setFromEuler(new Euler(0, 0, 0))
    const scratchScale = new Vector3()

    for (const column of query.data ?? []) {
      const sideM = column.crossSectionMm / MM_PER_M
      const storeyHeight = LEVEL_HEIGHT_M
      scratchPos.set(column.posX, storeyHeight / 2, column.posY)
      scratchScale.set(sideM, storeyHeight, sideM)
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale)

      const pool = perFloor.get(column.floor) ?? { count: 0, matrices: [] }
      // Column-major 4×4 (three's Matrix4#elements is column-major).
      for (let i = 0; i < 16; i++) pool.matrices.push(scratchMatrix.elements[i])
      pool.count += 1
      perFloor.set(column.floor, pool)
      totalColumns += 1
    }

    const pools: TieColumnPool[] = []
    for (const [floor, { count, matrices }] of perFloor) {
      pools.push({
        key: `tie-column|${floor}`,
        floor,
        count,
        matrices: new Float32Array(matrices),
      })
    }

    return { pools, computing: loading, totalColumns }
  }, [activated, query.data, loading])
}

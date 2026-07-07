'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { brickModuleFromSpecSheet, type BrickModule } from '@ai-home-designer/bim-engine'
import { fetchWallLayers, type WallAssemblyLayer } from '@/hooks/useProjects'
import type { House, Wall } from '@/store/project.store'
import type {
  BrickWorkerRequest,
  BrickWorkerResponse,
  BrickWorkerWallJob,
} from './brick-worker-protocol'

/**
 * One instancing pool per (material × floor) — never per wall — so draw calls
 * stay bounded no matter how many walls the house has (CLAUDE.md BIM-detail
 * step 6).
 */
export interface BrickPool {
  key: string
  materialCategory: string
  materialName: string
  floor: number
  count: number
  matrices: Float32Array
  cutFlags: Uint8Array
}

interface CachedWallBricks {
  cacheKey: string
  materialId: string
  materialCategory: string
  materialName: string
  brickWidthM: number
  floor: number
  count: number
  matrices: Float32Array
  cutFlags: Uint8Array
}

export interface BrickInstancesState {
  pools: BrickPool[]
  /** Per-wall brick block width (m), for walls that render as bricks — used for the mortar-core box. */
  brickWalls: Map<string, { brickWidthM: number }>
  /** True while layer data or worker results are still outstanding. */
  computing: boolean
  totalBricks: number
}

const EMPTY_STATE: BrickInstancesState = {
  pools: [],
  brickWalls: new Map(),
  computing: false,
  totalBricks: 0,
}

interface WallBrickSpec {
  wall: Wall
  cacheKey: string
  materialId: string
  materialCategory: string
  materialName: string
  brick: BrickModule
}

function structuralBrickSpec(wall: Wall, layers: WallAssemblyLayer[]): WallBrickSpec | null {
  const structural = layers.find((layer) => layer.function === 'STRUCTURAL')
  if (!structural) return null
  const brick = brickModuleFromSpecSheet(structural.material.specSheet)
  if (!brick) return null
  const cacheKey = JSON.stringify([
    wall.id,
    wall.startX,
    wall.startY,
    wall.endX,
    wall.endY,
    wall.height,
    wall.thickness,
    structural.material.id,
    brick,
  ])
  return {
    wall,
    cacheKey,
    materialId: structural.material.id,
    materialCategory: structural.material.category,
    materialName: structural.material.name,
    brick,
  }
}

/**
 * Computes per-brick instance matrices for every wall of the house whose
 * STRUCTURAL layer has real unit-masonry geometry in its material specSheet.
 * Generation runs in a Web Worker; results are cached by wall id + layer-spec
 * hash so re-entering detail mode (or an unrelated house update) never
 * recomputes unchanged walls.
 */
export function useBrickInstances(house: House | null, active: boolean): BrickInstancesState {
  // Latch: once detail mode has been requested, keep data warm for the rest
  // of the session so tier flapping doesn't refetch/recompute anything.
  const [activated, setActivated] = useState(false)
  useEffect(() => {
    if (active) setActivated(true)
  }, [active])

  const walls = useMemo(() => house?.walls ?? [], [house])

  const layerQueries = useQueries({
    queries: walls.map((wall) => ({
      queryKey: ['wall-layers', wall.id],
      queryFn: () => fetchWallLayers(wall.id),
      enabled: activated,
      staleTime: 5 * 60 * 1000,
    })),
  })
  const layersLoading = activated && layerQueries.some((q) => q.isLoading)

  const specs = useMemo(() => {
    if (!activated) return []
    const result: WallBrickSpec[] = []
    walls.forEach((wall, i) => {
      const layers = layerQueries[i]?.data
      if (!layers) return
      const spec = structuralBrickSpec(wall, layers)
      if (spec) result.push(spec)
    })
    return result
    // layerQueries is a new array each render; depend on the data references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activated, walls, ...layerQueries.map((q) => q.data)])

  const cacheRef = useRef(new Map<string, CachedWallBricks>())
  const pendingKeysRef = useRef(new Set<string>())
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const [cacheVersion, setCacheVersion] = useState(0)
  const [inFlight, setInFlight] = useState(0)

  useEffect(() => {
    if (!activated || workerRef.current) return
    const worker = new Worker(new URL('./brick-layout.worker.ts', import.meta.url))
    worker.addEventListener('message', (event: MessageEvent) => {
      const response = event.data as BrickWorkerResponse
      for (const result of response.results) {
        pendingKeysRef.current.delete(result.cacheKey)
        const existing = cacheRef.current.get(result.wallId)
        // The spec metadata for this result was stashed on the pending entry.
        if (existing && existing.cacheKey === result.cacheKey) {
          cacheRef.current.set(result.wallId, {
            ...existing,
            count: result.count,
            matrices: result.matrices,
            cutFlags: result.cutFlags,
          })
        }
      }
      setInFlight((n) => Math.max(0, n - response.results.length))
      setCacheVersion((v) => v + 1)
    })
    workerRef.current = worker
  }, [activated])

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = null
    },
    [],
  )

  useEffect(() => {
    const worker = workerRef.current
    if (!activated || !worker || specs.length === 0) return

    const jobs: BrickWorkerWallJob[] = []
    for (const spec of specs) {
      const cached = cacheRef.current.get(spec.wall.id)
      if (cached?.cacheKey === spec.cacheKey) continue
      if (pendingKeysRef.current.has(spec.cacheKey)) continue
      pendingKeysRef.current.add(spec.cacheKey)
      // Placeholder entry (count 0) carrying the spec metadata; the worker
      // response fills in the buffers.
      cacheRef.current.set(spec.wall.id, {
        cacheKey: spec.cacheKey,
        materialId: spec.materialId,
        materialCategory: spec.materialCategory,
        materialName: spec.materialName,
        brickWidthM: spec.brick.widthMm / 1000,
        floor: spec.wall.floor,
        count: 0,
        matrices: new Float32Array(0),
        cutFlags: new Uint8Array(0),
      })
      jobs.push({
        wallId: spec.wall.id,
        cacheKey: spec.cacheKey,
        startX: spec.wall.startX,
        startZ: spec.wall.startY,
        endX: spec.wall.endX,
        endZ: spec.wall.endY,
        heightM: spec.wall.height,
        thicknessM: spec.wall.thickness,
        brick: spec.brick,
      })
    }
    if (jobs.length === 0) return

    requestIdRef.current += 1
    const request: BrickWorkerRequest = { requestId: requestIdRef.current, jobs }
    setInFlight((n) => n + jobs.length)
    worker.postMessage(request)
  }, [activated, specs, cacheVersion])

  return useMemo(() => {
    if (!activated) return EMPTY_STATE

    const wallIds = new Set(walls.map((w) => w.id))
    const specByWall = new Map(specs.map((s) => [s.wall.id, s]))
    const poolMap = new Map<string, { meta: CachedWallBricks; entries: CachedWallBricks[] }>()
    const brickWalls = new Map<string, { brickWidthM: number }>()

    for (const [wallId, cached] of cacheRef.current) {
      if (!wallIds.has(wallId)) continue
      const spec = specByWall.get(wallId)
      if (!spec || spec.cacheKey !== cached.cacheKey || cached.count === 0) continue
      const poolKey = `${cached.materialId}|${cached.floor}`
      const pool = poolMap.get(poolKey) ?? { meta: cached, entries: [] }
      pool.entries.push(cached)
      poolMap.set(poolKey, pool)
      brickWalls.set(wallId, { brickWidthM: cached.brickWidthM })
    }

    const pools: BrickPool[] = []
    let totalBricks = 0
    for (const [poolKey, { meta, entries }] of poolMap) {
      const count = entries.reduce((sum, e) => sum + e.count, 0)
      const matrices = new Float32Array(count * 16)
      const cutFlags = new Uint8Array(count)
      let offset = 0
      for (const entry of entries) {
        matrices.set(entry.matrices, offset * 16)
        cutFlags.set(entry.cutFlags, offset)
        offset += entry.count
      }
      totalBricks += count
      pools.push({
        key: poolKey,
        materialCategory: meta.materialCategory,
        materialName: meta.materialName,
        floor: meta.floor,
        count,
        matrices,
        cutFlags,
      })
    }

    return {
      pools,
      brickWalls,
      computing: layersLoading || inFlight > 0,
      totalBricks,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activated, walls, specs, cacheVersion, layersLoading, inFlight])
}

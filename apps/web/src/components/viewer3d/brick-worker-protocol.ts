import type { BrickModule } from '@ai-home-designer/bim-engine'

/**
 * Message protocol between useBrickInstances and brick-layout.worker.
 * Kept in its own module so both sides share the types without the hook
 * importing the worker entry file itself.
 */

/** A door/window rectangle on the wall, wall-local, meters (see store Opening). */
export interface BrickWorkerOpening {
  position: number
  width: number
  height: number
  sillHeight: number
}

export interface BrickWorkerWallJob {
  wallId: string
  /** Cache key computed on the main thread (wall geometry + opening + layer spec hash). */
  cacheKey: string
  /** Wall placement in the house's local coordinates, meters (scene units). */
  startX: number
  startZ: number
  endX: number
  endZ: number
  heightM: number
  thicknessM: number
  brick: BrickModule
  openings: BrickWorkerOpening[]
}

export interface BrickWorkerRequest {
  requestId: number
  jobs: BrickWorkerWallJob[]
}

export interface BrickWorkerWallResult {
  wallId: string
  cacheKey: string
  count: number
  /** Column-major 4×4 instance matrices, meters — see bim-engine instancing.ts. */
  matrices: Float32Array
  cutFlags: Uint8Array
}

export interface BrickWorkerResponse {
  requestId: number
  results: BrickWorkerWallResult[]
}

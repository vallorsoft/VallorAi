import { generateWallBrickInstances } from '@ai-home-designer/bim-engine'
import type {
  BrickWorkerRequest,
  BrickWorkerResponse,
  BrickWorkerWallResult,
} from './brick-worker-protocol'

// Instance-transform generation runs here, off the main thread, so turning on
// brick detail never janks the UI (see CLAUDE.md BIM-detail step 6). The
// resulting buffers are handed back as transferables — zero-copy.

const workerScope = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  postMessage(message: unknown, transfer?: Transferable[]): void
}

workerScope.addEventListener('message', (event: MessageEvent) => {
  const request = event.data as BrickWorkerRequest
  const results: BrickWorkerWallResult[] = []
  const transfer: Transferable[] = []

  for (const job of request.jobs) {
    const { count, matrices, cutFlags } = generateWallBrickInstances(
      {
        startXMm: job.startX * 1000,
        startZMm: job.startZ * 1000,
        endXMm: job.endX * 1000,
        endZMm: job.endZ * 1000,
        baseYMm: 0,
        heightMm: job.heightM * 1000,
        thicknessMm: job.thicknessM * 1000,
      },
      job.brick,
    )
    results.push({ wallId: job.wallId, cacheKey: job.cacheKey, count, matrices, cutFlags })
    transfer.push(matrices.buffer, cutFlags.buffer)
  }

  const response: BrickWorkerResponse = { requestId: request.requestId, results }
  workerScope.postMessage(response, transfer)
})

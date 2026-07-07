import type { RebarBarSpec, RebarQuantity, RebarInstanceTransform } from './types'

// Longitudinal reinforcement only in this module — stirrups/étriers need a
// distinct bent-loop geometry and are a separate, later step (see plan).
// Steel density per SR 438-1:2012-class reinforcing steel.
const STEEL_DENSITY_KG_M3 = 7850

function weightPerMeterKg(diameterMm: number): number {
  const areaM2 = Math.PI * (diameterMm / 2000) ** 2
  return areaM2 * STEEL_DENSITY_KG_M3
}

export interface RebarElementDimensions {
  /** Length of the element along the reinforced axis (e.g. a wall/footing run). */
  lengthMm: number
  /** Width across which longitudinal bars are distributed (e.g. footing width, wall thickness). */
  widthMm: number
}

export function calculateLongitudinalRebarQuantity(
  element: RebarElementDimensions,
  spec: RebarBarSpec,
): RebarQuantity {
  const usableWidth = element.widthMm - 2 * spec.coverMm
  const barCount = Math.max(1, Math.floor(usableWidth / spec.spacingMm) + 1)
  const barLengthMm = element.lengthMm - 2 * spec.coverMm
  const totalLengthMm = barCount * barLengthMm
  const totalWeightKg = (totalLengthMm / 1000) * weightPerMeterKg(spec.diameterMm)

  return { barCount, totalLengthMm, totalWeightKg }
}

export function generateLongitudinalRebarLayout(
  element: RebarElementDimensions,
  spec: RebarBarSpec,
): RebarInstanceTransform[] {
  const { barCount } = calculateLongitudinalRebarQuantity(element, spec)
  const barLengthMm = element.lengthMm - 2 * spec.coverMm
  const usableWidth = element.widthMm - 2 * spec.coverMm

  const instances: RebarInstanceTransform[] = []
  for (let i = 0; i < barCount; i++) {
    const zMm = barCount === 1 ? element.widthMm / 2 : spec.coverMm + (usableWidth * i) / (barCount - 1)
    instances.push({
      xMm: element.lengthMm / 2,
      yMm: spec.coverMm, // near the bottom face; a full layout would offset top/bottom mats separately
      zMm,
      lengthMm: barLengthMm,
      diameterMm: spec.diameterMm,
      rotationDeg: 0,
    })
  }
  return instances
}

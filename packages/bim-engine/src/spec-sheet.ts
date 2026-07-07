import type { BrickModule } from './types'

/**
 * Default mortar joint dimensions per NE 001/1996 / C 126-75 (the same
 * researched defaults the API cost engine uses) for masonry materials whose
 * specSheet doesn't state its own. Tongue-and-groove (N+F) blocks have no
 * vertical mortar joint per the manufacturer's laying instructions, so their
 * head joint defaults to 0 when `specSheet.tongueAndGroove` is true.
 */
export const DEFAULT_BED_JOINT_MM = 12
export const DEFAULT_HEAD_JOINT_MM = 10

function asPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function asNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Derive the geometric BrickModule for a masonry material from its
 * `Material.specSheet` JSON (the seeded GENERIC_DEFAULT materials carry
 * `lengthMm`/`widthMm`/`heightMm` from their real datasheet/standard — see
 * packages/database/prisma/seed.ts). Returns null when the specSheet has no
 * complete unit geometry, i.e. the layer is not unit masonry (concrete,
 * insulation, render…) and has no per-brick representation.
 */
export function brickModuleFromSpecSheet(specSheet: Record<string, unknown>): BrickModule | null {
  const lengthMm = asPositiveNumber(specSheet.lengthMm)
  const heightMm = asPositiveNumber(specSheet.heightMm)
  const widthMm = asPositiveNumber(specSheet.widthMm)
  if (lengthMm === null || heightMm === null || widthMm === null) return null

  const tongueAndGroove = specSheet.tongueAndGroove === true
  const bedJointMm = asNonNegativeNumber(specSheet.bedJointMm) ?? DEFAULT_BED_JOINT_MM
  const headJointMm =
    asNonNegativeNumber(specSheet.headJointMm) ?? (tongueAndGroove ? 0 : DEFAULT_HEAD_JOINT_MM)

  return { lengthMm, heightMm, widthMm, bedJointMm, headJointMm }
}

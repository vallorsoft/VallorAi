// Plain, framework-agnostic types — no `three`, no Prisma. Callers (apps/api
// for cost calculation, apps/web for 3D rendering) map their own domain
// models into these shapes before calling into bim-engine, and map the
// results back out. This keeps bim-engine testable in plain Node and keeps
// `three`/WebGL entirely out of its dependency tree (see plan risk: server
// should never need a 3D rendering dependency just to compute a quantity).

export interface BrickModule {
  /** Along the wall's length axis. */
  lengthMm: number
  /** Vertical, per course. */
  heightMm: number
  /** Through the wall's thickness — for a "38-as" block this is 380. */
  widthMm: number
  /** Horizontal bed (mortar) joint between courses. */
  bedJointMm: number
  /** Vertical head joint between bricks in a course — 0 for tongue-and-groove (N+F) blocks. */
  headJointMm: number
}

export interface WallDimensions {
  lengthMm: number
  heightMm: number
  thicknessMm: number
}

export interface BrickQuantity {
  /** Whole-brick instances (openings not yet accounted for — see bim-engine roadmap step 7). */
  wholeBrickCount: number
  /** Courses in the wall height. */
  courseCount: number
}

export interface BrickInstanceTransform {
  /** Position of the brick's center, wall-local coordinates in mm. */
  xMm: number
  yMm: number
  /** Course index from the bottom, 0-based. */
  course: number
  lengthMm: number
  heightMm: number
  widthMm: number
  /** True if this unit was trimmed to fit (e.g. at a wall end) rather than a full module. */
  isCut: boolean
}

export type RebarRole = 'LONGITUDINAL' | 'STIRRUP'

export interface RebarBarSpec {
  diameterMm: number
  spacingMm: number
  coverMm: number
  role: RebarRole
}

export interface RebarQuantity {
  barCount: number
  totalLengthMm: number
  totalWeightKg: number
}

export interface RebarInstanceTransform {
  xMm: number
  yMm: number
  zMm: number
  lengthMm: number
  diameterMm: number
  /** Rotation about the wall/element's long axis, in degrees — 0 = parallel to length. */
  rotationDeg: number
}

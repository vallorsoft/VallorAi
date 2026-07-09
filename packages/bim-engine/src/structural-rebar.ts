import { rebarWeightPerMeterKg } from './rebar'

// Stirrup (etrier) + confining-element rebar geometry — BIM-detail step 9.
//
// A stirrup is a bent closed loop confining a column/beam cross-section, not
// a straight bar, so it gets its own calc distinct from rebar.ts's
// longitudinal mats. For rendering, each loop is decomposed into 4 straight
// segments placed on the loop's centerline rectangle — the same unit-cylinder
// InstancedMesh convention rebar-instancing.ts already uses, so the viewer
// needs no new geometry type. Corner bend radii (EN 1992-1-1 §8.3 mandrel
// diameters) and end hooks/anchorage are NOT modeled: no confirmed
// primary-source values were found for the hook allowance, so quantities are
// centerline-perimeter based and explicitly documented as excluding the hook
// allowance rather than guessing one (Key rule 7).

const MM_PER_M = 1000

/**
 * One straight rebar segment already placed in world coordinates (the 3D
 * viewer's axis convention: plan X/Y → scene X/Z, Y up), in millimeters.
 */
export interface RebarSegmentMm {
  fromXMm: number
  fromYMm: number
  fromZMm: number
  toXMm: number
  toYMm: number
  toZMm: number
  diameterMm: number
}

export interface SegmentInstancingResult {
  count: number
  /**
   * Column-major 4×4 matrices, 16 floats per instance, METERS — usable as an
   * InstancedMesh.instanceMatrix buffer over the same unit cylinder as
   * rebar-instancing.ts (CylinderGeometry(0.5, 0.5, 1), axis local Y).
   */
  matrices: Float32Array
}

/**
 * Compose instance matrices for arbitrary already-placed straight segments.
 * Unlike composeRebarInstanceMatrices (which is wall-frame-relative), this
 * takes world-space endpoints, so one pool can mix segments from many
 * differently-oriented elements (columns, ring beams, loops).
 */
export function composeSegmentInstanceMatrices(segments: RebarSegmentMm[]): SegmentInstancingResult {
  const matrices = new Float32Array(segments.length * 16)
  let count = 0

  for (const seg of segments) {
    const ax = seg.toXMm - seg.fromXMm
    const ay = seg.toYMm - seg.fromYMm
    const az = seg.toZMm - seg.fromZMm
    const lenMm = Math.hypot(ax, ay, az)
    if (lenMm === 0) continue

    // Unit axis d, plus two perpendicular unit vectors u/w spanning the
    // cross-section. Reference "up" flips to X for near-vertical segments.
    const dx = ax / lenMm
    const dy = ay / lenMm
    const dz = az / lenMm
    let rx = 0
    let ry = 1
    let rz = 0
    if (Math.abs(dy) > 0.9) {
      rx = 1
      ry = 0
    }
    // u = normalize(r × d), w = d × u
    let ux = ry * dz - rz * dy
    let uy = rz * dx - rx * dz
    let uz = rx * dy - ry * dx
    const uLen = Math.hypot(ux, uy, uz)
    ux /= uLen
    uy /= uLen
    uz /= uLen
    const wx = dy * uz - dz * uy
    const wy = dz * ux - dx * uz
    const wz = dx * uy - dy * ux

    const dM = seg.diameterMm / MM_PER_M
    const lM = lenMm / MM_PER_M
    const o = count * 16
    // Column 0: local X → u × Ø
    matrices[o] = ux * dM
    matrices[o + 1] = uy * dM
    matrices[o + 2] = uz * dM
    // Column 1: local Y (cylinder axis) → d × length
    matrices[o + 4] = dx * lM
    matrices[o + 5] = dy * lM
    matrices[o + 6] = dz * lM
    // Column 2: local Z → w × Ø
    matrices[o + 8] = wx * dM
    matrices[o + 9] = wy * dM
    matrices[o + 10] = wz * dM
    // Translation: segment midpoint, meters
    matrices[o + 12] = (seg.fromXMm + seg.toXMm) / 2 / MM_PER_M
    matrices[o + 13] = (seg.fromYMm + seg.toYMm) / 2 / MM_PER_M
    matrices[o + 14] = (seg.fromZMm + seg.toZMm) / 2 / MM_PER_M
    matrices[o + 15] = 1
    count++
  }

  return { count, matrices: matrices.subarray(0, count * 16) as Float32Array }
}

export interface StirrupSpecMm {
  diameterMm: number
  spacingMm: number
  coverMm: number
}

export interface StirrupQuantity {
  /** Number of closed loops along the run. */
  count: number
  /**
   * Centerline length of ONE loop, mm — the rectangle perimeter at the
   * stirrup bar's centerline. Excludes the end-hook/anchorage allowance
   * (no cited primary-source value — documented gap, not guessed).
   */
  loopLengthMm: number
  totalWeightKg: number
}

/**
 * Positions of stirrup loops along a run, mm from the run's start. The first
 * and last loops sit `endOffsetMm` in from the run ends (the concrete cover —
 * a geometric necessity, not a code-cited end distance), and intermediate
 * loops are spaced evenly so no gap exceeds `spacingMm` — the same
 * conservative even-spacing stance detectMidSpanTieColumns takes.
 */
export function generateStirrupPositionsMm(
  runLengthMm: number,
  spacingMm: number,
  endOffsetMm: number,
): number[] {
  const usable = runLengthMm - 2 * endOffsetMm
  if (usable <= 0) return [runLengthMm / 2]
  const intervals = Math.max(1, Math.ceil(usable / spacingMm))
  const positions: number[] = []
  for (let i = 0; i <= intervals; i++) {
    positions.push(endOffsetMm + (usable * i) / intervals)
  }
  return positions
}

/**
 * Stirrup steel quantity for a prismatic element (tie-column, centură, RC
 * wall): loops of `spec.diameterMm` confining a `crossSection` (outer
 * concrete dimensions), repeated along `runLengthMm`.
 */
export function calculateStirrupQuantity(
  runLengthMm: number,
  crossSection: { widthMm: number; heightMm: number },
  spec: StirrupSpecMm,
): StirrupQuantity {
  const count = generateStirrupPositionsMm(runLengthMm, spec.spacingMm, spec.coverMm).length
  // Loop centerline rectangle: outer face sits at the cover depth, so the
  // centerline is inset a further half bar diameter on each face.
  const w = crossSection.widthMm - 2 * spec.coverMm - spec.diameterMm
  const h = crossSection.heightMm - 2 * spec.coverMm - spec.diameterMm
  const loopLengthMm = Math.max(0, 2 * (w + h))
  const totalWeightKg = count * (loopLengthMm / 1000) * rebarWeightPerMeterKg(spec.diameterMm)
  return { count, loopLengthMm, totalWeightKg }
}

/** 4 straight segments tracing one rectangular loop centerline. */
function loopSegments(
  corners: [number, number, number][],
  diameterMm: number,
): RebarSegmentMm[] {
  const segs: RebarSegmentMm[] = []
  for (let i = 0; i < 4; i++) {
    const [fx, fy, fz] = corners[i]
    const [tx, ty, tz] = corners[(i + 1) % 4]
    segs.push({ fromXMm: fx, fromYMm: fy, fromZMm: fz, toXMm: tx, toYMm: ty, toZMm: tz, diameterMm })
  }
  return segs
}

export interface ColumnPlacementMm {
  centerXMm: number
  centerZMm: number
  /** Elevation of the column base (0 = its floor's level, pool-local). */
  baseYMm: number
  heightMm: number
  /** Square cross-section side (TIE_COLUMN_CROSS_SECTION_MM). */
  crossSectionMm: number
}

export interface ColumnLongitudinalSpecMm {
  barCount: number
  diameterMm: number
  coverMm: number
}

/**
 * A vertical confining column's full rebar cage as world-space segments:
 * corner longitudinal bars (the ordinary 4-corner arrangement — counts
 * beyond 4 are clamped to the corners; no tie-column today carries more)
 * plus horizontal stirrup loops along the height. Anchorage beyond the
 * column body (into foundation/centură) is not modeled.
 */
export function generateColumnRebarSegments(
  column: ColumnPlacementMm,
  longitudinal: ColumnLongitudinalSpecMm,
  stirrup: StirrupSpecMm,
): RebarSegmentMm[] {
  const segments: RebarSegmentMm[] = []

  // Longitudinal corner bars
  const inset = longitudinal.coverMm + longitudinal.diameterMm / 2
  const half = column.crossSectionMm / 2 - inset
  const corners: [number, number][] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ]
  const barCount = Math.min(longitudinal.barCount, 4)
  for (let i = 0; i < barCount; i++) {
    const [ox, oz] = corners[i]
    segments.push({
      fromXMm: column.centerXMm + ox,
      fromYMm: column.baseYMm,
      fromZMm: column.centerZMm + oz,
      toXMm: column.centerXMm + ox,
      toYMm: column.baseYMm + column.heightMm,
      toZMm: column.centerZMm + oz,
      diameterMm: longitudinal.diameterMm,
    })
  }

  // Stirrup loops: horizontal rectangles every spacing along the height
  const loopHalf = (column.crossSectionMm - 2 * stirrup.coverMm - stirrup.diameterMm) / 2
  if (loopHalf > 0) {
    for (const y of generateStirrupPositionsMm(column.heightMm, stirrup.spacingMm, stirrup.coverMm)) {
      const yAbs = column.baseYMm + y
      segments.push(
        ...loopSegments(
          [
            [column.centerXMm - loopHalf, yAbs, column.centerZMm - loopHalf],
            [column.centerXMm + loopHalf, yAbs, column.centerZMm - loopHalf],
            [column.centerXMm + loopHalf, yAbs, column.centerZMm + loopHalf],
            [column.centerXMm - loopHalf, yAbs, column.centerZMm + loopHalf],
          ],
          stirrup.diameterMm,
        ),
      )
    }
  }

  return segments
}

/**
 * A horizontal prismatic run (centură ring beam, or an RC wall treated as
 * one confined cross-section): plan start/end points, vertical extent from
 * `baseYMm` up `heightMm`, cross-section `widthMm` across the run (the wall
 * thickness direction).
 */
export interface HorizontalRunPlacementMm {
  startXMm: number
  startZMm: number
  endXMm: number
  endZMm: number
  baseYMm: number
  heightMm: number
  widthMm: number
}

export interface RunLongitudinalSpecMm {
  barCount: number
  diameterMm: number
  coverMm: number
}

/**
 * Longitudinal bars of a horizontal run as world-space segments. Bars are
 * arranged in a bottom and a top row (the ordinary confining-beam
 * arrangement: 2+2 for the 4-bar minimum); when the derived count exceeds 4
 * (deep perimeter centură — see deriveCenturaReinforcement) the extra bars
 * are distributed evenly across the two rows' widths, bottom row first.
 * This is a rendering arrangement, not a code-cited bar schedule.
 */
export function generateRunLongitudinalSegments(
  run: HorizontalRunPlacementMm,
  spec: RunLongitudinalSpecMm,
): RebarSegmentMm[] {
  const dx = run.endXMm - run.startXMm
  const dz = run.endZMm - run.startZMm
  const lengthMm = Math.hypot(dx, dz)
  if (lengthMm === 0 || spec.barCount <= 0) return []
  const ux = dx / lengthMm
  const uz = dz / lengthMm
  // Horizontal normal across the run's width (same convention as
  // rebar-instancing.ts: p = (-uz, ux)).
  const px = -uz
  const pz = ux

  const inset = spec.coverMm + spec.diameterMm / 2
  const yBottom = run.baseYMm + inset
  const yTop = run.baseYMm + run.heightMm - inset
  const acrossHalf = run.widthMm / 2 - inset

  const bottomCount = Math.ceil(spec.barCount / 2)
  const topCount = spec.barCount - bottomCount

  const rowPositions = (count: number): number[] => {
    if (count <= 0) return []
    if (count === 1) return [0]
    const positions: number[] = []
    for (let i = 0; i < count; i++) {
      positions.push(-acrossHalf + (2 * acrossHalf * i) / (count - 1))
    }
    return positions
  }

  const segments: RebarSegmentMm[] = []
  const x0 = run.startXMm + ux * spec.coverMm
  const z0 = run.startZMm + uz * spec.coverMm
  const x1 = run.endXMm - ux * spec.coverMm
  const z1 = run.endZMm - uz * spec.coverMm
  const pushRow = (y: number, positions: number[]) => {
    for (const across of positions) {
      segments.push({
        fromXMm: x0 + px * across,
        fromYMm: y,
        fromZMm: z0 + pz * across,
        toXMm: x1 + px * across,
        toYMm: y,
        toZMm: z1 + pz * across,
        diameterMm: spec.diameterMm,
      })
    }
  }
  pushRow(yBottom, rowPositions(bottomCount))
  pushRow(yTop, rowPositions(topCount))
  return segments
}

/**
 * Stirrup loops of a horizontal run as world-space segments: rectangles in
 * the plane perpendicular to the run, every spacing along it.
 */
export function generateRunStirrupSegments(
  run: HorizontalRunPlacementMm,
  spec: StirrupSpecMm,
): RebarSegmentMm[] {
  const dx = run.endXMm - run.startXMm
  const dz = run.endZMm - run.startZMm
  const lengthMm = Math.hypot(dx, dz)
  if (lengthMm === 0) return []
  const ux = dx / lengthMm
  const uz = dz / lengthMm
  const px = -uz
  const pz = ux

  const acrossHalf = (run.widthMm - 2 * spec.coverMm - spec.diameterMm) / 2
  const yLo = run.baseYMm + spec.coverMm + spec.diameterMm / 2
  const yHi = run.baseYMm + run.heightMm - spec.coverMm - spec.diameterMm / 2
  if (acrossHalf <= 0 || yHi <= yLo) return []

  const segments: RebarSegmentMm[] = []
  for (const along of generateStirrupPositionsMm(lengthMm, spec.spacingMm, spec.coverMm)) {
    const cx = run.startXMm + ux * along
    const cz = run.startZMm + uz * along
    segments.push(
      ...loopSegments(
        [
          [cx - px * acrossHalf, yLo, cz - pz * acrossHalf],
          [cx + px * acrossHalf, yLo, cz + pz * acrossHalf],
          [cx + px * acrossHalf, yHi, cz + pz * acrossHalf],
          [cx - px * acrossHalf, yHi, cz - pz * acrossHalf],
        ],
        spec.diameterMm,
      ),
    )
  }
  return segments
}

/** An axis-placed box in world coordinates (mm), rotated about Y. */
export interface WorldBoxMm {
  centerXMm: number
  /** Elevation of the box CENTER (not base). */
  centerYMm: number
  centerZMm: number
  /** Size along the box's local X (the run direction before rotation). */
  sizeXMm: number
  sizeYMm: number
  sizeZMm: number
  rotationYRad: number
}

export interface BoxInstancingResult {
  count: number
  /** Column-major 4×4 matrices, METERS, over a unit box geometry. */
  matrices: Float32Array
}

/**
 * Compose instance matrices for world-placed boxes (tie-column shafts,
 * centură prisms) over a unit box — counterpart of
 * composeBrickInstanceMatrices for elements that aren't laid out in a wall's
 * local frame.
 */
export function composeWorldBoxMatrices(boxes: WorldBoxMm[]): BoxInstancingResult {
  const matrices = new Float32Array(boxes.length * 16)
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    const cos = Math.cos(b.rotationYRad)
    const sin = Math.sin(b.rotationYRad)
    const sx = b.sizeXMm / MM_PER_M
    const sy = b.sizeYMm / MM_PER_M
    const sz = b.sizeZMm / MM_PER_M
    const o = i * 16
    matrices[o] = cos * sx
    matrices[o + 2] = -sin * sx
    matrices[o + 5] = sy
    matrices[o + 8] = sin * sz
    matrices[o + 10] = cos * sz
    matrices[o + 12] = b.centerXMm / MM_PER_M
    matrices[o + 13] = b.centerYMm / MM_PER_M
    matrices[o + 14] = b.centerZMm / MM_PER_M
    matrices[o + 15] = 1
  }
  return { count: boxes.length, matrices }
}

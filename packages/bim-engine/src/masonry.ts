import type {
  BrickModule,
  WallDimensions,
  WallOpeningMm,
  BrickQuantity,
  BrickInstanceTransform,
} from './types'

// Running-bond (offset) coursing, per researched masonry bonding rules:
//   - Romanian normativ zidărie (P2-85): vertical joints of adjacent courses
//     must be offset — bonding is achieved by shifting each course's joints
//     by roughly half a brick length relative to the course below.
//   - Hungarian masonry guides: vertical joints must never align between
//     courses ("a függőleges fugák sosem eshetnek egymás fölé").
//
// Opening-aware coursing (BIM-detail step 7): openings subtract rectangles
// from the wall strip. Per the same bonding rules, coursing is anchored FROM
// each opening's jamb — alternating courses start against the jamb with a
// half brick, so vertical joints stay offset next to the opening and the
// leftover cut lands away from it (at the far wall end / between openings),
// which is where a mason would put it. Courses that only partially overlap an
// opening vertically (a windowsill or lintel line crossing mid-course) get
// height-cut pieces filling exactly the strip below the sill / above the
// head — centimeter-precise per Opening.position/width/height/sillHeight.

/** Cut pieces shorter/lower than this read as a mortar-filled gap, not a brick sliver. */
const MIN_CUT_MM = 10
const EPS_MM = 0.5

function moduleLength(brick: BrickModule): number {
  return brick.lengthMm + brick.headJointMm
}

function courseHeight(brick: BrickModule): number {
  return brick.heightMm + brick.bedJointMm
}

interface IntervalMm {
  x0: number
  x1: number
}

/** Clamp openings into the wall strip and drop degenerate ones. */
function normalizeOpenings(wall: WallDimensions, openings: WallOpeningMm[]): WallOpeningMm[] {
  const result: WallOpeningMm[] = []
  for (const opening of openings) {
    const x0 = Math.max(0, opening.positionMm)
    const x1 = Math.min(wall.lengthMm, opening.positionMm + opening.widthMm)
    const y0 = Math.max(0, opening.sillHeightMm)
    const y1 = Math.min(wall.heightMm, opening.sillHeightMm + opening.heightMm)
    if (x1 - x0 > EPS_MM && y1 - y0 > EPS_MM) {
      result.push({ positionMm: x0, widthMm: x1 - x0, heightMm: y1 - y0, sillHeightMm: y0 })
    }
  }
  return result.sort((a, b) => a.positionMm - b.positionMm)
}

/** Subtract sorted, merged blocked intervals from [0, lengthMm]. */
function freeSegments(lengthMm: number, blocked: IntervalMm[]): IntervalMm[] {
  const merged: IntervalMm[] = []
  for (const b of [...blocked].sort((a, c) => a.x0 - c.x0)) {
    const last = merged[merged.length - 1]
    if (last && b.x0 <= last.x1 + EPS_MM) last.x1 = Math.max(last.x1, b.x1)
    else merged.push({ ...b })
  }
  const free: IntervalMm[] = []
  let cursor = 0
  for (const b of merged) {
    if (b.x0 - cursor > EPS_MM) free.push({ x0: cursor, x1: b.x0 })
    cursor = Math.max(cursor, b.x1)
  }
  if (lengthMm - cursor > EPS_MM) free.push({ x0: cursor, x1: lengthMm })
  return free
}

interface PieceVertical {
  yMm: number
  heightMm: number
  /** True when the piece is height-cut (sill/lintel strip), forcing isCut. */
  heightCut: boolean
}

function pushPiece(
  instances: BrickInstanceTransform[],
  brick: BrickModule,
  course: number,
  vertical: PieceVertical,
  centerXMm: number,
  lengthMm: number,
) {
  if (lengthMm < MIN_CUT_MM) return
  instances.push({
    xMm: centerXMm,
    yMm: vertical.yMm,
    course,
    lengthMm,
    heightMm: vertical.heightMm,
    widthMm: brick.widthMm,
    isCut: vertical.heightCut || lengthMm < brick.lengthMm - EPS_MM,
  })
}

/**
 * Fill a course segment anchored at an opening jamb: the first piece against
 * the anchor is a half brick on odd courses (running bond staggered from the
 * jamb), whole modules follow, and the last piece is cut to fit the far end.
 */
function fillAnchoredSegment(
  instances: BrickInstanceTransform[],
  brick: BrickModule,
  course: number,
  vertical: PieceVertical,
  segment: IntervalMm,
  anchor: 'left' | 'right',
) {
  const anchorHalf = course % 2 === 1
  let first = true
  if (anchor === 'left') {
    let xStart = segment.x0
    while (segment.x1 - xStart > EPS_MM) {
      const target = first && anchorHalf ? brick.lengthMm / 2 : brick.lengthMm
      const len = Math.min(target, segment.x1 - xStart)
      pushPiece(instances, brick, course, vertical, xStart + len / 2, len)
      xStart += len
      if (segment.x1 - xStart > EPS_MM) xStart += brick.headJointMm
      first = false
    }
  } else {
    let xEnd = segment.x1
    while (xEnd - segment.x0 > EPS_MM) {
      const target = first && anchorHalf ? brick.lengthMm / 2 : brick.lengthMm
      const len = Math.min(target, xEnd - segment.x0)
      pushPiece(instances, brick, course, vertical, xEnd - len / 2, len)
      xEnd -= len
      if (xEnd - segment.x0 > EPS_MM) xEnd -= brick.headJointMm
      first = false
    }
  }
}

/**
 * Original whole-wall running-bond fill (odd courses offset by half a module
 * from the wall start) — used for courses no opening touches, so opening-free
 * walls produce byte-identical layouts to the pre-step-7 algorithm.
 */
function fillGlobalBondCourse(
  instances: BrickInstanceTransform[],
  wallLengthMm: number,
  brick: BrickModule,
  course: number,
  vertical: PieceVertical,
) {
  const offset = course % 2 === 1 ? brick.lengthMm / 2 + brick.headJointMm / 2 : 0

  let xCursor = 0
  if (offset > 0) {
    const leadLength = offset - brick.headJointMm / 2
    if (leadLength > 0) {
      instances.push({
        xMm: leadLength / 2,
        yMm: vertical.yMm,
        course,
        lengthMm: leadLength,
        heightMm: vertical.heightMm,
        widthMm: brick.widthMm,
        isCut: true,
      })
    }
    xCursor = leadLength + brick.headJointMm
  }

  while (xCursor < wallLengthMm) {
    const remaining = wallLengthMm - xCursor
    const thisLength = Math.min(brick.lengthMm, remaining)
    instances.push({
      xMm: xCursor + thisLength / 2,
      yMm: vertical.yMm,
      course,
      lengthMm: thisLength,
      heightMm: vertical.heightMm,
      widthMm: brick.widthMm,
      isCut: vertical.heightCut || thisLength < brick.lengthMm,
    })
    xCursor += thisLength + brick.headJointMm
  }
}

export function calculateBrickQuantity(
  wall: WallDimensions,
  brick: BrickModule,
  openings: WallOpeningMm[] = [],
): BrickQuantity {
  const cHeight = courseHeight(brick)
  const courseCount = Math.ceil(wall.heightMm / cHeight)
  const bricksPerCourse = Math.ceil(wall.lengthMm / moduleLength(brick))
  const holes = normalizeOpenings(wall, openings)
  if (holes.length === 0) {
    return { wholeBrickCount: courseCount * bricksPerCourse, courseCount }
  }

  // Openings present: same ceil(run length / module) arithmetic as the
  // closed form, applied per course to each run beside/under/over the
  // openings — so a wall with a window always needs at most as many modules
  // as the solid wall, never more (each cut piece still conservatively
  // consumes one purchased module, but runs shortened by an opening save
  // the modules the hole displaced).
  const modulesForRun = (runMm: number) => Math.ceil(runMm / moduleLength(brick))
  let wholeBrickCount = 0
  for (let course = 0; course < courseCount; course++) {
    const brickBottom = course * cHeight
    const brickTop = brickBottom + brick.heightMm
    const touching = holes.filter(
      (o) =>
        Math.min(brickTop, o.sillHeightMm + o.heightMm) - Math.max(brickBottom, o.sillHeightMm) >
        EPS_MM,
    )
    if (touching.length === 0) {
      wholeBrickCount += bricksPerCourse
      continue
    }
    const blocked = touching.map((o) => ({ x0: o.positionMm, x1: o.positionMm + o.widthMm }))
    for (const segment of freeSegments(wall.lengthMm, blocked)) {
      wholeBrickCount += modulesForRun(segment.x1 - segment.x0)
    }
    // Height-cut sill/lintel strips still lay (cut) bricks across the
    // opening width — those modules are consumed, not saved.
    for (const o of touching) {
      const ovB = Math.max(brickBottom, o.sillHeightMm)
      const ovT = Math.min(brickTop, o.sillHeightMm + o.heightMm)
      if (ovB - brickBottom >= MIN_CUT_MM) wholeBrickCount += modulesForRun(o.widthMm)
      if (brickTop - ovT >= MIN_CUT_MM) wholeBrickCount += modulesForRun(o.widthMm)
    }
  }
  return { wholeBrickCount, courseCount }
}

/**
 * Generates one instance transform per brick piece for a wall segment,
 * subtracting door/window openings. Courses away from every opening keep the
 * plain running bond (odd courses offset half a module); courses beside an
 * opening are re-anchored from the jamb (half brick on odd courses); courses
 * a sill/lintel line crosses get height-cut strip pieces below/above the
 * opening. Overlapping openings are not supported (invalid geometry — the
 * caller's data model treats them as distinct holes in the wall).
 */
export function generateBrickLayout(
  wall: WallDimensions,
  brick: BrickModule,
  openings: WallOpeningMm[] = [],
): BrickInstanceTransform[] {
  const instances: BrickInstanceTransform[] = []
  const cHeight = courseHeight(brick)
  const courseCount = Math.ceil(wall.heightMm / cHeight)
  const holes = normalizeOpenings(wall, openings)

  for (let course = 0; course < courseCount; course++) {
    const brickBottom = course * cHeight
    const brickTop = brickBottom + brick.heightMm
    const fullVertical: PieceVertical = {
      yMm: brickBottom + brick.heightMm / 2,
      heightMm: brick.heightMm,
      heightCut: false,
    }

    // Openings this course's brick band vertically overlaps at all block
    // full-height placement across their width.
    const touching = holes.filter(
      (o) =>
        Math.min(brickTop, o.sillHeightMm + o.heightMm) - Math.max(brickBottom, o.sillHeightMm) >
        EPS_MM,
    )

    if (touching.length === 0) {
      fillGlobalBondCourse(instances, wall.lengthMm, brick, course, fullVertical)
      continue
    }

    const blocked = touching.map((o) => ({ x0: o.positionMm, x1: o.positionMm + o.widthMm }))
    for (const segment of freeSegments(wall.lengthMm, blocked)) {
      const leftIsJamb = segment.x0 > EPS_MM
      const rightIsJamb = segment.x1 < wall.lengthMm - EPS_MM
      if (leftIsJamb) {
        fillAnchoredSegment(instances, brick, course, fullVertical, segment, 'left')
      } else if (rightIsJamb) {
        fillAnchoredSegment(instances, brick, course, fullVertical, segment, 'right')
      } else {
        fillGlobalBondCourse(instances, wall.lengthMm, brick, course, fullVertical)
      }
    }

    // Height-cut strips where the sill or head line crosses this course:
    // below the sill (windowsill bedding) and above the head (lintel soffit).
    for (const o of touching) {
      const ovB = Math.max(brickBottom, o.sillHeightMm)
      const ovT = Math.min(brickTop, o.sillHeightMm + o.heightMm)
      const xRange: IntervalMm = { x0: o.positionMm, x1: o.positionMm + o.widthMm }

      const belowHeight = ovB - brickBottom
      if (belowHeight >= MIN_CUT_MM) {
        fillAnchoredSegment(
          instances,
          brick,
          course,
          { yMm: brickBottom + belowHeight / 2, heightMm: belowHeight, heightCut: true },
          xRange,
          'left',
        )
      }

      const aboveHeight = brickTop - ovT
      if (aboveHeight >= MIN_CUT_MM) {
        fillAnchoredSegment(
          instances,
          brick,
          course,
          { yMm: ovT + aboveHeight / 2, heightMm: aboveHeight, heightCut: true },
          xRange,
          'left',
        )
      }
    }
  }

  return instances
}

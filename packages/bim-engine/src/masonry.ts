import type { BrickModule, WallDimensions, BrickQuantity, BrickInstanceTransform } from './types'

// Running-bond (offset) coursing, per researched masonry bonding rules:
//   - Romanian normativ zidărie (P2-85): vertical joints of adjacent courses
//     must be offset — bonding is achieved by shifting each course's joints
//     by roughly half a brick length relative to the course below.
//   - Hungarian masonry guides: vertical joints must never align between
//     courses ("a függőleges fugák sosem eshetnek egymás fölé").
// Opening-aware coursing (anchoring the bond from a door/window jamb, and
// generating precisely-cut half-bricks there) is a separate, later step —
// this module intentionally covers only plain, opening-free wall segments
// first, so the running-bond math and instance generation can be perf- and
// correctness-validated in isolation before that harder problem is tackled.

function moduleLength(brick: BrickModule): number {
  return brick.lengthMm + brick.headJointMm
}

function courseHeight(brick: BrickModule): number {
  return brick.heightMm + brick.bedJointMm
}

export function calculateBrickQuantity(wall: WallDimensions, brick: BrickModule): BrickQuantity {
  const courseCount = Math.ceil(wall.heightMm / courseHeight(brick))
  const bricksPerCourse = Math.ceil(wall.lengthMm / moduleLength(brick))
  return {
    wholeBrickCount: courseCount * bricksPerCourse,
    courseCount,
  }
}

/**
 * Generates one instance transform per brick for a plain, opening-free wall
 * segment. Odd courses are offset by half a brick length (running bond).
 * The brick nearest each wall end is trimmed (`isCut: true`) if the wall
 * length isn't an exact multiple of the module length.
 */
export function generateBrickLayout(
  wall: WallDimensions,
  brick: BrickModule,
): BrickInstanceTransform[] {
  const instances: BrickInstanceTransform[] = []
  const cHeight = courseHeight(brick)
  const courseCount = Math.ceil(wall.heightMm / cHeight)

  for (let course = 0; course < courseCount; course++) {
    const yMm = course * cHeight + brick.heightMm / 2
    const offset = course % 2 === 1 ? brick.lengthMm / 2 + brick.headJointMm / 2 : 0

    let xCursor = -offset
    // Leading partial brick created by the running-bond offset, if any.
    if (offset > 0) {
      const leadLength = offset - brick.headJointMm / 2
      if (leadLength > 0) {
        instances.push({
          xMm: leadLength / 2,
          yMm,
          course,
          lengthMm: leadLength,
          heightMm: brick.heightMm,
          widthMm: brick.widthMm,
          isCut: true,
        })
      }
      xCursor = leadLength + brick.headJointMm
    } else {
      xCursor = 0
    }

    while (xCursor < wall.lengthMm) {
      const remaining = wall.lengthMm - xCursor
      const thisLength = Math.min(brick.lengthMm, remaining)
      instances.push({
        xMm: xCursor + thisLength / 2,
        yMm,
        course,
        lengthMm: thisLength,
        heightMm: brick.heightMm,
        widthMm: brick.widthMm,
        isCut: thisLength < brick.lengthMm,
      })
      xCursor += thisLength + brick.headJointMm
    }
  }

  return instances
}

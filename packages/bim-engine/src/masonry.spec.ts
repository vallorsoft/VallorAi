import { calculateBrickQuantity, generateBrickLayout } from './masonry'
import type { BrickModule, WallDimensions } from './types'

describe('masonry — running-bond coursing (opening-free walls)', () => {
  const solidBrick: BrickModule = {
    lengthMm: 240,
    heightMm: 63,
    widthMm: 115,
    bedJointMm: 12,
    headJointMm: 10,
  } // STAS 2945/73

  const leier38: BrickModule = {
    lengthMm: 250,
    heightMm: 238,
    widthMm: 380,
    bedJointMm: 12,
    headJointMm: 0, // N+F tongue-and-groove — no vertical mortar joint
  }

  describe('calculateBrickQuantity', () => {
    it('matches hand-calculated course/brick counts for a solid-brick wall', () => {
      const wall: WallDimensions = { lengthMm: 1000, heightMm: 750, thicknessMm: 115 }
      const result = calculateBrickQuantity(wall, solidBrick)
      // courseHeight = 63+12 = 75 -> ceil(750/75) = 10
      // moduleLength = 240+10 = 250 -> ceil(1000/250) = 4 per course
      expect(result.courseCount).toBe(10)
      expect(result.wholeBrickCount).toBe(40)
    })

    it('matches hand-calculated counts for the Leier 38 N+F default (no head joint)', () => {
      const wall: WallDimensions = { lengthMm: 3000, heightMm: 2500, thicknessMm: 380 }
      const result = calculateBrickQuantity(wall, leier38)
      // courseHeight = 238+12 = 250 -> ceil(2500/250) = 10
      // moduleLength = 250+0 = 250 -> ceil(3000/250) = 12 per course
      expect(result.courseCount).toBe(10)
      expect(result.wholeBrickCount).toBe(120)
    })
  })

  describe('generateBrickLayout', () => {
    it('lays the bottom (even) course with no running-bond offset', () => {
      const wall: WallDimensions = { lengthMm: 1000, heightMm: 750, thicknessMm: 115 }
      const instances = generateBrickLayout(wall, solidBrick)
      const course0 = instances.filter((b) => b.course === 0)

      // 4 whole 240mm bricks exactly fill the 1000mm wall (240+10 joint = 250mm module, 4x250=1000).
      expect(course0).toHaveLength(4)
      expect(course0[0]).toMatchObject({ xMm: 120, lengthMm: 240, isCut: false })
      expect(course0[1]).toMatchObject({ xMm: 370, lengthMm: 240, isCut: false })
      expect(course0[2]).toMatchObject({ xMm: 620, lengthMm: 240, isCut: false })
      expect(course0[3]).toMatchObject({ xMm: 870, lengthMm: 240, isCut: false })
    })

    it('offsets odd courses by half a brick length (running bond)', () => {
      const wall: WallDimensions = { lengthMm: 1000, heightMm: 750, thicknessMm: 115 }
      const instances = generateBrickLayout(wall, solidBrick)
      const course1 = instances.filter((b) => b.course === 1)

      // First unit in an offset course is the leading partial brick created
      // by the half-module shift, and must be marked as cut.
      expect(course1[0].isCut).toBe(true)
      expect(course1[0].lengthMm).toBeLessThan(solidBrick.lengthMm)
    })

    it('produces contiguous, non-overlapping bricks within a course (no gaps beyond the joint)', () => {
      const wall: WallDimensions = { lengthMm: 3000, heightMm: 2500, thicknessMm: 380 }
      const instances = generateBrickLayout(wall, leier38)
      const course2 = instances
        .filter((b) => b.course === 2)
        .sort((a, b) => a.xMm - b.xMm)

      for (let i = 1; i < course2.length; i++) {
        const prevEnd = course2[i - 1].xMm + course2[i - 1].lengthMm / 2
        const thisStart = course2[i].xMm - course2[i].lengthMm / 2
        expect(thisStart - prevEnd).toBeCloseTo(leier38.headJointMm, 5)
      }
    })

    it('generates one instance set per course, matching calculateBrickQuantity within rounding', () => {
      const wall: WallDimensions = { lengthMm: 3000, heightMm: 2500, thicknessMm: 380 }
      const quantity = calculateBrickQuantity(wall, leier38)
      const instances = generateBrickLayout(wall, leier38)
      const courses = new Set(instances.map((b) => b.course))
      expect(courses.size).toBe(quantity.courseCount)
    })
  })
})

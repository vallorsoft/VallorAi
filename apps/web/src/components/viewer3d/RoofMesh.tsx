'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { deriveHippedRidgeLength } from '@ai-home-designer/bim-engine'
import type { RoofData } from './useRoof'

/** Ceramic-tile terracotta tone (Tondach standard) — non-representational stand-in. */
const ROOF_COLOR = '#a3573b'
/** The soffit under the overhang gets a plain plaster color. */
const SOFFIT_COLOR = '#f1e9d8'
/** A flat roof is a real slab — 150 mm of concrete + finish is a reasonable stand-in thickness. */
const FLAT_SLAB_THICKNESS_M = 0.15

interface RoofMeshProps {
  roof: RoofData
  /** Bounding box of the topmost floor's exterior walls (world coords, meters). */
  footprint: { minX: number; maxX: number; minZ: number; maxZ: number }
  /** World Y at the top of the topmost floor's walls. */
  baseY: number
}

/**
 * Real per-type roof geometry (BufferGeometry, no CSG):
 *
 * - GABLED: two trapezoidal slopes meeting at a full-length ridge above the
 *   center, closed by two triangular gable ends on the shorter sides.
 * - HIPPED: two trapezoidal main slopes (long sides) + two triangular hip
 *   slopes (short sides), all meeting at a shorter ridge (`long - short`, from
 *   `deriveHippedRidgeLength`). A square footprint collapses the ridge to a
 *   single apex (pyramid); the geometry code handles both smoothly.
 * - FLAT: an honest flat slab (BoxGeometry) sitting on top of the walls with
 *   overhang extended out on all four sides — replaces the prior thin-cap
 *   placeholder so the roof reads as a real flat roof, not a stand-in.
 * - MONOSLOPE (mono-pitch / pupitru): one rectangular sloped plane, high edge
 *   above one long facade, low edge above the opposite one, so runoff falls
 *   across the shorter span. The rise is `shortSide · tan(pitch)` — the full
 *   span, matching bim-engine's `deriveMonoslopeRise` (not the half-span used
 *   by the symmetric gabled/hipped types).
 *
 * Ridge / high edge runs along the footprint's longer side for every pitched
 * type — matches the widely-cited RO residential convention.
 */
export function RoofMesh({ roof, footprint, baseY }: RoofMeshProps) {
  const geometry = useMemo(() => {
    const rawWidth = footprint.maxX - footprint.minX
    const rawDepth = footprint.maxZ - footprint.minZ
    if (rawWidth <= 0 || rawDepth <= 0) return null

    const overhang = Math.max(0, roof.overhangM)
    const width = rawWidth + 2 * overhang
    const depth = rawDepth + 2 * overhang
    const centerX = (footprint.minX + footprint.maxX) / 2
    const centerZ = (footprint.minZ + footprint.maxZ) / 2

    if (roof.type === 'FLAT' || roof.pitchDeg === 0) {
      const box = new THREE.BoxGeometry(width, FLAT_SLAB_THICKNESS_M, depth)
      box.translate(centerX, baseY + FLAT_SLAB_THICKNESS_M / 2, centerZ)
      return box
    }

    // Ridge / high edge runs along the longer side; slopes fall across the shorter.
    const ridgeAlongX = width >= depth
    const longSide = ridgeAlongX ? width : depth
    const shortSide = ridgeAlongX ? depth : width
    const pitchRad = (roof.pitchDeg * Math.PI) / 180

    if (roof.type === 'MONOSLOPE') {
      return buildMonoslope({
        centerX,
        centerZ,
        baseY,
        longSide,
        shortSide,
        ridgeAlongX,
        pitchRad,
      })
    }

    if (roof.type === 'HIPPED') {
      return buildHipped({
        centerX,
        centerZ,
        baseY,
        longSide,
        shortSide,
        ridgeAlongX,
        pitchRad,
      })
    }

    // GABLED (default). Kept byte-identical to the pre-change geometry so the
    // widely-verified gable path never regresses.
    return buildGabled({
      centerX,
      centerZ,
      baseY,
      longSide,
      shortSide,
      ridgeAlongX,
      pitchRad,
    })
  }, [roof, footprint, baseY])

  if (!geometry) return null

  return (
    <>
      <mesh geometry={geometry} castShadow={false} receiveShadow={false}>
        <meshLambertMaterial color={ROOF_COLOR} side={THREE.DoubleSide} />
      </mesh>
      {roof.overhangM > 0 && roof.type !== 'FLAT' && (
        <SoffitStrips footprint={footprint} baseY={baseY} overhangM={roof.overhangM} />
      )}
    </>
  )
}

interface RoofBuildArgs {
  centerX: number
  centerZ: number
  baseY: number
  longSide: number
  shortSide: number
  /** True: ridge/high edge runs parallel to world +X. False: parallel to world +Z. */
  ridgeAlongX: boolean
  pitchRad: number
}

/**
 * Original 6-vertex gable geometry. `local` coords: ridge along local +X,
 * slopes fall along local ±Z. Rotated into world by swapping x↔z when the
 * ridge should run along Z instead.
 */
function buildGabled({
  centerX,
  centerZ,
  baseY,
  longSide,
  shortSide,
  ridgeAlongX,
  pitchRad,
}: RoofBuildArgs): THREE.BufferGeometry {
  const half = longSide / 2
  const halfSpan = shortSide / 2
  const ridgeH = halfSpan * Math.tan(pitchRad)

  const local: [number, number, number][] = [
    [-half, 0, -halfSpan], // 0 eave-A start
    [+half, 0, -halfSpan], // 1 eave-A end
    [-half, 0, +halfSpan], // 2 eave-B start
    [+half, 0, +halfSpan], // 3 eave-B end
    [-half, ridgeH, 0], // 4 ridge start
    [+half, ridgeH, 0], // 5 ridge end
  ]
  const indices = [
    // Slope A
    0, 1, 5, 0, 5, 4,
    // Slope B (winding flipped for outward normal)
    2, 5, 3, 2, 4, 5,
    // Gable ends (short sides): triangles from eaves to the ridge point.
    0, 4, 2,
    1, 3, 5,
  ]
  return assembleGeometry(local, indices, centerX, centerZ, baseY, ridgeAlongX)
}

/**
 * Hipped: same ridge height as a gable of the same footprint, but the ridge
 * ends `shortSide/2` inside from each short facade — so each short end is a
 * triangular hip slope reaching an apex on the ridge line, not a gable wall.
 *
 * A square footprint has `ridgeLength = 0`: both apexes coincide at the center
 * → pyramid. Emitted as 4 triangles from the 4 eave corners to that single
 * apex (skipping the degenerate ridge-based faces). Non-square: 2 trapezoidal
 * main slopes + 2 triangular hip slopes.
 */
function buildHipped({
  centerX,
  centerZ,
  baseY,
  longSide,
  shortSide,
  ridgeAlongX,
  pitchRad,
}: RoofBuildArgs): THREE.BufferGeometry {
  const halfLong = longSide / 2
  const halfShort = shortSide / 2
  const ridgeH = halfShort * Math.tan(pitchRad)
  const ridgeLength = deriveHippedRidgeLength({
    lengthM: longSide,
    widthM: shortSide,
  })
  const halfRidge = ridgeLength / 2

  if (halfRidge === 0) {
    // Pyramid: 4 eave corners + 1 apex.
    const local: [number, number, number][] = [
      [-halfLong, 0, -halfShort], // 0
      [+halfLong, 0, -halfShort], // 1
      [+halfLong, 0, +halfShort], // 2
      [-halfLong, 0, +halfShort], // 3
      [0, ridgeH, 0], // 4 apex
    ]
    const indices = [
      0, 1, 4, // -Z hip
      1, 2, 4, // +X hip
      2, 3, 4, // +Z hip
      3, 0, 4, // -X hip
    ]
    return assembleGeometry(local, indices, centerX, centerZ, baseY, ridgeAlongX)
  }

  const local: [number, number, number][] = [
    [-halfLong, 0, -halfShort], // 0 corner -X,-Z
    [+halfLong, 0, -halfShort], // 1 corner +X,-Z
    [+halfLong, 0, +halfShort], // 2 corner +X,+Z
    [-halfLong, 0, +halfShort], // 3 corner -X,+Z
    [-halfRidge, ridgeH, 0], // 4 ridge -X apex
    [+halfRidge, ridgeH, 0], // 5 ridge +X apex
  ]
  const indices = [
    // Main slope at -Z: corners 0,1 (eave) up to ridge 4,5.
    0, 1, 5,
    0, 5, 4,
    // Main slope at +Z: corners 3,2 (eave) up to ridge 4,5, winding flipped.
    3, 4, 5,
    3, 5, 2,
    // Hip end at -X: corners 0,3 (eave) up to ridge apex 4.
    0, 4, 3,
    // Hip end at +X: corners 1,2 (eave) up to ridge apex 5. `side: DoubleSide`
    // on the material means either winding renders — outward normal is the
    // computeVertexNormals output; the DoubleSide guard keeps the roof lit
    // from either side regardless.
    1, 5, 2,
  ]
  return assembleGeometry(local, indices, centerX, centerZ, baseY, ridgeAlongX)
}

/**
 * Monoslope: 4 corners, plane tilted so one long edge is high and the
 * opposite long edge sits at the eave. High edge along -Z in local coords
 * (arbitrary but stable — the ridge-along-X convention still puts the peak
 * over the longer side of the footprint).
 */
function buildMonoslope({
  centerX,
  centerZ,
  baseY,
  longSide,
  shortSide,
  ridgeAlongX,
  pitchRad,
}: RoofBuildArgs): THREE.BufferGeometry {
  const halfLong = longSide / 2
  const halfShort = shortSide / 2
  // shortSide · tan(pitch) — matches bim-engine's deriveMonoslopeRise, kept
  // inline because pitchRad is already in scope; the exported helper is what
  // the API + spec side use for the persisted ridgeHeightM.
  const rise = shortSide * Math.tan(pitchRad)

  const local: [number, number, number][] = [
    [-halfLong, rise, -halfShort], // 0 high, -X
    [+halfLong, rise, -halfShort], // 1 high, +X
    [-halfLong, 0, +halfShort], // 2 low, -X
    [+halfLong, 0, +halfShort], // 3 low, +X
  ]
  // Two triangles forming the sloped rectangle.
  const indices = [
    0, 1, 3,
    0, 3, 2,
  ]
  return assembleGeometry(local, indices, centerX, centerZ, baseY, ridgeAlongX)
}

function assembleGeometry(
  local: [number, number, number][],
  indices: number[],
  centerX: number,
  centerZ: number,
  baseY: number,
  ridgeAlongX: boolean,
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry()
  const positions: number[] = []
  for (const [lx, ly, lz] of local) {
    // ridgeAlongX = true keeps local +X as world +X; false rotates 90° so
    // the ridge/high edge runs along world +Z instead. Swap and negate to
    // stay right-handed (identical to the pre-change gable code).
    const wx = ridgeAlongX ? lx : lz
    const wz = ridgeAlongX ? lz : lx
    positions.push(centerX + wx, baseY + ly, centerZ + wz)
  }
  geom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
  )
  geom.setIndex(indices)
  geom.computeVertexNormals()
  return geom
}

function SoffitStrips({
  footprint,
  baseY,
  overhangM,
}: {
  footprint: RoofMeshProps['footprint']
  baseY: number
  overhangM: number
}) {
  const width = footprint.maxX - footprint.minX
  const depth = footprint.maxZ - footprint.minZ
  return (
    <>
      <mesh position={[(footprint.minX + footprint.maxX) / 2, baseY - 0.01, footprint.minZ - overhangM / 2]}>
        <boxGeometry args={[width + 2 * overhangM, 0.02, overhangM]} />
        <meshLambertMaterial color={SOFFIT_COLOR} />
      </mesh>
      <mesh position={[(footprint.minX + footprint.maxX) / 2, baseY - 0.01, footprint.maxZ + overhangM / 2]}>
        <boxGeometry args={[width + 2 * overhangM, 0.02, overhangM]} />
        <meshLambertMaterial color={SOFFIT_COLOR} />
      </mesh>
      <mesh position={[footprint.minX - overhangM / 2, baseY - 0.01, (footprint.minZ + footprint.maxZ) / 2]}>
        <boxGeometry args={[overhangM, 0.02, depth]} />
        <meshLambertMaterial color={SOFFIT_COLOR} />
      </mesh>
      <mesh position={[footprint.maxX + overhangM / 2, baseY - 0.01, (footprint.minZ + footprint.maxZ) / 2]}>
        <boxGeometry args={[overhangM, 0.02, depth]} />
        <meshLambertMaterial color={SOFFIT_COLOR} />
      </mesh>
    </>
  )
}

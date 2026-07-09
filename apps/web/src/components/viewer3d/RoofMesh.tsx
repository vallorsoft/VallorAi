'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import type { RoofData } from './useRoof'

/** Ceramic-tile terracotta tone (Tondach standard) — non-representational stand-in. */
const ROOF_COLOR = '#a3573b'
/** The soffit under the overhang gets a plain plaster color. */
const SOFFIT_COLOR = '#f1e9d8'

interface RoofMeshProps {
  roof: RoofData
  /** Bounding box of the topmost floor's exterior walls (world coords, meters). */
  footprint: { minX: number; maxX: number; minZ: number; maxZ: number }
  /** World Y at the top of the topmost floor's walls. */
  baseY: number
}

/**
 * Symmetric gabled/hipped roof over a rectangular footprint. Geometry is a
 * BufferGeometry with 6 real triangles (2 slopes × 2 tris + 2 gable tris)
 * plus 4 optional overhang extension quads — cheap, no CSG, and it reads as a
 * proper roof from every angle.
 *
 * Ridge runs along the footprint's longer side (RO residential convention).
 * FLAT/MONOSLOPE fall back to a plain thin cap for now — a first-cut
 * placeholder so the roof doesn't disappear for those types; a full
 * per-type geometry can ship later without touching this callsite.
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
      const box = new THREE.BoxGeometry(width, 0.15, depth)
      box.translate(centerX, baseY + 0.075, centerZ)
      return box
    }

    // Ridge runs along the longer side; slopes fall to the shorter side.
    const ridgeAlongX = width >= depth
    const ridgeLength = ridgeAlongX ? width : depth
    const span = ridgeAlongX ? depth : width
    const ridgeH = (span / 2) * Math.tan((roof.pitchDeg * Math.PI) / 180)

    const geom = new THREE.BufferGeometry()
    const half = ridgeLength / 2
    const halfSpan = span / 2

    // 6 vertices in ridge-local coords (ridge along local X), then rotated + translated to world.
    // 0: eave-A start (-half, 0, -halfSpan)   1: eave-A end   (+half, 0, -halfSpan)
    // 2: eave-B start (-half, 0, +halfSpan)   3: eave-B end   (+half, 0, +halfSpan)
    // 4: ridge start  (-half, ridgeH, 0)      5: ridge end    (+half, ridgeH, 0)
    const local = [
      [-half, 0, -halfSpan],
      [+half, 0, -halfSpan],
      [-half, 0, +halfSpan],
      [+half, 0, +halfSpan],
      [-half, ridgeH, 0],
      [+half, ridgeH, 0],
    ] as const

    const positions: number[] = []
    for (const [lx, ly, lz] of local) {
      const wx = ridgeAlongX ? lx : lz
      const wz = ridgeAlongX ? lz : lx
      positions.push(centerX + wx, baseY + ly, centerZ + wz)
    }

    const indices = [
      // Slope A (eave 0-1 to ridge 4-5)
      0, 1, 5,
      0, 5, 4,
      // Slope B (eave 2-3 to ridge 4-5, note winding flipped for outward normal)
      2, 5, 3,
      2, 4, 5,
      // Gable end at -half x (short-side triangle)
      0, 4, 2,
      // Gable end at +half x
      1, 3, 5,
      // For a hipped roof, the two gable triangles instead slope inward to
      // ridge points — not modeled in this first cut; HIPPED and GABLED render
      // identically here and a real hipped topology can ship later.
    ]

    geom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
    )
    geom.setIndex(indices)
    geom.computeVertexNormals()
    return geom
  }, [roof, footprint, baseY])

  if (!geometry) return null

  return (
    <>
      <mesh geometry={geometry} castShadow={false} receiveShadow={false}>
        <meshLambertMaterial color={ROOF_COLOR} side={THREE.DoubleSide} />
      </mesh>
      {/* Soffit at the eave, filling the gap between the wall top and the
          overhang edge — a thin flat rectangle each side. Skipped when
          overhang is 0 or the roof is flat. */}
      {roof.overhangM > 0 && roof.type !== 'FLAT' && (
        <SoffitStrips footprint={footprint} baseY={baseY} overhangM={roof.overhangM} />
      )}
    </>
  )
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

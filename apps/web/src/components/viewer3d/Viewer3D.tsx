'use client'

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useProjectStore } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'
import { HouseScene } from './HouseScene'

export function Viewer3D() {
  const house = useProjectStore((s) => s.house)
  const { t } = useTranslation()

  return (
    <div className="relative w-full h-full bg-gray-50">
      <Canvas camera={{ position: [14, 12, 14], fov: 45 }}>
        <color attach="background" args={['#f8fafc']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 15, 8]} intensity={0.7} />
        <gridHelper args={[60, 60, '#cbd5e1', '#e2e8f0']} />
        <Suspense fallback={null}>{house && <HouseScene house={house} />}</Suspense>
        <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      </Canvas>
      {!house && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none">
          {t.editor.emptyCanvasHint}
        </div>
      )}
    </div>
  )
}

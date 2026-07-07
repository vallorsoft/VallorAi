'use client'

import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { useProjectStore } from '@/store/project.store'
import { useTranslation } from '@/lib/useTranslation'
import { HouseScene } from './HouseScene'

// Renderer strings that mean the browser fell back to software rasterization
// (no usable GPU) — full-frame WebGL can't hold 30+ FPS there no matter what
// we do, so masonry detail is withheld (see HouseScene) instead of letting
// the whole view stutter.
const SOFTWARE_GL_PATTERN =
  /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i

// Dev/e2e escape hatch so brick detail stays verifiable in headless
// (software-GL) test browsers. Not a user-facing setting.
function lowPerfOverridden(): boolean {
  try {
    return window.localStorage.getItem('viewer3d.ignoreLowPerf') === '1'
  } catch {
    return false
  }
}

export function Viewer3D() {
  const house = useProjectStore((s) => s.house)
  const { t } = useTranslation()
  // Start at a moderate resolution; PerformanceMonitor raises it to the
  // display's native ratio on machines that hold the frame rate and drops it
  // to 1 on machines that don't — fill rate is the main scaling knob.
  const [dpr, setDpr] = useState(1.5)
  const [lowPerfMode, setLowPerfMode] = useState(false)

  const markLowPerf = () => {
    if (!lowPerfOverridden()) setLowPerfMode(true)
  }

  return (
    <div className="relative w-full h-full bg-gray-50">
      <Canvas
        camera={{ position: [14, 12, 14], fov: 45 }}
        dpr={dpr}
        gl={{ powerPreference: 'high-performance', antialias: true }}
        onCreated={({ gl }) => {
          const ctx = gl.getContext()
          const info = ctx.getExtension('WEBGL_debug_renderer_info')
          const renderer = info ? String(ctx.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
          if (SOFTWARE_GL_PATTERN.test(renderer)) markLowPerf()
        }}
      >
        <color attach="background" args={['#f8fafc']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 15, 8]} intensity={0.7} />
        <gridHelper args={[60, 60, '#cbd5e1', '#e2e8f0']} />
        <PerformanceMonitor
          flipflops={3}
          onIncline={() => setDpr(Math.min(2, window.devicePixelRatio || 1.5))}
          onDecline={() => setDpr(1)}
          onFallback={markLowPerf}
        >
          <Suspense fallback={null}>
            {house && <HouseScene house={house} lowPerfMode={lowPerfMode} />}
          </Suspense>
        </PerformanceMonitor>
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

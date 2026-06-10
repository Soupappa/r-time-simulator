// V1 — Temporal Valley
// The current working demo: distance becomes visible age via R ratio.
import { useRef, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from '../components/Scene'
import { UIOverlay } from '../components/UIOverlay'
import { RecorderControls } from '../components/RecorderControls'

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      style={{
        position: 'fixed', top: 14, right: 210, zIndex: 100,
        background: 'rgba(10,10,20,0.8)', border: '1px solid rgba(100,120,200,0.3)',
        borderRadius: 6, color: '#6b8cff', fontFamily: 'monospace', fontSize: 11,
        padding: '6px 14px', cursor: 'pointer', letterSpacing: '0.08em',
        backdropFilter: 'blur(8px)',
      }}
    >
      ← Hub
    </button>
  )
}

export function V1Page({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 5, 10], fov: 65, near: 0.1, far: 600 }}
        shadows
        gl={{ preserveDrawingBuffer: true }}
        style={{ background: '#08091a' }}
      >
        <Suspense fallback={null}>
          <Scene canvasRef={canvasRef} />
        </Suspense>
      </Canvas>
      <UIOverlay />
      <RecorderControls canvasRef={canvasRef} />
      <BackButton onBack={onBack} />
    </div>
  )
}

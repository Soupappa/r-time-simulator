/**
 * ScenePanel — panneau gauche unifié pour toutes les variantes R-Time.
 *
 * Contient : titre, contenu spécifique (children), + bouton export WebM.
 * L'accès au canvas se fait via containerRef → querySelector('canvas').
 */

import { useRef, useState, type ReactNode } from 'react'
import { VideoRecorder } from '../utils/recording'

type Theme = 'blue' | 'orange'

function themeVars(t: Theme) {
  if (t === 'orange') return {
    accent:      '#ff7744',
    accentMuted: '#804020',
    bg:          'rgba(12,4,1,0.95)',
    border:      'rgba(255,100,40,0.28)',
    borderDim:   'rgba(255,80,20,0.18)',
    labelCol:    '#a07050',
    valueCol:    '#e8c090',
    infoBg:      'rgba(0,0,0,0.45)',
    recBg:       'rgba(255,60,0,0.10)',
    recBorder:   'rgba(255,80,20,0.30)',
    btnBack:     { bg:'rgba(12,4,1,0.92)', border:'rgba(255,120,50,0.35)', color:'#ff9955' },
  }
  return {
    accent:      '#6b8cff',
    accentMuted: '#2a3478',
    bg:          'rgba(8,10,24,0.95)',
    border:      'rgba(107,140,255,0.22)',
    borderDim:   'rgba(80,100,200,0.18)',
    labelCol:    '#4a5888',
    valueCol:    '#b0bce0',
    infoBg:      'rgba(0,0,0,0.40)',
    recBg:       'rgba(107,140,255,0.08)',
    recBorder:   'rgba(107,140,255,0.25)',
    btnBack:     { bg:'rgba(8,10,24,0.92)', border:'rgba(107,140,255,0.35)', color:'#8ca8ff' },
  }
}

interface ScenePanelProps {
  /** Short version label, e.g. "V4 — Volcanic Retardation" */
  title: string
  onBack: () => void
  /** Ref on the outer wrapper div that contains the R3F <Canvas> */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Version-specific controls + indicators */
  children: ReactNode
  theme?: Theme
  width?: number
  /** Filename for the downloaded WebM */
  filename?: string
}

export function ScenePanel({
  title,
  onBack,
  containerRef,
  children,
  theme = 'blue',
  width = 285,
  filename = 'r-time-simulation.webm',
}: ScenePanelProps) {
  const [recording, setRecording] = useState(false)
  const [blobUrl,   setBlobUrl]   = useState<string | null>(null)
  const recorderRef = useRef(new VideoRecorder())
  const c = themeVars(theme)

  const startRec = () => {
    const canvas = containerRef.current?.querySelector('canvas')
    if (!canvas) { console.warn('ScenePanel: no canvas found'); return }
    recorderRef.current.start(canvas)
    setBlobUrl(null)
    setRecording(true)
  }

  const stopRec = async () => {
    const blob = await recorderRef.current.stop()
    const url  = URL.createObjectURL(blob)
    setBlobUrl(url)
    setRecording(false)
  }

  return (
    <>
      {/* ── Back button (top-right) ─────────────────────────────── */}
      <button
        onClick={onBack}
        style={{
          position: 'absolute', top: 14, right: 14,
          pointerEvents: 'all',
          background: c.btnBack.bg,
          border: `1px solid ${c.btnBack.border}`,
          borderRadius: 6, color: c.btnBack.color,
          fontFamily: 'inherit', fontSize: 13,
          padding: '7px 16px', cursor: 'pointer',
          letterSpacing: '0.06em', backdropFilter: 'blur(8px)',
        }}
      >
        ← Hub
      </button>

      {/* ── Left panel ─────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 16, left: 16, width, pointerEvents: 'all' }}>
        <div style={{
          background: c.bg,
          border: `1px solid ${c.border}`,
          borderRadius: 12,
          padding: '18px 20px',
          backdropFilter: 'blur(16px)',
          display: 'flex', flexDirection: 'column', gap: 0,
        }}>
          {/* Title */}
          <div style={{
            color: c.accent, fontSize: 11, letterSpacing: '0.16em',
            textTransform: 'uppercase', marginBottom: 16,
            paddingBottom: 10, borderBottom: `1px solid ${c.borderDim}`,
          }}>
            {title}
          </div>

          {/* Version-specific content */}
          {children}

          {/* ── Recording ──────────────────────────────────────── */}
          <div style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: `1px solid ${c.borderDim}`,
            background: c.recBg,
            borderRadius: 6,
            padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 7,
          }}>
            <div style={{ fontSize: 11, color: c.accentMuted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>
              Export WebM
            </div>

            {!recording ? (
              <button
                onClick={startRec}
                style={{
                  width: '100%', padding: '8px 0',
                  background: 'transparent',
                  border: `1px solid ${c.recBorder}`,
                  borderRadius: 6, color: c.accent,
                  fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
                  letterSpacing: '0.06em',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                ⬤ Enregistrer
              </button>
            ) : (
              <button
                onClick={stopRec}
                style={{
                  width: '100%', padding: '8px 0',
                  background: 'rgba(200,30,30,0.18)',
                  border: '1px solid rgba(220,60,60,0.5)',
                  borderRadius: 6, color: '#ff8888',
                  fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
                  letterSpacing: '0.06em', animation: 'pulse 1.2s ease infinite',
                }}
              >
                ⬛ Arrêter
              </button>
            )}

            {blobUrl && (
              <a
                href={blobUrl}
                download={filename}
                style={{ textDecoration: 'none' }}
              >
                <button style={{
                  width: '100%', padding: '8px 0',
                  background: 'rgba(80,200,80,0.12)',
                  border: '1px solid rgba(80,200,80,0.4)',
                  borderRadius: 6, color: '#88dd88',
                  fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
                  letterSpacing: '0.06em',
                }}>
                  ↓ Télécharger WebM
                </button>
              </a>
            )}

            <div style={{ fontSize: 10, color: c.accentMuted, lineHeight: 1.6 }}>
              Converti en MP4 : <span style={{ opacity: 0.7 }}>ffmpeg -i in.webm out.mp4</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
      `}</style>
    </>
  )
}

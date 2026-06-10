import { useRef, useState } from 'react'
import { VideoRecorder } from '../utils/recording'

export function RecorderControls({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const [recording, setRecording] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const recorderRef = useRef(new VideoRecorder())

  const startRecording = () => {
    if (!canvasRef.current) return
    recorderRef.current.start(canvasRef.current)
    setBlobUrl(null)
    setRecording(true)
  }

  const stopRecording = async () => {
    const blob = await recorderRef.current.stop()
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    setRecording(false)
  }

  return (
    <div className="panel-recorder">
      <div className="panel">
        <h3>Record</h3>
        {!recording ? (
          <button className="btn primary" onClick={startRecording}>
            ● Start recording
          </button>
        ) : (
          <button className="btn active" onClick={stopRecording}>
            <span className="rec-dot" />
            Stop recording
          </button>
        )}
        {blobUrl && (
          <a href={blobUrl} download="r-time-simulation.webm" style={{ textDecoration: 'none' }}>
            <button className="btn" style={{ marginTop: 4 }}>
              ↓ Download WebM
            </button>
          </a>
        )}
        <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 9, lineHeight: 1.5 }}>
          WebM via captureStream.<br />
          Convert to MP4: ffmpeg -i out.webm out.mp4
        </div>
      </div>
    </div>
  )
}

import { useSimStore } from '../store'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  )
}

export function UIOverlay() {
  const {
    R, ageScale, showLabels, ghosting, cameraMode, focusedObject,
    setR, setAgeScale, setShowLabels, setGhosting, setCameraMode,
  } = useSimStore()

  return (
    <div className="ui-overlay">
      {/* Controls panel */}
      <div className="panel-controls">
        <div className="panel">
          <h3>R-Time Controls</h3>

          <div className="slider-row">
            <label>
              R (propagation ratio)
              <span>{R.toFixed(3)}</span>
            </label>
            <input
              type="range" min={0.05} max={5} step={0.01} value={R}
              onChange={e => setR(parseFloat(e.target.value))}
            />
          </div>

          <div className="slider-row">
            <label>
              Age scale
              <span>{ageScale.toFixed(3)}</span>
            </label>
            <input
              type="range" min={0.01} max={2} step={0.01} value={ageScale}
              onChange={e => setAgeScale(parseFloat(e.target.value))}
            />
          </div>

          <div className="toggle-row">
            <span>Temporal labels</span>
            <Toggle checked={showLabels} onChange={setShowLabels} />
          </div>
          <div className="toggle-row">
            <span>Ghosting</span>
            <Toggle checked={ghosting} onChange={setGhosting} />
          </div>
        </div>

        <div className="panel">
          <h3>Camera</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <button
              className={`btn ${cameraMode === 'fps' ? 'active' : 'primary'}`}
              onClick={() => setCameraMode(cameraMode === 'fps' ? 'orbit' : 'fps')}
            >
              {cameraMode === 'fps' ? '■ Exit FPS (ESC)' : '🚶 Free walk (WASD)'}
            </button>
            <button
              className={`btn ${cameraMode === 'demo' ? 'active' : ''}`}
              onClick={() => setCameraMode(cameraMode === 'demo' ? 'orbit' : 'demo')}
            >
              {cameraMode === 'demo' ? '■ Stop demo' : '▶ Cinematic demo'}
            </button>
          </div>
          <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 10, lineHeight: 1.6 }}>
            {cameraMode === 'fps'
              ? 'Click canvas · WASD = move · Shift = sprint · E/Q = up/down · ESC = exit'
              : cameraMode === 'demo'
              ? 'Camera flies toward the mountain'
              : 'Drag to orbit · Scroll to zoom'}
          </div>
        </div>
      </div>

      {/* Temporal readout */}
      <div className="panel-info">
        <div className="panel">
          <h3>Temporal Readout</h3>
          {focusedObject ? (
            <>
              <div className="info-row">
                <span className="info-key">Object</span>
                <span className="info-val">{focusedObject.name}</span>
              </div>
              <div className="info-row">
                <span className="info-key">Distance</span>
                <span className="info-val">{focusedObject.distance.toFixed(1)} u</span>
              </div>
              <div className="info-row">
                <span className="info-key">Visible age</span>
                <span className="info-val">{(focusedObject.distance * ageScale / R).toFixed(2)}</span>
              </div>
              <div className="info-row">
                <span className="info-key">State</span>
                <span className="info-val">{focusedObject.stateLabel}</span>
              </div>
              <div className="info-row">
                <span className="info-key">R</span>
                <span className="info-val">{R.toFixed(3)}</span>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--muted)' }}>Move near objects…</div>
          )}
          <div className="formula">
            <em>visibleAge</em> = dist × scale × (1/R)
            {focusedObject && (
              <><br />= {focusedObject.distance.toFixed(1)} × {ageScale.toFixed(2)} × {(1/R).toFixed(2)} = <em>{(focusedObject.distance * ageScale / R).toFixed(2)}</em></>
            )}
          </div>
        </div>
      </div>

      {/* FPS hint overlay */}
      {cameraMode === 'fps' && (
        <div className="fps-hint">
          Click to capture mouse · WASD to walk · Shift to sprint · E/Q = up/down
        </div>
      )}

      {/* Crosshair */}
      <div className="crosshair" />

      {cameraMode === 'demo' && (
        <div className="mode-hint">
          Approach → present state · Retreat → ancient past
        </div>
      )}
    </div>
  )
}

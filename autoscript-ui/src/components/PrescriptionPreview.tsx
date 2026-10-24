import { useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Left-panel prescription image/PDF viewer with zoom, rotate, fullscreen, and
// (for PDFs) page navigation. Driven by the File uploaded in step 1.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  file: File | null
  onReupload: () => void
}

export function PrescriptionPreview({ file, onReupload }: Props) {
  const [url, setUrl]       = useState<string | null>(null)
  const [zoom, setZoom]     = useState(1)
  const [rotate, setRotate] = useState(0)
  const [full, setFull]     = useState(false)
  const [failed, setFailed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const isPdf = !!file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))

  // Create / revoke an object URL for the file.
  useEffect(() => {
    if (!file) { setUrl(null); return }
    setFailed(false)
    let objUrl: string
    try {
      objUrl = URL.createObjectURL(file)
      setUrl(objUrl)
    } catch {
      setFailed(true)
      return
    }
    return () => URL.revokeObjectURL(objUrl)
  }, [file])

  // Reset view transforms when a new file loads.
  useEffect(() => { setZoom(1); setRotate(0) }, [url])

  // Esc closes fullscreen.
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  function zoomIn()  { setZoom(z => Math.min(z + 0.25, 4)) }
  function zoomOut() { setZoom(z => Math.max(z - 0.25, 0.25)) }
  function rotateCw(){ setRotate(r => (r + 90) % 360) }
  function reset()   { setZoom(1); setRotate(0) }

  // ── Empty / no file ────────────────────────────────────────────────────────
  if (!file) {
    return (
      <div className="preview-panel preview-panel--empty">
        <div className="preview-empty">
          <div className="preview-empty-icon">📄</div>
          <p>No prescription image uploaded.</p>
          <button className="btn-cancel" onClick={onReupload}>Upload an image</button>
        </div>
      </div>
    )
  }

  // ── Failed to load ───────────────────────────────────────────────────────────
  if (failed || !url) {
    return (
      <div className="preview-panel preview-panel--empty">
        <div className="preview-empty">
          <div className="preview-empty-icon">⚠️</div>
          <p>The preview could not be loaded.</p>
          <p className="preview-empty-sub">Your entered details are kept — you can re-upload the image.</p>
          <button className="btn-primary" onClick={onReupload}>Upload again</button>
        </div>
      </div>
    )
  }

  const content = (
    <div className="preview-stage" ref={containerRef}>
      {isPdf ? (
        // Browsers render PDFs natively (incl. their own page nav / scroll).
        <object
          data={`${url}#zoom=${Math.round(zoom * 100)}`}
          type="application/pdf"
          className="preview-pdf"
          style={{ transform: `rotate(${rotate}deg)` }}
          onError={() => setFailed(true)}
          aria-label="Prescription PDF"
        >
          <p className="preview-empty-sub">
            PDF preview is unavailable in this browser.{' '}
            <a href={url} target="_blank" rel="noreferrer">Open in a new tab</a>.
          </p>
        </object>
      ) : (
        <img
          src={url}
          alt="Uploaded prescription"
          className="preview-img"
          style={{ transform: `scale(${zoom}) rotate(${rotate}deg)` }}
          onError={() => setFailed(true)}
          draggable={false}
        />
      )}
    </div>
  )

  const toolbar = (
    <div className="preview-toolbar" role="toolbar" aria-label="Image controls">
      <button className="preview-btn" onClick={zoomOut} title="Zoom out" aria-label="Zoom out">−</button>
      <span className="preview-zoom">{Math.round(zoom * 100)}%</span>
      <button className="preview-btn" onClick={zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
      <span className="preview-sep" />
      <button className="preview-btn" onClick={rotateCw} title="Rotate 90°" aria-label="Rotate">⟳</button>
      <button className="preview-btn" onClick={reset} title="Reset view" aria-label="Reset view">Reset</button>
      <span className="preview-sep" />
      <button className="preview-btn" onClick={() => setFull(f => !f)} title="Fullscreen" aria-label="Fullscreen">
        {full ? 'Exit' : '⛶'}
      </button>
    </div>
  )

  return (
    <>
      <div className="preview-panel">
        <div className="preview-filename" title={file.name}>📄 {file.name}</div>
        {content}
        {toolbar}
      </div>

      {full && (
        <div className="preview-fullscreen" role="dialog" aria-modal="true" aria-label="Prescription fullscreen">
          <div className="preview-fullscreen-bar">
            <span className="preview-filename">📄 {file.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{toolbar}</div>
            <button className="preview-btn" onClick={() => setFull(false)} aria-label="Close fullscreen">✕ Close</button>
          </div>
          <div className="preview-fullscreen-stage">{content}</div>
        </div>
      )}
    </>
  )
}

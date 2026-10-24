import { useEffect, useRef, useState, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Left-panel prescription viewer.
//   • Images: zoom, rotate, fullscreen.
//   • PDFs:   rendered page-by-page to a <canvas> via pdf.js (loaded on demand
//             from a CDN) with real prev/next page navigation + a page counter,
//             plus the same zoom / rotate / fullscreen controls.
//   • Failure: shows an error with an "Upload again" option that does NOT clear
//             the form (the form state lives in the parent modal).
// ─────────────────────────────────────────────────────────────────────────────

// pdf.js is loaded lazily from a CDN the first time a PDF is opened, so it adds
// nothing to the main bundle for the image-only path.
const PDFJS_VERSION = '4.7.76'
const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`
const PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`

// Minimal typing for the slice of the pdf.js API we use.
interface PdfPage { getViewport(o: { scale: number; rotation: number }): { width: number; height: number }
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> } }
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage> }
interface PdfJsLib { GlobalWorkerOptions: { workerSrc: string }; getDocument(src: unknown): { promise: Promise<PdfDoc> } }

let pdfjsPromise: Promise<PdfJsLib> | null = null
function loadPdfJs(): Promise<PdfJsLib> {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ PDFJS_URL).then((lib: PdfJsLib) => {
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
      return lib
    })
  }
  return pdfjsPromise
}

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

  // PDF state
  const [pdfDoc, setPdfDoc]   = useState<PdfDoc | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [pdfError, setPdfError] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  // Reset view transforms + page when a new file loads.
  useEffect(() => { setZoom(1); setRotate(0); setPageNum(1) }, [url])

  // Load the PDF document (lazily pulling pdf.js) when a PDF file is present.
  useEffect(() => {
    if (!file || !isPdf) { setPdfDoc(null); setNumPages(0); return }
    let cancelled = false
    setPdfError(false)
    ;(async () => {
      try {
        const lib = await loadPdfJs()
        const data = await file.arrayBuffer()
        if (cancelled) return
        const doc = await lib.getDocument({ data }).promise
        if (cancelled) return
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setPageNum(1)
      } catch {
        if (!cancelled) setPdfError(true)
      }
    })()
    return () => { cancelled = true }
  }, [file, isPdf])

  // Render the current PDF page to the canvas whenever page / zoom / rotate change.
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return
    try {
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale: zoom * 1.3, rotation: rotate })
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvasContext: ctx, viewport }).promise
    } catch {
      setPdfError(true)
    }
  }, [pdfDoc, pageNum, zoom, rotate])

  useEffect(() => { if (pdfDoc) void renderPage() }, [pdfDoc, renderPage])

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
  function prevPage(){ setPageNum(p => Math.max(1, p - 1)) }
  function nextPage(){ setPageNum(p => Math.min(numPages, p + 1)) }

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

  // ── Failed to load (image URL failed, or PDF failed to render) ───────────────
  if (failed || !url || (isPdf && pdfError)) {
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
    <div className="preview-stage">
      {isPdf ? (
        pdfDoc ? (
          <canvas ref={canvasRef} className="preview-canvas" aria-label={`Prescription PDF, page ${pageNum} of ${numPages}`} />
        ) : (
          <div className="preview-empty-sub" style={{ padding: 24 }}>Loading PDF…</div>
        )
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
    <div className="preview-toolbar" role="toolbar" aria-label="Preview controls">
      <button className="preview-btn" onClick={zoomOut} title="Zoom out" aria-label="Zoom out">−</button>
      <span className="preview-zoom">{Math.round(zoom * 100)}%</span>
      <button className="preview-btn" onClick={zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
      <span className="preview-sep" />
      <button className="preview-btn" onClick={rotateCw} title="Rotate 90°" aria-label="Rotate">⟳</button>
      <button className="preview-btn" onClick={reset} title="Reset view" aria-label="Reset view">Reset</button>

      {/* PDF page navigation */}
      {isPdf && numPages > 1 && (
        <>
          <span className="preview-sep" />
          <button className="preview-btn" onClick={prevPage} disabled={pageNum <= 1}
            title="Previous page" aria-label="Previous page">‹</button>
          <span className="preview-zoom">{pageNum} / {numPages}</span>
          <button className="preview-btn" onClick={nextPage} disabled={pageNum >= numPages}
            title="Next page" aria-label="Next page">›</button>
        </>
      )}

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

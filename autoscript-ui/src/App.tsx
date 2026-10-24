import { useState, useCallback, useEffect, useRef } from 'react'
import './App.css'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const API = 'http://localhost:8080/api'

const AVATAR_COLORS = [
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#ef4444,#dc2626)',
  'linear-gradient(135deg,#3b82f6,#2563eb)',
  'linear-gradient(135deg,#ec4899,#db2777)',
  'linear-gradient(135deg,#14b8a6,#0d9488)',
  'linear-gradient(135deg,#f97316,#ea580c)',
]

function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length] }
function initials(fn: string, ln: string) {
  return `${fn?.[0] ?? '?'}${ln?.[0] ?? '?'}`.toUpperCase()
}

// ─────────────────────────────────────────────────────────────────────────────
// API types
// ─────────────────────────────────────────────────────────────────────────────

interface ApiPatient {
  id: number
  firstName: string
  lastName: string
  dob: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  fullName: string
  initials: string
}

interface ApiPrescription {
  id: number
  rxId: string
  patientId: number
  patientName: string
  patientDob: string
  medication: string
  dosage: string | null
  instructions: string | null
  status: string
  substatus: string | null
  prescriber: string | null
  createdAt: string | null
}

interface ApiStats {
  reviewed: number
  manual: number
  cleared: number
  processing: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `Server error ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI components
// ─────────────────────────────────────────────────────────────────────────────

type BadgeVariant = 'processing' | 'manual' | 'reviewed' | 'cleared'

const BADGE_LABELS: Record<string, string> = {
  processing: 'Processing',
  manual:     'Manual Review Needed',
  reviewed:   'Reviewed Today',
  cleared:    'Cleared',
}

function Badge({ status }: { status: string }) {
  const variant = (status as BadgeVariant) ?? 'processing'
  return (
    <span className={`badge badge-${variant}`}>
      <span className="badge-dot" />
      {BADGE_LABELS[variant] ?? status}
    </span>
  )
}

function Avatar({ id, fn, ln, size = 36 }: { id: number; fn: string; ln: string; size?: number }) {
  return (
    <div className="patient-avatar"
      style={{ background: avatarColor(id), width: size, height: size, fontSize: size * 0.35 }}>
      {initials(fn, ln)}
    </div>
  )
}

function Spinner({ small }: { small?: boolean }) {
  return <span className={small ? 'spinner spinner--sm' : 'spinner'} aria-hidden="true" />
}

function ApiErrorBanner({ message }: { message: string }) {
  return (
    <div className="api-error" role="alert">
      ⚠️ {message}
      {message.includes('fetch') || message.includes('Failed') || message.includes('Network')
        ? ' — Make sure the Spring Boot server is running on port 8080.'
        : ''}
    </div>
  )
}

// Icons
function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
  )
}
function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}
function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}
function UploadCloudIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  )
}
function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload / New Prescription Modal
// ─────────────────────────────────────────────────────────────────────────────

interface UploadModalProps {
  onClose: () => void
  onCreated: () => void
  preselectedPatient?: ApiPatient | null
}

function UploadModal({ onClose, onCreated, preselectedPatient }: UploadModalProps) {
  const [step, setStep]               = useState<'file' | 'patient' | 'rx'>(preselectedPatient ? 'rx' : 'file')
  const [patient, setPatient]         = useState<ApiPatient | null>(preselectedPatient ?? null)
  const [search,  setSearch]          = useState('')
  const [ptList,  setPtList]          = useState<ApiPatient[]>([])
  const [ptLoading, setPtLoading]     = useState(false)
  const [fileName, setFileName]       = useState<string | null>(null)
  const [medication, setMedication]   = useState('')
  const [dosage,     setDosage]       = useState('')
  const [instructions, setInstructions] = useState('')
  const [prescriber, setPrescriber]   = useState('Dr. Jane Doe')
  const [saving,  setSaving]          = useState(false)
  const [error,   setError]           = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Load patients for search
  useEffect(() => {
    if (step !== 'patient') return
    setPtLoading(true)
    apiFetch<ApiPatient[]>(`/patients`)
      .then(setPtList)
      .catch(e => setError(e.message))
      .finally(() => setPtLoading(false))
  }, [step])

  const filteredPts = ptList.filter(p => {
    const q = search.toLowerCase()
    return !q
      || `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)
      || (p.phone ?? '').includes(q)
      || p.dob.includes(q)
  })

  async function handleCreate() {
    if (!patient || !medication.trim()) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/prescriptions', {
        method: 'POST',
        body: JSON.stringify({
          patientId:    patient.id,
          medication:   medication.trim(),
          dosage:       dosage.trim() || null,
          instructions: instructions.trim() || null,
          prescriber:   prescriber.trim() || null,
        }),
      })
      onCreated()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create prescription')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 id="modal-title">New Prescription Intake</h2>
            <p>
              {step === 'file'    && 'Upload or drop a prescription image / PDF'}
              {step === 'patient' && 'Select the patient for this prescription'}
              {step === 'rx'      && 'Enter medication details'}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><XIcon /></button>
        </div>

        {/* Step indicator */}
        <div className="modal-steps">
          {(['file','patient','rx'] as const).map((s, i) => (
            <div key={s} className={`modal-step ${step === s ? 'active' : ''} ${
              (['file','patient','rx'].indexOf(step) > i) ? 'done' : ''
            }`}>
              <span className="step-num">{['file','patient','rx'].indexOf(step) > i ? <CheckIcon /> : i + 1}</span>
              <span className="step-label">{['Upload','Patient','Details'][i]}</span>
            </div>
          ))}
        </div>

        <div className="modal-body">
          {error && <ApiErrorBanner message={error} />}

          {/* Step 1 — File */}
          {step === 'file' && (
            <>
              <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display:'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) { setFileName(f.name); setStep('patient') }
                }} />
              <div className="drop-zone" role="button" tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
                onDrop={e => {
                  e.preventDefault()
                  const f = e.dataTransfer.files?.[0]
                  if (f) { setFileName(f.name); setStep('patient') }
                }}
                onDragOver={e => e.preventDefault()}
              >
                <div className="drop-icon">☁️</div>
                <p>Drag and drop a prescription image or PDF here<br />
                  <span className="browse">or click to browse</span></p>
                <p className="formats">Supports JPG, PNG, PDF (max 10MB)</p>
              </div>
              <div className="modal-footer" style={{ marginTop: 16 }}>
                <button className="btn-cancel" onClick={onClose}>Cancel</button>
                <button className="btn-primary" onClick={() => setStep('patient')}>
                  Skip — enter manually <ChevronRight />
                </button>
              </div>
            </>
          )}

          {/* Step 2 — Patient */}
          {step === 'patient' && (
            <>
              {fileName && <div className="file-badge">📄 {fileName}</div>}
              <div className="patient-search" style={{ marginBottom: 12 }}>
                <SearchIcon />
                <input type="text" placeholder="Search by name, phone, or DOB…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  aria-label="Search patients" autoFocus />
              </div>
              {ptLoading
                ? <div className="loading-row"><Spinner small /> Loading patients…</div>
                : (
                  <div className="patient-list" role="listbox" style={{ maxHeight: 280, overflowY:'auto' }}>
                    {filteredPts.map(p => (
                      <div key={p.id} role="option"
                        className={`patient-row${patient?.id === p.id ? ' selected' : ''}`}
                        aria-selected={patient?.id === p.id}
                        onClick={() => setPatient(p)}
                        tabIndex={0} onKeyDown={e => e.key === 'Enter' && setPatient(p)}
                      >
                        <Avatar id={p.id} fn={p.firstName} ln={p.lastName} />
                        <div className="patient-details">
                          <div className="pname">{p.fullName}</div>
                          <div className="pmeta">DOB {p.dob} • {p.phone ?? '—'}</div>
                        </div>
                        {patient?.id === p.id && <span style={{ color:'#2563eb', marginLeft:'auto' }}><CheckIcon /></span>}
                      </div>
                    ))}
                    {filteredPts.length === 0 && !ptLoading && (
                      <p style={{ padding:'16px', color:'#94a3b8', textAlign:'center', fontSize:13 }}>No patients found</p>
                    )}
                  </div>
                )
              }
              <div className="modal-footer" style={{ marginTop: 12 }}>
                <button className="btn-cancel" onClick={() => setStep('file')}>Back</button>
                <button className="btn-primary" disabled={!patient} onClick={() => setStep('rx')}>
                  Continue <ChevronRight />
                </button>
              </div>
            </>
          )}

          {/* Step 3 — Rx details */}
          {step === 'rx' && (
            <>
              {patient && (
                <div className="selected-patient-chip">
                  <Avatar id={patient.id} fn={patient.firstName} ln={patient.lastName} size={32} />
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{patient.fullName}</div>
                    <div style={{ fontSize:11, color:'#64748b' }}>DOB {patient.dob}</div>
                  </div>
                  {!preselectedPatient && (
                    <button className="chip-change" onClick={() => setStep('patient')}>Change</button>
                  )}
                </div>
              )}
              <div className="create-form-grid" style={{ marginTop: 16 }}>
                <div className="field-group" style={{ gridColumn:'1 / -1' }}>
                  <label className="field-label">Medication <span className="req">*</span></label>
                  <input className="field-input" type="text" placeholder="e.g. Lisinopril 10mg"
                    value={medication} onChange={e => setMedication(e.target.value)} autoFocus />
                </div>
                <div className="field-group">
                  <label className="field-label">Dosage</label>
                  <input className="field-input" type="text" placeholder="e.g. 1 tablet daily"
                    value={dosage} onChange={e => setDosage(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Prescriber</label>
                  <input className="field-input" type="text"
                    value={prescriber} onChange={e => setPrescriber(e.target.value)} />
                </div>
                <div className="field-group" style={{ gridColumn:'1 / -1' }}>
                  <label className="field-label">Instructions</label>
                  <textarea className="field-input field-textarea" rows={2}
                    placeholder="e.g. Take with food, avoid grapefruit…"
                    value={instructions} onChange={e => setInstructions(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer" style={{ marginTop: 16 }}>
                <button className="btn-cancel" onClick={() => setStep('patient')} disabled={saving}>Back</button>
                <button className="btn-primary"
                  disabled={!medication.trim() || saving || !patient}
                  onClick={handleCreate}>
                  {saving ? <><Spinner small /> Saving…</> : <>Start Review <ChevronRight /></>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

function Dashboard({ onUpload, onNavigate }: { onUpload: () => void; onNavigate: (nav: string) => void }) {
  const [stats, setStats]         = useState<ApiStats | null>(null)
  const [rxList, setRxList]       = useState<ApiPrescription[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [globalQ, setGlobalQ]     = useState('')
  const [filtering, setFiltering] = useState(false)
  const [showSignal, setShowSignal] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, rx] = await Promise.all([
        apiFetch<ApiStats>('/prescriptions/stats'),
        apiFetch<ApiPrescription[]>('/prescriptions'),
      ])
      setStats(s); setRxList(rx)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Global search filter
  const filtered = globalQ.trim()
    ? rxList.filter(r =>
        r.patientName.toLowerCase().includes(globalQ.toLowerCase()) ||
        r.rxId.toLowerCase().includes(globalQ.toLowerCase()) ||
        r.medication.toLowerCase().includes(globalQ.toLowerCase()))
    : rxList

  async function handleGlobalSearch(q: string) {
    setGlobalQ(q)
    if (!q.trim()) return
    setFiltering(true)
    try {
      const results = await apiFetch<ApiPrescription[]>(`/prescriptions?q=${encodeURIComponent(q)}`)
      setRxList(results)
    } catch { /* keep local filter */ }
    finally { setFiltering(false) }
  }

  async function handleStatusChange(rx: ApiPrescription, newStatus: string) {
    try {
      const updated = await apiFetch<ApiPrescription>(`/prescriptions/${rx.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, substatus: null }),
      })
      setRxList(prev => prev.map(r => r.id === updated.id ? updated : r))
      // refresh stats
      const s = await apiFetch<ApiStats>('/prescriptions/stats')
      setStats(s)
    } catch (e: unknown) {
      alert('Status update failed: ' + (e instanceof Error ? e.message : e))
    }
  }

  const signals = [
    { icon: '🚨', cls: 'red',    title: 'Drug interaction detected', desc: 'Checks for interactions between new medications and existing therapies. Click to filter prescriptions flagged for this issue.' },
    { icon: '⚠️', cls: 'orange', title: 'Allergy mismatch',          desc: 'Identifies potential conflicts with known patient allergies.' },
    { icon: '📊', cls: 'blue',   title: 'Dose looks unusual',        desc: "Flags doses outside typical ranges for the patient's age, condition, or renal function." },
    { icon: '📄', cls: 'purple', title: 'Missing patient context',   desc: 'Alerts when key information (indication, labs, medical history) is missing.' },
  ]

  if (loading) return (
    <div className="loading-page"><Spinner /> <span>Loading dashboard…</span></div>
  )

  return (
    <>
      <div className="page-header">
        <h1>Prescription Review Dashboard</h1>
        <p>Today's prescription queue and review status</p>
      </div>

      {error && <ApiErrorBanner message={error} />}

      {/* Stat cards */}
      {stats && (
        <div className="stat-cards" role="region" aria-label="Today's statistics">
          {[
            { label: 'Reviewed Today',       value: stats.reviewed,   cls: 'green',  icon: '📋', status: 'reviewed'   },
            { label: 'Manual Review Needed', value: stats.manual,     cls: 'orange', icon: '⚠️', status: 'manual'     },
            { label: 'Cleared / No Action',  value: stats.cleared,    cls: 'blue',   icon: '✅', status: 'cleared'    },
            { label: 'Processing',           value: stats.processing, cls: 'purple', icon: '⏳', status: 'processing' },
          ].map(card => (
            <div key={card.status} className="stat-card stat-card--clickable"
              role="button" tabIndex={0}
              title={`Filter by: ${card.label}`}
              onClick={() => {
                const q = card.status === globalQ ? '' : card.status
                setGlobalQ(q)
              }}
              onKeyDown={e => e.key === 'Enter' && setGlobalQ(
                card.status === globalQ ? '' : card.status)}
              style={{ outline: globalQ === card.status ? '2px solid #2563eb' : undefined }}
            >
              <div className={`stat-icon ${card.cls}`}>{card.icon}</div>
              <div className="stat-info">
                <div className="label">{card.label}</div>
                <div className="value">{card.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search bar for table */}
      <div className="table-search-row">
        <div className="search-bar" style={{ width: 320 }}>
          <SearchIcon />
          <input type="search" placeholder="Filter by patient, Rx ID, or medication…"
            value={globalQ}
            onChange={e => handleGlobalSearch(e.target.value)}
            aria-label="Filter prescriptions" />
          {filtering && <Spinner small />}
        </div>
        {globalQ && (
          <button className="btn-cancel" style={{ padding:'6px 12px', fontSize:12 }}
            onClick={() => { setGlobalQ(''); loadData() }}>
            Clear filter
          </button>
        )}
      </div>

      <div className="dashboard-grid">
        {/* Prescriptions table */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Latest Prescriptions</h2>
              <p>{filtered.length} prescription{filtered.length !== 1 ? 's' : ''}{globalQ ? ` matching "${globalQ}"` : ''}</p>
            </div>
            <button className="upload-btn" onClick={onUpload}>
              <UploadCloudIcon /> Upload Prescription
            </button>
          </div>
          <div className="table-wrapper">
            <table aria-label="Prescriptions table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Rx ID</th>
                  <th scope="col">Patient</th>
                  <th scope="col">Medication</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign:'center', color:'#94a3b8', padding:24 }}>
                    No prescriptions found
                  </td></tr>
                )}
                {filtered.map(rx => {
                  const t = rx.createdAt ? new Date(rx.createdAt) : null
                  const time = t ? t.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : '—'
                  return (
                    <tr key={rx.id} tabIndex={0}>
                      <td className="td-time">{time}</td>
                      <td className="td-rxid">{rx.rxId}</td>
                      <td>
                        <div className="patient-name">{rx.patientName}</div>
                        <div className="patient-dob">DOB {rx.patientDob}</div>
                      </td>
                      <td style={{ fontSize:13 }}>
                        <div style={{ fontWeight:500 }}>{rx.medication}</div>
                        {rx.dosage && <div style={{ fontSize:11, color:'#94a3b8' }}>{rx.dosage}</div>}
                      </td>
                      <td>
                        <Badge status={rx.status} />
                        {rx.substatus && <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>{rx.substatus}</div>}
                      </td>
                      <td>
                        <div className="rx-actions">
                          {rx.status !== 'reviewed' && (
                            <button className="rx-action-btn rx-action-btn--approve"
                              title="Mark as Reviewed"
                              onClick={() => handleStatusChange(rx, 'reviewed')}>
                              <CheckIcon />
                            </button>
                          )}
                          {rx.status !== 'cleared' && (
                            <button className="rx-action-btn rx-action-btn--clear"
                              title="Clear / No Action"
                              onClick={() => handleStatusChange(rx, 'cleared')}>
                              ✓
                            </button>
                          )}
                          {rx.status !== 'manual' && (
                            <button className="rx-action-btn rx-action-btn--flag"
                              title="Flag for Manual Review"
                              onClick={() => handleStatusChange(rx, 'manual')}>
                              ⚑
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Signals panel */}
        <aside className="signals-panel">
          <div className="signals-card">
            <div className="signals-header">
              <div className="signals-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                Review Signals
              </div>
              <button className="how-it-works"
                onClick={() => alert('Review Signals analyze each prescription using multiple clinical checks before it reaches the pharmacist.')}>
                How it works
              </button>
            </div>

            {signals.map((s, i) => (
              <div key={i} className={`signal-item${showSignal === i ? ' signal-item--open' : ''}`}
                tabIndex={0} role="button"
                onClick={() => setShowSignal(showSignal === i ? null : i)}
                onKeyDown={e => e.key === 'Enter' && setShowSignal(showSignal === i ? null : i)}>
                <div className={`signal-icon ${s.cls}`}>{s.icon}</div>
                <div className="signal-info">
                  <strong>{s.title}</strong>
                  {showSignal === i
                    ? <span className="signal-desc">{s.desc}</span>
                    : <span>Click to learn more</span>
                  }
                </div>
                <div className="signal-chevron" style={{ transform: showSignal === i ? 'rotate(90deg)' : undefined }}>
                  <ChevronRight />
                </div>
              </div>
            ))}
          </div>

          <div className="safe-care">
            <div className="icon">💡</div>
            <h3>Built for safer care</h3>
            <p>Combining AI with clinical expertise to catch potential issues early — before they reach the patient.</p>
            <button className="btn-primary" style={{ marginTop:12, width:'100%', justifyContent:'center' }}
              onClick={() => onNavigate('prescriptions')}>
              View all prescriptions <ChevronRight />
            </button>
          </div>
        </aside>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Prescriptions page
// ─────────────────────────────────────────────────────────────────────────────

function PrescriptionsPage({ onUpload }: { onUpload: () => void }) {
  const [rxList,   setRxList]   = useState<ApiPrescription[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [query,    setQuery]    = useState('')
  const [statusF,  setStatusF]  = useState('')
  const [selected, setSelected] = useState<ApiPrescription | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await apiFetch<ApiPrescription[]>('/prescriptions')
      setRxList(data)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rxList.filter(r => {
    const matchQ = !query.trim()
      || r.patientName.toLowerCase().includes(query.toLowerCase())
      || r.rxId.toLowerCase().includes(query.toLowerCase())
      || r.medication.toLowerCase().includes(query.toLowerCase())
    const matchS = !statusF || r.status === statusF
    return matchQ && matchS
  })

  async function changeStatus(rx: ApiPrescription, s: string) {
    try {
      const updated = await apiFetch<ApiPrescription>(`/prescriptions/${rx.id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: s, substatus: null }),
      })
      setRxList(prev => prev.map(r => r.id === updated.id ? updated : r))
      if (selected?.id === rx.id) setSelected(updated)
    } catch (e: unknown) { alert('Update failed: ' + (e instanceof Error ? e.message : e)) }
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="page-header" style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
        <div>
          <h1>Prescriptions</h1>
          <p>All prescriptions in the system</p>
        </div>
        <button className="upload-btn" onClick={onUpload}><UploadCloudIcon /> New Prescription</button>
      </div>

      {error && <ApiErrorBanner message={error} />}

      {/* Filters */}
      <div className="table-search-row" style={{ marginBottom: 16 }}>
        <div className="search-bar" style={{ width: 300 }}>
          <SearchIcon />
          <input type="search" placeholder="Search patient, Rx ID, medication…"
            value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {['','processing','manual','reviewed','cleared'].map(s => (
            <button key={s}
              className={`filter-pill${statusF === s ? ' active' : ''}`}
              onClick={() => setStatusF(s)}>
              {s === '' ? 'All' : BADGE_LABELS[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      {loading
        ? <div className="loading-page"><Spinner /> Loading…</div>
        : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Time</th><th>Rx ID</th><th>Patient</th>
                  <th>Medication</th><th>Prescriber</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign:'center', color:'#94a3b8', padding:24 }}>
                    No prescriptions match your filters
                  </td></tr>
                )}
                {filtered.map(rx => {
                  const t = rx.createdAt ? new Date(rx.createdAt) : null
                  return (
                    <tr key={rx.id} tabIndex={0} className={selected?.id === rx.id ? 'tr--selected' : ''}
                      onClick={() => setSelected(rx === selected ? null : rx)}>
                      <td className="td-time">{t ? t.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                      <td className="td-rxid">{rx.rxId}</td>
                      <td>
                        <div className="patient-name">{rx.patientName}</div>
                        <div className="patient-dob">DOB {rx.patientDob}</div>
                      </td>
                      <td style={{ fontSize:13 }}>
                        <div style={{ fontWeight:500 }}>{rx.medication}</div>
                        {rx.dosage && <div style={{ fontSize:11, color:'#94a3b8' }}>{rx.dosage}</div>}
                      </td>
                      <td style={{ fontSize:12, color:'#64748b' }}>{rx.prescriber ?? '—'}</td>
                      <td><Badge status={rx.status} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="rx-actions">
                          {rx.status !== 'reviewed' && <button className="rx-action-btn rx-action-btn--approve" title="Mark Reviewed" onClick={() => changeStatus(rx,'reviewed')}><CheckIcon /></button>}
                          {rx.status !== 'cleared'  && <button className="rx-action-btn rx-action-btn--clear"   title="Clear"         onClick={() => changeStatus(rx,'cleared')}>✓</button>}
                          {rx.status !== 'manual'   && <button className="rx-action-btn rx-action-btn--flag"    title="Flag Manual"   onClick={() => changeStatus(rx,'manual')}>⚑</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="detail-drawer">
          <div className="detail-drawer-header">
            <h3>{selected.rxId} — {selected.patientName}</h3>
            <button className="modal-close" onClick={() => setSelected(null)}><XIcon /></button>
          </div>
          <div className="detail-grid">
            <div className="detail-item"><span className="detail-label">Patient</span><span>{selected.patientName}</span></div>
            <div className="detail-item"><span className="detail-label">DOB</span><span>{selected.patientDob}</span></div>
            <div className="detail-item"><span className="detail-label">Medication</span><span>{selected.medication}</span></div>
            <div className="detail-item"><span className="detail-label">Dosage</span><span>{selected.dosage ?? '—'}</span></div>
            <div className="detail-item"><span className="detail-label">Prescriber</span><span>{selected.prescriber ?? '—'}</span></div>
            <div className="detail-item"><span className="detail-label">Status</span><span><Badge status={selected.status} /></span></div>
            <div className="detail-item" style={{ gridColumn:'1/-1' }}>
              <span className="detail-label">Instructions</span>
              <span>{selected.instructions ?? '—'}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            {selected.status !== 'reviewed' && <button className="btn-primary" onClick={() => changeStatus(selected,'reviewed')}><CheckIcon /> Mark Reviewed</button>}
            {selected.status !== 'cleared'  && <button className="btn-cancel"  onClick={() => changeStatus(selected,'cleared')}>Clear</button>}
            {selected.status !== 'manual'   && <button className="btn-cancel"  onClick={() => changeStatus(selected,'manual')}>⚑ Flag for Review</button>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Patient Lookup page
// ─────────────────────────────────────────────────────────────────────────────

function PatientLookup({ onUploadForPatient }: { onUploadForPatient: (p: ApiPatient) => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [dob,       setDob]       = useState('')
  const [phone,     setPhone]     = useState('')
  const [results,   setResults]   = useState<ApiPatient[] | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [showCreate,setShowCreate]= useState(false)
  const [creating,  setCreating]  = useState(false)
  const [createOk,  setCreateOk]  = useState<string | null>(null)
  const [form, setForm] = useState({ firstName:'', lastName:'', dob:'', phone:'', email:'', address:'', notes:'' })

  const hasInput = firstName || lastName || dob || phone

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!hasInput) return
    setLoading(true); setError(null); setShowCreate(false); setCreateOk(null)
    try {
      const params = new URLSearchParams()
      if (firstName) params.set('firstName', firstName)
      if (lastName)  params.set('lastName',  lastName)
      if (dob)       params.set('dob',       dob)
      if (phone)     params.set('phone',     phone)
      const data = await apiFetch<ApiPatient[]>(`/patients?${params}`)
      setResults(data)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Search failed') }
    finally { setLoading(false) }
  }

  function handleClear() {
    setFirstName(''); setLastName(''); setDob(''); setPhone('')
    setResults(null); setError(null); setShowCreate(false); setCreateOk(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.firstName.trim() || !form.lastName.trim() || !form.dob.trim()) return
    setCreating(true); setError(null)
    try {
      const created = await apiFetch<ApiPatient>('/patients', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName:  form.lastName.trim(),
          dob:       form.dob.trim(),
          phone:     form.phone.trim()   || null,
          email:     form.email.trim()   || null,
          address:   form.address.trim() || null,
          notes:     form.notes.trim()   || null,
        }),
      })
      setCreateOk(`${created.fullName} created successfully!`)
      setShowCreate(false)
      setForm({ firstName:'', lastName:'', dob:'', phone:'', email:'', address:'', notes:'' })
      // refresh results if we had a search
      if (results !== null) handleSearch({ preventDefault: () => {} } as React.FormEvent)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Create failed') }
    finally { setCreating(false) }
  }

  // Count shared phones in results
  const phoneCounts = new Map<string, number>()
  if (results) {
    for (const p of results) {
      const k = (p.phone ?? '').replace(/[\s\-()+]/g, '')
      if (k) phoneCounts.set(k, (phoneCounts.get(k) ?? 0) + 1)
    }
  }

  return (
    <div className="lookup-page">
      <div className="page-header">
        <h1>Patient Lookup</h1>
        <p>Search by any combination of name, date of birth, or phone number</p>
      </div>

      {/* Search card */}
      <div className="lookup-card">
        <div className="lookup-card-header">
          <div className="lookup-card-title"><SearchIcon size={18} /> Search Criteria</div>
          <p className="lookup-hint">Fill in one or more fields — partial matches are supported</p>
        </div>
        <form onSubmit={handleSearch} aria-label="Patient search form">
          <div className="lookup-fields">
            {[
              { id:'firstName', label:'First Name',   val:firstName, set:setFirstName, ph:'e.g. Emily' },
              { id:'lastName',  label:'Last Name',    val:lastName,  set:setLastName,  ph:'e.g. Carter' },
              { id:'dob',       label:'Date of Birth',val:dob,       set:setDob,       ph:'MM/DD/YYYY or partial' },
              { id:'phone',     label:'Phone Number', val:phone,     set:setPhone,     ph:'Full or last 4 digits' },
            ].map(f => (
              <div key={f.id} className="field-group">
                <label htmlFor={f.id} className="field-label">{f.label}</label>
                <input id={f.id} className="field-input" type="text" placeholder={f.ph}
                  value={f.val} onChange={e => { f.set(e.target.value); setResults(null) }} />
              </div>
            ))}
          </div>
          <div className="lookup-actions">
            {hasInput && <button type="button" className="btn-cancel" onClick={handleClear}>Clear</button>}
            <button type="submit" className="btn-primary" disabled={!hasInput || loading}>
              {loading ? <><Spinner small /> Searching…</> : <><SearchIcon size={14} /> Search Patients</>}
            </button>
          </div>
        </form>
      </div>

      {error     && <ApiErrorBanner message={error} />}
      {createOk  && <div className="create-success"><div className="create-success-icon">✅</div><div className="create-success-text"><strong>{createOk}</strong></div></div>}

      {/* Tips */}
      {results === null && !showCreate && (
        <div className="lookup-tips">
          {[
            { icon:'💡', title:'Partial search works',        text:'Type "Kim" in Last Name or "04/12" in DOB to find partial matches.' },
            { icon:'📞', title:'Shared phone numbers',        text:'A parent may use their number for a child. All matches are shown with a warning.' },
            { icon:'👥', title:'Multiple matches are normal', text:'Common names or shared DOBs return several results. Always confirm with a second field.' },
          ].map(t => (
            <div key={t.title} className="tip-item">
              <span className="tip-icon">{t.icon}</span>
              <div><strong>{t.title}</strong><span>{t.text}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {results !== null && (
        <div className="lookup-results">
          <div className="results-header">
            <span className={`results-count${results.length === 0 ? ' none' : ''}`}>
              {results.length === 0 ? 'No patients found' : `${results.length} match${results.length !== 1 ? 'es' : ''} found`}
            </span>
            {results.length > 1 && (
              <span className="results-note">⚠️ Multiple matches — verify with a second identifier</span>
            )}
          </div>
          {results.length === 0 && (
            <div className="no-results">
              <div className="no-results-icon">🔍</div>
              <p>No patients matched your search criteria.</p>
              <p className="no-results-sub">Try fewer fields or check the spelling.</p>
            </div>
          )}
          <div className="results-grid">
            {results.map(p => {
              const pk = (p.phone ?? '').replace(/[\s\-()+]/g, '')
              const shared = pk ? (phoneCounts.get(pk) ?? 1) > 1 : false
              return (
                <div key={p.id} className={`result-card${shared ? ' result-card--warning' : ''}`}>
                  <div className="result-card-top">
                    <Avatar id={p.id} fn={p.firstName} ln={p.lastName} size={46} />
                    <div className="result-identity">
                      <div className="result-name">{p.fullName}</div>
                      <div className="result-meta">DOB {p.dob}</div>
                    </div>
                    <button className="btn-select-patient"
                      onClick={() => onUploadForPatient(p)}>
                      New Rx <ChevronRight />
                    </button>
                  </div>
                  <div className="result-details">
                    <div className="result-detail-row">
                      <span className="detail-label">Phone</span>
                      <span className="detail-value">
                        {p.phone ?? '—'}
                        {shared && <span className="shared-phone-tag">Shared number</span>}
                      </span>
                    </div>
                    <div className="result-detail-row">
                      <span className="detail-label">DOB</span>
                      <span className="detail-value">{p.dob}</span>
                    </div>
                    {p.email && (
                      <div className="result-detail-row">
                        <span className="detail-label">Email</span>
                        <span className="detail-value">{p.email}</span>
                      </div>
                    )}
                    {p.notes && <div className="result-note"><span className="note-icon">ℹ️</span>{p.notes}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Create new patient */}
      {!showCreate ? (
        <div className="create-cta">
          <div className="create-cta-text">
            <strong>Patient not found?</strong>
            <span>Create a new patient record — any info you've already typed will be pre-filled.</span>
          </div>
          <button className="btn-create-patient" onClick={() => {
            setForm(f => ({ ...f, firstName, lastName, dob, phone }))
            setShowCreate(true)
          }}>
            ＋ Create New Patient
          </button>
        </div>
      ) : (
        <div className="create-panel">
          <div className="create-panel-header">
            <div className="create-panel-title">👤 Create New Patient</div>
            <button className="modal-close" onClick={() => setShowCreate(false)}><XIcon /></button>
          </div>
          <form onSubmit={handleCreate}>
            {error && <ApiErrorBanner message={error} />}
            <div className="create-form-grid">
              {[
                { id:'cf-fn', label:'First Name', req:true,  val:form.firstName, key:'firstName' as const, ph:'e.g. Emily',                type:'text'  },
                { id:'cf-ln', label:'Last Name',  req:true,  val:form.lastName,  key:'lastName'  as const, ph:'e.g. Carter',               type:'text'  },
                { id:'cf-db', label:'Date of Birth',req:true,val:form.dob,       key:'dob'       as const, ph:'MM/DD/YYYY',                type:'text'  },
                { id:'cf-ph', label:'Phone',      req:false, val:form.phone,     key:'phone'     as const, ph:'(555) 000-0000',            type:'text'  },
                { id:'cf-em', label:'Email',      req:false, val:form.email,     key:'email'     as const, ph:'patient@email.com',         type:'email' },
                { id:'cf-ad', label:'Address',    req:false, val:form.address,   key:'address'   as const, ph:'123 Main St, City, State',  type:'text'  },
              ].map(f => (
                <div key={f.id} className="field-group">
                  <label htmlFor={f.id} className="field-label">{f.label}{f.req && <span className="req"> *</span>}</label>
                  <input id={f.id} className="field-input" type={f.type} placeholder={f.ph} value={f.val}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} required={f.req} />
                </div>
              ))}
            </div>
            <div className="field-group cf-notes" style={{ marginBottom:12 }}>
              <label htmlFor="cf-notes" className="field-label">Notes</label>
              <textarea id="cf-notes" className="field-input field-textarea" rows={3}
                placeholder="Allergies, special considerations, family contacts…"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <p className="req-note"><span className="req">*</span> Required fields</p>
            <div className="lookup-actions">
              <button type="button" className="btn-cancel" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</button>
              <button type="submit" className="btn-primary"
                disabled={!form.firstName.trim() || !form.lastName.trim() || !form.dob.trim() || creating}>
                {creating ? <><Spinner small /> Saving…</> : <>👤 Create Patient</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Root App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeNav,      setActiveNav]      = useState('dashboard')
  const [showModal,      setShowModal]      = useState(false)
  const [modalPatient,   setModalPatient]   = useState<ApiPatient | null>(null)
  const [refreshKey,     setRefreshKey]     = useState(0)
  const [globalSearch,   setGlobalSearch]   = useState('')
  const [notifOpen,      setNotifOpen]      = useState(false)

  function openUpload(patient?: ApiPatient) {
    setModalPatient(patient ?? null)
    setShowModal(true)
  }

  function handleRxCreated() {
    setRefreshKey(k => k + 1)
    setActiveNav('dashboard')
  }

  const navItems = [
    { id: 'dashboard',     label: 'Dashboard',     icon: '🏠' },
    { id: 'prescriptions', label: 'Prescriptions', icon: '📋' },
    { id: 'patients',      label: 'Patients',      icon: '👤' },
    { id: 'reviews',       label: 'Reviews',       icon: '🛡️' },
    { id: 'analytics',     label: 'Analytics',     icon: '📊' },
    { id: 'settings',      label: 'Settings',      icon: '⚙️' },
  ]

  const notifications = [
    { icon:'⚠️', text:'RX-78431 — Drug interaction flagged for Michael Chen', time:'2m ago' },
    { icon:'📋', text:'RX-78430 — Sarah Johnson cleared by Dr. Wright',        time:'14m ago' },
    { icon:'🔔', text:'RX-78428 — Lisa Patel awaiting manual review',          time:'26m ago' },
  ]

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar" role="navigation" aria-label="Main navigation">
        <div className="sidebar-logo">
          <div className="logo-icon">Rx</div>
          <div className="logo-text">
            <div className="brand">RxGuardian</div>
            <div className="tagline">Safer Prescriptions.<br />Healthier People.</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button key={item.id}
              className={`nav-item${activeNav === item.id ? ' active' : ''}`}
              onClick={() => setActiveNav(item.id)}
              aria-current={activeNav === item.id ? 'page' : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">JD</div>
            <div className="sidebar-user-info">
              <div className="name">Dr. Jane Doe</div>
              <div className="role">Clinical Pharmacist</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        <header className="topbar" role="banner">
          {/* Global search */}
          <form className="search-bar" role="search"
            onSubmit={e => { e.preventDefault(); if (globalSearch.trim()) { setActiveNav('prescriptions') } }}>
            <SearchIcon />
            <input type="search" placeholder="Search prescriptions, patients, or Rx ID…"
              value={globalSearch} onChange={e => setGlobalSearch(e.target.value)}
              aria-label="Global search" />
          </form>

          <div className="topbar-right">
            {/* Notifications */}
            <div style={{ position:'relative' }}>
              <button className="icon-btn" aria-label="Notifications"
                onClick={() => setNotifOpen(o => !o)}>
                <BellIcon />
                <span className="notif-badge" />
              </button>
              {notifOpen && (
                <div className="notif-dropdown">
                  <div className="notif-header">
                    <strong>Notifications</strong>
                    <button className="modal-close" style={{ width:24,height:24 }} onClick={() => setNotifOpen(false)}><XIcon /></button>
                  </div>
                  {notifications.map((n, i) => (
                    <div key={i} className="notif-item" onClick={() => { setActiveNav('prescriptions'); setNotifOpen(false) }}>
                      <span className="notif-icon">{n.icon}</span>
                      <div>
                        <div style={{ fontSize:12, color:'#0f172a' }}>{n.text}</div>
                        <div style={{ fontSize:11, color:'#94a3b8' }}>{n.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="topbar-user">
              <div className="topbar-avatar">JD</div>
              <div className="topbar-user-info">
                <div className="name">Dr. Jane Doe</div>
                <div className="role">Clinical Pharmacist</div>
              </div>
            </div>

            <button className="upload-btn" onClick={() => openUpload()}>
              <UploadCloudIcon /> Upload Prescription
            </button>
          </div>
        </header>

        <main className="page-body">
          {activeNav === 'dashboard'     && <Dashboard key={refreshKey} onUpload={() => openUpload()} onNavigate={setActiveNav} />}
          {activeNav === 'prescriptions' && <PrescriptionsPage key={refreshKey} onUpload={() => openUpload()} />}
          {activeNav === 'patients'      && <PatientLookup onUploadForPatient={p => openUpload(p)} />}
          {(activeNav === 'reviews' || activeNav === 'analytics' || activeNav === 'settings') && (
            <div className="placeholder-page">
              <div className="placeholder-icon">🚧</div>
              <h2>{navItems.find(n => n.id === activeNav)?.label}</h2>
              <p>This section is coming soon — prescription image AI review will live here.</p>
            </div>
          )}
        </main>
      </div>

      {showModal && (
        <UploadModal
          onClose={() => { setShowModal(false); setModalPatient(null) }}
          onCreated={handleRxCreated}
          preselectedPatient={modalPatient}
        />
      )}
    </div>
  )
}

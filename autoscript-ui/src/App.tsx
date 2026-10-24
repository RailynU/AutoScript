import { useState, useCallback, useEffect, useRef } from 'react'
import './App.css'

// Backend-driven data layer
import { prescriptionsApi, statusMeta } from './api/prescriptions'
import { patientsApi } from './api/patients'
import { usePrescriptions } from './hooks/usePrescriptions'
import { avatarColor, initials } from './ui/avatar'
import { PrescriptionPreview } from './components/PrescriptionPreview'
import { scriptsApi } from './api/scripts'
import type { ScriptData, Flag, ReviewResult } from './api/scripts'
import { ApiError } from './api/client'

/**
 * Convert a patient DOB to the ISO yyyy-MM-dd form the backend ScriptData
 * (a LocalDate) expects. Accepts "MM/DD/YYYY" or an already-ISO string;
 * returns null if it can't be parsed.
 */
function toIsoDob(dob: string | null | undefined): string | null {
  if (!dob) return null
  const s = dob.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s            // already ISO
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)   // MM/DD/YYYY
  if (m) {
    const [, mm, dd, yyyy] = m
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  return null
}
import type {
  ApiPatient,
  ApiPrescription,
  PrescriptionStatus,
} from './api/types'

// ─────────────────────────────────────────────────────────────────────────────
// Thin fetch shim — kept so existing inline callers keep working while the app
// migrates to the api/ + hooks/ layer. New code should import from ./api/*.
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase()
  const body = options?.body ? JSON.parse(options.body as string) : undefined

  if (path === '/prescriptions' && method === 'GET') return prescriptionsApi.list() as Promise<T>
  if (path === '/prescriptions/stats')               return prescriptionsApi.stats() as Promise<T>
  if (path.startsWith('/prescriptions?q=')) {
    const q = decodeURIComponent(path.split('q=')[1] ?? '')
    return prescriptionsApi.list(q) as Promise<T>
  }
  if (path === '/prescriptions' && method === 'POST') return prescriptionsApi.create(body) as Promise<T>
  const statusMatch = path.match(/^\/prescriptions\/(\d+)\/status$/)
  if (statusMatch && method === 'PATCH') {
    return prescriptionsApi.updateStatus(Number(statusMatch[1]), body.status, body.substatus) as Promise<T>
  }
  if (path === '/patients' && method === 'GET')  return patientsApi.search() as Promise<T>
  if (path === '/patients' && method === 'POST') return patientsApi.create(body) as Promise<T>
  if (path.startsWith('/patients?')) {
    const sp = new URLSearchParams(path.split('?')[1])
    return patientsApi.search({
      firstName: sp.get('firstName') ?? undefined,
      lastName:  sp.get('lastName')  ?? undefined,
      dob:       sp.get('dob')       ?? undefined,
      phone:     sp.get('phone')     ?? undefined,
    }) as Promise<T>
  }
  throw new Error(`Unmapped API path: ${method} ${path}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI components
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ status }: { status: string }) {
  const meta = statusMeta(status)
  return (
    <span className={`badge badge-${meta.variant}`}>
      <span className="badge-dot" />
      {meta.label}
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
  const [file, setFile]               = useState<File | null>(null)
  const fileName = file?.name ?? null

  // Patient lookup form state (replaces the old "load all patients" list).
  const [lookupFirst, setLookupFirst] = useState('')
  const [lookupLast,  setLookupLast]  = useState('')
  const [lookupDob,   setLookupDob]   = useState('')
  const [lookupPhone, setLookupPhone] = useState('')
  const [ptResults, setPtResults]     = useState<ApiPatient[] | null>(null) // null = no search run yet
  const [ptLoading, setPtLoading]     = useState(false)

  // Rx form fields. All six are collected separately in the UI, then composed
  // into the backend's limited shape on submit (see handleCreate).
  const [drugName,     setDrugName]     = useState('')
  const [directions,   setDirections]   = useState('')
  const [quantity,     setQuantity]     = useState('')
  const [daySupply,    setDaySupply]    = useState('')
  const [prescriberName, setPrescriberName] = useState('Dr. Jane Doe')
  const [npiDea,       setNpiDea]       = useState('')
  const [saving,  setSaving]          = useState(false)
  const [error,   setError]           = useState<string | null>(null)
  const [autofilling, setAutofilling] = useState(false)
  const [autofillNote, setAutofillNote] = useState<string | null>(null)
  const [reviewing, setReviewing]     = useState(false)
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null)
  const [reviewNote, setReviewNote]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Create-new-patient fallback (shown when a lookup returns no matches).
  const [showCreatePt, setShowCreatePt] = useState(false)
  const [creatingPt, setCreatingPt]     = useState(false)
  const [newPt, setNewPt] = useState({ firstName: '', lastName: '', dob: '', phone: '', email: '' })

  function pickFile(f: File | undefined | null) {
    // Only accept a new file when none is currently loaded — the user must
    // remove the current image before uploading another.
    if (f && !file) setFile(f)
  }

  async function handleCreatePatient() {
    if (!newPt.firstName.trim() || !newPt.lastName.trim() || !newPt.dob.trim()) return
    setCreatingPt(true)
    setError(null)
    try {
      const created = await apiFetch<ApiPatient>('/patients', {
        method: 'POST',
        body: JSON.stringify({
          firstName: newPt.firstName.trim(),
          lastName:  newPt.lastName.trim(),
          dob:       newPt.dob.trim(),
          phone:     newPt.phone.trim() || null,
          email:     newPt.email.trim() || null,
        }),
      })
      setPatient(created)          // auto-select the new patient
      setShowCreatePt(false)
      setPtResults([created])      // reflect it in the results list
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create patient')
    } finally {
      setCreatingPt(false)
    }
  }

  async function handleAutofill() {
    if (!file) return
    setAutofilling(true)
    setAutofillNote(null)
    setError(null)
    try {
      const data = await scriptsApi.autofill(file)
      // Map extracted fields onto the six rx form fields. Only overwrite a
      // field when the AI actually returned a value for it.
      if (data.drugName)       setDrugName(data.drugName)
      if (data.directions)     setDirections(data.directions)
      if (data.quantity != null)  setQuantity(String(data.quantity))
      if (data.daySupply != null) setDaySupply(String(data.daySupply))
      if (data.prescriberName) setPrescriberName(data.prescriberName)
      if (data.prescriberNpi)  setNpiDea(data.prescriberNpi)
      setAutofillNote('✨ Fields autofilled from the image. Please verify against the prescription before starting review.')
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setAutofillNote('AI autofill is not enabled on the server. Enter the details manually while viewing the image.')
      } else {
        setAutofillNote(e instanceof Error ? e.message : 'Autofill failed. Enter the details manually.')
      }
    } finally {
      setAutofilling(false)
    }
  }

  // "Verify against image": compare the entered fields with what the model reads
  // from the image, and show any mismatches inline before saving.
  async function handleReview() {
    if (!file) return
    setReviewing(true)
    setReviewNote(null)
    setReviewResult(null)
    setError(null)
    try {
      // Patient identity comes from the selected patient record; the rest from
      // the six clinical fields on the form.
      const result = await scriptsApi.review(file, {
        patientFirstName:   patient?.firstName ?? null,
        patientLastName:    patient?.lastName ?? null,
        patientDateOfBirth: toIsoDob(patient?.dob),
        drugName:       drugName.trim() || null,
        directions:     directions.trim() || null,
        quantity:       quantity.trim() ? Number(quantity) : null,
        daySupply:      daySupply.trim() ? Number(daySupply) : null,
        prescriberName: prescriberName.trim() || null,
        prescriberNpi:  npiDea.trim() || null,
      })
      setReviewResult(result)
      // Never claim the script is "safe": use the backend's summary wording.
      setReviewNote(result.flags.length === 0
        ? `✅ ${result.summary}`
        : `⚠️ ${result.flags.length} field${result.flags.length !== 1 ? 's' : ''} differ from the image. Review the flags below.`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setReviewNote('AI review is not enabled on the server.')
      } else {
        setReviewNote(e instanceof Error ? e.message : 'Review could not be completed.')
      }
    } finally {
      setReviewing(false)
    }
  }

  // Run a patient lookup against GET /api/patients with the entered params
  // (partial match). Only the matching results are shown — we never load all
  // patients up front.
  async function handlePatientSearch() {
    setPtLoading(true)
    setError(null)
    setShowCreatePt(false)
    try {
      const params = new URLSearchParams()
      if (lookupFirst.trim()) params.set('firstName', lookupFirst.trim())
      if (lookupLast.trim())  params.set('lastName',  lookupLast.trim())
      if (lookupDob.trim())   params.set('dob',       lookupDob.trim())
      if (lookupPhone.trim()) params.set('phone',     lookupPhone.trim())
      const results = await apiFetch<ApiPatient[]>(`/patients?${params.toString()}`)
      setPtResults(results)
      // Pre-fill the create-patient form with whatever was typed, so if there
      // are no matches the user can create a profile without retyping.
      setNewPt(p => ({
        ...p,
        firstName: lookupFirst.trim() || p.firstName,
        lastName:  lookupLast.trim()  || p.lastName,
        dob:       lookupDob.trim()   || p.dob,
        phone:     lookupPhone.trim() || p.phone,
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Patient search failed')
      setPtResults([])
    } finally {
      setPtLoading(false)
    }
  }

  // Are all six required rx fields filled? (quantity / daySupply must be numeric)
  const rxValid =
    drugName.trim() !== '' &&
    directions.trim() !== '' &&
    quantity.trim() !== '' && !Number.isNaN(Number(quantity)) &&
    daySupply.trim() !== '' && !Number.isNaN(Number(daySupply)) &&
    prescriberName.trim() !== '' &&
    npiDea.trim() !== ''

  async function handleCreate() {
    if (!patient || !rxValid) return
    setSaving(true)
    setError(null)
    try {
      // 1) Persist the prescription record. The backend prescription entity has
      //    { patientId, medication, dosage, instructions, prescriber }, so the
      //    six UI fields are composed into that shape:
      //      medication   = Drug Name
      //      instructions = Directions
      //      dosage       = "Qty {quantity} · {daySupply}-day supply"
      //      prescriber   = "{prescriberName} (NPI/DEA: {npiDea})"
      await apiFetch('/prescriptions', {
        method: 'POST',
        body: JSON.stringify({
          patientId:    patient.id,
          medication:   drugName.trim(),
          dosage:       `Qty ${quantity.trim()} · ${daySupply.trim()}-day supply`,
          instructions: directions.trim(),
          prescriber:   `${prescriberName.trim()} (NPI/DEA: ${npiDea.trim()})`,
        }),
      })

      // 2) If we have the image, send it + the verified fields to the AI review
      //    endpoint so the backend can cross-check for dispensing errors.
      //    This is best-effort: if AI is disabled (404) or unreachable, the
      //    prescription is still created — we just skip the automated flags.
      if (file) {
        try {
          const scriptData: ScriptData = {
            patientFirstName:   patient.firstName,
            patientLastName:    patient.lastName,
            patientDateOfBirth: toIsoDob(patient.dob),
            drugName:           drugName.trim(),
            directions:         directions.trim(),
            quantity:           Number(quantity),
            daySupply:          Number(daySupply),
            refillCount:        null,
            prescriberName:     prescriberName.trim(),
            prescriberNpi:      npiDea.trim(),
            prescriberPhone:    null,
          }
          await scriptsApi.review(file, scriptData)
        } catch (reviewErr) {
          // Non-fatal — the record is saved; the AI review is optional.
          if (reviewErr instanceof ApiError && reviewErr.status === 404) {
            // AI not enabled on the server; nothing to do.
          } else {
            console.warn('AI review skipped:', reviewErr)
          }
        }
      }

      onCreated()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create prescription')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className={`modal${step === 'rx' || step === 'patient' ? ' modal--wide' : ''}`} onClick={e => e.stopPropagation()}
        style={{ maxWidth: step === 'rx' || step === 'patient' ? 960 : 560 }}>

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
                onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />

              {!file ? (
                // No file yet — show the drop zone.
                <div className="drop-zone" role="button" tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
                  onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]) }}
                  onDragOver={e => e.preventDefault()}
                >
                  <div className="drop-icon">☁️</div>
                  <p>Drag and drop a prescription image or PDF here<br />
                    <span className="browse">or click to browse</span></p>
                  <p className="formats">Supports JPG, PNG, PDF (max 10MB)</p>
                </div>
              ) : (
                // A file is loaded — lock the uploader. To change it the user
                // must first remove the current image.
                <div className="uploaded-file-card">
                  <div className="uploaded-file-info">
                    <span className="uploaded-file-icon">📄</span>
                    <div>
                      <div className="uploaded-file-name">{fileName}</div>
                      <div className="uploaded-file-size">{(file.size / 1024).toFixed(0)} KB</div>
                    </div>
                  </div>
                  <button className="btn-remove-file" onClick={() => setFile(null)} aria-label="Remove uploaded image">
                    <XIcon /> Remove
                  </button>
                </div>
              )}

              <div className="modal-footer" style={{ marginTop: 16 }}>
                <button className="btn-cancel" onClick={onClose}>Cancel</button>
                <button className="btn-primary" disabled={!file} onClick={() => setStep('patient')}>
                  Proceed <ChevronRight />
                </button>
              </div>
            </>
          )}

          {/* Step 2 — Patient lookup: image preview (left) + lookup/create (right) */}
          {step === 'patient' && (
            <div className="details-layout">
              {/* LEFT — the uploaded script, visible while looking up the patient */}
              <div className="details-preview">
                <PrescriptionPreview file={file} onReupload={() => setStep('file')} />
              </div>

              {/* RIGHT — lookup form + results, or the create-patient fallback */}
              <div className="details-form">
                {!showCreatePt ? (
                  <>
                    {/* Lookup form — search GET /api/patients by partial match */}
                    <form className="create-form-grid" style={{ marginBottom: 12 }}
                      onSubmit={e => { e.preventDefault(); handlePatientSearch() }}>
                      <div className="field-group">
                        <label className="field-label">First Name</label>
                        <input className="field-input" type="text" placeholder="e.g. Jane"
                          value={lookupFirst} onChange={e => setLookupFirst(e.target.value)} autoFocus />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Last Name</label>
                        <input className="field-input" type="text" placeholder="e.g. Doe"
                          value={lookupLast} onChange={e => setLookupLast(e.target.value)} />
                      </div>
                      <div className="field-group">
                        <label className="field-label">DOB</label>
                        <input className="field-input" type="text" placeholder="MM/DD/YYYY"
                          value={lookupDob} onChange={e => setLookupDob(e.target.value)} />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Phone</label>
                        <input className="field-input" type="text" placeholder="e.g. 555-0100"
                          value={lookupPhone} onChange={e => setLookupPhone(e.target.value)} />
                      </div>
                      <div className="field-group" style={{ gridColumn:'1 / -1' }}>
                        <button type="submit" className="btn-primary" disabled={ptLoading}
                          style={{ justifySelf:'start' }}>
                          {ptLoading ? <><Spinner small /> Searching…</> : <><SearchIcon /> Search</>}
                        </button>
                      </div>
                    </form>

                    {/* Results — only matching patients */}
                    {ptResults !== null && !ptLoading && (
                      <>
                        <div className="patient-list" role="listbox" style={{ maxHeight: 220, overflowY:'auto' }}>
                          {ptResults.map(p => (
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
                        </div>

                        {/* No matches → offer to create a new patient profile */}
                        {ptResults.length === 0 && (
                          <div className="no-match-create">
                            <p className="no-match-text">No matching patient found.</p>
                            <button className="btn-primary" onClick={() => setShowCreatePt(true)}>
                              ＋ Create new patient
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  /* Create-new-patient form (prefilled from the lookup fields) */
                  <div className="create-pt-panel">
                    <div className="entry-mode-row" style={{ marginTop: 0 }}>
                      <span className="entry-mode-label">New patient profile</span>
                      <button className="chip-change" onClick={() => setShowCreatePt(false)}>Back to search</button>
                    </div>
                    <div className="create-form-grid" style={{ marginTop: 12 }}>
                      <div className="field-group">
                        <label className="field-label">First Name <span className="req">*</span></label>
                        <input className="field-input" type="text" value={newPt.firstName}
                          onChange={e => setNewPt(p => ({ ...p, firstName: e.target.value }))} />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Last Name <span className="req">*</span></label>
                        <input className="field-input" type="text" value={newPt.lastName}
                          onChange={e => setNewPt(p => ({ ...p, lastName: e.target.value }))} />
                      </div>
                      <div className="field-group">
                        <label className="field-label">DOB <span className="req">*</span></label>
                        <input className="field-input" type="text" placeholder="MM/DD/YYYY" value={newPt.dob}
                          onChange={e => setNewPt(p => ({ ...p, dob: e.target.value }))} />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Phone</label>
                        <input className="field-input" type="text" value={newPt.phone}
                          onChange={e => setNewPt(p => ({ ...p, phone: e.target.value }))} />
                      </div>
                      <div className="field-group" style={{ gridColumn:'1 / -1' }}>
                        <label className="field-label">Email</label>
                        <input className="field-input" type="email" value={newPt.email}
                          onChange={e => setNewPt(p => ({ ...p, email: e.target.value }))} />
                      </div>
                    </div>
                    <button className="btn-primary" style={{ marginTop: 12 }}
                      disabled={creatingPt || !newPt.firstName.trim() || !newPt.lastName.trim() || !newPt.dob.trim()}
                      onClick={handleCreatePatient}>
                      {creatingPt ? <><Spinner small /> Creating…</> : <>＋ Create & select patient</>}
                    </button>
                  </div>
                )}

                {/* Selected patient confirmation */}
                {patient && !showCreatePt && (
                  <div className="selected-patient-chip" style={{ marginTop: 12 }}>
                    <Avatar id={patient.id} fn={patient.firstName} ln={patient.lastName} size={32} />
                    <div>
                      <div style={{ fontWeight:600, fontSize:13 }}>{patient.fullName}</div>
                      <div style={{ fontSize:11, color:'#64748b' }}>DOB {patient.dob}</div>
                    </div>
                    <span style={{ color:'#2563eb', marginLeft:'auto' }}><CheckIcon /></span>
                  </div>
                )}

                <div className="modal-footer" style={{ marginTop: 16 }}>
                  <button className="btn-cancel" onClick={() => setStep('file')}>Back</button>
                  <button className="btn-primary" disabled={!patient} onClick={() => setStep('rx')}>
                    Continue <ChevronRight />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Details: image preview (left) + form (right) */}
          {step === 'rx' && (
            <div className="details-layout">
              {/* LEFT — prescription preview */}
              <div className="details-preview">
                <PrescriptionPreview file={file} onReupload={() => setStep('file')} />
              </div>

              {/* RIGHT — scrollable form */}
              <div className="details-form">
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

                {/* Autofill / manual entry toggle */}
                <div className="entry-mode-row">
                  <span className="entry-mode-label">Medication details</span>
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn-autofill" onClick={handleAutofill} disabled={!file || autofilling}
                      title={file ? 'Extract fields from the image using AI' : 'Upload an image first to autofill'}>
                      {autofilling ? <><Spinner small /> Reading image…</> : <>✨ Autofill from image</>}
                    </button>
                    <button className="btn-autofill" onClick={handleReview}
                      disabled={!file || reviewing || !drugName.trim()}
                      title={!file ? 'Upload an image first' : !drugName.trim() ? 'Enter at least the drug name' : 'Verify the entered details against the image'}>
                      {reviewing ? <><Spinner small /> Verifying…</> : <>🛡️ Verify against image</>}
                    </button>
                  </div>
                </div>
                {autofillNote && <div className="autofill-note">{autofillNote}</div>}
                {reviewNote && <div className="autofill-note">{reviewNote}</div>}
                {reviewResult && reviewResult.flags.length > 0 && (
                  <ul className="review-flags">
                    {reviewResult.flags.map((f: Flag) => (
                      <li key={f.field} className="review-flag">
                        <span className="review-flag-field">{f.field}</span>
                        <span className="review-flag-desc">{f.description}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="create-form-grid" style={{ marginTop: 12 }}>
                  <div className="field-group" style={{ gridColumn:'1 / -1' }}>
                    <label className="field-label">Drug Name <span className="req">*</span></label>
                    <input className="field-input" type="text" placeholder="e.g. Lisinopril 10mg"
                      value={drugName} onChange={e => setDrugName(e.target.value)} />
                  </div>
                  <div className="field-group" style={{ gridColumn:'1 / -1' }}>
                    <label className="field-label">Directions <span className="req">*</span></label>
                    <textarea className="field-input field-textarea" rows={2}
                      placeholder="e.g. Take 1 tablet by mouth once daily"
                      value={directions} onChange={e => setDirections(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Quantity <span className="req">*</span></label>
                    <input className="field-input" type="number" min="0" inputMode="numeric"
                      placeholder="e.g. 30"
                      value={quantity} onChange={e => setQuantity(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Day Supply <span className="req">*</span></label>
                    <input className="field-input" type="number" min="0" inputMode="numeric"
                      placeholder="e.g. 30"
                      value={daySupply} onChange={e => setDaySupply(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Prescriber Name <span className="req">*</span></label>
                    <input className="field-input" type="text" placeholder="e.g. Dr. Jane Doe"
                      value={prescriberName} onChange={e => setPrescriberName(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Prescriber NPI/DEA <span className="req">*</span></label>
                    <input className="field-input" type="text" placeholder="e.g. 1234567890"
                      value={npiDea} onChange={e => setNpiDea(e.target.value)} />
                  </div>
                </div>

                <div className="modal-footer" style={{ marginTop: 16 }}>
                  <button className="btn-cancel" onClick={() => setStep('patient')} disabled={saving}>Back</button>
                  <button className="btn-primary"
                    disabled={!rxValid || saving || !patient}
                    onClick={handleCreate}>
                    {saving ? <><Spinner small /> Saving…</> : <>Start Review <ChevronRight /></>}
                  </button>
                </div>
              </div>
            </div>
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
  // All prescription + stats data now comes from the backend-driven hook.
  const { data: rxList, stats, loading, error, refresh, setStatus } = usePrescriptions()
  const [globalQ, setGlobalQ]     = useState('')
  const [statusFilter, setStatusFilter] = useState<PrescriptionStatus | ''>('')
  const [showSignal, setShowSignal] = useState<number | null>(null)

  // Client-side narrowing on top of whatever the backend returned.
  // Status filter (from stat cards) and text search (from the box) are independent.
  const filtered = rxList.filter(r => {
    const matchesStatus = !statusFilter || r.status === statusFilter
    const q = globalQ.trim().toLowerCase()
    const matchesText = !q
      || r.patientName.toLowerCase().includes(q)
      || r.rxId.toLowerCase().includes(q)
      || r.medication.toLowerCase().includes(q)
    return matchesStatus && matchesText
  })

  // Pure client-side text filter so it composes with the status filter.
  // (rxList already holds the latest 50 from the backend.)
  function handleGlobalSearch(q: string) {
    setGlobalQ(q)
  }

  async function handleStatusChange(rx: ApiPrescription, newStatus: PrescriptionStatus) {
    try {
      await setStatus(rx.id, newStatus)
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
              onClick={() => setStatusFilter(prev => prev === card.status ? '' : card.status as PrescriptionStatus)}
              onKeyDown={e => e.key === 'Enter' && setStatusFilter(prev => prev === card.status ? '' : card.status as PrescriptionStatus)}
              style={{ outline: statusFilter === card.status ? '2px solid #2563eb' : undefined }}
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
        </div>
        {statusFilter && (
          <span className="active-filter-pill">
            {statusMeta(statusFilter).label}
            <button onClick={() => setStatusFilter('')} aria-label="Clear status filter">✕</button>
          </span>
        )}
        {(globalQ || statusFilter) && (
          <button className="btn-cancel" style={{ padding:'6px 12px', fontSize:12 }}
            onClick={() => { setGlobalQ(''); setStatusFilter(''); refresh() }}>
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
              <p>
                {filtered.length} prescription{filtered.length !== 1 ? 's' : ''}
                {statusFilter ? ` · ${statusMeta(statusFilter).label}` : ''}
                {globalQ ? ` · matching "${globalQ}"` : ''}
              </p>
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
              {s === '' ? 'All' : statusMeta(s).label}
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

import { useState, useEffect, useRef, useMemo } from 'react'
import './App.css'

// Backend-driven data layer
import { prescriptionsApi, statusMeta, severityRank, REVIEW_STATUS_LABEL } from './api/prescriptions'
import { patientsApi, formatDob, fullName, normalizePhone, parseList, toIsoDob } from './api/patients'
import { usePrescriptions } from './hooks/usePrescriptions'
import { avatarColor, initials } from './ui/avatar'
import { PrescriptionPreview } from './components/PrescriptionPreview'
import { PrescriptionDetail, SeverityChip } from './components/PrescriptionDetail'
import { API_BASE, ApiError } from './api/client'
import type {
  ApiPatient,
  ApiPrescription,
  CreatePatientRequest,
  PrescriptionStatus,
  ScriptData,
} from './api/types'

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

function Avatar({ id, fn, ln, size = 36 }: { id: string; fn: string; ln: string; size?: number }) {
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
    </div>
  )
}

/** Status badge + what the engine is doing / found, for table rows. */
function StatusCell({ rx }: { rx: ApiPrescription }) {
  return (
    <>
      <Badge status={rx.status} />
      {rx.status === 'PROCESSING' && (
        <div className="row-progress">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${rx.progressPercent}%` }} /></div>
          <span>{rx.progressMessage}</span>
        </div>
      )}
      {rx.status !== 'PROCESSING' && rx.findingCount > 0 && (
        <div className="row-findings"><SeverityChip severity={rx.highestSeverity} /> {rx.findingCount} finding{rx.findingCount !== 1 ? 's' : ''}</div>
      )}
      {rx.status === 'FAILED' && rx.failureReason && <div className="row-sub">{rx.failureReason.slice(0, 80)}</div>}
      {rx.reviewStatus !== 'PENDING_REVIEW' && <div className="row-sub">{REVIEW_STATUS_LABEL[rx.reviewStatus]}</div>}
    </>
  )
}

function rxTime(rx: ApiPrescription): string {
  return new Date(rx.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function rxMedication(rx: ApiPrescription): string {
  return rx.medicationSummary.length ? rx.medicationSummary.join(', ') : (rx.status === 'PROCESSING' ? 'Reading script…' : '—')
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
// New-patient form (shared by the intake modal and the Patients page)
// ─────────────────────────────────────────────────────────────────────────────

export interface NewPatientForm {
  firstName: string; lastName: string; dob: string; phone: string
  allergies: string; nkda: boolean; medications: string; conditions: string
}

export const EMPTY_PATIENT: NewPatientForm = { firstName: '', lastName: '', dob: '', phone: '', allergies: '', nkda: false, medications: '', conditions: '' }

/** Form → POST /api/patients body. Allergies typed as "Penicillin (rash)" keep the reaction. */
function toCreatePatient(f: NewPatientForm): CreatePatientRequest | string {
  const dateOfBirth = toIsoDob(f.dob)
  if (!f.firstName.trim() || !f.lastName.trim()) return 'First and last name are required.'
  if (!dateOfBirth) return 'Date of birth must be MM/DD/YYYY.'
  const allergies = f.nkda ? [{ substance: 'NKDA', reaction: null, severity: 'UNKNOWN' as const }]
    : parseList(f.allergies).map(a => {
        const m = a.match(/^(.*?)\s*\((.*)\)\s*$/)
        const reaction = m ? m[2] : null
        return { substance: (m ? m[1] : a).trim(), reaction, severity: /anaphyla|severe/i.test(a) ? 'SEVERE' as const : 'UNKNOWN' as const }
      })
  return {
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim(),
    dateOfBirth,
    phone: normalizePhone(f.phone) || null,
    allergiesVerified: f.nkda || allergies.length > 0,
    allergies,
    conditions: parseList(f.conditions).map(name => ({ name, status: 'ACTIVE' as const })),
    medications: parseList(f.medications).map(name => ({ name, active: true })),
  }
}

function PatientFields({ form, setForm }: { form: NewPatientForm; setForm: (f: (p: NewPatientForm) => NewPatientForm) => void }) {
  const set = (k: keyof NewPatientForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }))
  return (
    <div className="create-form-grid">
      <div className="field-group">
        <label className="field-label">First Name <span className="req">*</span></label>
        <input className="field-input" type="text" placeholder="e.g. Emily" value={form.firstName} onChange={set('firstName')} />
      </div>
      <div className="field-group">
        <label className="field-label">Last Name <span className="req">*</span></label>
        <input className="field-input" type="text" placeholder="e.g. Carter" value={form.lastName} onChange={set('lastName')} />
      </div>
      <div className="field-group">
        <label className="field-label">Date of Birth <span className="req">*</span></label>
        <input className="field-input" type="text" placeholder="MM/DD/YYYY" value={form.dob} onChange={set('dob')} />
      </div>
      <div className="field-group">
        <label className="field-label">Phone</label>
        <input className="field-input" type="text" placeholder="(555) 000-0000" value={form.phone} onChange={set('phone')} />
      </div>
      <div className="field-group" style={{ gridColumn: '1 / -1' }}>
        <label className="field-label">Allergies</label>
        <input className="field-input" type="text" disabled={form.nkda} placeholder="e.g. Penicillin (hives), Sulfa"
          value={form.nkda ? '' : form.allergies} onChange={set('allergies')} />
        <label className="checkbox-row">
          <input type="checkbox" checked={form.nkda} onChange={e => setForm(p => ({ ...p, nkda: e.target.checked }))} />
          No known drug allergies (NKDA), confirmed with the patient
        </label>
      </div>
      <div className="field-group" style={{ gridColumn: '1 / -1' }}>
        <label className="field-label">Current medications</label>
        <input className="field-input" type="text" placeholder="e.g. Warfarin 5 mg daily, Metformin 500 mg" value={form.medications} onChange={set('medications')} />
      </div>
      <div className="field-group" style={{ gridColumn: '1 / -1' }}>
        <label className="field-label">Conditions</label>
        <input className="field-input" type="text" placeholder="e.g. Atrial fibrillation, CKD stage 3" value={form.conditions} onChange={set('conditions')} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload / New Prescription Modal
// ─────────────────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

interface UploadModalProps {
  onClose: () => void
  onCreated: (prescriptionId: string) => void
  preselectedPatient?: ApiPatient | null
}

function UploadModal({ onClose, onCreated, preselectedPatient }: UploadModalProps) {
  const [step, setStep]               = useState<'file' | 'patient' | 'rx'>('file')
  const [patient, setPatient]         = useState<ApiPatient | null>(preselectedPatient ?? null)
  const [file, setFile]               = useState<File | null>(null)
  const [fileError, setFileError]     = useState<string | null>(null)
  const fileName = file?.name ?? null

  // Patient lookup form state.
  const [lookupFirst, setLookupFirst] = useState('')
  const [lookupLast,  setLookupLast]  = useState('')
  const [lookupDob,   setLookupDob]   = useState('')
  const [lookupPhone, setLookupPhone] = useState('')
  const [ptResults, setPtResults]     = useState<ApiPatient[] | null>(null) // null = no search run yet
  const [ptLoading, setPtLoading]     = useState(false)

  // Manual entry — the technician types what is on the script; the engine verifies it.
  const [drugName,     setDrugName]     = useState('')
  const [directions,   setDirections]   = useState('')
  const [quantity,     setQuantity]     = useState('')
  const [daySupply,    setDaySupply]    = useState('')
  const [refills,      setRefills]      = useState('')
  const [prescriberName, setPrescriberName] = useState('')
  const [npi,          setNpi]          = useState('')
  const [saving,  setSaving]          = useState(false)
  const [error,   setError]           = useState<string | null>(null)
  const [autofilling, setAutofilling] = useState(false)
  const [autofillNote, setAutofillNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Create-new-patient fallback (shown when a lookup returns no matches).
  const [showCreatePt, setShowCreatePt] = useState(false)
  const [creatingPt, setCreatingPt]     = useState(false)
  const [newPt, setNewPt] = useState<NewPatientForm>(EMPTY_PATIENT)

  function pickFile(f: File | undefined | null) {
    // Only accept a new file when none is currently loaded — the user must
    // remove the current image before uploading another.
    if (!f || file) return
    if (!ACCEPTED_TYPES.includes(f.type)) { setFileError('The script must be a JPEG, PNG, or PDF file.'); return }
    if (f.size > MAX_FILE_BYTES) { setFileError('The script exceeds the 10 MB maximum.'); return }
    setFileError(null)
    setFile(f)
  }

  async function handleCreatePatient() {
    const body = toCreatePatient(newPt)
    if (typeof body === 'string') { setError(body); return }
    setCreatingPt(true)
    setError(null)
    try {
      const created = await patientsApi.create(body)
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
      const { scriptData: data } = await prescriptionsApi.extract(file)
      // Only overwrite a field when the AI actually returned a value for it.
      if (data.drugName)       setDrugName(data.drugName)
      if (data.directions)     setDirections(data.directions)
      if (data.quantity != null)    setQuantity(String(data.quantity))
      if (data.daySupply != null)   setDaySupply(String(data.daySupply))
      if (data.refillCount != null) setRefills(String(data.refillCount))
      if (data.prescriberName) setPrescriberName(data.prescriberName)
      if (data.prescriberNpi)  setNpi(data.prescriberNpi)
      setAutofillNote('✨ Fields autofilled from the image. Verify them against the prescription before submitting.')
    } catch (e) {
      setAutofillNote(e instanceof Error ? `Autofill failed: ${e.message}. Enter the details manually.` : 'Autofill failed. Enter the details manually.')
    } finally {
      setAutofilling(false)
    }
  }

  // Run a patient lookup with the entered params (partial match).
  async function handlePatientSearch() {
    setPtLoading(true)
    setError(null)
    setShowCreatePt(false)
    try {
      const results = await patientsApi.search({ firstName: lookupFirst, lastName: lookupLast, dob: lookupDob, phone: lookupPhone })
      setPtResults(results)
      // Pre-fill the create-patient form with whatever was typed.
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

  const num = (s: string) => (s.trim() && !Number.isNaN(Number(s)) ? Number(s) : null)
  const guardError =
    drugName.length > 200 ? 'Drug name must be 200 characters or fewer.'
    : directions.length > 500 ? 'Directions must be 500 characters or fewer.'
    : quantity && !(Number(quantity) >= 1 && Number(quantity) <= 9999) ? 'Quantity must be 1–9999.'
    : daySupply && !(Number(daySupply) >= 1 && Number(daySupply) <= 365) ? 'Day supply must be 1–365.'
    : refills && !(Number(refills) >= 0 && Number(refills) <= 99) ? 'Refills must be 0–99.'
    : npi && !/^\d{10}$/.test(npi.replace(/\D/g, '')) ? 'NPI must be exactly 10 digits.'
    : null

  const rxValid = drugName.trim() !== '' && directions.trim() !== '' && quantity.trim() !== '' && !guardError

  async function handleCreate() {
    if (!patient || !file || !rxValid) return
    setSaving(true)
    setError(null)
    try {
      const enteredData: ScriptData = {
        patientFirstName:   patient.firstName,
        patientLastName:    patient.lastName,
        patientDateOfBirth: patient.dateOfBirth,
        drugName:       drugName.trim(),
        directions:     directions.trim(),
        quantity:       num(quantity),
        daySupply:      num(daySupply),
        refillCount:    num(refills),
        prescriberName: prescriberName.trim() || null,
        prescriberNpi:  npi.replace(/\D/g, '') || null,
        prescriberPhone: null,
      }
      // The engine reads the script, verifies this entry against it, and runs the clinical checks.
      const rx = await prescriptionsApi.upload(file, patient.id, enteredData)
      onCreated(rx.id)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit prescription')
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
              {step === 'rx'      && 'Enter the prescription exactly as written — AutoScript verifies it against the image'}
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
              {fileError && <ApiErrorBanner message={fileError} />}

              <div className="modal-footer" style={{ marginTop: 16 }}>
                <button className="btn-cancel" onClick={onClose}>Cancel</button>
                <button className="btn-primary" disabled={!file} onClick={() => setStep(preselectedPatient ? 'rx' : 'patient')}>
                  Proceed <ChevronRight />
                </button>
              </div>
            </>
          )}

          {/* Step 2 — Patient lookup: image preview (left) + lookup/create (right) */}
          {step === 'patient' && (
            <div className="details-layout">
              <div className="details-preview">
                <PrescriptionPreview file={file} onReupload={() => setStep('file')} />
              </div>

              <div className="details-form">
                {!showCreatePt ? (
                  <>
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
                                <div className="pname">{fullName(p)}</div>
                                <div className="pmeta">DOB {formatDob(p.dateOfBirth)} • {p.phone ?? '—'}</div>
                              </div>
                              {patient?.id === p.id && <span style={{ color:'#2563eb', marginLeft:'auto' }}><CheckIcon /></span>}
                            </div>
                          ))}
                        </div>

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
                  <div className="create-pt-panel">
                    <div className="entry-mode-row" style={{ marginTop: 0 }}>
                      <span className="entry-mode-label">New patient profile</span>
                      <button className="chip-change" onClick={() => setShowCreatePt(false)}>Back to search</button>
                    </div>
                    <div style={{ marginTop: 12 }}><PatientFields form={newPt} setForm={setNewPt} /></div>
                    <button className="btn-primary" style={{ marginTop: 12 }}
                      disabled={creatingPt || !newPt.firstName.trim() || !newPt.lastName.trim() || !newPt.dob.trim()}
                      onClick={handleCreatePatient}>
                      {creatingPt ? <><Spinner small /> Creating…</> : <>＋ Create & select patient</>}
                    </button>
                  </div>
                )}

                {patient && !showCreatePt && (
                  <div className="selected-patient-chip" style={{ marginTop: 12 }}>
                    <Avatar id={patient.id} fn={patient.firstName} ln={patient.lastName} size={32} />
                    <div>
                      <div style={{ fontWeight:600, fontSize:13 }}>{fullName(patient)}</div>
                      <div style={{ fontSize:11, color:'#64748b' }}>DOB {formatDob(patient.dateOfBirth)}</div>
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
              <div className="details-preview">
                <PrescriptionPreview file={file} onReupload={() => setStep('file')} />
              </div>

              <div className="details-form">
                {patient && (
                  <div className="selected-patient-chip">
                    <Avatar id={patient.id} fn={patient.firstName} ln={patient.lastName} size={32} />
                    <div>
                      <div style={{ fontWeight:600, fontSize:13 }}>{fullName(patient)}</div>
                      <div style={{ fontSize:11, color:'#64748b' }}>DOB {formatDob(patient.dateOfBirth)}</div>
                    </div>
                    {!preselectedPatient && (
                      <button className="chip-change" onClick={() => setStep('patient')}>Change</button>
                    )}
                  </div>
                )}

                <div className="entry-mode-row">
                  <span className="entry-mode-label">Medication details</span>
                  <button className="btn-autofill" onClick={handleAutofill} disabled={!file || autofilling}
                    title={file ? 'Extract fields from the image using AI' : 'Upload an image first to autofill'}>
                    {autofilling ? <><Spinner small /> Reading image…</> : <>✨ Autofill from image</>}
                  </button>
                </div>
                {autofillNote && <div className="autofill-note">{autofillNote}</div>}

                <div className="create-form-grid" style={{ marginTop: 12 }}>
                  <div className="field-group" style={{ gridColumn:'1 / -1' }}>
                    <label className="field-label">Drug Name & Strength <span className="req">*</span></label>
                    <input className="field-input" type="text" placeholder="e.g. Lisinopril 10 mg tablet" maxLength={200}
                      value={drugName} onChange={e => setDrugName(e.target.value)} />
                  </div>
                  <div className="field-group" style={{ gridColumn:'1 / -1' }}>
                    <label className="field-label">Directions <span className="req">*</span></label>
                    <textarea className="field-input field-textarea" rows={2} maxLength={500}
                      placeholder="e.g. Take 1 tablet by mouth once daily"
                      value={directions} onChange={e => setDirections(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Quantity <span className="req">*</span></label>
                    <input className="field-input" type="number" min="1" max="9999" inputMode="numeric"
                      placeholder="e.g. 30" value={quantity} onChange={e => setQuantity(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Day Supply</label>
                    <input className="field-input" type="number" min="1" max="365" inputMode="numeric"
                      placeholder="e.g. 30" value={daySupply} onChange={e => setDaySupply(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Refills</label>
                    <input className="field-input" type="number" min="0" max="99" inputMode="numeric"
                      placeholder="e.g. 2" value={refills} onChange={e => setRefills(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Prescriber NPI</label>
                    <input className="field-input" type="text" placeholder="10 digits"
                      value={npi} onChange={e => setNpi(e.target.value)} />
                  </div>
                  <div className="field-group" style={{ gridColumn:'1 / -1' }}>
                    <label className="field-label">Prescriber Name</label>
                    <input className="field-input" type="text" placeholder="e.g. Dr. Alan Reyes" maxLength={100}
                      value={prescriberName} onChange={e => setPrescriberName(e.target.value)} />
                  </div>
                </div>
                {guardError && <div className="autofill-note">⚠️ {guardError}</div>}

                <div className="modal-footer" style={{ marginTop: 16 }}>
                  <button className="btn-cancel" onClick={() => setStep(preselectedPatient ? 'file' : 'patient')} disabled={saving}>Back</button>
                  <button className="btn-primary"
                    disabled={!rxValid || saving || !patient}
                    onClick={handleCreate}>
                    {saving ? <><Spinner small /> Submitting…</> : <>Submit for Review <ChevronRight /></>}
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
// Prescription table (Dashboard, Prescriptions, Reviews)
// ─────────────────────────────────────────────────────────────────────────────

function PrescriptionTable({ rows, onOpen, empty }: { rows: ApiPrescription[]; onOpen: (rx: ApiPrescription) => void; empty: string }) {
  return (
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
          {rows.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign:'center', color:'#94a3b8', padding:24 }}>{empty}</td></tr>
          )}
          {rows.map(rx => (
            <tr key={rx.id} tabIndex={0} className="tr--clickable" onClick={() => onOpen(rx)}
              onKeyDown={e => e.key === 'Enter' && onOpen(rx)}>
              <td className="td-time">{rxTime(rx)}</td>
              <td className="td-rxid">{rx.externalRef}</td>
              <td>
                <div className="patient-name">{rx.patient ? fullName(rx.patient) : 'No patient linked'}</div>
                {rx.patient && <div className="patient-dob">DOB {formatDob(rx.patient.dateOfBirth)}</div>}
              </td>
              <td style={{ fontSize:13 }}>
                <div style={{ fontWeight:500 }}>{rxMedication(rx)}</div>
                {rx.fileName && <div style={{ fontSize:11, color:'#94a3b8' }}>{rx.fileName}</div>}
              </td>
              <td><StatusCell rx={rx} /></td>
              <td>
                <button className="btn-cancel" style={{ padding:'4px 10px', fontSize:12 }} onClick={e => { e.stopPropagation(); onOpen(rx) }}>
                  {rx.status === 'MANUAL_REVIEW_NEEDED' && rx.reviewStatus === 'PENDING_REVIEW' ? 'Review' : 'Open'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function matchesQuery(rx: ApiPrescription, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return (rx.patient ? fullName(rx.patient).toLowerCase().includes(s) : false)
    || rx.externalRef.toLowerCase().includes(s)
    || rx.medicationSummary.some(m => m.toLowerCase().includes(s))
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

function Dashboard({ rxList, stats, loading, error, onUpload, onOpen, onNavigate }: {
  rxList: ApiPrescription[]; stats: ReturnType<typeof usePrescriptions>['stats']; loading: boolean; error: string | null
  onUpload: () => void; onOpen: (rx: ApiPrescription) => void; onNavigate: (nav: string) => void
}) {
  const [globalQ, setGlobalQ]     = useState('')
  const [statusFilter, setStatusFilter] = useState<PrescriptionStatus | ''>('')
  const [showSignal, setShowSignal] = useState<number | null>(null)

  const filtered = rxList.filter(r => (!statusFilter || r.status === statusFilter) && matchesQuery(r, globalQ))

  const signals = [
    { icon: '🚨', cls: 'red',    title: 'Drug interaction detected', desc: 'Checks the new prescription against the other drugs on it and the patient’s active medications (curated interaction table, with cited references).' },
    { icon: '⚠️', cls: 'orange', title: 'Allergy mismatch',          desc: 'Matches recorded allergies, including cross-reactive classes (e.g. penicillin → cephalosporin), against the prescribed drug.' },
    { icon: '📊', cls: 'blue',   title: 'Dose looks unusual',        desc: 'Computes the daily dose from strength × units × frequency and flags anything above labeled maximums.' },
    { icon: '📄', cls: 'purple', title: 'Missing patient context',   desc: 'Alerts when allergies are unverified, no patient is linked, or key prescription fields are missing.' },
    { icon: '⌨️', cls: 'red',    title: 'Data entry mismatch',       desc: 'Compares what the technician typed with what is written on the script — wrong patient, drug, strength, quantity or directions.' },
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

      {stats && (
        <div className="stat-cards" role="region" aria-label="Today's statistics">
          {[
            { label: 'Manual Review Needed', value: stats.manualReviewNeeded, cls: 'orange', icon: '⚠️', status: 'MANUAL_REVIEW_NEEDED' },
            { label: 'No Flags Detected',    value: stats.noFlagsDetected,    cls: 'blue',   icon: '✅', status: 'NO_FLAGS_DETECTED'    },
            { label: 'Processing',           value: stats.processing,         cls: 'purple', icon: '⏳', status: 'PROCESSING'           },
            { label: 'Reviewed Today',       value: stats.reviewedToday,      cls: 'green',  icon: '📋', status: ''                     },
          ].map(card => (
            <div key={card.label} className="stat-card stat-card--clickable"
              role="button" tabIndex={0}
              title={card.status ? `Filter by: ${card.label}` : 'Open Reviews'}
              onClick={() => card.status ? setStatusFilter(prev => prev === card.status ? '' : card.status as PrescriptionStatus) : onNavigate('reviews')}
              onKeyDown={e => e.key === 'Enter' && (card.status ? setStatusFilter(prev => prev === card.status ? '' : card.status as PrescriptionStatus) : onNavigate('reviews'))}
              style={{ outline: card.status && statusFilter === card.status ? '2px solid #2563eb' : undefined }}
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

      <div className="table-search-row">
        <div className="search-bar" style={{ width: 320 }}>
          <SearchIcon />
          <input type="search" placeholder="Filter by patient, Rx ID, or medication…"
            value={globalQ} onChange={e => setGlobalQ(e.target.value)} aria-label="Filter prescriptions" />
        </div>
        {statusFilter && (
          <span className="active-filter-pill">
            {statusMeta(statusFilter).label}
            <button onClick={() => setStatusFilter('')} aria-label="Clear status filter">✕</button>
          </span>
        )}
        {(globalQ || statusFilter) && (
          <button className="btn-cancel" style={{ padding:'6px 12px', fontSize:12 }}
            onClick={() => { setGlobalQ(''); setStatusFilter('') }}>
            Clear filter
          </button>
        )}
      </div>

      <div className="dashboard-grid">
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
          <PrescriptionTable rows={filtered.slice(0, 50)} onOpen={onOpen} empty="No prescriptions found — upload one to start." />
        </div>

        <aside className="signals-panel">
          <div className="signals-card">
            <div className="signals-header">
              <div className="signals-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                Review Signals
              </div>
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
            <p>AutoScript routes prescriptions to the pharmacist — it never approves them. "No flags" only means nothing was found within the checked criteria.</p>
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

function PrescriptionsPage({ rxList, loading, error, initialQuery, onUpload, onOpen }: {
  rxList: ApiPrescription[]; loading: boolean; error: string | null; initialQuery: string
  onUpload: () => void; onOpen: (rx: ApiPrescription) => void
}) {
  const [query,   setQuery]   = useState(initialQuery)
  const [statusF, setStatusF] = useState<PrescriptionStatus | ''>('')
  useEffect(() => { setQuery(initialQuery) }, [initialQuery])

  const filtered = rxList.filter(r => matchesQuery(r, query) && (!statusF || r.status === statusF))

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

      <div className="table-search-row" style={{ marginBottom: 16 }}>
        <div className="search-bar" style={{ width: 300 }}>
          <SearchIcon />
          <input type="search" placeholder="Search patient, Rx ID, medication…"
            value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {(['', 'PROCESSING', 'MANUAL_REVIEW_NEEDED', 'NO_FLAGS_DETECTED', 'FAILED'] as const).map(s => (
            <button key={s} className={`filter-pill${statusF === s ? ' active' : ''}`} onClick={() => setStatusF(s)}>
              {s === '' ? 'All' : statusMeta(s).label}
            </button>
          ))}
        </div>
      </div>

      {loading
        ? <div className="loading-page"><Spinner /> Loading…</div>
        : <div className="card"><PrescriptionTable rows={filtered} onOpen={onOpen} empty="No prescriptions match your filters" /></div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Reviews page — the pharmacist's work queue
// ─────────────────────────────────────────────────────────────────────────────

function ReviewsPage({ rxList, loading, onOpen }: { rxList: ApiPrescription[]; loading: boolean; onOpen: (rx: ApiPrescription) => void }) {
  const open = rxList
    .filter(r => r.status === 'MANUAL_REVIEW_NEEDED' && !['REVIEWED', 'INTERVENTION_DOCUMENTED'].includes(r.reviewStatus))
    .sort((a, b) => severityRank(b.highestSeverity) - severityRank(a.highestSeverity) || a.createdAt.localeCompare(b.createdAt))
  const done = rxList.filter(r => r.reviewedAt).sort((a, b) => (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? ''))
  const failed = rxList.filter(r => r.status === 'FAILED')

  if (loading) return <div className="loading-page"><Spinner /> Loading…</div>
  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="page-header">
        <h1>Reviews</h1>
        <p>Prescriptions routed to the pharmacist, most severe first</p>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div><h2>Needs pharmacist review</h2><p>{open.length} open</p></div></div>
        <PrescriptionTable rows={open} onOpen={onOpen} empty="Nothing waiting for review." />
      </div>
      {failed.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><div><h2>Screening failed</h2><p>Open one to see the reason and retry</p></div></div>
          <PrescriptionTable rows={failed} onOpen={onOpen} empty="" />
        </div>
      )}
      <div className="card">
        <div className="card-header"><div><h2>Completed reviews</h2><p>{done.length} reviewed</p></div></div>
        <PrescriptionTable rows={done} onOpen={onOpen} empty="No completed reviews yet." />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics page
// ─────────────────────────────────────────────────────────────────────────────

function AnalyticsPage({ rxList, stats }: { rxList: ApiPrescription[]; stats: ReturnType<typeof usePrescriptions>['stats'] }) {
  const bySeverity = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rxList) if (r.highestSeverity) m.set(r.highestSeverity, (m.get(r.highestSeverity) ?? 0) + 1)
    return (['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'INFO'] as const).map(s => [s, m.get(s) ?? 0] as const)
  }, [rxList])
  const max = Math.max(1, ...bySeverity.map(([, n]) => n))
  const totalFindings = rxList.reduce((n, r) => n + r.findingCount, 0)

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="page-header"><h1>Analytics</h1><p>Screening outcomes across all prescriptions</p></div>
      {stats && (
        <div className="stat-cards">
          {[
            { label: 'Total prescriptions', value: stats.total, cls: 'blue', icon: '📋' },
            { label: 'Findings raised', value: totalFindings, cls: 'orange', icon: '🔎' },
            { label: 'Interventions required', value: stats.interventionRequired, cls: 'purple', icon: '🛠️' },
            { label: 'Failed screenings', value: stats.failed, cls: 'orange', icon: '⚠️' },
          ].map(c => (
            <div key={c.label} className="stat-card">
              <div className={`stat-icon ${c.cls}`}>{c.icon}</div>
              <div className="stat-info"><div className="label">{c.label}</div><div className="value">{c.value}</div></div>
            </div>
          ))}
        </div>
      )}
      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Highest severity per prescription</h2>
        {bySeverity.map(([sev, n]) => (
          <div key={sev} className="bar-row">
            <span className="bar-label"><SeverityChip severity={sev} /></span>
            <div className="bar-track"><div className={`bar-fill sev-bg-${sev.toLowerCase()}`} style={{ width: `${(n / max) * 100}%` }} /></div>
            <span className="bar-value">{n}</span>
          </div>
        ))}
        {stats && (
          <p className="muted" style={{ marginTop: 12 }}>
            Review status: {stats.pendingReview} pending · {stats.infoRequested} info requested · {stats.interventionDocumented} interventions documented · {stats.reviewed} reviewed
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings page — system status
// ─────────────────────────────────────────────────────────────────────────────

function SettingsPage() {
  const [health, setHealth] = useState<{ ok: boolean; engine: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch(`${API_BASE}/health`).then(r => r.json()).then(setHealth).catch(() => setError('API unreachable'))
  }, [])
  return (
    <div style={{ maxWidth: 700 }}>
      <div className="page-header"><h1>Settings</h1><p>System status</p></div>
      <div className="card" style={{ padding: 20 }}>
        <div className="detail-item"><span className="detail-label">API</span><span>{API_BASE} — {error ?? (health?.ok ? '✅ online' : 'checking…')}</span></div>
        <div className="detail-item" style={{ marginTop: 8 }}><span className="detail-label">RX Engine</span><span>{health ? (health.engine ? '✅ online' : '❌ offline — start it with pnpm dev') : '—'}</span></div>
        <p className="muted" style={{ marginTop: 16 }}>
          AI extraction and analysis use the OpenRouter key in <code>autoscript/.env</code> (<code>LLM_API_KEY</code>).
          Without it, uploads fail with an explicit error instead of guessing.
        </p>
      </div>
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
  const [form, setForm] = useState<NewPatientForm>(EMPTY_PATIENT)

  const hasInput = firstName || lastName || dob || phone

  async function runSearch() {
    setLoading(true); setError(null); setShowCreate(false); setCreateOk(null)
    try {
      setResults(await patientsApi.search({ firstName, lastName, dob, phone }))
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Search failed') }
    finally { setLoading(false) }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (hasInput) runSearch()
  }

  function handleClear() {
    setFirstName(''); setLastName(''); setDob(''); setPhone('')
    setResults(null); setError(null); setShowCreate(false); setCreateOk(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const body = toCreatePatient(form)
    if (typeof body === 'string') { setError(body); return }
    setCreating(true); setError(null)
    try {
      const created = await patientsApi.create(body)
      setCreateOk(`${fullName(created)} created successfully!`)
      setShowCreate(false)
      setForm(EMPTY_PATIENT)
      setResults([created])
    } catch (e: unknown) { setError(e instanceof ApiError ? e.message : 'Create failed') }
    finally { setCreating(false) }
  }

  const phoneCounts = new Map<string, number>()
  for (const p of results ?? []) {
    const k = normalizePhone(p.phone)
    if (k) phoneCounts.set(k, (phoneCounts.get(k) ?? 0) + 1)
  }

  return (
    <div className="lookup-page">
      <div className="page-header">
        <h1>Patient Lookup</h1>
        <p>Search by any combination of name, date of birth, or phone number</p>
      </div>

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

      {results === null && !showCreate && (
        <div className="lookup-tips">
          {[
            { icon:'💡', title:'Partial search works',        text:'Type "Rey" in Last Name or "04/12" in DOB to find partial matches.' },
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
              const pk = normalizePhone(p.phone)
              const shared = pk ? (phoneCounts.get(pk) ?? 1) > 1 : false
              return (
                <div key={p.id} className={`result-card${shared ? ' result-card--warning' : ''}`}>
                  <div className="result-card-top">
                    <Avatar id={p.id} fn={p.firstName} ln={p.lastName} size={46} />
                    <div className="result-identity">
                      <div className="result-name">{fullName(p)}</div>
                      <div className="result-meta">DOB {formatDob(p.dateOfBirth)}</div>
                    </div>
                    <button className="btn-select-patient" onClick={() => onUploadForPatient(p)}>
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
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
            <PatientFields form={form} setForm={setForm} />
            <p className="req-note"><span className="req">*</span> Required fields. Allergies and medications drive the clinical checks.</p>
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
  const [openRxId,       setOpenRxId]       = useState<string | null>(null)
  const [globalSearch,   setGlobalSearch]   = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [notifOpen,      setNotifOpen]      = useState(false)
  const { data: rxList, stats, loading, error, refresh } = usePrescriptions()

  function openUpload(patient?: ApiPatient) {
    setModalPatient(patient ?? null)
    setShowModal(true)
  }

  function handleRxCreated(id: string) {
    refresh()
    setOpenRxId(id)       // follow the screening live
  }

  const navItems = [
    { id: 'dashboard',     label: 'Dashboard',     icon: '🏠' },
    { id: 'prescriptions', label: 'Prescriptions', icon: '📋' },
    { id: 'patients',      label: 'Patients',      icon: '👤' },
    { id: 'reviews',       label: 'Reviews',       icon: '🛡️' },
    { id: 'analytics',     label: 'Analytics',     icon: '📊' },
    { id: 'settings',      label: 'Settings',      icon: '⚙️' },
  ]

  // Notifications = prescriptions currently waiting on the pharmacist, most severe first.
  const notifications = rxList
    .filter(r => r.status === 'MANUAL_REVIEW_NEEDED' && r.reviewStatus === 'PENDING_REVIEW')
    .sort((a, b) => severityRank(b.highestSeverity) - severityRank(a.highestSeverity))
    .slice(0, 6)

  const openRx = (rx: ApiPrescription) => setOpenRxId(rx.id)

  return (
    <div className="app-shell">
      <aside className="sidebar" role="navigation" aria-label="Main navigation">
        <div className="sidebar-logo">
          <div className="logo-icon">Rx</div>
          <div className="logo-text">
            <div className="brand">AutoScript</div>
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
              {item.id === 'reviews' && notifications.length > 0 && <span className="nav-count">{notifications.length}</span>}
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

      <div className="main-content">
        <header className="topbar" role="banner">
          <form className="search-bar" role="search"
            onSubmit={e => { e.preventDefault(); setSubmittedSearch(globalSearch.trim()); setActiveNav('prescriptions') }}>
            <SearchIcon />
            <input type="search" placeholder="Search prescriptions, patients, or Rx ID…"
              value={globalSearch} onChange={e => setGlobalSearch(e.target.value)}
              aria-label="Global search" />
          </form>

          <div className="topbar-right">
            <div style={{ position:'relative' }}>
              <button className="icon-btn" aria-label="Notifications"
                onClick={() => setNotifOpen(o => !o)}>
                <BellIcon />
                {notifications.length > 0 && <span className="notif-badge" />}
              </button>
              {notifOpen && (
                <div className="notif-dropdown">
                  <div className="notif-header">
                    <strong>Needs review</strong>
                    <button className="modal-close" style={{ width:24,height:24 }} onClick={() => setNotifOpen(false)}><XIcon /></button>
                  </div>
                  {notifications.length === 0 && <div className="notif-item">Nothing waiting for review.</div>}
                  {notifications.map(n => (
                    <div key={n.id} className="notif-item" onClick={() => { setOpenRxId(n.id); setNotifOpen(false) }}>
                      <span className="notif-icon">{n.highestSeverity === 'CRITICAL' || n.highestSeverity === 'HIGH' ? '🚨' : '⚠️'}</span>
                      <div>
                        <div style={{ fontSize:12, color:'#0f172a' }}>{n.externalRef} — {n.patient ? fullName(n.patient) : 'No patient'} · {n.findingCount} finding(s)</div>
                        <div style={{ fontSize:11, color:'#94a3b8' }}>{new Date(n.updatedAt).toLocaleTimeString()}</div>
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
          {activeNav === 'dashboard'     && <Dashboard rxList={rxList} stats={stats} loading={loading} error={error} onUpload={() => openUpload()} onOpen={openRx} onNavigate={setActiveNav} />}
          {activeNav === 'prescriptions' && <PrescriptionsPage rxList={rxList} loading={loading} error={error} initialQuery={submittedSearch} onUpload={() => openUpload()} onOpen={openRx} />}
          {activeNav === 'patients'      && <PatientLookup onUploadForPatient={p => openUpload(p)} />}
          {activeNav === 'reviews'       && <ReviewsPage rxList={rxList} loading={loading} onOpen={openRx} />}
          {activeNav === 'analytics'     && <AnalyticsPage rxList={rxList} stats={stats} />}
          {activeNav === 'settings'      && <SettingsPage />}
        </main>
      </div>

      {showModal && (
        <UploadModal
          onClose={() => { setShowModal(false); setModalPatient(null) }}
          onCreated={handleRxCreated}
          preselectedPatient={modalPatient}
        />
      )}
      {openRxId && <PrescriptionDetail id={openRxId} onClose={() => setOpenRxId(null)} onChanged={refresh} />}
    </div>
  )
}

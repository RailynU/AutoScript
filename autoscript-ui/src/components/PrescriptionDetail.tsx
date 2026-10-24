import { useEffect, useState } from 'react'
import {
  prescriptionsApi,
  statusMeta,
  REVIEW_ACTIONS,
  REVIEW_STATUS_LABEL,
  FINDING_TYPE_LABEL,
  reviewActionLabel,
} from '../api/prescriptions'
import { formatDob, fullName } from '../api/patients'
import { ApiError } from '../api/client'
import { usePrescriptionDetail } from '../hooks/usePrescriptions'
import { PrescriptionPreview } from './PrescriptionPreview'
import type { ApiFinding, ApiPrescriptionDetail, ReviewAction, ScriptData, Severity } from '../api/types'

// ─────────────────────────────────────────────────────────────────────────────
// Prescription detail: original script (left) + screening report, data-entry
// check and pharmacist review (right). Nothing here approves dispensing — the
// pharmacist records what they did; the system only routes to review.
// ─────────────────────────────────────────────────────────────────────────────

const PHARMACIST = 'Dr. Jane Doe'

export function SeverityChip({ severity }: { severity: Severity | null }) {
  if (!severity) return null
  return <span className={`sev-chip sev-${severity.toLowerCase()}`}>{severity}</span>
}

function useScriptFile(rx: ApiPrescriptionDetail | null): File | null {
  const [file, setFile] = useState<File | null>(null)
  const id = rx?.id
  const hasFile = !!rx?.fileName
  useEffect(() => {
    if (!id || !hasFile) return
    let cancelled = false
    fetch(prescriptionsApi.fileUrl(id))
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(b => { if (!cancelled) setFile(new File([b], rx?.fileName ?? 'script', { type: b.type || rx?.mimeType || '' })) })
      .catch(() => { /* preview shows its own error state */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hasFile])
  return file
}

function FindingCard({ f }: { f: ApiFinding }) {
  const [showEvidence, setShowEvidence] = useState(false)
  return (
    <div className={`finding-card finding-card--${f.severity.toLowerCase()}`}>
      <div className="finding-head">
        <SeverityChip severity={f.severity} />
        <span className="finding-type">{FINDING_TYPE_LABEL[f.type] ?? f.type}</span>
        {f.supportStatus === 'UNVERIFIED' && <span className="finding-tag">Unverified</span>}
        {!f.deterministic && <span className="finding-tag">AI</span>}
      </div>
      <div className="finding-title">{f.title}</div>
      <p className="finding-text">{f.explanation}</p>
      {f.aiContext && <p className="finding-ai"><strong>AI context:</strong> {f.aiContext}</p>}
      {f.reviewQuestions.length > 0 && (
        <ul className="finding-questions">
          {f.reviewQuestions.map(q => <li key={q}>{q}</li>)}
        </ul>
      )}
      {f.evidence.length > 0 && (
        <>
          <button className="chip-change" onClick={() => setShowEvidence(s => !s)}>
            {showEvidence ? 'Hide' : 'Show'} evidence ({f.evidence.length})
          </button>
          {showEvidence && (
            <ul className="finding-evidence">
              {f.evidence.map(e => (
                <li key={e.chunkId}>
                  <div className="evidence-title">
                    {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : e.title}
                    {e.section && <span> · {e.section}</span>}
                  </div>
                  <div className="evidence-excerpt">{e.excerpt}</div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

const ENTRY_FIELDS: { key: keyof ScriptData; label: string }[] = [
  { key: 'patientFirstName', label: 'Patient first name' },
  { key: 'patientLastName',  label: 'Patient last name' },
  { key: 'patientDateOfBirth', label: 'Date of birth' },
  { key: 'drugName',     label: 'Drug' },
  { key: 'directions',   label: 'Directions' },
  { key: 'quantity',     label: 'Quantity' },
  { key: 'daySupply',    label: 'Day supply' },
  { key: 'refillCount',  label: 'Refills' },
  { key: 'prescriberName', label: 'Prescriber' },
  { key: 'prescriberNpi',  label: 'Prescriber NPI' },
]

function EntryCheck({ rx }: { rx: ApiPrescriptionDetail }) {
  const entered = rx.enteredData
  if (!entered) return <p className="muted">No manual entry was captured for this prescription.</p>
  const x = rx.report?.extraction
  const med = x?.medications[0]
  const onScript: Partial<Record<keyof ScriptData, string | null>> = x ? {
    patientFirstName: x.patientName,
    patientLastName: x.patientName,
    patientDateOfBirth: x.patientDateOfBirth,
    drugName: med ? [med.rawName, med.strength].filter(Boolean).join(' ') : null,
    directions: med?.sig ?? med?.frequency ?? null,
    quantity: med?.quantity ?? null,
    daySupply: med?.duration ?? null,
    refillCount: med?.refills ?? null,
    prescriberName: x.prescriberName,
    prescriberNpi: x.prescriberIdentifier,
  } : {}
  const mismatches = (rx.report?.findings ?? []).filter(f => f.type === 'DATA_ENTRY_MISMATCH')
  return (
    <>
      <p className={mismatches.length ? 'entry-summary entry-summary--bad' : 'entry-summary'}>
        {!x ? 'Waiting for the engine to read the script…'
          : mismatches.length ? `⚠️ ${mismatches.length} field(s) differ from the script — see the Data entry mismatch findings.`
          : '✅ Entered fields match what was read on the script (within checked fields).'}
      </p>
      <table className="entry-table">
        <thead><tr><th>Field</th><th>Entered</th><th>On script</th></tr></thead>
        <tbody>
          {ENTRY_FIELDS.map(f => (
            <tr key={f.key}>
              <td>{f.label}</td>
              <td>{entered[f.key] ?? '—'}</td>
              <td>{onScript[f.key] ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function ReviewPanel({ rx, onUpdated }: { rx: ApiPrescriptionDetail; onUpdated: (d: ApiPrescriptionDetail) => void }) {
  const [action, setAction] = useState<ReviewAction>('REVIEWED_NO_INTERVENTION')
  const [name, setName]     = useState(PHARMACIST)
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const needsNote = REVIEW_ACTIONS.find(a => a.value === action)?.needsNote ?? false

  async function submit() {
    setSaving(true); setError(null)
    try {
      onUpdated(await prescriptionsApi.addReview(rx.id, action, name.trim() || PHARMACIST, notes.trim() || null))
      setNotes('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record review')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <p className="muted">Recording a review documents what you did. It is not an approval to dispense.</p>
      {rx.status === 'PROCESSING'
        ? <p className="muted">Screening is still running.</p>
        : (
          <div className="review-form">
            <div className="field-group">
              <label className="field-label">Action</label>
              <select className="field-input" value={action} onChange={e => setAction(e.target.value as ReviewAction)}>
                {REVIEW_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Pharmacist</label>
              <input className="field-input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field-group" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">Notes {needsNote && <span className="req">*</span>}</label>
              <textarea className="field-input field-textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="What was checked, who was contacted, outcome…" />
            </div>
            {error && <div className="api-error" style={{ gridColumn: '1 / -1' }}>⚠️ {error}</div>}
            <button className="btn-primary" disabled={saving || (needsNote && !notes.trim())} onClick={submit}>
              {saving ? 'Saving…' : 'Record review'}
            </button>
          </div>
        )}
      <h4 className="detail-subhead">History</h4>
      {rx.reviews.length === 0 ? <p className="muted">No review actions yet.</p> : (
        <ul className="review-history">
          {rx.reviews.map(r => (
            <li key={r.id}>
              <strong>{reviewActionLabel(r.action)}</strong> · {r.pharmacistName}
              <span className="muted"> · {new Date(r.createdAt).toLocaleString()}</span>
              {r.notes && <div>{r.notes}</div>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function PrescriptionDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const { data: rx, error, reload, setData } = usePrescriptionDetail(id)
  const file = useScriptFile(rx)
  const [tab, setTab] = useState<'findings' | 'entry' | 'review'>('findings')
  const findings = rx?.report?.findings ?? []

  async function retry() {
    await prescriptionsApi.retry(id)
    reload()
    onChanged?.()
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal modal--wide" style={{ maxWidth: 1180 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{rx ? `${rx.externalRef}${rx.patient ? ` — ${fullName(rx.patient)}` : ''}` : 'Loading…'}</h2>
            {rx && (
              <p>
                <span className={`badge badge-${statusMeta(rx.status).variant}`}><span className="badge-dot" />{statusMeta(rx.status).label}</span>
                {' '}<span className="muted">· {REVIEW_STATUS_LABEL[rx.reviewStatus]}</span>
                {rx.patient && <span className="muted"> · DOB {formatDob(rx.patient.dateOfBirth)}</span>}
              </p>
            )}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="api-error">⚠️ {error}</div>}
          {rx && (
            <div className="details-layout">
              <div className="details-preview">
                {rx.fileName ? <PrescriptionPreview file={file} onReupload={reload} />
                  : <pre className="raw-text">{rx.rawText ?? 'No document'}</pre>}
              </div>

              <div className="details-form">
                {rx.status === 'PROCESSING' && (
                  <div className="progress-box">
                    <div className="progress-label">{rx.progressMessage ?? 'Processing…'}</div>
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${rx.progressPercent}%` }} /></div>
                  </div>
                )}
                {rx.status === 'FAILED' && (
                  <div className="api-error">
                    ⚠️ Screening failed: {rx.failureReason}
                    <button className="btn-cancel" style={{ marginLeft: 8 }} onClick={retry}>Retry</button>
                  </div>
                )}

                {rx.patientContext && (
                  <div className="context-card">
                    <div><strong>Allergies:</strong> {rx.patientContext.allergies.length
                      ? rx.patientContext.allergies.map(a => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ')
                      : 'none recorded'}{!rx.patientContext.allergiesVerified && <span className="finding-tag">unverified</span>}</div>
                    <div><strong>Medications:</strong> {rx.patientContext.medications.filter(m => m.active).map(m => [m.name, m.dose].filter(Boolean).join(' ')).join(', ') || 'none'}</div>
                    <div><strong>Conditions:</strong> {rx.patientContext.conditions.filter(c => c.status === 'ACTIVE').map(c => c.name).join(', ') || 'none'}</div>
                  </div>
                )}

                <div className="detail-tabs">
                  {([['findings', `Findings (${findings.length})`], ['entry', 'Entry check'], ['review', `Review (${rx.reviews.length})`]] as const).map(([k, label]) => (
                    <button key={k} className={`filter-pill${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
                  ))}
                </div>

                {tab === 'findings' && (
                  <>
                    {rx.report && (
                      <div className={`disposition disposition--${rx.report.disposition === 'NO_FLAGS_DETECTED' ? 'clear' : 'manual'}`}>
                        {rx.report.dispositionReason}
                      </div>
                    )}
                    {rx.report?.ai && (
                      <div className="ai-summary"><strong>AI summary</strong> <span className="muted">({rx.report.ai.model})</span><p>{rx.report.ai.summary}</p></div>
                    )}
                    {findings.map(f => <FindingCard key={f.id} f={f} />)}
                    {rx.report && (
                      <details className="coverage">
                        <summary>Checks performed</summary>
                        <p>{rx.report.coverage.rulesEvaluated.length} rules · retrieval {rx.report.coverage.retrievalMethod} · AI {rx.report.coverage.llmUsed ? 'used' : 'not used'}</p>
                        <ul>{rx.report.coverage.limitations.map(l => <li key={l}>{l}</li>)}</ul>
                      </details>
                    )}
                  </>
                )}
                {tab === 'entry' && <EntryCheck rx={rx} />}
                {tab === 'review' && <ReviewPanel rx={rx} onUpdated={d => { setData(d); onChanged?.() }} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

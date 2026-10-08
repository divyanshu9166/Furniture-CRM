'use client'

import { useEffect, useRef, useState } from 'react'
import { searchCampaignContacts, previewCampaignRecipients } from '@/app/actions/email-campaigns'
import { campaignEmailSchema, emptyRecipientSelection, MAX_CAMPAIGN_RECIPIENTS, MAX_RECIPIENT_FILE_BYTES, mergeCampaignEmails } from '@/lib/email-audience'
import type { CampaignAudience, RecipientSelection } from '@/lib/email-audience'
import type { RecipientImportPreview } from '@/lib/email-recipient-import'

const inputClass = 'w-full min-w-0 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground'
const buttonClass = 'min-h-11 rounded-xl border border-border px-3 py-2 text-sm text-foreground disabled:opacity-50 hover:bg-surface-hover'
const segments = [
  { value: 'selected', label: 'Choose recipients', description: 'Select contacts, add emails or import a file' },
  { value: 'all', label: 'All contacts', description: 'All subscribed CRM contacts with an email' },
  { value: 'leads', label: 'Leads', description: 'Subscribed contacts with a lead' },
  { value: 'customers', label: 'Customers', description: 'Subscribed contacts with an order' },
] as const

type ContactRow = { id: number; name: string; email: string | null; emailSubscribed: boolean; selectable: boolean }
type Preview = { recipients: Array<{ contactId: number | null; email: string; name: string }>; total: number; invalid: number; duplicates: number; unsubscribed: number; unavailableContacts: number }
type Props = {
  audience: CampaignAudience; selection?: RecipientSelection | null; automated: boolean; disabled?: boolean
  onAudienceChange: (value: CampaignAudience) => void; onChange: (value: RecipientSelection) => void
  onBusyChange: (value: boolean) => void; onValidityChange: (value: boolean) => void
  searchContacts?: typeof searchCampaignContacts; previewRecipients?: typeof previewCampaignRecipients
}

export default function CampaignRecipients({ audience, selection, automated, disabled = false, onAudienceChange, onChange, onBusyChange, onValidityChange, searchContacts = searchCampaignContacts, previewRecipients = previewCampaignRecipients }: Props) {
  const value = selection || emptyRecipientSelection()
  const [search, setSearch] = useState(''), [page, setPage] = useState(1)
  const [contacts, setContacts] = useState<ContactRow[]>([]), [total, setTotal] = useState(0), [loading, setLoading] = useState(true)
  const [contactError, setContactError] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [email, setEmail] = useState(''), [name, setName] = useState('')
  const [importPreview, setImportPreview] = useState<RecipientImportPreview | null>(null), [reading, setReading] = useState(false)
  const [preview, setPreview] = useState<{ key: string; data: Preview } | null>(null), [checking, setChecking] = useState(false)
  const worker = useRef<Worker | null>(null), workerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true), previewSequence = useRef(0)
  const key = JSON.stringify({ audience, selection: audience === 'selected' ? value : null })
  const currentKey = useRef(key)
  const contactsSelected = new Set(value.contactIds)

  useEffect(() => { currentKey.current = key }, [key])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; worker.current?.terminate(); if (workerTimer.current) clearTimeout(workerTimer.current) }
  }, [])
  useEffect(() => { onBusyChange(reading || checking); return () => onBusyChange(false) }, [reading, checking, onBusyChange])
  useEffect(() => { onValidityChange(audience !== 'selected' || (!email.trim() && !name.trim() && !importPreview && !reading)); return () => onValidityChange(true) }, [audience, email, name, importPreview, reading, onValidityChange])
  useEffect(() => {
    if (audience !== 'selected') return
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true); setContactError('')
      try {
        const result = await searchContacts({ search, page })
        if (cancelled) return
        if (result.success && result.data) { setContacts(result.data.contacts); setTotal(result.data.total) }
        else { setContacts([]); setContactError(result.error || 'Unable to load contacts.') }
      } catch { if (!cancelled) { setContacts([]); setContactError('Unable to load contacts. Change the search or retry.') } }
      finally { if (!cancelled) setLoading(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [audience, search, page, searchContacts])

  function update(next: RecipientSelection) { onChange(next); setError(''); setNotice('') }
  function addEmails(rows: RecipientSelection['emails']) {
    try {
      const merged = mergeCampaignEmails(value.emails, rows)
      if (merged.emails.length + value.contactIds.length > MAX_CAMPAIGN_RECIPIENTS) throw new Error(`Select at most ${MAX_CAMPAIGN_RECIPIENTS} contacts and emails combined.`)
      update({ ...value, emails: merged.emails, consentConfirmed: false })
      setNotice(`${merged.emails.length - value.emails.length} emails added; ${merged.duplicates} already in your explicit email list. Contact/email overlap is deduplicated before sending.`)
      return true
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to add emails.'); return false }
  }
  function toggleContact(id: number) {
    const ids = contactsSelected.has(id) ? value.contactIds.filter(current => current !== id) : [...value.contactIds, id]
    if (ids.length + value.emails.length > MAX_CAMPAIGN_RECIPIENTS) { setError(`Select at most ${MAX_CAMPAIGN_RECIPIENTS} contacts and emails combined.`); return }
    update({ ...value, contactIds: ids })
  }
  async function readFile(file: File) {
    setError(''); setNotice(''); setImportPreview(null)
    if (!/\.(csv|xlsx|xls)$/i.test(file.name) || !file.size || file.size > MAX_RECIPIENT_FILE_BYTES) { setError('Choose a non-empty CSV, XLSX or XLS file no larger than 5 MB.'); return }
    setReading(true)
    let active: Worker | null = null
    const finish = () => { active?.terminate(); worker.current = null; if (workerTimer.current) clearTimeout(workerTimer.current); workerTimer.current = null; if (mounted.current) setReading(false) }
    try {
      const bytes = await file.arrayBuffer()
      if (!mounted.current) return
      active = new Worker(new URL('../../lib/email-recipient-import.worker.ts', import.meta.url), { type: 'module' })
      worker.current = active
      workerTimer.current = setTimeout(() => { finish(); if (mounted.current) setError('File parsing timed out. Export a simpler CSV and retry.') }, 10000)
      active.onmessage = event => {
        finish()
        if (!mounted.current) return
        if (event.data.success) setImportPreview(event.data.data)
        else setError(event.data.error || 'Unable to read the file.')
      }
      active.onerror = () => { finish(); if (mounted.current) setError('Unable to read the file. Try exporting it as CSV.') }
      active.postMessage({ bytes, filename: file.name }, [bytes])
    } catch { finish(); if (mounted.current) setError('Unable to read the file. Please retry.') }
  }
  async function checkRecipients() {
    const request = ++previewSequence.current, requestKey = key
    setChecking(true); setError('')
    try {
      const result = await previewRecipients(audience, audience === 'selected' ? value : undefined)
      if (!mounted.current || request !== previewSequence.current || currentKey.current !== requestKey) return
      if (result.success && result.data) setPreview({ key: requestKey, data: result.data })
      else setError(result.error || 'Unable to review recipients.')
    } catch { if (mounted.current && currentKey.current === requestKey) setError('Unable to review recipients. Please retry.') }
    finally { if (mounted.current && request === previewSequence.current) setChecking(false) }
  }
  const reviewed = preview?.key === key ? preview.data : null

  return <section className="min-w-0 space-y-4" aria-label="Campaign recipients">
    <div><h3 className="text-sm font-semibold text-foreground">Recipients</h3><p className="mt-1 text-xs text-muted">One email per unique address. Unsubscribed addresses are excluded again when sending.</p></div>
    <fieldset disabled={disabled || reading || checking} className="min-w-0 space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {segments.map(segment => <button key={segment.value} type="button" aria-pressed={audience === segment.value} disabled={automated && segment.value === 'selected'} onClick={() => onAudienceChange(segment.value)} className={`${buttonClass} text-left ${audience === segment.value ? 'border-accent bg-accent-light' : ''}`}>
          <span className="block font-medium">{segment.label}</span><span className="block text-xs text-muted">{segment.description}</span>
        </button>)}
      </div>
      {automated && <p className="text-xs text-muted">Trigger automations use CRM segments. Explicit lists are available for regular and scheduled campaigns.</p>}
      {audience === 'selected' && <>
        <div className="rounded-xl border border-border p-3 space-y-3">
          <h4 className="text-sm font-medium">Select existing contacts</h4>
          <input aria-label="Search contacts by name or email" value={search} onChange={event => { setLoading(true); setSearch(event.target.value); setPage(1) }} placeholder="Search name or email…" className={inputClass} />
          {contactError && <p role="alert" className="text-xs text-danger">{contactError}</p>}
          <div aria-busy={loading} className="max-h-64 overflow-y-auto space-y-1">
            {loading ? <p className="text-xs text-muted p-2">Loading contacts…</p> : contacts.length ? contacts.map(contact => <label key={contact.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover">
              <input type="checkbox" disabled={!contact.selectable} checked={contactsSelected.has(contact.id)} onChange={() => toggleContact(contact.id)} aria-label={`Select ${contact.email || contact.name}`} className="h-4 w-4 shrink-0 accent-accent" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium break-words">{contact.name}</span><span className="block text-xs text-muted break-all">{contact.email} {!contact.selectable && (contact.emailSubscribed ? '— invalid email' : '— unsubscribed')}</span></span>
            </label>) : !contactError && <p className="p-2 text-xs text-muted">No matching contacts with an email. Add an email below, or update the contact in CRM.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{value.contactIds.length} selected · {total} matching contacts</span>
            <div className="flex gap-2"><button type="button" className={buttonClass} disabled={page === 1 || loading} onClick={() => { setLoading(true); setPage(page - 1) }}>Previous</button><button type="button" className={buttonClass} disabled={page * 50 >= total || loading} onClick={() => { setLoading(true); setPage(page + 1) }}>Next</button></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} disabled={loading || !contacts.some(contact => contact.selectable)} onClick={() => {
              const ids = [...new Set([...value.contactIds, ...contacts.filter(contact => contact.selectable).map(contact => contact.id)])]
              if (ids.length + value.emails.length > MAX_CAMPAIGN_RECIPIENTS) { setError(`Select at most ${MAX_CAMPAIGN_RECIPIENTS} contacts and emails combined.`); return }
              update({ ...value, contactIds: ids })
            }}>Select eligible on this page</button>
            <button type="button" className={buttonClass} disabled={!value.contactIds.length} onClick={() => update({ ...value, contactIds: [] })}>Clear contact selections</button>
          </div>
          {!!value.contactIds.length && <div className="space-y-2 border-t border-border pt-2">
            <p className="text-xs text-muted">Selections remain across search/pages. Remove individual selections below.</p>
            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">{value.contactIds.map(id => <button key={id} type="button" onClick={() => toggleContact(id)} className={`${buttonClass} max-w-full break-all`} aria-label={`Remove selected contact ${id}`}>{contacts.find(contact => contact.id === id)?.name || `Contact #${id}`} ×</button>)}</div>
          </div>}
        </div>
        <div className="rounded-xl border border-border p-3 space-y-3">
          <h4 className="text-sm font-medium">Add a new email</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input aria-label="Recipient email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="client@example.com" className={inputClass} />
            <input aria-label="Recipient name (optional)" maxLength={150} value={name} onChange={event => setName(event.target.value)} placeholder="Name (optional)" className={inputClass} />
          </div>
          <button type="button" className={buttonClass} disabled={!email.trim()} onClick={() => { const parsed = campaignEmailSchema.safeParse({ email, name }); if (!parsed.success) { setError(parsed.error.issues[0].message); return } if (addEmails([parsed.data])) { setEmail(''); setName('') } }}>Add email to list</button>
          {(email || name) && <p className="text-xs text-warning">Click Add email to list, or clear these fields, before saving.</p>}
        </div>
        <div className="rounded-xl border border-border p-3 space-y-3">
          <h4 className="text-sm font-medium">Import CSV / Excel</h4>
          <p className="text-xs text-muted">First row: Email (required), Name (optional). First sheet only, plain values, up to {MAX_CAMPAIGN_RECIPIENTS} rows and 5 MB. Imports stay in this campaign; no CRM contacts are overwritten.</p>
          <input aria-label="Import recipient file" type="file" accept=".csv,.xlsx,.xls" disabled={reading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readFile(file) }} className="block w-full min-w-0 text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-surface-hover file:px-3 file:py-3 file:text-foreground" />
          <a href="data:text/csv;charset=utf-8,Email%2CName%0Asample%40example.com%2CSample%20Customer%0A" download="campaign-recipient-template.csv" className="inline-flex min-h-11 items-center text-sm text-accent underline">Download CSV template</a>
          {reading && <p role="status" className="text-xs text-muted">Reading file safely…</p>}
          {importPreview && <div className="space-y-2 rounded-lg bg-surface-hover p-3">
            <p className="text-sm font-medium">Import preview: {importPreview.emails.length} valid · {importPreview.invalid} invalid · {importPreview.duplicates} duplicates</p>
            <p className="text-xs text-muted">First sheet: {importPreview.sheet}. {importPreview.totalRows} non-empty rows checked. Nothing added yet.</p>
            <div className="max-h-40 overflow-y-auto text-xs space-y-1">{importPreview.emails.slice(0, 20).map(row => <p key={row.email} className="break-all">{row.name || 'Customer'} — {row.email}</p>)}{importPreview.emails.length > 20 && <p>Showing first 20 valid rows.</p>}{importPreview.issues.map(issue => <p key={issue.row} className="text-danger">Row {issue.row}: {issue.error}</p>)}{importPreview.invalid > importPreview.issues.length && <p>Showing first 100 invalid rows.</p>}</div>
            <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={!importPreview.emails.length} onClick={() => { if (addEmails(importPreview.emails)) setImportPreview(null) }}>Add valid emails to list</button><button type="button" className={buttonClass} onClick={() => setImportPreview(null)}>Discard import</button></div>
          </div>}
        </div>
        {!!value.emails.length && <div className="rounded-xl border border-border p-3 space-y-3">
          <h4 className="text-sm font-medium">Added/imported emails ({value.emails.length})</h4>
          <div className="max-h-52 overflow-y-auto space-y-1">{value.emails.map(row => <div key={row.email} className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 break-all">{row.name || 'Customer'} — {row.email}</span><button type="button" className={buttonClass} aria-label={`Remove ${row.email}`} onClick={() => update({ ...value, emails: value.emails.filter(current => current.email !== row.email) })}>Remove</button></div>)}</div>
          <label className="flex min-h-11 items-start gap-3 text-xs"><input type="checkbox" checked={value.consentConfirmed} onChange={event => update({ ...value, consentConfirmed: event.target.checked })} className="mt-1 h-4 w-4 shrink-0 accent-accent" /><span>I confirm these added/imported recipients have permitted marketing emails. Existing unsubscribes are never overridden.</span></label>
        </div>}
        <p className="text-xs text-muted">Requested: {value.contactIds.length} contacts + {value.emails.length} explicit emails. Review below for the deduplicated, eligible count.</p>
      </>}
      <button type="button" className={buttonClass} onClick={() => void checkRecipients()}>{checking ? 'Reviewing…' : 'Review eligible recipients'}</button>
    </fieldset>
    {error && <p role="alert" className="text-xs text-danger break-words">{error}</p>}
    {notice && <p role="status" className="text-xs text-muted break-words">{notice}</p>}
    {reviewed && <div role="status" className="rounded-xl border border-border p-3 space-y-2">
      <p className="text-sm font-medium">{reviewed.total} eligible unique recipients</p>
      <p className="text-xs text-muted">Excluded: {reviewed.unsubscribed} unsubscribed, {reviewed.invalid} invalid, {reviewed.duplicates} duplicate entries, {reviewed.unavailableContacts} unavailable contacts. Rechecked at send time.</p>
      <div className="max-h-36 overflow-y-auto text-xs space-y-1">{reviewed.recipients.map(row => <p key={row.email} className="break-all">{row.name} — {row.email}</p>)}</div>
      {reviewed.total > reviewed.recipients.length && <p className="text-xs text-muted">Showing first 100; all {reviewed.total} eligible addresses will be used.</p>}
    </div>}
  </section>
}

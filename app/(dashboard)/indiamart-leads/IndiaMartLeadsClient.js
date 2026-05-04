'use client'

import { useMemo, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Download,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import {
  getIndiaMartConfig,
  getIndiaMartLeads,
  syncIndiaMartPullLeads,
} from '@/app/actions/indiamart'
import { useAlertToast } from '@/components/AlertToastProvider'

function formatDateTime(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function IndiaMartLeadsClient({ initialConfig, initialRows, initialError = null }) {
  const { notify } = useAlertToast()
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [config, setConfig] = useState(initialConfig)
  const [rows, setRows] = useState(initialRows)
  const [syncResult, setSyncResult] = useState(null)

  const loadData = async () => {
    const [configRes, leadsRes] = await Promise.all([getIndiaMartConfig(), getIndiaMartLeads(500)])
    if (configRes.success) {
      setConfig(configRes.data)
    }
    if (leadsRes.success) {
      setRows(leadsRes.data)
    }
  }

  const stats = useMemo(() => {
    const total = config?.totalSynced || 0
    const imported = config?.totalImported || 0
    const pending = Math.max(total - imported, 0)
    return { total, imported, pending }
  }, [config])

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => {
      return (
        row.uniqueQueryId?.toLowerCase().includes(term) ||
        row.senderName?.toLowerCase().includes(term) ||
        row.senderMobile?.toLowerCase().includes(term) ||
        row.senderEmail?.toLowerCase().includes(term) ||
        row.queryProductName?.toLowerCase().includes(term) ||
        row.queryMessage?.toLowerCase().includes(term)
      )
    })
  }, [rows, search])

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    const res = await syncIndiaMartPullLeads()
    setSyncing(false)

    if (!res.success) {
      notify(res.error || 'IndiaMART sync failed', { variant: 'danger' })
      setSyncResult({ ok: false, message: res.error || 'Sync failed' })
      return
    }

    const summary = `Fetched ${res.data.fetched}, saved ${res.data.saved}, imported ${res.data.imported}`
    notify(summary, { variant: 'success' })
    setSyncResult({ ok: true, message: summary })
    await loadData()
  }

  if (!config) {
    return (
      <div className="glass-card p-6">
        <p className="text-sm text-danger">
          {initialError || 'Failed to load IndiaMART configuration.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out] min-w-0">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-accent" />
            IndiaMART Leads
          </h1>
          <p className="text-sm text-muted mt-1">
            Pull API v2 sync with duplicate-safe import into CRM leads.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-muted mb-1">Total Synced Rows</p>
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted mb-1">Imported to CRM Leads</p>
          <p className="text-2xl font-bold text-success">{stats.imported}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted mb-1">Pending Import</p>
          <p className="text-2xl font-bold text-warning">{stats.pending}</p>
        </div>
      </div>

      {syncResult && (
        <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${syncResult.ok ? 'bg-success-light text-success' : 'bg-red-500/10 text-red-700'}`}>
          {syncResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {syncResult.message}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Download className="w-4 h-4 text-accent" />
            Synced IndiaMART Rows
          </h2>
          <span className="text-xs text-muted">{visibleRows.length} shown</span>
        </div>
        <div className="px-4 py-3 border-b border-border bg-surface/40">
          <input
            type="text"
            placeholder="Search by query id, sender, phone, email, product, message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:max-w-xl"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Query ID</th>
                <th>Type</th>
                <th>Sender</th>
                <th>Product / Need</th>
                <th>Imported</th>
                <th>Query Time</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => (
                <tr key={row.id}>
                  <td className="font-medium text-foreground">{row.uniqueQueryId}</td>
                  <td>{row.queryTypeLabel}</td>
                  <td>
                    <div>
                      <p className="text-foreground">{row.senderName}</p>
                      <p className="text-xs text-muted">{row.senderMobile || row.senderEmail || 'N/A'}</p>
                    </div>
                  </td>
                  <td className="max-w-[320px]">
                    <p className="truncate text-foreground">{row.queryProductName || 'General Enquiry'}</p>
                    {row.queryMessage && <p className="truncate text-xs text-muted">{row.queryMessage}</p>}
                  </td>
                  <td>
                    {row.importedLeadId ? (
                      <span className="badge bg-success-light text-success">Lead #{row.importedLeadId}</span>
                    ) : (
                      <span className="badge bg-surface-hover text-muted">Not Imported</span>
                    )}
                  </td>
                  <td className="text-muted">{formatDateTime(row.queryTime || row.syncedAt)}</td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted">No matching IndiaMART rows found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

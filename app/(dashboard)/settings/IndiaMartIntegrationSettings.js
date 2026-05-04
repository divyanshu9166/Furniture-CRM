'use client'

import { useEffect, useState } from 'react'
import { Building2, CheckCircle2, Clock3, Eye, EyeOff, KeyRound, Save, XCircle } from 'lucide-react'
import { getIndiaMartConfig, saveIndiaMartConfig } from '@/app/actions/indiamart'
import { useAlertToast } from '@/components/AlertToastProvider'

const leadStatusOptions = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'SHOWROOM_VISIT', label: 'Showroom Visit' },
  { value: 'QUOTATION', label: 'Quotation' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
]

function formatDateTime(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function IndiaMartIntegrationSettings() {
  const { notify } = useAlertToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [form, setForm] = useState({
    enabled: false,
    autoImportToLeads: true,
    overlapMinutes: 5,
    defaultLeadStatus: 'NEW',
  })

  const applyConfigResult = (res) => {
    if (!res.success) {
      setError(res.error || 'Failed to load IndiaMART settings')
      setLoading(false)
      return
    }

    setConfig(res.data)
    setForm({
      enabled: res.data.enabled,
      autoImportToLeads: res.data.autoImportToLeads,
      overlapMinutes: res.data.overlapMinutes || 5,
      defaultLeadStatus: res.data.defaultLeadStatus || 'NEW',
    })
    setLoading(false)
  }

  useEffect(() => {
    let mounted = true

    async function loadInitialConfig() {
      const res = await getIndiaMartConfig()
      if (mounted) applyConfigResult(res)
    }

    loadInitialConfig()

    return () => {
      mounted = false
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError('')

    const res = await saveIndiaMartConfig({
      ...form,
      overlapMinutes: Number(form.overlapMinutes) || 5,
      pullApiKey: apiKeyInput,
    })

    setSaving(false)
    if (!res.success) {
      const message = res.error || 'Failed to save IndiaMART settings'
      setError(message)
      notify(message, { variant: 'danger' })
      return
    }

    setApiKeyInput('')
    setSaved(true)
    notify('IndiaMART settings saved', { variant: 'success' })
    setTimeout(() => setSaved(false), 2500)
    const refreshed = await getIndiaMartConfig()
    applyConfigResult(refreshed)
  }

  return (
    <div className="glass-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-accent" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">IndiaMART Integration</h2>
            <p className="text-xs text-muted">Configure Pull API sync and CRM lead import behavior.</p>
          </div>
        </div>
        {config && (
          <span className={`self-start sm:self-auto px-2.5 py-1 rounded-full text-[10px] font-medium border ${form.enabled ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : 'bg-surface-hover text-muted border-border'}`}>
            {form.enabled ? 'Enabled' : 'Disabled'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-12 bg-surface rounded-xl" />
          <div className="h-10 bg-surface rounded-xl" />
          <div className="h-10 bg-surface rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="p-3 rounded-xl bg-surface flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-foreground">Enable IndiaMART Integration</p>
                <p className="text-xs text-muted">Show IndiaMART in the sidebar and allow Pull API syncing.</p>
              </div>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm(prev => ({ ...prev, enabled: e.target.checked }))}
                className="w-4 h-4 mt-1 accent-accent"
              />
            </label>

            <label className="p-3 rounded-xl bg-surface flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-foreground">Auto Import to Leads</p>
                <p className="text-xs text-muted">Create CRM leads from synced IndiaMART rows.</p>
              </div>
              <input
                type="checkbox"
                checked={form.autoImportToLeads}
                onChange={(e) => setForm(prev => ({ ...prev, autoImportToLeads: e.target.checked }))}
                className="w-4 h-4 mt-1 accent-accent"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1.5">Pull API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={config?.hasPullApiKey ? 'Saved key exists. Enter only to replace it.' : 'Paste your glusr_crm_key'}
                  className="w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-foreground"
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted mt-1 flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" />
                Leave empty to keep existing saved key.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Default Lead Stage</label>
              <select
                value={form.defaultLeadStatus}
                onChange={(e) => setForm(prev => ({ ...prev, defaultLeadStatus: e.target.value }))}
                className="w-full"
              >
                {leadStatusOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Overlap Minutes (recommended: 5)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={form.overlapMinutes}
                onChange={(e) => setForm(prev => ({ ...prev, overlapMinutes: e.target.value }))}
                className="w-full"
              />
            </div>

            <div className="lg:col-span-2 flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
              </button>

              <div className="text-xs text-muted flex items-center gap-1.5">
                <Clock3 className="w-3.5 h-3.5" />
                Last sync: {formatDateTime(config?.lastSyncAt)}
              </div>
            </div>
          </div>

          <p className="text-xs text-muted">
            Pull API guardrails applied: minimum 5-minute interval between syncs and a maximum 7-day request window.
          </p>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 text-red-700 text-sm flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          {saved && !error && (
            <div className="p-3 rounded-xl bg-success-light text-success text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              IndiaMART settings saved successfully.
            </div>
          )}
        </>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, FileText,
  BookOpen, Plus, RefreshCw, IndianRupee
} from 'lucide-react'
import {
  seedChartOfAccounts, getAccounts, getProfitAndLoss,
  getBalanceSheet, getCashFlow, getJournalEntries, createManualJournal
} from '@/app/actions/financials'
import Modal from '@/components/Modal'

export default function FinancialsPage() {
  const [tab, setTab] = useState('pnl')
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState([])
  const [journals, setJournals] = useState([])

  // Date range
  const now = new Date()
  const fyStart = now.getMonth() >= 3 ? `${now.getFullYear()}-04-01` : `${now.getFullYear() - 1}-04-01`
  const [fromDate, setFromDate] = useState(fyStart)
  const [toDate, setToDate] = useState(now.toISOString().split('T')[0])
  const [asOfDate, setAsOfDate] = useState(now.toISOString().split('T')[0])

  // Reports
  const [pnlData, setPnlData] = useState(null)
  const [bsData, setBsData] = useState(null)
  const [cfData, setCfData] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)

  // Journal modal
  const [showJournalModal, setShowJournalModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [journalForm, setJournalForm] = useState({
    date: now.toISOString().split('T')[0],
    narration: '',
    lines: [{ accountId: '', debit: 0, credit: 0, description: '' }, { accountId: '', debit: 0, credit: 0, description: '' }]
  })

  const allAccounts = accounts.flatMap(g => g.accounts?.map(a => ({ ...a, groupName: g.name, groupType: g.type })) || [])

  const loadData = () => {
    setLoading(true)
    Promise.all([getAccounts(), getJournalEntries()]).then(([accRes, jrnRes]) => {
      if (accRes.success) setAccounts(accRes.data)
      if (jrnRes.success) setJournals(jrnRes.data)
      setLoading(false)
    })
  }

  useEffect(() => {
    seedChartOfAccounts().then(() => loadData())
  }, [])

  const fetchPnL = async () => {
    setReportLoading(true)
    const res = await getProfitAndLoss(fromDate, toDate)
    if (res.success) setPnlData(res.data)
    else alert(res.error)
    setReportLoading(false)
  }

  const fetchBS = async () => {
    setReportLoading(true)
    const res = await getBalanceSheet(asOfDate)
    if (res.success) setBsData(res.data)
    else alert(res.error)
    setReportLoading(false)
  }

  const fetchCF = async () => {
    setReportLoading(true)
    const res = await getCashFlow(fromDate, toDate)
    if (res.success) setCfData(res.data)
    else alert(res.error)
    setReportLoading(false)
  }

  const handleCreateJournal = async () => {
    setSubmitting(true)
    const lines = journalForm.lines.filter(l => l.accountId).map(l => ({
      accountId: Number(l.accountId), debit: Number(l.debit), credit: Number(l.credit), description: l.description
    }))
    const res = await createManualJournal({ date: journalForm.date, narration: journalForm.narration, lines })
    if (res.success) {
      setShowJournalModal(false)
      setJournalForm({ date: now.toISOString().split('T')[0], narration: '', lines: [{ accountId: '', debit: 0, credit: 0, description: '' }, { accountId: '', debit: 0, credit: 0, description: '' }] })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const fmt = (v) => `₹${(v || 0).toLocaleString('en-IN')}`

  const tabs = [
    { id: 'pnl', label: 'Profit & Loss' },
    { id: 'bs', label: 'Balance Sheet' },
    { id: 'cf', label: 'Cash Flow' },
    { id: 'coa', label: 'Chart of Accounts' },
    { id: 'journals', label: 'Journal Entries' },
  ]

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financial Statements</h1>
          <p className="text-muted text-sm mt-1">P&L, Balance Sheet, Cash Flow & Journal Entries</p>
        </div>
        {tab === 'journals' && (
          <button onClick={() => setShowJournalModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Journal
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* P&L Tab */}
      {tab === 'pnl' && (
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
            </div>
            <button onClick={fetchPnL} disabled={reportLoading} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2">
              {reportLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} Generate
            </button>
          </div>

          {pnlData && (
            <div className="glass-card p-6 space-y-6">
              <h3 className="text-lg font-semibold text-foreground text-center">Profit & Loss Statement</h3>
              <p className="text-sm text-muted text-center">{pnlData.period?.from} to {pnlData.period?.to}</p>

              {/* Revenue */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground border-b border-border pb-1">Revenue</h4>
                <div className="flex justify-between text-sm"><span className="text-muted">Gross Sales</span><span className="text-foreground">{fmt(pnlData.revenue?.grossSales)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted">Less: Returns</span><span className="text-red-400">({fmt(pnlData.revenue?.returns)})</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted">Less: Sales GST</span><span className="text-red-400">({fmt(pnlData.revenue?.salesGST)})</span></div>
                <div className="flex justify-between text-sm font-semibold border-t border-border/50 pt-1"><span className="text-foreground">Net Revenue</span><span className="text-foreground">{fmt(pnlData.revenue?.netRevenue)}</span></div>
              </div>

              {/* COGS */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground border-b border-border pb-1">Cost of Goods Sold</h4>
                <div className="flex justify-between text-sm"><span className="text-muted">Purchases (ex-GST)</span><span className="text-foreground">{fmt(pnlData.cogs?.cogs)}</span></div>
                <div className="flex justify-between text-sm font-semibold border-t border-border/50 pt-1"><span className="text-foreground">Gross Profit</span><span className={pnlData.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmt(pnlData.grossProfit)}</span></div>
              </div>

              {/* Operating Expenses */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground border-b border-border pb-1">Operating Expenses</h4>
                <div className="flex justify-between text-sm"><span className="text-muted">Salary Expense</span><span className="text-foreground">{fmt(pnlData.operatingExpenses?.salaryExpense)}</span></div>
                <div className="flex justify-between text-sm font-semibold border-t border-border/50 pt-1"><span className="text-foreground">Total Operating Expenses</span><span className="text-foreground">{fmt(pnlData.operatingExpenses?.total)}</span></div>
              </div>

              {/* Net Profit */}
              <div className="bg-surface-hover p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-foreground">Net Profit</span>
                  <span className={`text-2xl font-bold ${pnlData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pnlData.netProfit >= 0 ? <TrendingUp className="w-5 h-5 inline mr-1" /> : <TrendingDown className="w-5 h-5 inline mr-1" />}
                    {fmt(pnlData.netProfit)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Balance Sheet Tab */}
      {tab === 'bs' && (
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">As of Date</label>
              <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
            </div>
            <button onClick={fetchBS} disabled={reportLoading} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2">
              {reportLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} Generate
            </button>
          </div>

          {bsData && (
            <div className="glass-card p-6 space-y-6">
              <h3 className="text-lg font-semibold text-foreground text-center">Balance Sheet</h3>
              <p className="text-sm text-muted text-center">As of {bsData.asOfDate}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Assets */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-foreground border-b border-border pb-1">Assets</h4>
                  <div className="flex justify-between text-sm"><span className="text-muted">Cash & Bank</span><span className="text-foreground">{fmt(bsData.assets?.cashAndBank)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted">Accounts Receivable</span><span className="text-foreground">{fmt(bsData.assets?.accountsReceivable)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted">Inventory</span><span className="text-foreground">{fmt(bsData.assets?.inventory)}</span></div>
                  <div className="flex justify-between text-sm font-semibold border-t border-border/50 pt-1"><span className="text-foreground">Total Assets</span><span className="text-accent">{fmt(bsData.assets?.total)}</span></div>
                </div>

                {/* Liabilities & Equity */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-foreground border-b border-border pb-1">Liabilities</h4>
                  <div className="flex justify-between text-sm"><span className="text-muted">Accounts Payable</span><span className="text-foreground">{fmt(bsData.liabilities?.accountsPayable)}</span></div>
                  <div className="flex justify-between text-sm font-semibold border-t border-border/50 pt-1"><span className="text-foreground">Total Liabilities</span><span className="text-foreground">{fmt(bsData.liabilities?.total)}</span></div>
                  <h4 className="text-sm font-semibold text-foreground border-b border-border pb-1 mt-4">Equity</h4>
                  <div className="flex justify-between text-sm font-semibold"><span className="text-foreground">Total Equity</span><span className="text-emerald-400">{fmt(bsData.equity?.total)}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cash Flow Tab */}
      {tab === 'cf' && (
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
            </div>
            <button onClick={fetchCF} disabled={reportLoading} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2">
              {reportLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} Generate
            </button>
          </div>

          {cfData && (
            <div className="glass-card p-6 space-y-6">
              <h3 className="text-lg font-semibold text-foreground text-center">Cash Flow Statement</h3>
              <p className="text-sm text-muted text-center">{cfData.period?.from} to {cfData.period?.to}</p>

              {/* Operating */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground border-b border-border pb-1">Operating Activities</h4>
                <div className="flex justify-between text-sm"><span className="text-muted">Sales Collections</span><span className="text-emerald-400">+{fmt(cfData.operating?.inflow?.salesCollections)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted">Purchase Payments</span><span className="text-red-400">-{fmt(cfData.operating?.outflow?.purchases)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted">Salary Payments</span><span className="text-red-400">-{fmt(cfData.operating?.outflow?.salaries)}</span></div>
                <div className="flex justify-between text-sm font-semibold border-t border-border/50 pt-1"><span className="text-foreground">Net Operating</span><span className={cfData.operating?.net >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmt(cfData.operating?.net)}</span></div>
              </div>

              {/* Investing & Financing */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-hover p-3 rounded-lg">
                  <p className="text-xs text-muted">Investing Activities</p>
                  <p className="font-semibold text-foreground">{fmt(cfData.investing?.net)}</p>
                </div>
                <div className="bg-surface-hover p-3 rounded-lg">
                  <p className="text-xs text-muted">Financing Activities</p>
                  <p className="font-semibold text-foreground">{fmt(cfData.financing?.net)}</p>
                </div>
              </div>

              {/* Net Cash Flow */}
              <div className="bg-surface-hover p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-foreground">Net Cash Flow</span>
                  <span className={`text-2xl font-bold ${cfData.netCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(cfData.netCashFlow)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chart of Accounts Tab */}
      {tab === 'coa' && (
        <div className="space-y-4">
          {accounts.map(group => (
            <div key={group.id} className="glass-card p-5">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                {group.name}
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  group.type === 'ASSET' ? 'bg-blue-500/10 text-blue-400' :
                  group.type === 'LIABILITY' ? 'bg-red-500/10 text-red-400' :
                  group.type === 'INCOME' ? 'bg-emerald-500/10 text-emerald-400' :
                  group.type === 'EXPENSE' ? 'bg-amber-500/10 text-amber-400' :
                  'bg-purple-500/10 text-purple-400'
                }`}>{group.type}</span>
              </h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border">
                  {['Code', 'Account Name', 'System'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted">{h}</th>)}
                </tr></thead>
                <tbody>
                  {group.accounts?.map(acc => (
                    <tr key={acc.id} className="border-b border-border/50">
                      <td className="px-3 py-2 font-mono text-foreground">{acc.code}</td>
                      <td className="px-3 py-2 text-foreground">{acc.name}</td>
                      <td className="px-3 py-2">{acc.isSystemAccount ? <span className="text-xs text-muted">System</span> : <span className="text-xs text-accent">Custom</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {accounts.length === 0 && <div className="text-center py-12 text-muted">No accounts. Chart of accounts will be auto-seeded.</div>}
        </div>
      )}

      {/* Journal Entries Tab */}
      {tab === 'journals' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              {['JV #', 'Date', 'Narration', 'Type', 'Debit', 'Credit', 'Lines'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {journals.map(j => (
                <tr key={j.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{j.displayId}</td>
                  <td className="px-4 py-3 text-muted">{new Date(j.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3 text-foreground max-w-[250px] truncate">{j.narration}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${j.referenceType === 'MANUAL' ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-400'}`}>{j.referenceType}</span></td>
                  <td className="px-4 py-3 text-foreground">{fmt(j.totalDebit)}</td>
                  <td className="px-4 py-3 text-foreground">{fmt(j.totalCredit)}</td>
                  <td className="px-4 py-3 text-muted">{j.lines?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {journals.length === 0 && <div className="text-center py-12 text-muted">No journal entries yet</div>}
        </div>
      )}

      {/* Create Journal Modal */}
      <Modal isOpen={showJournalModal} onClose={() => setShowJournalModal(false)} title="Create Manual Journal Entry" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">Date *</label>
              <input type="date" value={journalForm.date} onChange={e => setJournalForm(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">Narration *</label>
              <input value={journalForm.narration} onChange={e => setJournalForm(p => ({ ...p, narration: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted">Lines (Debit = Credit)</label>
              <button onClick={() => setJournalForm(f => ({ ...f, lines: [...f.lines, { accountId: '', debit: 0, credit: 0, description: '' }] }))} className="text-xs text-accent hover:underline">+ Add Line</button>
            </div>
            {journalForm.lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                <select value={line.accountId} onChange={e => { const v = [...journalForm.lines]; v[i].accountId = e.target.value; setJournalForm(f => ({ ...f, lines: v })) }} className="col-span-5 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                  <option value="">Select Account</option>
                  {allAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
                <input type="number" min="0" value={line.debit} onChange={e => { const v = [...journalForm.lines]; v[i].debit = e.target.value; setJournalForm(f => ({ ...f, lines: v })) }} placeholder="Debit" className="col-span-2 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                <input type="number" min="0" value={line.credit} onChange={e => { const v = [...journalForm.lines]; v[i].credit = e.target.value; setJournalForm(f => ({ ...f, lines: v })) }} placeholder="Credit" className="col-span-2 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                <input value={line.description} onChange={e => { const v = [...journalForm.lines]; v[i].description = e.target.value; setJournalForm(f => ({ ...f, lines: v })) }} placeholder="Desc" className="col-span-2 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                <button onClick={() => setJournalForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))} className="col-span-1 text-red-400 hover:text-red-300 text-lg">×</button>
              </div>
            ))}
            <div className="flex justify-between text-sm mt-2 px-1">
              <span className="text-muted">Totals:</span>
              <span>
                <span className="text-emerald-400 mr-4">Dr: {fmt(journalForm.lines.reduce((s, l) => s + Number(l.debit || 0), 0))}</span>
                <span className="text-red-400">Cr: {fmt(journalForm.lines.reduce((s, l) => s + Number(l.credit || 0), 0))}</span>
              </span>
            </div>
          </div>

          <button onClick={handleCreateJournal} disabled={submitting || !journalForm.narration || !journalForm.lines.some(l => l.accountId)} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Journal Entry'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

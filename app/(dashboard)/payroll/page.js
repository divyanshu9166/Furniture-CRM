'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Wallet, Users, Calendar, CheckCircle, Eye, CreditCard,
  AlertCircle, IndianRupee, Printer, Edit2, Save, X,
  FileText, ShieldCheck, BadgeCheck, PiggyBank, Plus, Landmark
} from 'lucide-react'
import {
  generatePayroll, getPayrollHistory, getPayrollRun, getAllPayslips,
  approvePayroll, markPayrollPaid, getStaffForPayroll, updateStaffPayrollInfo,
  getStaffLoans, createStaffLoan, closeStaffLoan
} from '@/app/actions/payroll'
import Modal from '@/components/Modal'

const statusColors = {
  DRAFT: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  APPROVED: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  PAID: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
}

const PT_STATES = ['None', 'Maharashtra', 'Karnataka', 'West Bengal', 'Tamil Nadu', 'Gujarat', 'Andhra', 'Telangana']

const fmt = (v) => `₹${(v || 0).toLocaleString('en-IN')}`

export default function PayrollPage() {
  const [tab, setTab] = useState('process')
  const [loading, setLoading] = useState(true)

  // Staff setup
  const [staffList, setStaffList] = useState([])
  const [editingStaff, setEditingStaff] = useState(null)
  const [staffForm, setStaffForm] = useState({})
  const [savingStaff, setSavingStaff] = useState(false)

  // Loans
  const [loans, setLoans] = useState([])
  const [showLoanModal, setShowLoanModal] = useState(false)
  const [loanForm, setLoanForm] = useState({ staffId: '', purpose: '', principalAmount: '', monthlyInstallment: '', startPeriod: '', notes: '' })
  const [savingLoan, setSavingLoan] = useState(false)

  // Process payroll
  const [history, setHistory] = useState([])
  const [period, setPeriod] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [workingDays, setWorkingDays] = useState(26)
  const [generating, setGenerating] = useState(false)
  const [generatedRun, setGeneratedRun] = useState(null)

  // Payslips
  const [payslips, setPayslips] = useState([])
  const [payslipPeriodFilter, setPayslipPeriodFilter] = useState('')

  // Detail modal
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedRun, setSelectedRun] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Print payslip
  const [printPayslip, setPrintPayslip] = useState(null)
  const printRef = useRef(null)

  // Bank advice print
  const [bankAdviceRun, setBankAdviceRun] = useState(null)
  const bankRef = useRef(null)

  const loadAll = async () => {
    setLoading(true)
    const [histRes, staffRes, loanRes] = await Promise.all([
      getPayrollHistory(), getStaffForPayroll(), getStaffLoans()
    ])
    if (histRes.success) setHistory(histRes.data)
    if (staffRes.success) setStaffList(staffRes.data)
    if (loanRes.success) setLoans(loanRes.data)
    setLoading(false)
  }

  const loadPayslips = async () => {
    const res = await getAllPayslips(payslipPeriodFilter || undefined)
    if (res.success) setPayslips(res.data)
  }

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (tab === 'payslips') loadPayslips() }, [tab, payslipPeriodFilter])

  // ── Staff setup ──
  const startEditStaff = (s) => {
    setEditingStaff(s.id)
    setStaffForm({
      staffId: s.id,
      basicSalary: s.basicSalary || 0,
      designation: s.designation || '',
      panNumber: s.panNumber || '',
      bankAccount: s.bankAccount || '',
      bankName: s.bankName || '',
      ifscCode: s.ifscCode || '',
      pfEnrolled: s.pfEnrolled || false,
      esiEnrolled: s.esiEnrolled || false,
      uanNumber: s.uanNumber || '',
      pfNumber: s.pfNumber || '',
      esiNumber: s.esiNumber || '',
      professionalTaxState: s.professionalTaxState || 'None',
      tdsMonthly: s.tdsMonthly || 0,
    })
  }

  const handleSaveStaff = async () => {
    setSavingStaff(true)
    const res = await updateStaffPayrollInfo({
      ...staffForm,
      basicSalary: Number(staffForm.basicSalary),
      tdsMonthly: Number(staffForm.tdsMonthly),
    })
    if (res.success) { setEditingStaff(null); loadAll() }
    else alert(res.error)
    setSavingStaff(false)
  }

  // ── Loans ──
  const handleCreateLoan = async () => {
    setSavingLoan(true)
    const res = await createStaffLoan({
      staffId: Number(loanForm.staffId),
      purpose: loanForm.purpose,
      principalAmount: Number(loanForm.principalAmount),
      monthlyInstallment: Number(loanForm.monthlyInstallment),
      startPeriod: loanForm.startPeriod,
      notes: loanForm.notes,
    })
    if (res.success) {
      setShowLoanModal(false)
      setLoanForm({ staffId: '', purpose: '', principalAmount: '', monthlyInstallment: '', startPeriod: '', notes: '' })
      loadAll()
    } else alert(res.error)
    setSavingLoan(false)
  }

  const handleCloseLoan = async (id) => {
    if (!confirm('Close this loan? Remaining balance will be cleared.')) return
    const res = await closeStaffLoan(id)
    if (res.success) loadAll()
    else alert(res.error)
  }

  // ── Payroll ──
  const handleGenerate = async () => {
    const unconfigured = staffList.filter(s => !s.basicSalary)
    if (unconfigured.length > 0 && !confirm(`${unconfigured.length} staff have ₹0 basic salary. Continue?`)) return
    setGenerating(true)
    setGeneratedRun(null)
    const res = await generatePayroll({ period, workingDays: Number(workingDays) })
    if (res.success) { setGeneratedRun(res.data); loadAll() }
    else alert(res.error)
    setGenerating(false)
  }

  const handleApprove = async (id) => {
    const res = await approvePayroll(id)
    if (res.success) { loadAll(); if (generatedRun?.id === id) setGeneratedRun(p => ({ ...p, status: 'APPROVED' })) }
    else alert(res.error)
  }

  const handleMarkPaid = async (id) => {
    if (!confirm('Mark entire payroll as PAID? This cannot be undone.')) return
    const res = await markPayrollPaid(id)
    if (res.success) loadAll()
    else alert(res.error)
  }

  const viewRun = async (id) => {
    setDetailLoading(true)
    setShowDetailModal(true)
    const res = await getPayrollRun(id)
    if (res.success) setSelectedRun(res.data)
    setDetailLoading(false)
  }

  // ── Print helpers ──
  const handlePrintPayslip = () => {
    const content = printRef.current?.innerHTML
    if (!content) return
    const win = window.open('', '_blank')
    win.document.write(`<html><head><title>Payslip</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#000}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #bbb;padding:6px 10px;text-align:left}
      th{background:#f0f0f0;font-weight:bold}
      .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:16px}
      .hdr h2{margin:0;font-size:20px}.hdr p{margin:2px 0;color:#555;font-size:11px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
      .net{text-align:right;font-size:16px;font-weight:bold;margin-top:12px;border-top:2px solid #333;padding-top:8px}
      .foot{display:grid;grid-template-columns:1fr 1fr;margin-top:40px;font-size:11px;color:#555}
    </style></head><body>${content}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  const handlePrintBankAdvice = () => {
    const content = bankRef.current?.innerHTML
    if (!content) return
    const win = window.open('', '_blank')
    win.document.write(`<html><head><title>Bank Payment Advice</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#000}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #bbb;padding:6px 8px;text-align:left}
      th{background:#f0f0f0;font-weight:bold}
      h2{text-align:center;margin-bottom:4px} p{text-align:center;color:#555;font-size:11px;margin-bottom:16px}
    </style></head><body>${content}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  // ── Stats ──
  const totalPaidAmount = history.filter(h => h.status === 'PAID').reduce((s, h) => s + h.totalNet, 0)
  const pendingApproval = history.filter(h => h.status === 'DRAFT').length
  const staffConfigured = staffList.filter(s => s.basicSalary > 0).length
  const activeLoans = loans.filter(l => l.status === 'Active').length

  const tabs = [
    { id: 'setup', label: 'Staff Setup', icon: Users },
    { id: 'process', label: 'Process Payroll', icon: Wallet },
    { id: 'payslips', label: 'Payslips', icon: FileText },
    { id: 'loans', label: 'Loans & Advances', icon: PiggyBank },
    { id: 'history', label: 'History', icon: Calendar },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Staff Payroll</h1>
        <p className="text-muted text-sm mt-1">
          Tally-parity payroll — PF (12%), ESI (0.75%/3.25%), Professional Tax, TDS, OT, Loans, Statutory Bonus, Bank Advice
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Active Staff', value: staffList.length, sub: `${staffConfigured} configured`, icon: Users, color: 'text-blue-400' },
          { label: 'Payroll Runs', value: history.length, sub: `${pendingApproval} pending`, icon: Calendar, color: 'text-purple-400' },
          { label: 'Pending Approval', value: pendingApproval, sub: 'awaiting sign-off', icon: AlertCircle, color: 'text-amber-400' },
          { label: 'Active Loans', value: activeLoans, sub: 'staff advances', icon: PiggyBank, color: 'text-orange-400' },
          { label: 'Total Paid (YTD)', value: fmt(totalPaidAmount), sub: 'net disbursed', icon: IndianRupee, color: 'text-emerald-400' },
        ].map((s, i) => (
          <div key={i} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color} flex-shrink-0`} />
              <p className="text-xs text-muted">{s.label}</p>
            </div>
            <p className="text-xl font-bold text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.id === 'setup' && staffList.filter(s => !s.basicSalary).length > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                {staffList.filter(s => !s.basicSalary).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── STAFF SETUP TAB ── */}
      {tab === 'setup' && (
        <div className="space-y-4">
          <div className="glass-card p-4 bg-amber-500/5 border border-amber-500/20">
            <p className="text-sm text-amber-400 font-medium">Configure salary, statutory details & bank info per staff member before generating payroll.</p>
            <p className="text-xs text-muted mt-1">Fields used: Basic Salary → HRA (40%) + DA (10%) auto-computed. PT deducted per state slab. TDS is fixed monthly amount.</p>
          </div>

          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm min-w-[1200px]">
              <thead>
                <tr className="border-b border-border bg-surface-hover">
                  {['Staff', 'Role', 'Designation', 'Basic (₹)', 'PF', 'UAN', 'ESI', 'ESI No.', 'PT State', 'TDS/mo', 'Bank', 'PAN', ''].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-muted whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffList.map(s => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-surface-hover/50 transition-colors">
                    {editingStaff === s.id ? (
                      <>
                        <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                        <td className="px-3 py-2 text-muted text-xs">{s.role}</td>
                        <td className="px-3 py-2"><input value={staffForm.designation} onChange={e => setStaffForm(p => ({ ...p, designation: e.target.value }))} className="w-24 px-2 py-1 bg-surface border border-border rounded text-xs text-foreground" placeholder="Designation" /></td>
                        <td className="px-3 py-2"><input type="number" min="0" value={staffForm.basicSalary} onChange={e => setStaffForm(p => ({ ...p, basicSalary: e.target.value }))} className="w-24 px-2 py-1 bg-surface border border-border rounded text-xs text-foreground" /></td>
                        <td className="px-3 py-2">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={staffForm.pfEnrolled} onChange={e => setStaffForm(p => ({ ...p, pfEnrolled: e.target.checked }))} />
                            <span className="text-xs text-muted">12%</span>
                          </label>
                        </td>
                        <td className="px-3 py-2"><input value={staffForm.uanNumber} onChange={e => setStaffForm(p => ({ ...p, uanNumber: e.target.value }))} className="w-24 px-2 py-1 bg-surface border border-border rounded text-xs text-foreground" placeholder="UAN" /></td>
                        <td className="px-3 py-2">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={staffForm.esiEnrolled} onChange={e => setStaffForm(p => ({ ...p, esiEnrolled: e.target.checked }))} />
                            <span className="text-xs text-muted">0.75%</span>
                          </label>
                        </td>
                        <td className="px-3 py-2"><input value={staffForm.esiNumber} onChange={e => setStaffForm(p => ({ ...p, esiNumber: e.target.value }))} className="w-24 px-2 py-1 bg-surface border border-border rounded text-xs text-foreground" placeholder="ESI No." /></td>
                        <td className="px-3 py-2">
                          <select value={staffForm.professionalTaxState} onChange={e => setStaffForm(p => ({ ...p, professionalTaxState: e.target.value }))} className="w-28 px-2 py-1 bg-surface border border-border rounded text-xs text-foreground">
                            {PT_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><input type="number" min="0" value={staffForm.tdsMonthly} onChange={e => setStaffForm(p => ({ ...p, tdsMonthly: e.target.value }))} className="w-20 px-2 py-1 bg-surface border border-border rounded text-xs text-foreground" /></td>
                        <td className="px-3 py-2"><input value={staffForm.bankAccount} onChange={e => setStaffForm(p => ({ ...p, bankAccount: e.target.value }))} className="w-24 px-2 py-1 bg-surface border border-border rounded text-xs text-foreground" placeholder="Acct No." /></td>
                        <td className="px-3 py-2"><input value={staffForm.panNumber} onChange={e => setStaffForm(p => ({ ...p, panNumber: e.target.value }))} className="w-20 px-2 py-1 bg-surface border border-border rounded text-xs text-foreground" placeholder="PAN" /></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button onClick={handleSaveStaff} disabled={savingStaff} className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"><Save className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingStaff(null)} className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3 font-medium text-foreground">{s.name}</td>
                        <td className="px-3 py-3 text-muted text-xs">{s.role}</td>
                        <td className="px-3 py-3 text-muted text-xs">{s.designation || '—'}</td>
                        <td className="px-3 py-3"><span className={!s.basicSalary ? 'text-amber-400 text-xs' : 'text-foreground font-medium'}>{s.basicSalary ? fmt(s.basicSalary) : 'Not set'}</span></td>
                        <td className="px-3 py-3"><span className={`text-xs flex items-center gap-1 ${s.pfEnrolled ? 'text-emerald-400' : 'text-muted'}`}>{s.pfEnrolled ? <><BadgeCheck className="w-3 h-3" />Yes</> : 'No'}</span></td>
                        <td className="px-3 py-3 text-muted text-xs">{s.uanNumber || '—'}</td>
                        <td className="px-3 py-3"><span className={`text-xs flex items-center gap-1 ${s.esiEnrolled ? 'text-emerald-400' : 'text-muted'}`}>{s.esiEnrolled ? <><BadgeCheck className="w-3 h-3" />Yes</> : 'No'}</span></td>
                        <td className="px-3 py-3 text-muted text-xs">{s.esiNumber || '—'}</td>
                        <td className="px-3 py-3 text-muted text-xs">{s.professionalTaxState || 'None'}</td>
                        <td className="px-3 py-3 text-muted text-xs">{s.tdsMonthly ? fmt(s.tdsMonthly) : '—'}</td>
                        <td className="px-3 py-3 text-muted text-xs">{s.bankAccount ? `****${s.bankAccount.slice(-4)}` : '—'}</td>
                        <td className="px-3 py-3 text-muted text-xs">{s.panNumber || '—'}</td>
                        <td className="px-3 py-3">
                          <button onClick={() => startEditStaff(s)} className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-foreground"><Edit2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {staffList.length === 0 && <div className="text-center py-12 text-muted">No active staff found.</div>}
          </div>
        </div>
      )}

      {/* ── PROCESS PAYROLL TAB ── */}
      {tab === 'process' && (
        <div className="space-y-6">
          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Generate Monthly Payroll</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="text-sm text-muted mb-1 block">Payroll Period</label>
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
              </div>
              <div>
                <label className="text-sm text-muted mb-1 block">Working Days</label>
                <input type="number" min="1" max="31" value={workingDays} onChange={e => setWorkingDays(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
              </div>
              <div className="flex items-end">
                <button onClick={handleGenerate} disabled={generating || staffList.length === 0}
                  className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {generating ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Calculating...</> : <><Wallet className="w-4 h-4" /> Generate Payroll</>}
                </button>
              </div>
            </div>

            {/* Calculation legend */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-4 border-t border-border">
              {[
                { label: 'HRA', value: '40% of Basic', color: 'text-blue-400' },
                { label: 'DA', value: '10% of Basic', color: 'text-purple-400' },
                { label: 'PF (Employee)', value: '12% of Basic', color: 'text-red-400' },
                { label: 'ESI (Employee)', value: '0.75% if Gross ≤₹21k', color: 'text-orange-400' },
                { label: 'OT Pay', value: '2× hourly rate', color: 'text-amber-400' },
              ].map((item, i) => (
                <div key={i} className="bg-surface-hover rounded-lg p-3 text-center">
                  <p className={`text-xs font-semibold ${item.color}`}>{item.label}</p>
                  <p className="text-xs text-muted mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Generated result */}
          {generatedRun && (
            <div className="glass-card p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{generatedRun.displayId}</h3>
                  <p className="text-sm text-muted">Period: {generatedRun.period} · {generatedRun.payslips?.length} staff</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[generatedRun.status]}`}>{generatedRun.status}</span>
                  {generatedRun.status === 'DRAFT' && (
                    <button onClick={() => handleApprove(generatedRun.id)}
                      className="px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-500/20 border border-emerald-500/20 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" /> Approve
                    </button>
                  )}
                </div>
              </div>

              {/* Totals */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                <div className="bg-surface-hover p-4 rounded-lg text-center">
                  <p className="text-xs text-muted">Total Gross</p>
                  <p className="text-xl font-bold text-foreground">{fmt(generatedRun.totalGross)}</p>
                </div>
                <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-lg text-center">
                  <p className="text-xs text-muted">Total Deductions</p>
                  <p className="text-xl font-bold text-red-400">{fmt(generatedRun.totalDeductions)}</p>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-lg text-center">
                  <p className="text-xs text-muted">Net Payable</p>
                  <p className="text-xl font-bold text-emerald-400">{fmt(generatedRun.totalNet)}</p>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-lg text-center">
                  <p className="text-xs text-muted">Employer CTC Add-on</p>
                  <p className="text-xl font-bold text-amber-400">{fmt(generatedRun.employerContributions)}</p>
                </div>
              </div>

              {/* Per-staff table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-hover">
                      {['Staff', 'Days', 'Basic', 'HRA', 'DA', 'OT', 'Bonus', 'Gross', 'PF', 'ESI', 'PT', 'TDS', 'Loan', 'Net'].map(h => (
                        <th key={h} className="px-2 py-2 text-left text-xs font-medium text-muted whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {generatedRun.payslips?.map((ps, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-surface-hover/50">
                        <td className="px-2 py-2 text-foreground font-medium text-xs">{ps.staff?.name}</td>
                        <td className="px-2 py-2 text-foreground text-xs">{ps.presentDays}/{ps.workingDays}</td>
                        <td className="px-2 py-2 text-foreground text-xs">{fmt(ps.basicSalary)}</td>
                        <td className="px-2 py-2 text-foreground text-xs">{fmt(ps.hra)}</td>
                        <td className="px-2 py-2 text-foreground text-xs">{fmt(ps.da)}</td>
                        <td className="px-2 py-2 text-blue-400 text-xs">{ps.otHours > 0 ? `+${fmt(ps.otPay)}` : '—'}</td>
                        <td className="px-2 py-2 text-purple-400 text-xs">{ps.bonus > 0 ? fmt(ps.bonus) : '—'}</td>
                        <td className="px-2 py-2 text-foreground font-medium text-xs">{fmt(ps.grossSalary)}</td>
                        <td className="px-2 py-2 text-red-400 text-xs">-{fmt(ps.pfEmployee)}</td>
                        <td className="px-2 py-2 text-red-400 text-xs">-{fmt(ps.esiEmployee)}</td>
                        <td className="px-2 py-2 text-red-400 text-xs">-{fmt(ps.professionalTax)}</td>
                        <td className="px-2 py-2 text-red-400 text-xs">-{fmt(ps.tds)}</td>
                        <td className="px-2 py-2 text-orange-400 text-xs">{ps.loanDeduction > 0 ? `-${fmt(ps.loanDeduction)}` : '—'}</td>
                        <td className="px-2 py-2 text-emerald-400 font-bold text-xs">{fmt(ps.netSalary)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bank Advice */}
              <div className="flex justify-end mt-3">
                <button onClick={() => setBankAdviceRun(generatedRun)}
                  className="px-4 py-2 bg-surface-hover text-muted hover:text-foreground rounded-lg text-sm flex items-center gap-2 border border-border">
                  <Landmark className="w-4 h-4" /> Bank Payment Advice
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PAYSLIPS TAB ── */}
      {tab === 'payslips' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">Filter by Period</label>
              <input type="month" value={payslipPeriodFilter} onChange={e => setPayslipPeriodFilter(e.target.value)}
                className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
            </div>
            {payslipPeriodFilter && (
              <button onClick={() => setPayslipPeriodFilter('')} className="mt-5 px-3 py-2 text-xs text-muted hover:text-foreground border border-border rounded-lg">Clear</button>
            )}
          </div>

          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Staff', 'Period', 'Basic', 'HRA', 'DA', 'OT', 'Gross', 'PF', 'ESI', 'PT', 'TDS', 'Loan', 'Net', 'Status', ''].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-muted whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payslips.map(ps => (
                  <tr key={ps.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="px-3 py-2 font-medium text-foreground">{ps.staff?.name}</td>
                    <td className="px-3 py-2 text-muted font-mono text-xs">{ps.payrollRun?.period}</td>
                    <td className="px-3 py-2 text-foreground text-xs">{fmt(ps.basicSalary)}</td>
                    <td className="px-3 py-2 text-foreground text-xs">{fmt(ps.hra)}</td>
                    <td className="px-3 py-2 text-foreground text-xs">{fmt(ps.da)}</td>
                    <td className="px-3 py-2 text-blue-400 text-xs">{ps.otPay > 0 ? fmt(ps.otPay) : '—'}</td>
                    <td className="px-3 py-2 text-foreground font-medium text-xs">{fmt(ps.grossSalary)}</td>
                    <td className="px-3 py-2 text-red-400 text-xs">-{fmt(ps.pfEmployee)}</td>
                    <td className="px-3 py-2 text-red-400 text-xs">-{fmt(ps.esiEmployee)}</td>
                    <td className="px-3 py-2 text-red-400 text-xs">-{fmt(ps.professionalTax)}</td>
                    <td className="px-3 py-2 text-red-400 text-xs">-{fmt(ps.tds)}</td>
                    <td className="px-3 py-2 text-orange-400 text-xs">{ps.loanDeduction > 0 ? `-${fmt(ps.loanDeduction)}` : '—'}</td>
                    <td className="px-3 py-2 text-emerald-400 font-bold text-xs">{fmt(ps.netSalary)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[ps.payrollRun?.status] || ''}`}>{ps.payrollRun?.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => setPrintPayslip({ ...ps, payrollRun: ps.payrollRun })}
                        className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-foreground" title="Print">
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payslips.length === 0 && <div className="text-center py-12 text-muted">No payslips found</div>}
          </div>
        </div>
      )}

      {/* ── LOANS & ADVANCES TAB ── */}
      {tab === 'loans' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-muted">Track staff loans and salary advance deductions. Installment is auto-deducted each payroll run.</p>
            </div>
            <button onClick={() => setShowLoanModal(true)}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Loan
            </button>
          </div>

          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Staff', 'Purpose', 'Principal', 'Remaining', 'Installment/Month', 'Start Period', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loans.map(l => (
                  <tr key={l.id} className="border-b border-border/50 hover:bg-surface-hover">
                    <td className="px-4 py-3 font-medium text-foreground">{l.staff?.name}</td>
                    <td className="px-4 py-3 text-foreground">{l.purpose}</td>
                    <td className="px-4 py-3 text-foreground">{fmt(l.principalAmount)}</td>
                    <td className="px-4 py-3">
                      <div>
                        <span className={`font-medium ${l.remainingAmount <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{fmt(l.remainingAmount)}</span>
                        <div className="w-24 h-1.5 bg-surface-hover rounded-full mt-1">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.max(0, Math.min(100, 100 - (l.remainingAmount / l.principalAmount) * 100))}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{fmt(l.monthlyInstallment)}</td>
                    <td className="px-4 py-3 text-muted font-mono text-xs">{l.startPeriod}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${l.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-400'}`}>{l.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {l.status === 'Active' && (
                        <button onClick={() => handleCloseLoan(l.id)} className="px-3 py-1 text-xs bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">Close Loan</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loans.length === 0 && <div className="text-center py-12 text-muted">No staff loans yet. Create one to auto-deduct from payroll.</div>}
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Run ID', 'Period', 'Staff', 'Gross', 'Deductions', 'Net Payable', 'Employer Add-on', 'Status', 'Paid On', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} className="border-b border-border/50 hover:bg-surface-hover">
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{h.displayId}</td>
                  <td className="px-4 py-3 text-foreground">{h.period}</td>
                  <td className="px-4 py-3 text-muted">{h._count?.payslips || 0}</td>
                  <td className="px-4 py-3 text-foreground">{fmt(h.totalGross)}</td>
                  <td className="px-4 py-3 text-red-400">{fmt(h.totalDeductions)}</td>
                  <td className="px-4 py-3 text-emerald-400 font-semibold">{fmt(h.totalNet)}</td>
                  <td className="px-4 py-3 text-amber-400">{fmt(h.employerContributions)}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[h.status] || ''}`}>{h.status}</span></td>
                  <td className="px-4 py-3 text-muted text-xs">{h.paidAt ? new Date(h.paidAt).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => viewRun(h.id)} className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-foreground" title="View"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => setBankAdviceRun(h)} className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-foreground" title="Bank Advice"><Landmark className="w-4 h-4" /></button>
                      {h.status === 'DRAFT' && <button onClick={() => handleApprove(h.id)} className="p-1.5 rounded hover:bg-blue-500/10 text-muted hover:text-blue-400" title="Approve"><ShieldCheck className="w-4 h-4" /></button>}
                      {h.status === 'APPROVED' && <button onClick={() => handleMarkPaid(h.id)} className="p-1.5 rounded hover:bg-emerald-500/10 text-muted hover:text-emerald-400" title="Mark Paid"><CreditCard className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && <div className="text-center py-12 text-muted">No payroll runs yet.</div>}
        </div>
      )}

      {/* ── PAYROLL DETAIL MODAL ── */}
      <Modal isOpen={showDetailModal} onClose={() => { setShowDetailModal(false); setSelectedRun(null) }}
        title={`${selectedRun?.displayId || 'Payroll'} — ${selectedRun?.period || ''}`} size="xl">
        {detailLoading ? (
          <div className="flex justify-center h-32 items-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" /></div>
        ) : selectedRun ? (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Gross', value: fmt(selectedRun.totalGross) },
                { label: 'Deductions', value: fmt(selectedRun.totalDeductions), cls: 'text-red-400' },
                { label: 'Net Payable', value: fmt(selectedRun.totalNet), cls: 'text-emerald-400' },
                { label: 'Employer Add-on', value: fmt(selectedRun.employerContributions), cls: 'text-amber-400' },
              ].map((s, i) => (
                <div key={i} className="bg-surface-hover p-3 rounded-lg">
                  <p className="text-xs text-muted">{s.label}</p>
                  <p className={`font-semibold ${s.cls || 'text-foreground'}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-hover">
                    {['Staff', 'Desig.', 'Days', 'Basic', 'HRA', 'DA', 'OT', 'Bonus', 'Gross', 'PF(E)', 'PF(R)', 'ESI(E)', 'ESI(R)', 'PT', 'TDS', 'Loan', 'Net', 'Bank', 'UAN'].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-medium text-muted whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedRun.payslips?.map((ps, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-surface-hover/50">
                      <td className="px-2 py-1.5 font-medium text-foreground">{ps.staff?.name}</td>
                      <td className="px-2 py-1.5 text-muted">{ps.staff?.designation || ps.staff?.role}</td>
                      <td className="px-2 py-1.5">{ps.presentDays}/{ps.workingDays}</td>
                      <td className="px-2 py-1.5 text-foreground">{fmt(ps.basicSalary)}</td>
                      <td className="px-2 py-1.5 text-foreground">{fmt(ps.hra)}</td>
                      <td className="px-2 py-1.5 text-foreground">{fmt(ps.da)}</td>
                      <td className="px-2 py-1.5 text-blue-400">{ps.otPay > 0 ? fmt(ps.otPay) : '—'}</td>
                      <td className="px-2 py-1.5 text-purple-400">{ps.bonus > 0 ? fmt(ps.bonus) : '—'}</td>
                      <td className="px-2 py-1.5 font-medium text-foreground">{fmt(ps.grossSalary)}</td>
                      <td className="px-2 py-1.5 text-red-400">-{fmt(ps.pfEmployee)}</td>
                      <td className="px-2 py-1.5 text-amber-400">{fmt(ps.pfEmployer)}</td>
                      <td className="px-2 py-1.5 text-red-400">-{fmt(ps.esiEmployee)}</td>
                      <td className="px-2 py-1.5 text-amber-400">{fmt(ps.esiEmployer)}</td>
                      <td className="px-2 py-1.5 text-red-400">-{fmt(ps.professionalTax)}</td>
                      <td className="px-2 py-1.5 text-red-400">-{fmt(ps.tds)}</td>
                      <td className="px-2 py-1.5 text-orange-400">{ps.loanDeduction > 0 ? `-${fmt(ps.loanDeduction)}` : '—'}</td>
                      <td className="px-2 py-1.5 text-emerald-400 font-bold">{fmt(ps.netSalary)}</td>
                      <td className="px-2 py-1.5 text-muted">{ps.staff?.bankAccount ? `****${ps.staff.bankAccount.slice(-4)}` : '—'}</td>
                      <td className="px-2 py-1.5 text-muted">{ps.staff?.uanNumber || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
              {selectedRun.payslips?.map((ps, i) => (
                <button key={i} onClick={() => setPrintPayslip({ ...ps, payrollRun: selectedRun })}
                  className="px-3 py-1.5 text-xs bg-surface-hover text-muted hover:text-foreground rounded border border-border flex items-center gap-1.5">
                  <Printer className="w-3 h-3" /> {ps.staff?.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ── CREATE LOAN MODAL ── */}
      <Modal isOpen={showLoanModal} onClose={() => setShowLoanModal(false)} title="Create Staff Loan / Advance">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted mb-1 block">Staff Member *</label>
            <select value={loanForm.staffId} onChange={e => setLoanForm(p => ({ ...p, staffId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
              <option value="">Select Staff</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Purpose *</label>
            <input value={loanForm.purpose} onChange={e => setLoanForm(p => ({ ...p, purpose: e.target.value }))} placeholder="e.g. Medical emergency, Home repair" className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">Principal Amount (₹) *</label>
              <input type="number" min="1" value={loanForm.principalAmount} onChange={e => setLoanForm(p => ({ ...p, principalAmount: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">Monthly Installment (₹) *</label>
              <input type="number" min="1" value={loanForm.monthlyInstallment} onChange={e => setLoanForm(p => ({ ...p, monthlyInstallment: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
          </div>
          {loanForm.principalAmount && loanForm.monthlyInstallment && (
            <p className="text-xs text-muted bg-surface-hover p-2 rounded">
              Estimated repayment: {Math.ceil(Number(loanForm.principalAmount) / Number(loanForm.monthlyInstallment))} months
            </p>
          )}
          <div>
            <label className="text-sm text-muted mb-1 block">Start Period *</label>
            <input type="month" value={loanForm.startPeriod} onChange={e => setLoanForm(p => ({ ...p, startPeriod: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Notes</label>
            <textarea value={loanForm.notes} onChange={e => setLoanForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>
          <button onClick={handleCreateLoan} disabled={savingLoan || !loanForm.staffId || !loanForm.purpose || !loanForm.principalAmount || !loanForm.monthlyInstallment || !loanForm.startPeriod}
            className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {savingLoan ? 'Creating...' : 'Create Loan'}
          </button>
        </div>
      </Modal>

      {/* ── PRINT PAYSLIP MODAL ── */}
      {printPayslip && (
        <Modal isOpen={!!printPayslip} onClose={() => setPrintPayslip(null)} title="Payslip Preview" size="lg">
          <div className="space-y-4">
            <div ref={printRef} className="bg-white text-black p-6 rounded text-sm">
              <div className="hdr text-center border-b-2 border-gray-800 pb-3 mb-4">
                <h2 className="text-xl font-bold text-gray-900">Furzentic</h2>
                <p className="text-gray-500 text-xs">SALARY SLIP — {printPayslip.payrollRun?.period}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
                <div className="space-y-1">
                  <p><strong>Employee Name:</strong> {printPayslip.staff?.name}</p>
                  <p><strong>Designation:</strong> {printPayslip.staff?.designation || printPayslip.staff?.role}</p>
                  <p><strong>PAN:</strong> {printPayslip.staff?.panNumber || '—'}</p>
                  <p><strong>UAN:</strong> {printPayslip.staff?.uanNumber || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p><strong>Period:</strong> {printPayslip.payrollRun?.period}</p>
                  <p><strong>Working Days:</strong> {printPayslip.workingDays}</p>
                  <p><strong>Days Present:</strong> {printPayslip.presentDays}</p>
                  <p><strong>Bank A/C:</strong> {printPayslip.staff?.bankAccount ? `****${printPayslip.staff.bankAccount.slice(-4)}` : '—'} {printPayslip.staff?.bankName ? `(${printPayslip.staff.bankName})` : ''}</p>
                </div>
              </div>
              <table className="w-full border-collapse text-xs mb-4">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left">Earnings</th>
                    <th className="border border-gray-300 px-3 py-2 text-right">Amount (₹)</th>
                    <th className="border border-gray-300 px-3 py-2 text-left">Deductions</th>
                    <th className="border border-gray-300 px-3 py-2 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Basic Salary', printPayslip.basicSalary, 'PF (Employee 12%)', printPayslip.pfEmployee],
                    ['HRA (40%)', printPayslip.hra, 'ESI (Employee 0.75%)', printPayslip.esiEmployee],
                    ['Dearness Allowance (10%)', printPayslip.da, 'Professional Tax', printPayslip.professionalTax],
                    ...(printPayslip.otPay > 0 ? [['Overtime Pay', printPayslip.otPay, 'TDS (Income Tax)', printPayslip.tds]] : [['', '', 'TDS (Income Tax)', printPayslip.tds]]),
                    ...(printPayslip.loanDeduction > 0 ? [['', '', 'Loan Deduction', printPayslip.loanDeduction]] : []),
                  ].map(([e, ev, d, dv], i) => (
                    <tr key={i}>
                      <td className="border border-gray-300 px-3 py-1.5">{e || ''}</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-right">{ev ? (ev).toLocaleString('en-IN') : ''}</td>
                      <td className="border border-gray-300 px-3 py-1.5">{d || ''}</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-right">{dv !== undefined ? (dv).toLocaleString('en-IN') : ''}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-bold">
                    <td className="border border-gray-300 px-3 py-2">Gross Earnings</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{(printPayslip.grossSalary || 0).toLocaleString('en-IN')}</td>
                    <td className="border border-gray-300 px-3 py-2">Total Deductions</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{(printPayslip.totalDeductions || 0).toLocaleString('en-IN')}</td>
                  </tr>
                </tbody>
              </table>
              <div className="text-right font-bold text-base border-t-2 border-gray-800 pt-3">
                Net Pay: ₹{(printPayslip.netSalary || 0).toLocaleString('en-IN')}
              </div>
              <div className="grid grid-cols-2 mt-8 text-xs text-gray-500 border-t border-gray-200 pt-4">
                <div>
                  <p>Employer PF: ₹{(printPayslip.pfEmployer || 0).toLocaleString('en-IN')}</p>
                  <p>Employer ESI: ₹{(printPayslip.esiEmployer || 0).toLocaleString('en-IN')}</p>
                </div>
                <div className="text-right">
                  <p className="mt-6">Authorised Signatory</p>
                  <p>This is a system-generated payslip</p>
                </div>
              </div>
            </div>
            <button onClick={handlePrintPayslip}
              className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center justify-center gap-2">
              <Printer className="w-4 h-4" /> Print / Save as PDF
            </button>
          </div>
        </Modal>
      )}

      {/* ── BANK PAYMENT ADVICE MODAL ── */}
      {bankAdviceRun && (
        <Modal isOpen={!!bankAdviceRun} onClose={() => setBankAdviceRun(null)} title="Bank Payment Advice" size="xl">
          <div className="space-y-4">
            <div ref={bankRef} className="bg-white text-black p-6 rounded text-sm">
              <h2 className="text-center font-bold text-lg mb-1">Furzentic — Bank Payment Advice</h2>
              <p className="text-center text-xs text-gray-500 mb-4">Period: {bankAdviceRun.period} · Total: ₹{(bankAdviceRun.totalNet || 0).toLocaleString('en-IN')}</p>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    {['#', 'Employee Name', 'Designation', 'Bank Name', 'Account No.', 'IFSC Code', 'Net Pay (₹)'].map(h => (
                      <th key={h} className="border border-gray-300 px-3 py-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(bankAdviceRun.payslips || []).map((ps, i) => (
                    <tr key={i}>
                      <td className="border border-gray-300 px-3 py-1.5">{i + 1}</td>
                      <td className="border border-gray-300 px-3 py-1.5 font-medium">{ps.staff?.name}</td>
                      <td className="border border-gray-300 px-3 py-1.5">{ps.staff?.designation || ps.staff?.role}</td>
                      <td className="border border-gray-300 px-3 py-1.5">{ps.staff?.bankName || '—'}</td>
                      <td className="border border-gray-300 px-3 py-1.5">{ps.staff?.bankAccount || '—'}</td>
                      <td className="border border-gray-300 px-3 py-1.5">{ps.staff?.ifscCode || '—'}</td>
                      <td className="border border-gray-300 px-3 py-1.5 font-bold text-right">{(ps.netSalary || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-bold">
                    <td className="border border-gray-300 px-3 py-2" colSpan={6}>Total</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{(bankAdviceRun.totalNet || 0).toLocaleString('en-IN')}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-4 text-center">Generated by Furzentic Payroll System on {new Date().toLocaleDateString('en-IN')}</p>
            </div>
            <button onClick={handlePrintBankAdvice}
              className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center justify-center gap-2">
              <Printer className="w-4 h-4" /> Print / Save as PDF
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

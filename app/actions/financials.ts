'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
import { createJournalSchema, createAccountSchema } from '@/lib/validations/financials'

// ─── CHART OF ACCOUNTS ────────────────────────────────

const DEFAULT_ACCOUNTS = [
  // Assets
  { groupName: 'Current Assets',   type: 'ASSET',     code: '1001', name: 'Cash in Hand' },
  { groupName: 'Current Assets',   type: 'ASSET',     code: '1002', name: 'Bank Account' },
  { groupName: 'Current Assets',   type: 'ASSET',     code: '1100', name: 'Accounts Receivable' },
  { groupName: 'Current Assets',   type: 'ASSET',     code: '1200', name: 'Closing Stock / Inventory' },
  { groupName: 'Current Assets',   type: 'ASSET',     code: '1300', name: 'GST Input Credit (ITC)' },
  { groupName: 'Current Assets',   type: 'ASSET',     code: '1400', name: 'Advance to Suppliers' },
  { groupName: 'Fixed Assets',     type: 'ASSET',     code: '1500', name: 'Plant & Machinery' },
  { groupName: 'Fixed Assets',     type: 'ASSET',     code: '1510', name: 'Furniture & Fixtures' },
  // Liabilities
  { groupName: 'Current Liabilities', type: 'LIABILITY', code: '2001', name: 'Accounts Payable' },
  { groupName: 'Current Liabilities', type: 'LIABILITY', code: '2100', name: 'GST Payable (Output)' },
  { groupName: 'Current Liabilities', type: 'LIABILITY', code: '2200', name: 'Salary Payable' },
  { groupName: 'Current Liabilities', type: 'LIABILITY', code: '2300', name: 'PF / ESI Payable' },
  { groupName: 'Current Liabilities', type: 'LIABILITY', code: '2400', name: 'TDS Payable' },
  { groupName: 'Current Liabilities', type: 'LIABILITY', code: '2500', name: 'Advance from Customers' },
  { groupName: 'Long Term Liabilities', type: 'LIABILITY', code: '2900', name: 'Bank Loan' },
  // Equity
  { groupName: 'Equity',           type: 'EQUITY',    code: '3001', name: "Owner's Capital" },
  { groupName: 'Equity',           type: 'EQUITY',    code: '3100', name: 'Retained Earnings' },
  { groupName: 'Equity',           type: 'EQUITY',    code: '3200', name: 'Drawings' },
  // Income
  { groupName: 'Revenue',          type: 'INCOME',    code: '4001', name: 'Sales Revenue' },
  { groupName: 'Revenue',          type: 'INCOME',    code: '4100', name: 'Other Income' },
  { groupName: 'Revenue',          type: 'INCOME',    code: '4200', name: 'Interest Income' },
  // Expenses
  { groupName: 'Cost of Goods Sold', type: 'EXPENSE', code: '5001', name: 'Cost of Goods Sold' },
  { groupName: 'Cost of Goods Sold', type: 'EXPENSE', code: '5010', name: 'Opening Stock' },
  { groupName: 'Cost of Goods Sold', type: 'EXPENSE', code: '5020', name: 'Purchases' },
  { groupName: 'Operating Expenses', type: 'EXPENSE', code: '5100', name: 'Salary Expense' },
  { groupName: 'Operating Expenses', type: 'EXPENSE', code: '5110', name: 'Employer PF Contribution' },
  { groupName: 'Operating Expenses', type: 'EXPENSE', code: '5120', name: 'Employer ESI Contribution' },
  { groupName: 'Operating Expenses', type: 'EXPENSE', code: '5200', name: 'Rent Expense' },
  { groupName: 'Operating Expenses', type: 'EXPENSE', code: '5300', name: 'Electricity & Utilities' },
  { groupName: 'Operating Expenses', type: 'EXPENSE', code: '5400', name: 'Transport / Freight' },
  { groupName: 'Operating Expenses', type: 'EXPENSE', code: '5500', name: 'Marketing & Advertising' },
  { groupName: 'Operating Expenses', type: 'EXPENSE', code: '5600', name: 'Discount Allowed' },
  { groupName: 'Operating Expenses', type: 'EXPENSE', code: '5700', name: 'Bank Charges' },
  { groupName: 'Operating Expenses', type: 'EXPENSE', code: '5800', name: 'Depreciation' },
  { groupName: 'Operating Expenses', type: 'EXPENSE', code: '5900', name: 'Other Expenses' },
]

export async function seedChartOfAccounts() {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const existing = await prisma.ledgerAccount.count()
  if (existing > 0) return { success: true, message: 'Chart of accounts already exists' }

  for (const acc of DEFAULT_ACCOUNTS) {
    const group = await prisma.accountGroup.upsert({
      where: { name: acc.groupName },
      create: { name: acc.groupName, type: acc.type },
      update: {},
    })
    await prisma.ledgerAccount.upsert({
      where: { code: acc.code },
      create: { code: acc.code, name: acc.name, groupId: group.id, isSystemAccount: true },
      update: {},
    })
  }

  revalidatePath('/financials')
  return { success: true, message: 'Chart of accounts created' }
}

export async function getAccounts() {
  const groups = await prisma.accountGroup.findMany({
    include: { accounts: { orderBy: { code: 'asc' } } },
    orderBy: { name: 'asc' },
  })
  return { success: true, data: groups }
}

export async function createAccount(data: unknown) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const parsed = createAccountSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const exists = await prisma.ledgerAccount.findFirst({ where: { code: parsed.data.code } })
  if (exists) return { success: false, error: `Account code ${parsed.data.code} already exists` }

  const acc = await prisma.ledgerAccount.create({ data: parsed.data })
  revalidatePath('/financials')
  return { success: true, data: acc }
}

// ─── PROFIT & LOSS (CORRECTED) ────────────────────────

export async function getProfitAndLoss(fromDate: string, toDate: string, compareFrom?: string, compareTo?: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  async function fetchPL(fd: string, td: string) {
    const from = new Date(fd)
    const to = new Date(td)
    to.setHours(23, 59, 59, 999)

    const [invoiceAgg, creditNoteAgg, invoiceItems, purchaseAgg, payrollAgg, employerPayroll] = await Promise.all([
      // Gross sales from invoices
      prisma.invoice.aggregate({
        where: { date: { gte: from, lte: to }, invoiceStatus: 'ACTIVE' },
        _sum: { subtotal: true, discount: true, gst: true, total: true },
        _count: { id: true },
      }),
      // Returns
      prisma.creditNote.aggregate({
        where: { date: { gte: from, lte: to } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // CORRECT COGS: cost of items actually sold
      prisma.invoiceItem.findMany({
        where: { invoice: { date: { gte: from, lte: to }, invoiceStatus: 'ACTIVE' } },
        include: { product: { select: { costPrice: true } } },
      }),
      // Purchases in period (for reference, not used for COGS)
      prisma.purchaseOrder.aggregate({
        where: { date: { gte: from, lte: to }, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] } },
        _sum: { subtotal: true, discount: true, gst: true, total: true },
      }),
      // Payroll — net pay
      prisma.payrollRun.aggregate({
        where: { status: { in: ['APPROVED', 'PAID'] }, period: { gte: fd.substring(0, 7), lte: td.substring(0, 7) } },
        _sum: { totalNet: true, totalGross: true, totalDeductions: true },
      }),
      // Employer PF/ESI/Bonus contributions
      prisma.payrollRun.aggregate({
        where: { status: { in: ['APPROVED', 'PAID'] }, period: { gte: fd.substring(0, 7), lte: td.substring(0, 7) } },
        _sum: { employerContributions: true },
      }),
    ])

    // Revenue
    const grossSales = invoiceAgg._sum.total || 0
    const salesExGST = (invoiceAgg._sum.subtotal || 0) - (invoiceAgg._sum.discount || 0)
    const salesGST = invoiceAgg._sum.gst || 0
    const returns = creditNoteAgg._sum.amount || 0
    const netRevenue = salesExGST - returns

    // COGS — actual cost of items sold (correct method)
    const cogs = invoiceItems.reduce((sum, item) => sum + item.quantity * (item.product.costPrice || 0), 0)
    const grossProfit = netRevenue - cogs
    const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0

    // Operating expenses
    const salaryExpense = payrollAgg._sum.totalGross || 0  // use gross (employee cost to employer)
    const employerPFESI = employerPayroll._sum.employerContributions || 0
    const totalOpEx = salaryExpense + employerPFESI

    const operatingProfit = grossProfit - totalOpEx
    const netProfit = operatingProfit  // no interest/tax in this simplified model
    const netMarginPct = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0
    const opMarginPct = netRevenue > 0 ? (operatingProfit / netRevenue) * 100 : 0

    // Purchases (for reference)
    const purchasesExGST = (purchaseAgg._sum.subtotal || 0) - (purchaseAgg._sum.discount || 0)

    return {
      period: { from: fd, to: td },
      invoiceCount: invoiceAgg._count.id,
      returnCount: creditNoteAgg._count.id,
      revenue: { grossSales, salesExGST, salesGST, returns, netRevenue },
      cogs: { total: cogs, note: 'Based on cost price of items sold' },
      grossProfit, grossMarginPct,
      purchases: { total: purchasesExGST, gst: purchaseAgg._sum.gst || 0 },
      operatingExpenses: {
        salary: salaryExpense,
        employerPFESI,
        total: totalOpEx,
      },
      operatingProfit, opMarginPct,
      netProfit, netMarginPct,
    }
  }

  const current = await fetchPL(fromDate, toDate)
  let compare = null
  if (compareFrom && compareTo) {
    compare = await fetchPL(compareFrom, compareTo)
  }

  return { success: true, data: { current, compare } }
}

// ─── BALANCE SHEET ────────────────────────────────────

export async function getBalanceSheet(asOfDate: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const asOf = new Date(asOfDate)
  asOf.setHours(23, 59, 59, 999)

  const [
    payments, supplierPaid, receivables, poPayables,
    products, gstOutputInvoices, gstInputPOs,
    payrollPayable, staffLoans,
  ] = await Promise.all([
    // Cash collected from customers
    prisma.payment.aggregate({ where: { date: { lte: asOf } }, _sum: { amount: true } }),
    // Cash paid to suppliers (amountPaid on POs)
    prisma.purchaseOrder.aggregate({ where: { date: { lte: asOf }, status: { notIn: ['CANCELLED', 'DRAFT'] } }, _sum: { amountPaid: true } }),
    // Accounts receivable (outstanding invoices)
    prisma.invoice.aggregate({ where: { invoiceStatus: 'ACTIVE', date: { lte: asOf } }, _sum: { balanceDue: true } }),
    // Accounts payable (outstanding POs)
    prisma.purchaseOrder.aggregate({ where: { date: { lte: asOf }, status: { notIn: ['CANCELLED'] } }, _sum: { balanceDue: true } }),
    // Inventory at cost price
    prisma.product.findMany({ select: { stock: true, costPrice: true } }),
    // GST output (from invoices)
    prisma.invoice.aggregate({ where: { date: { lte: asOf }, invoiceStatus: 'ACTIVE' }, _sum: { gst: true } }),
    // GST input (ITC from purchases)
    prisma.purchaseOrder.aggregate({ where: { date: { lte: asOf }, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] }, itcEligible: true }, _sum: { gst: true } }),
    // Salary payable (approved but unpaid payroll)
    prisma.payrollRun.aggregate({ where: { status: 'APPROVED' }, _sum: { totalNet: true } }),
    // Staff loans outstanding (assets — money owed by staff)
    prisma.staffLoan.aggregate({ where: { status: 'Active' }, _sum: { remainingAmount: true } }),
  ])

  const cashCollected = payments._sum.amount || 0
  const cashPaidToSuppliers = supplierPaid._sum.amountPaid || 0
  const cashAndBank = cashCollected - cashPaidToSuppliers

  const accountsReceivable = receivables._sum.balanceDue || 0
  const inventoryValue = products.reduce((sum, p) => sum + p.stock * (p.costPrice || 0), 0)
  const staffLoanAsset = staffLoans._sum.remainingAmount || 0
  const itcAsset = gstInputPOs._sum.gst || 0

  const totalCurrentAssets = cashAndBank + accountsReceivable + inventoryValue
  const totalAssets = totalCurrentAssets + staffLoanAsset + itcAsset

  const accountsPayable = poPayables._sum.balanceDue || 0
  const gstOutput = gstOutputInvoices._sum.gst || 0
  const gstInput = itcAsset
  const netGSTPayable = Math.max(0, gstOutput - gstInput)
  const salaryPayable = payrollPayable._sum.totalNet || 0

  const totalLiabilities = accountsPayable + netGSTPayable + salaryPayable

  // Equity = Assets - Liabilities (derived)
  const equity = totalAssets - totalLiabilities

  return {
    success: true,
    data: {
      asOfDate,
      currentAssets: {
        cashAndBank,
        accountsReceivable,
        inventory: inventoryValue,
        itcReceivable: itcAsset,
        staffLoans: staffLoanAsset,
        total: totalCurrentAssets,
      },
      totalAssets,
      currentLiabilities: {
        accountsPayable,
        netGSTPayable,
        gstOutput,
        gstInput,
        salaryPayable,
        total: totalLiabilities,
      },
      equity: {
        derived: equity,
        note: 'Equity = Total Assets − Total Liabilities',
      },
    },
  }
}

// ─── CASH FLOW ────────────────────────────────────────

export async function getCashFlow(fromDate: string, toDate: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const from = new Date(fromDate)
  const to = new Date(toDate)
  to.setHours(23, 59, 59, 999)

  const [salesCollections, purchasePayments, salaryPayments, creditNoteRefunds, loanCollections] = await Promise.all([
    // Inflow: cash collected from customers
    prisma.payment.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { amount: true } }),
    // Outflow: cash paid to suppliers
    prisma.purchaseOrder.aggregate({
      where: { receivedAt: { gte: from, lte: to } },
      _sum: { amountPaid: true },
    }),
    // Outflow: salaries paid
    prisma.payrollRun.aggregate({
      where: { status: 'PAID', paidAt: { gte: from, lte: to } },
      _sum: { totalNet: true },
    }),
    // Outflow: credit note refunds
    prisma.creditNote.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { amount: true } }),
    // Inflow: staff loan repayments (from payroll deductions)
    prisma.payslip.aggregate({
      where: { payrollRun: { status: { in: ['APPROVED', 'PAID'] }, period: { gte: fromDate.substring(0, 7), lte: toDate.substring(0, 7) } } },
      _sum: { loanDeduction: true },
    }),
  ])

  const salesInflow = salesCollections._sum.amount || 0
  const purchaseOutflow = purchasePayments._sum.amountPaid || 0
  const salaryOutflow = salaryPayments._sum.totalNet || 0
  const refundOutflow = creditNoteRefunds._sum.amount || 0
  const loanInflow = loanCollections._sum.loanDeduction || 0

  const totalInflow = salesInflow + loanInflow
  const totalOutflow = purchaseOutflow + salaryOutflow + refundOutflow
  const netOperating = totalInflow - totalOutflow

  return {
    success: true,
    data: {
      period: { from: fromDate, to: toDate },
      operating: {
        inflow: {
          salesCollections: salesInflow,
          loanRepayments: loanInflow,
          total: totalInflow,
        },
        outflow: {
          purchases: purchaseOutflow,
          salaries: salaryOutflow,
          creditRefunds: refundOutflow,
          total: totalOutflow,
        },
        net: netOperating,
      },
      investing: { net: 0, note: 'Fixed asset purchases not tracked yet' },
      financing: { net: 0, note: 'Equity/loan transactions not tracked yet' },
      netCashFlow: netOperating,
    },
  }
}

// ─── TRIAL BALANCE ────────────────────────────────────

export async function getTrialBalance(asOfDate: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const asOf = new Date(asOfDate)
  asOf.setHours(23, 59, 59, 999)

  const [payments, receivables, inventory, poPayables, salesTotal, purchasesTotal,
    payrollTotal, employerTotal, gstOutput, gstInput, creditNotes, staffLoans] = await Promise.all([
    prisma.payment.aggregate({ where: { date: { lte: asOf } }, _sum: { amount: true } }),
    prisma.invoice.aggregate({ where: { invoiceStatus: 'ACTIVE', date: { lte: asOf } }, _sum: { balanceDue: true } }),
    prisma.product.findMany({ select: { stock: true, costPrice: true } }),
    prisma.purchaseOrder.aggregate({ where: { date: { lte: asOf }, status: { notIn: ['CANCELLED'] } }, _sum: { balanceDue: true } }),
    prisma.invoice.aggregate({ where: { invoiceStatus: 'ACTIVE', date: { lte: asOf } }, _sum: { subtotal: true, discount: true } }),
    prisma.purchaseOrder.aggregate({ where: { date: { lte: asOf }, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] } }, _sum: { subtotal: true, discount: true } }),
    prisma.payrollRun.aggregate({ where: { status: { in: ['APPROVED', 'PAID'] } }, _sum: { totalGross: true } }),
    prisma.payrollRun.aggregate({ where: { status: { in: ['APPROVED', 'PAID'] } }, _sum: { employerContributions: true } }),
    prisma.invoice.aggregate({ where: { invoiceStatus: 'ACTIVE', date: { lte: asOf } }, _sum: { gst: true } }),
    prisma.purchaseOrder.aggregate({ where: { date: { lte: asOf }, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] }, itcEligible: true }, _sum: { gst: true } }),
    prisma.creditNote.aggregate({ where: { date: { lte: asOf } }, _sum: { amount: true } }),
    prisma.staffLoan.aggregate({ where: { status: 'Active' }, _sum: { remainingAmount: true } }),
  ])

  const cashAndBank = (payments._sum.amount || 0)
  const receivablesVal = receivables._sum.balanceDue || 0
  const inventoryVal = inventory.reduce((s, p) => s + p.stock * (p.costPrice || 0), 0)
  const gstITC = gstInput._sum.gst || 0
  const staffLoanAsset = staffLoans._sum.remainingAmount || 0

  const netSalesRevenue = (salesTotal._sum.subtotal || 0) - (salesTotal._sum.discount || 0) - (creditNotes._sum.amount || 0)
  const purchasesEx = (purchasesTotal._sum.subtotal || 0) - (purchasesTotal._sum.discount || 0)
  const salaryEx = payrollTotal._sum.totalGross || 0
  const employerEx = employerTotal._sum.employerContributions || 0

  const netGST = Math.max(0, (gstOutput._sum.gst || 0) - gstITC)
  const payables = poPayables._sum.balanceDue || 0

  const lines = [
    { code: '1002', name: 'Cash & Bank', type: 'ASSET', debit: cashAndBank, credit: 0 },
    { code: '1100', name: 'Accounts Receivable', type: 'ASSET', debit: receivablesVal, credit: 0 },
    { code: '1200', name: 'Closing Stock / Inventory', type: 'ASSET', debit: inventoryVal, credit: 0 },
    { code: '1300', name: 'GST Input Credit (ITC)', type: 'ASSET', debit: gstITC, credit: 0 },
    { code: '1400', name: 'Staff Loans Outstanding', type: 'ASSET', debit: staffLoanAsset, credit: 0 },
    { code: '2001', name: 'Accounts Payable', type: 'LIABILITY', debit: 0, credit: payables },
    { code: '2100', name: 'Net GST Payable', type: 'LIABILITY', debit: 0, credit: netGST },
    { code: '4001', name: 'Sales Revenue', type: 'INCOME', debit: 0, credit: netSalesRevenue },
    { code: '5020', name: 'Purchases (COGS)', type: 'EXPENSE', debit: purchasesEx, credit: 0 },
    { code: '5100', name: 'Salary Expense', type: 'EXPENSE', debit: salaryEx, credit: 0 },
    { code: '5110', name: 'Employer PF/ESI', type: 'EXPENSE', debit: employerEx, credit: 0 },
  ]

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

  // Balancing figure goes to Equity (Retained Earnings)
  const equityBalance = totalDebit - totalCredit
  if (equityBalance !== 0) {
    lines.push({
      code: '3100', name: "Retained Earnings / Equity",
      type: 'EQUITY',
      debit: equityBalance < 0 ? Math.abs(equityBalance) : 0,
      credit: equityBalance > 0 ? equityBalance : 0,
    })
  }

  const finalDebit = lines.reduce((s, l) => s + l.debit, 0)
  const finalCredit = lines.reduce((s, l) => s + l.credit, 0)

  return {
    success: true,
    data: { asOfDate, lines, totalDebit: finalDebit, totalCredit: finalCredit },
  }
}

// ─── RECEIVABLES AGING ────────────────────────────────

export async function getReceivablesAging() {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const outstanding = await prisma.invoice.findMany({
    where: { invoiceStatus: 'ACTIVE', balanceDue: { gt: 0 } },
    include: { contact: { select: { name: true, phone: true } } },
    orderBy: { date: 'asc' },
  })

  const buckets = { current: [] as typeof outstanding, days30: [], days60: [], days90: [], over90: [] } as Record<string, typeof outstanding>
  const labels = { current: '0-30 days', days30: '31-60 days', days60: '61-90 days', days90: '91-180 days', over90: '180+ days' }

  for (const inv of outstanding) {
    const ageDays = Math.floor((today.getTime() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24))
    if (ageDays <= 30) buckets.current.push(inv)
    else if (ageDays <= 60) buckets.days30.push(inv)
    else if (ageDays <= 90) buckets.days60.push(inv)
    else if (ageDays <= 180) buckets.days90.push(inv)
    else buckets.over90.push(inv)
  }

  const summary = Object.entries(buckets).map(([key, items]) => ({
    bucket: key,
    label: labels[key],
    count: items.length,
    amount: items.reduce((s, i) => s + i.balanceDue, 0),
    invoices: items.map(i => ({
      displayId: i.displayId, date: i.date, customer: i.contact.name,
      phone: i.contact.phone, total: i.total, balanceDue: i.balanceDue,
      ageDays: Math.floor((today.getTime() - new Date(i.date).getTime()) / (1000 * 60 * 60 * 24)),
    })),
  }))

  const totalOutstanding = outstanding.reduce((s, i) => s + i.balanceDue, 0)
  return { success: true, data: { summary, totalOutstanding, totalCount: outstanding.length } }
}

// ─── PAYABLES AGING ──────────────────────────────────

export async function getPayablesAging() {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const outstanding = await prisma.purchaseOrder.findMany({
    where: { balanceDue: { gt: 0 }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
    include: { supplier: { select: { name: true, phone: true, paymentTerms: true } } },
    orderBy: { date: 'asc' },
  })

  const buckets = { current: [] as typeof outstanding, days30: [], days60: [], days90: [], over90: [] } as Record<string, typeof outstanding>
  const labels = { current: '0-30 days', days30: '31-60 days', days60: '61-90 days', days90: '91-180 days', over90: '180+ days' }

  for (const po of outstanding) {
    const ageDays = Math.floor((today.getTime() - new Date(po.date).getTime()) / (1000 * 60 * 60 * 24))
    const dueDays = po.supplier.paymentTerms || 30
    if (ageDays <= dueDays) buckets.current.push(po)
    else if (ageDays <= 60) buckets.days30.push(po)
    else if (ageDays <= 90) buckets.days60.push(po)
    else if (ageDays <= 180) buckets.days90.push(po)
    else buckets.over90.push(po)
  }

  const summary = Object.entries(buckets).map(([key, items]) => ({
    bucket: key,
    label: labels[key],
    count: items.length,
    amount: items.reduce((s, p) => s + p.balanceDue, 0),
    pos: items.map(p => ({
      displayId: p.displayId, date: p.date, supplier: p.supplier.name,
      total: p.total, balanceDue: p.balanceDue,
      ageDays: Math.floor((today.getTime() - new Date(p.date).getTime()) / (1000 * 60 * 60 * 24)),
      paymentTerms: p.supplier.paymentTerms,
    })),
  }))

  const totalOutstanding = outstanding.reduce((s, p) => s + p.balanceDue, 0)
  return { success: true, data: { summary, totalOutstanding, totalCount: outstanding.length } }
}

// ─── JOURNAL ENTRIES ─────────────────────────────────

export async function getJournalEntries(fromDate?: string, toDate?: string) {
  const where: Record<string, unknown> = {}
  if (fromDate && toDate) {
    where.date = { gte: new Date(fromDate), lte: new Date(toDate) }
  }

  const entries = await prisma.journalEntry.findMany({
    where,
    orderBy: { date: 'desc' },
    take: 200,
    include: {
      lines: {
        include: { account: { select: { code: true, name: true } } },
        orderBy: { debit: 'desc' },
      },
    },
  })
  return { success: true, data: entries }
}

export async function createManualJournal(data: unknown) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const parsed = createJournalSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { date, narration, lines } = parsed.data
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
  if (Math.abs(totalDebit - totalCredit) > 1) {
    return { success: false, error: `Debit (${totalDebit}) ≠ Credit (${totalCredit}). Journal must balance.` }
  }

  const count = await prisma.journalEntry.count()
  const displayId = `JV-${String(count + 1).padStart(4, '0')}`

  const entry = await prisma.journalEntry.create({
    data: {
      displayId, date: new Date(date), narration,
      referenceType: 'MANUAL', totalDebit, totalCredit,
      lines: {
        create: lines.map(l => ({
          accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description,
        })),
      },
    },
  })

  revalidatePath('/financials')
  return { success: true, data: entry }
}

export async function voidJournalEntry(id: number) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const entry = await prisma.journalEntry.findUnique({ where: { id }, select: { status: true } })
  if (!entry) return { success: false, error: 'Journal entry not found' }
  if (entry.status === 'VOIDED') return { success: false, error: 'Already voided' }

  await prisma.journalEntry.update({ where: { id }, data: { status: 'VOIDED' } })
  revalidatePath('/financials')
  return { success: true }
}

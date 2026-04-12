'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
import { generatePayrollSchema, updateStaffPayrollSchema } from '@/lib/validations/payroll'
import { z } from 'zod'

// ─── PROFESSIONAL TAX SLABS (state-wise) ─────────────
// Monthly gross → PT amount
const PT_SLABS: Record<string, { upTo: number; tax: number }[]> = {
  Maharashtra: [
    { upTo: 7500, tax: 0 },
    { upTo: 10000, tax: 175 },
    { upTo: Infinity, tax: 200 }, // 300 in Feb
  ],
  Karnataka: [
    { upTo: 15000, tax: 0 },
    { upTo: 25000, tax: 150 },
    { upTo: 35000, tax: 200 },
    { upTo: Infinity, tax: 200 },
  ],
  'West Bengal': [
    { upTo: 10000, tax: 0 },
    { upTo: 15000, tax: 110 },
    { upTo: 25000, tax: 130 },
    { upTo: 40000, tax: 150 },
    { upTo: Infinity, tax: 200 },
  ],
  'Tamil Nadu': [
    { upTo: 21000, tax: 0 },
    { upTo: Infinity, tax: 208 },
  ],
  Gujarat: [
    { upTo: 5999, tax: 0 },
    { upTo: 8999, tax: 80 },
    { upTo: 11999, tax: 150 },
    { upTo: Infinity, tax: 200 },
  ],
  Andhra: [
    { upTo: 15000, tax: 0 },
    { upTo: 20000, tax: 150 },
    { upTo: Infinity, tax: 200 },
  ],
  Telangana: [
    { upTo: 15000, tax: 0 },
    { upTo: 20000, tax: 150 },
    { upTo: Infinity, tax: 200 },
  ],
  // Default (no PT state)
  None: [{ upTo: Infinity, tax: 0 }],
}

function calcProfessionalTax(state: string, grossSalary: number): number {
  const slabs = PT_SLABS[state] || PT_SLABS['None']
  for (const slab of slabs) {
    if (grossSalary <= slab.upTo) return slab.tax
  }
  return 0
}

// ─── STAFF PAYROLL SETTINGS ──────────────────────────

export async function getStaffForPayroll() {
  const staff = await prisma.staff.findMany({
    where: { status: 'Active' },
    select: {
      id: true, name: true, role: true, designation: true,
      basicSalary: true, panNumber: true, bankAccount: true,
      bankName: true, ifscCode: true, pfEnrolled: true, esiEnrolled: true,
      uanNumber: true, pfNumber: true, esiNumber: true,
      professionalTaxState: true, tdsMonthly: true,
      loans: { where: { status: 'Active' }, select: { id: true, purpose: true, remainingAmount: true, monthlyInstallment: true } },
    },
    orderBy: { name: 'asc' },
  })
  return { success: true, data: staff }
}

export async function updateStaffPayrollInfo(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = updateStaffPayrollSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { staffId, ...rest } = parsed.data
  await prisma.staff.update({ where: { id: staffId }, data: rest })
  revalidatePath('/payroll')
  return { success: true }
}

// ─── LOANS & ADVANCES ────────────────────────────────

const loanSchema = z.object({
  staffId: z.number(),
  purpose: z.string().min(1),
  principalAmount: z.number().min(1),
  monthlyInstallment: z.number().min(1),
  startPeriod: z.string().regex(/^\d{4}-\d{2}$/),
  notes: z.string().optional(),
})

export async function getStaffLoans(staffId?: number) {
  const loans = await prisma.staffLoan.findMany({
    where: staffId ? { staffId } : undefined,
    include: { staff: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return { success: true, data: loans }
}

export async function createStaffLoan(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = loanSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const loan = await prisma.staffLoan.create({
    data: {
      ...parsed.data,
      remainingAmount: parsed.data.principalAmount,
    },
  })
  revalidatePath('/payroll')
  return { success: true, data: loan }
}

export async function closeStaffLoan(id: number) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  await prisma.staffLoan.update({ where: { id }, data: { status: 'Closed', remainingAmount: 0 } })
  revalidatePath('/payroll')
  return { success: true }
}

// ─── GENERATE PAYROLL ────────────────────────────────

export async function generatePayroll(data: unknown) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const parsed = generatePayrollSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { period, workingDays } = parsed.data

  // Check if already finalized
  const existing = await prisma.payrollRun.findFirst({ where: { period } })
  if (existing && existing.status !== 'DRAFT') {
    return { success: false, error: `Payroll for ${period} is already ${existing.status}. Cannot re-generate.` }
  }

  // Build date range for attendance
  const [year, month] = period.split('-').map(Number)
  const currentMonth = new Date(year, month - 1, 1)
  const nextMonth = month === 12 ? new Date(year + 1, 0, 1) : new Date(year, month, 1)

  // Fetch all active staff with attendance + active loans
  const staffList = await prisma.staff.findMany({
    where: { status: 'Active' },
    include: {
      attendance: {
        where: { date: { gte: currentMonth, lt: nextMonth } },
        select: { status: true, hours: true },
      },
      loans: { where: { status: 'Active' } },
    },
    orderBy: { name: 'asc' },
  })

  if (staffList.length === 0) {
    return { success: false, error: 'No active staff found. Add staff before generating payroll.' }
  }

  let totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployerContributions = 0

  const payslipData = staffList.map(staff => {
    // Attendance
    const presentDays = staff.attendance.length > 0
      ? staff.attendance.filter(a => a.status !== 'Absent').length
      : workingDays

    // OT: sum hours flagged as overtime (status === 'OT') — double rate
    const otHours = staff.attendance
      .filter(a => a.status === 'OT')
      .reduce((sum, a) => sum + (a.hours || 8), 0)

    // Basic (pro-rated)
    const basic = staff.basicSalary || 0
    const dailyRate = workingDays > 0 ? basic / workingDays : 0
    const effectiveBasic = Math.round(dailyRate * Math.min(presentDays, workingDays))

    // Earnings
    const hra = Math.round(effectiveBasic * 0.40)           // 40%
    const da = Math.round(effectiveBasic * 0.10)            // 10%
    const hourlyRate = effectiveBasic > 0 ? Math.round(effectiveBasic / (workingDays * 8)) : 0
    const otPay = Math.round(hourlyRate * otHours * 2)      // OT at double rate

    // Statutory Bonus: 8.33% of basic (payable monthly as provision)
    const bonus = staff.pfEnrolled ? Math.round(effectiveBasic * 0.0833) : 0

    const grossSalary = effectiveBasic + hra + da + otPay   // bonus kept separate (employer expense)

    // Deductions
    const pfEmployee = staff.pfEnrolled ? Math.round(effectiveBasic * 0.12) : 0
    const pfEmployer = staff.pfEnrolled ? Math.round(effectiveBasic * 0.12) : 0
    const esiEmployee = (staff.esiEnrolled && grossSalary <= 21000) ? Math.round(grossSalary * 0.0075) : 0
    const esiEmployer = (staff.esiEnrolled && grossSalary <= 21000) ? Math.round(grossSalary * 0.0325) : 0

    // Professional Tax (state-wise slab on gross)
    const professionalTax = calcProfessionalTax(staff.professionalTaxState || 'None', grossSalary)

    // TDS (fixed monthly amount configured per staff)
    const tds = staff.tdsMonthly || 0

    // Loan deductions — deduct installment from each active loan
    let loanDeduction = 0
    for (const loan of staff.loans) {
      const installment = Math.min(loan.monthlyInstallment, loan.remainingAmount)
      loanDeduction += installment
    }

    const totalDeductionsStaff = pfEmployee + esiEmployee + professionalTax + tds + loanDeduction
    const netSalary = Math.max(0, grossSalary - totalDeductionsStaff)

    totalGross += grossSalary
    totalDeductions += totalDeductionsStaff
    totalNet += netSalary
    totalEmployerContributions += pfEmployer + esiEmployer + bonus

    return {
      staffId: staff.id,
      workingDays,
      presentDays,
      basicSalary: effectiveBasic,
      hra, da,
      specialAllowance: 0,
      otHours,
      otPay,
      bonus,
      grossSalary,
      pfEmployee,
      pfEmployer,
      esiEmployee,
      esiEmployer,
      professionalTax,
      tds,
      loanDeduction,
      otherDeductions: 0,
      totalDeductions: totalDeductionsStaff,
      netSalary,
    }
  })

  const displayId = `PAY-${period}`

  const run = await prisma.$transaction(async (tx) => {
    // Delete existing draft if re-generating
    if (existing) {
      await tx.payslip.deleteMany({ where: { payrollRunId: existing.id } })
      await tx.payrollRun.delete({ where: { id: existing.id } })
    }

    // Create payroll run
    const newRun = await tx.payrollRun.create({
      data: {
        displayId,
        period,
        totalGross,
        totalDeductions,
        totalNet,
        employerContributions: totalEmployerContributions,
        payslips: { create: payslipData },
      },
      include: {
        payslips: {
          include: {
            staff: {
              select: {
                name: true, role: true, designation: true,
                bankAccount: true, bankName: true, ifscCode: true,
                panNumber: true, uanNumber: true, pfNumber: true, esiNumber: true,
              },
            },
          },
          orderBy: { staff: { name: 'asc' } },
        },
      },
    })

    // Deduct loan installments from remaining balances
    for (const staff of staffList) {
      for (const loan of staff.loans) {
        const installment = Math.min(loan.monthlyInstallment, loan.remainingAmount)
        const newRemaining = loan.remainingAmount - installment
        await tx.staffLoan.update({
          where: { id: loan.id },
          data: {
            remainingAmount: newRemaining,
            status: newRemaining <= 0 ? 'Closed' : 'Active',
          },
        })
      }
    }

    return newRun
  })

  revalidatePath('/payroll')
  return { success: true, data: run }
}

// ─── PAYROLL RUNS ────────────────────────────────────

export async function getPayrollHistory() {
  const runs = await prisma.payrollRun.findMany({
    orderBy: { period: 'desc' },
    include: { _count: { select: { payslips: true } } },
  })
  return { success: true, data: runs }
}

export async function getPayrollRun(id: number) {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      payslips: {
        include: {
          staff: {
            select: {
              name: true, role: true, designation: true,
              bankAccount: true, bankName: true, ifscCode: true,
              panNumber: true, uanNumber: true, pfNumber: true, esiNumber: true,
            },
          },
        },
        orderBy: { staff: { name: 'asc' } },
      },
    },
  })
  if (!run) return { success: false, error: 'Payroll run not found' }
  return { success: true, data: run }
}

export async function getAllPayslips(period?: string) {
  const payslips = await prisma.payslip.findMany({
    where: period ? { payrollRun: { period } } : undefined,
    include: {
      staff: { select: { name: true, role: true, designation: true } },
      payrollRun: { select: { period: true, status: true, displayId: true } },
    },
    orderBy: [{ payrollRun: { period: 'desc' } }, { staff: { name: 'asc' } }],
  })
  return { success: true, data: payslips }
}

export async function approvePayroll(id: number) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const run = await prisma.payrollRun.findUnique({ where: { id }, select: { status: true } })
  if (!run) return { success: false, error: 'Payroll run not found' }
  if (run.status !== 'DRAFT') return { success: false, error: `Cannot approve a ${run.status} payroll` }

  await prisma.payrollRun.update({ where: { id }, data: { status: 'APPROVED' } })
  revalidatePath('/payroll')
  return { success: true }
}

export async function markPayrollPaid(id: number) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const run = await prisma.payrollRun.findUnique({ where: { id }, select: { status: true } })
  if (!run) return { success: false, error: 'Payroll run not found' }
  if (run.status !== 'APPROVED') return { success: false, error: 'Payroll must be APPROVED before marking as paid' }

  await prisma.payrollRun.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } })
  revalidatePath('/payroll')
  return { success: true }
}

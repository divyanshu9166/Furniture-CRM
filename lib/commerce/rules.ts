// The existing database stores money in whole rupees. Reject fractional writes
// instead of silently truncating customer payments or changing historical units.
export function wholeMoney(value: number, label = 'Amount') {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error(`${label} must be whole rupees within the supported range`)
  return value
}

export function calculateBill<T extends { quantity: number; price: number; gstRate?: number }>(items: T[], discount: number, type: string, defaultRate = 18, interstate = false, freight = 0) {
  wholeMoney(discount, 'Discount')
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error('Quantity must be a positive integer')
    wholeMoney(item.price, 'Unit price')
  }
  const subtotal = wholeMoney(items.reduce((sum, item) => sum + item.quantity * item.price, 0), 'Subtotal')
  if (type === 'percent' && discount > 100) throw new Error('Percentage discount cannot exceed 100')
  const discountAmount = type === 'percent' ? Math.round(subtotal * discount / 100) : type === 'flat' ? Math.min(discount, subtotal) : 0
  wholeMoney(discountAmount, 'Discount')
  // Cumulative rounding ensures shares never overshoot a line, even for
  // many tiny lines with a 100% discount. Last line reconciles exactly.
  let cumulative = 0
  let allocated = 0
  const rows = items.map(item => {
    const line = item.quantity * item.price
    cumulative += line
    const next = subtotal ? Math.round(cumulative * discountAmount / subtotal) : 0
    const taxableAmount = line - (next - allocated)
    allocated = next
    const gstRate = item.gstRate ?? defaultRate
    if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) throw new Error('Invalid GST rate')
    const gstAmount = Math.round(taxableAmount * gstRate / 100)
    const cgst = interstate ? 0 : Math.round(gstAmount / 2)
    return { ...item, taxableAmount, gstRate, gstAmount, cgst, sgst: interstate ? 0 : gstAmount - cgst, igst: interstate ? gstAmount : 0, cess: 0 }
  })
  const gst = rows.reduce((sum, row) => sum + row.gstAmount, 0)
  return { rows, subtotal, discount: discountAmount, gst, cgst: rows.reduce((s, r) => s + r.cgst, 0), sgst: rows.reduce((s, r) => s + r.sgst, 0), igst: rows.reduce((s, r) => s + r.igst, 0), total: wholeMoney(subtotal - discountAmount + gst + wholeMoney(freight), 'Total') }
}

export function invoiceBalance(total: number, paid: number, credited = 0) {
  wholeMoney(total); wholeMoney(paid); wholeMoney(credited)
  if (credited > total) throw new Error('Credit notes cannot exceed the invoice total')
  const netTotal = total - credited
  const balanceDue = Math.max(0, netTotal - paid)
  return { amountPaid: paid, balanceDue, paymentStatus: balanceDue === 0 ? 'PAID' as const : paid > 0 ? 'PARTIAL' as const : 'PENDING' as const }
}

export function assertPayment(amount: number, balance: number) {
  wholeMoney(amount, 'Payment')
  if (!amount || amount > balance) throw new Error('Payment must be positive and cannot exceed the pending balance')
}

// POS may accept cash tender larger than the bill and return change. Persist
// only the applied cash; keep tender/change in its audit note. Non-cash
// overpayment is not change and must never be silently clipped.
export function settleTender<T extends { amount: number; method: string; reference?: string | null; notes?: string | null }>(payments: T[], total: number) {
  const references = new Set<string>()
  for (const payment of payments) {
    wholeMoney(payment.amount, 'Payment')
    if (!payment.amount) throw new Error('Payment must be positive')
    if (payment.reference?.trim()) {
      const key = `${payment.method}:${payment.reference.trim()}`
      if (references.has(key)) throw new Error('Duplicate payment reference in split payments')
      references.add(key)
    }
  }
  const nonCash = payments.filter(p => p.method !== 'Cash').reduce((sum, p) => sum + p.amount, 0)
  if (nonCash > total) throw new Error('Non-cash payments exceed the invoice total')
  let cashDue = total - nonCash
  return payments.map(payment => {
    if (payment.method !== 'Cash') return { ...payment, notes: payment.notes || undefined, reference: payment.reference?.trim() || undefined }
    const applied = Math.min(payment.amount, cashDue)
    cashDue -= applied
    const change = payment.amount - applied
    return { ...payment, amount: applied, ...(change ? { notes: [payment.notes, `Cash tendered: ${payment.amount}; change returned: ${change}`].filter(Boolean).join('\n') } : {}) }
  }).filter(payment => payment.amount > 0)
}

export function validVisitTime(value: string) {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return true
  const part = '(0[1-9]|1[0-2]):([0-5]\\d) (AM|PM)'
  const match = value.match(new RegExp(`^${part} - ${part}$`))
  if (!match) return false
  const minutes = (h: string, m: string, meridiem: string) => Number(h) % 12 * 60 + Number(m) + (meridiem === 'PM' ? 720 : 0)
  return minutes(match[4], match[5], match[6]) > minutes(match[1], match[2], match[3])
}

export function indiaDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// Follow-up dates are calendar dates persisted at UTC midnight, not instants
// at server midnight. Compare with the current business calendar day.
export function dueCalendarCutoff(now = new Date()) { return new Date(`${indiaDay(now)}T23:59:59.999Z`) }

export function indiaBillingPeriods(now = new Date()) {
  const day = indiaDay(now)
  const [year, month] = day.split('-').map(Number)
  return {
    day, todayStart: new Date(`${day}T00:00:00+05:30`),
    monthStart: new Date(Date.UTC(year, month - 1, 1) - 19800000),
    lastMonthStart: new Date(Date.UTC(year, month - 2, 1) - 19800000),
  }
}

export function assertReturn(received: number, returned: number, requested: number) {
  if (!Number.isSafeInteger(requested) || requested <= 0 || requested > received - returned) throw new Error('Return quantity exceeds the quantity received and not already returned')
}

export function assertCustomTransition(current: string, next: string, jobs: { status: string; qualityStatus: string | null }[], inventory: { status: string; quantity: number }[]) {
  const states = ['MEASUREMENT_SCHEDULED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'DELIVERED']
  if (current === next) return
  if (states.indexOf(next) !== states.indexOf(current) + 1) throw new Error('Custom orders must progress one stage at a time; delivered orders cannot be reopened')
  if (next === 'QUALITY_CHECK' || next === 'DELIVERED') {
    if (jobs.some(job => !['COMPLETED', 'CANCELLED'].includes(job.status))) throw new Error('Complete or cancel linked production jobs first')
  }
  if (next === 'DELIVERED' && jobs.length) {
    if (jobs.some(job => job.status === 'COMPLETED' && !['PASSED', 'PARTIAL'].includes(job.qualityStatus || ''))) throw new Error('Linked production must pass quality control before delivery')
    if (!inventory.some(item => item.status === 'READY' && item.quantity > 0)) throw new Error('No ready custom inventory is available for delivery')
  }
}

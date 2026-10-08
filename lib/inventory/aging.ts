export function agingBracket(days: number) {
  if (days > 180) return '180+ days'
  if (days > 90) return '91-180 days'
  if (days > 60) return '61-90 days'
  if (days > 30) return '31-60 days'
  return '0-30 days'
}

export function ageInDays(date: Date | string, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 86400000))
}

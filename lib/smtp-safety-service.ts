import { prisma } from './db'
import { createSmtpSafety, SmtpSafetyStop, type SafetyRepository } from './smtp-safety'

const repository: SafetyRepository = {
  ensure: id => prisma.smtpSendingSafety.upsert({ where: { id }, create: { id }, update: {} }),
  read: id => prisma.smtpSendingSafety.findUnique({ where: { id } }),
  claim: async (id, token, now, until) => (await prisma.smtpSendingSafety.updateMany({
    where: { id, blockedAt: null, nextAllowedAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { leaseToken: token, leaseUntil: until },
  })).count === 1,
  release: (id, token, next, blocked) => prisma.smtpSendingSafety.updateMany({
    where: { id, leaseToken: token },
    data: { leaseToken: null, leaseUntil: null, nextAllowedAt: next, ...(blocked ? { blockedAt: blocked.at, blockReason: blocked.reason } : {}) },
  }),
  stop: (id, at, reason) => prisma.smtpSendingSafety.updateMany({
    where: { id, blockedAt: null }, data: { blockedAt: at, blockReason: reason },
  }),
  reset: async (id, blockedAt, actor, now) => (await prisma.smtpSendingSafety.updateMany({
    where: { id, blockedAt, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { blockedAt: null, blockReason: null, resetAt: now, resetBy: actor },
  })).count === 1,
}
const safety = createSmtpSafety(repository)
export const withSmtpSafety = safety.send
export const getSmtpSafetyStatus = safety.status
export const resetSmtpSafety = safety.reset
export const stopSmtpSafety = safety.stop
export async function assertSmtpSendingAvailable(config: { smtpHost: string; smtpUser: string }) {
  if ((await safety.status(config)).blocked) throw new SmtpSafetyStop()
}

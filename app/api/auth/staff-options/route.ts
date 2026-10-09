import { prisma } from '@/lib/db'
import { staffLoginOptionsResponse } from '@/lib/auth/staff-login-options'

export const dynamic = 'force-dynamic'

// No session required. Only the minimal, active sign-in directory is public;
// management/HR details and password verification remain protected separately.
export async function GET() {
  return staffLoginOptionsResponse(prisma)
}

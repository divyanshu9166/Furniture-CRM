import type { PrismaClient } from '@prisma/client'

// Public by design: the existing sign-in flow asks staff to select their name.
// Never use the management staff listing here: it includes private HR data.
export async function staffLoginOptionsResponse(db: Pick<PrismaClient, 'staff'>): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' }
  try {
    const staff = await db.staff.findMany({
      where: { status: 'Active', user: { is: { isActive: true } } },
      select: { id: true, name: true, role: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
    // Explicit whitelist even if the repository layer later returns more fields.
    return Response.json({ success: true, data: staff.map(({ id, name, role }) => ({ id, name, role })) }, { headers })
  } catch {
    console.error('[staff-login-options] Unable to load staff sign-in options')
    return Response.json({ success: false, error: 'Unable to load staff names. Please retry or contact your admin.' }, { status: 503, headers })
  }
}

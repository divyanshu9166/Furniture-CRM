import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { requirementLabelSchema, readWalkinRequirements, assertWalkinRequirement, RequirementsChangedError } from '@/lib/walkins/requirements'

export const dynamic = 'force-dynamic'

const walkinFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(10, 'Valid phone number required'),
  requirement: requirementLabelSchema,
  budget: z.string().optional(),
})

// POST /api/walkin — public, no auth required
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = walkinFormSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { name, phone, requirement, budget } = parsed.data

    const walkin = await prisma.$transaction(async tx => {
      await assertWalkinRequirement(tx, requirement)
      const contact = await tx.contact.upsert({
        where: { phone }, update: {}, create: { name, phone, source: 'QR Walk-in' },
      })
      const now = new Date()
      return tx.walkin.create({
        data: {
          contactId: contact.id, requirement, budget: budget || null, date: now,
          time: now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }),
          source: 'QR Walk-in',
        },
      })
    })

    return NextResponse.json({ success: true, data: { id: walkin.id } })
  } catch (err) {
    if (err instanceof RequirementsChangedError) {
      return NextResponse.json({ success: false, error: err.message, requirementsChanged: true }, { status: 409 })
    }
    console.error('Walk-in form error:', err)
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}

// Public projection only: never expose other store settings or credentials.
export async function GET() {
  try {
    const [settings, requirements] = await Promise.all([
      prisma.storeSettings.findFirst({ where: { id: 1 }, select: { storeName: true, logo: true } }),
      readWalkinRequirements(prisma),
    ])
    return NextResponse.json({
      storeName: settings?.storeName || 'Furniture Store',
      logo: settings?.logo || null,
      requirements: requirements.options,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({
      success: false, error: 'Could not load requirements. Please try again.',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

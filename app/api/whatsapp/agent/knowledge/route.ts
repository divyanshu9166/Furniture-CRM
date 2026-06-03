import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { indexKnowledgeDoc } from '@/lib/ai-agent/agent-worker'

/**
 * GET /api/whatsapp/agent/knowledge
 * List all knowledge documents for the current user.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = String(session.id)
    const docs = await prisma.waKnowledgeDoc.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { chunks: true } } },
    })

    return NextResponse.json(
      docs.map((d) => ({
        id: d.id,
        title: d.title,
        source_type: d.source_type,
        char_count: d.char_count,
        status: d.status,
        error: d.error,
        chunk_count: d._count.chunks,
        created_at: d.created_at.toISOString(),
        updated_at: d.updated_at.toISOString(),
      })),
    )
  } catch (error) {
    console.error('[agent/knowledge GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/whatsapp/agent/knowledge
 * Upload a new knowledge document and trigger async indexing.
 *
 * Body: { title: string, raw_text: string, source_type?: string }
 */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = String(session.id)

    let body: { title?: string; raw_text?: string; source_type?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { title, raw_text, source_type = 'text' } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (!raw_text?.trim()) {
      return NextResponse.json({ error: 'raw_text is required' }, { status: 400 })
    }
    if (raw_text.length > 500_000) {
      return NextResponse.json({ error: 'raw_text exceeds 500,000 character limit' }, { status: 400 })
    }

    const doc = await prisma.waKnowledgeDoc.create({
      data: {
        user_id: userId,
        title: title.trim(),
        raw_text,
        char_count: raw_text.length,
        source_type,
        status: 'pending',
      },
    })

    // Trigger async indexing — don't await, respond immediately.
    // The UI polls the status field to show pending → indexed / error.
    indexKnowledgeDoc(doc.id).catch((err) =>
      console.error(`[agent/knowledge] indexing failed for doc ${doc.id}:`, err),
    )

    return NextResponse.json({ success: true, id: doc.id, status: 'pending' }, { status: 201 })
  } catch (error) {
    console.error('[agent/knowledge POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { prisma } from '@/lib/db'

const REQUIRED_TABLES = [
  'profiles',
  'contacts',
  'tags',
  'contact_tags',
  'custom_fields',
  'contact_custom_values',
  'contact_notes',
  'conversations',
  'messages',
  'whatsapp_config',
  'message_templates',
  'pipelines',
  'pipeline_stages',
  'deals',
  'broadcasts',
  'broadcast_recipients',
  'automations',
  'automation_steps',
  'automation_logs',
  'automation_pending_executions',
  'message_reactions',
]

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true },
    orderBy: { id: 'asc' },
    take: 3,
  })

  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${REQUIRED_TABLES}::text[])
    ORDER BY table_name
  `

  console.log(
    JSON.stringify(
      {
        users,
        tables,
      },
      null,
      2,
    ),
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })


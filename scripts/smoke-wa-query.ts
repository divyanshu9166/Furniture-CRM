import { executeQuery, executeRpc } from '@/lib/supabase/query-engine'
import { prisma } from '@/lib/db'

const userId = '1'

async function mustOk(label: string, result: Awaited<ReturnType<typeof executeQuery>>) {
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`)
  }
  return result.data
}

async function main() {
  await mustOk(
    'upsert profile',
    await executeQuery(
      {
        table: 'profiles',
        action: 'upsert',
        onConflict: 'user_id',
        payload: {
          user_id: userId,
          full_name: 'Admin User',
          email: 'admin@furniturecrm.com',
          role: 'ADMIN',
        },
        select: '*',
        filters: [],
        orders: [],
        returning: true,
      },
      { userId, admin: false },
    ),
  )

  const contactResult = await executeQuery(
    {
      table: 'contacts',
      action: 'insert',
      payload: {
        user_id: userId,
        phone: `+919999${Date.now().toString().slice(-6)}`,
        name: 'WA Smoke Contact',
      },
      select: '*',
      filters: [],
      orders: [],
      single: true,
      returning: true,
    },
    { userId, admin: false },
  )
  console.log('contactResult:', JSON.stringify(contactResult))
  const contact = await mustOk(
    'insert contact',
    contactResult,
  )

  if (!contact || typeof contact !== 'object' || !(contact as { id?: unknown }).id) {
    console.log('contact payload:', contact)
    throw new Error('Insert contact returned empty payload')
  }
  const contactId = (contact as { id: string }).id

  const conversationResult = await executeQuery(
    {
      table: 'conversations',
      action: 'insert',
      payload: {
        user_id: userId,
        contact_id: contactId,
        status: 'open',
        unread_count: 0,
      },
      select: '*',
      filters: [],
      orders: [],
      single: true,
      returning: true,
    },
    { userId, admin: false },
  )
  console.log('conversationResult:', JSON.stringify(conversationResult))
  const conversation = await mustOk(
    'insert conversation',
    conversationResult,
  )

  if (
    !conversation ||
    typeof conversation !== 'object' ||
    !(conversation as { id?: unknown }).id
  ) {
    console.log('conversation payload:', conversation)
    throw new Error('Insert conversation returned empty payload')
  }
  const conversationId = (conversation as { id: string }).id

  await mustOk(
    'insert message',
    await executeQuery(
      {
        table: 'messages',
        action: 'insert',
        payload: {
          conversation_id: conversationId,
          sender_type: 'customer',
          content_type: 'text',
          content_text: 'Smoke test message',
          status: 'delivered',
        },
        filters: [],
        orders: [],
      },
      { userId, admin: false },
    ),
  )

  const prismaCheck = await prisma.waConversation.findMany({
    where: { id: conversationId, user_id: userId },
    include: { contact: true },
  })
  console.log('prismaCheckCount:', prismaCheck.length)

  const listResult = await executeQuery(
    {
      table: 'conversations',
      action: 'select',
      select: '*, contact:contacts(*)',
      filters: [{ op: 'eq', field: 'id', value: conversationId }],
      orders: [],
    },
    { userId, admin: false },
  )
  console.log('listResult:', JSON.stringify(listResult))
  const list = await mustOk('select conversations', listResult)
  const listNoFilterResult = await executeQuery(
    {
      table: 'conversations',
      action: 'select',
      select: '*, contact:contacts(*)',
      filters: [],
      orders: [],
      limit: 3,
    },
    { userId, admin: false },
  )
  console.log('listNoFilterResult:', JSON.stringify(listNoFilterResult))
  const listNoFilter = await mustOk(
    'select conversations without id filter',
    listNoFilterResult,
  )

  const automation = await mustOk(
    'insert automation',
    await executeQuery(
      {
        table: 'automations',
        action: 'insert',
        payload: {
          user_id: userId,
          name: `Smoke Automation ${Date.now()}`,
          trigger_type: 'new_message_received',
          trigger_config: {},
          is_active: true,
        },
        select: '*',
        filters: [],
        orders: [],
        single: true,
        returning: true,
      },
      { userId, admin: false },
    ),
  )

  const automationId = (automation as { id: string }).id
  await mustOk(
    'rpc increment_automation_execution_count',
    await executeRpc(
      'increment_automation_execution_count',
      { p_automation_id: automationId },
      { userId, admin: false },
    ),
  )

  const automationAfter = await mustOk(
    'select automation after rpc',
    await executeQuery(
      {
        table: 'automations',
        action: 'select',
        filters: [{ op: 'eq', field: 'id', value: automationId }],
        orders: [],
        single: true,
      },
      { userId, admin: false },
    ),
  )

  console.log(
    JSON.stringify(
      {
        insertedContactId: contactId,
        insertedConversationId: conversationId,
        selectedConversationCount: Array.isArray(list) ? list.length : 0,
        selectedWithoutFilterCount: Array.isArray(listNoFilter)
          ? listNoFilter.length
          : 0,
        automationExecutionCount: (automationAfter as { execution_count?: number })
          .execution_count,
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
    // Keep inserted rows for manual UI verification; only disconnect here.
    await prisma.$disconnect()
  })

/**
 * lib/queues/jobs.ts
 *
 * BullMQ queue and worker definitions for durable, retryable workflows.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Queue              │ Job               │ Retries │ Backoff         │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │  automation-queue   │ run automation    │ 3       │ Exponential 5 s │
 * │  broadcast-status   │ sync counts       │ 5       │ Exponential 2 s │
 * │  message-delivery   │ retry failed send │ 3       │ Fixed 10 s      │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Workers are imported separately so they only run in the right process
 * (Node.js server — not the edge runtime or the browser).
 */

import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq'
import { redis } from '@/lib/redis'

// BullMQ requires a raw ioredis connection (not the shared publishEvent
// one) so we pass the options object. ioredis duplicates the connection
// internally as needed.
const connection: ConnectionOptions = redis as unknown as ConnectionOptions

// ── Queue names ────────────────────────────────────────────────────────────
export const QUEUE_AUTOMATION = 'automation-queue'
export const QUEUE_BROADCAST_STATUS = 'broadcast-status-queue'
export const QUEUE_MESSAGE_DELIVERY = 'message-delivery-queue'

// ── Typed job data shapes ──────────────────────────────────────────────────

export interface AutomationJobData {
  userId: string
  triggerType:
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
  contactId: string
  context: {
    message_text?: string
    conversation_id?: string
  }
}

export interface BroadcastStatusJobData {
  broadcastId: string
  recipientId: string
  status: string
  timestamp: number
}

export interface MessageDeliveryJobData {
  conversationId: string
  userId: string
  messageId: string      // internal DB id
  metaMessageId?: string // Meta's wa_id for status lookups
}

// ── Queue instances ────────────────────────────────────────────────────────

export const automationQueue = new Queue<AutomationJobData>(QUEUE_AUTOMATION, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
})

export const broadcastStatusQueue = new Queue<BroadcastStatusJobData>(
  QUEUE_BROADCAST_STATUS,
  {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  },
)

export const messageDeliveryQueue = new Queue<MessageDeliveryJobData>(
  QUEUE_MESSAGE_DELIVERY,
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'fixed', delay: 10_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  },
)

// ── Worker factory ─────────────────────────────────────────────────────────
// Workers are created lazily so importing this module in the Next.js
// process (which runs in both server and edge contexts) doesn't accidentally
// spawn worker threads in the wrong environment.

type WorkerHandler<T> = (job: Job<T>) => Promise<void>

export function createAutomationWorker(handler: WorkerHandler<AutomationJobData>): Worker {
  return new Worker<AutomationJobData>(QUEUE_AUTOMATION, handler, {
    connection,
    concurrency: 5,
  })
}

export function createBroadcastStatusWorker(
  handler: WorkerHandler<BroadcastStatusJobData>,
): Worker {
  return new Worker<BroadcastStatusJobData>(QUEUE_BROADCAST_STATUS, handler, {
    connection,
    concurrency: 10,
  })
}

export function createMessageDeliveryWorker(
  handler: WorkerHandler<MessageDeliveryJobData>,
): Worker {
  return new Worker<MessageDeliveryJobData>(QUEUE_MESSAGE_DELIVERY, handler, {
    connection,
    concurrency: 5,
  })
}

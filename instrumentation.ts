/**
 * instrumentation.ts
 *
 * Next.js instrumentation hook — runs once when the server starts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We use it to boot the BullMQ automation worker so it's registered before
 * the first request arrives. The `register` function is called once per
 * server process (not once per request), making it the correct place to
 * start long-lived background workers.
 */

export async function register() {
  // Only start the worker in the Node.js runtime, not in the edge runtime
  // (which doesn't support ioredis / worker_threads).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAutomationWorker } = await import('./lib/queues/automation-worker')
    startAutomationWorker()

    const { startAiAgentWorker } = await import('./lib/queues/ai-agent-worker')
    startAiAgentWorker()
  }
}


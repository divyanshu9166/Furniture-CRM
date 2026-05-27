# Goal Description

The objective is to completely disconnect Supabase from the WhatsApp Marketing section, ensuring that all frontend tabs and background processes communicate natively with the database via Prisma. We also need to guarantee that the logic is bug-free and that real-time syncing works across every tab (Inbox, Automations, Broadcasts, Contacts, etc.).

Currently, while explicit Supabase calls have been removed, there is a hidden `CompatSupabaseClient` (a mock wrapper that translates Supabase syntax like `supabase.from('table').select()` into Prisma queries on the backend via `/api/supabase/query`). This compat layer powers the Automations tab, Broadcast sending logic, and the Inbox unread badge. 

We will rip out this compat layer entirely to fulfill the requirement of completely removing Supabase dependencies, and rewrite the affected areas to use standard Next.js API routes, Prisma, and the new real-time WebSocket architecture.

> [!WARNING]
> This will involve significant backend refactoring to the Automations engine and Broadcast sending logic to make them native to Prisma.

## Open Questions

- Should we transition the Broadcast sending logic (`lib/use-broadcast-sending.ts`) into a BullMQ background queue so it's durable and continues even if you close the browser tab? (Currently, the browser loop sends batches of 10 to Meta and updates the database, meaning you must keep the tab open until it finishes).

## Proposed Changes

### Supabase Core Compat Layer (Deletion)

We will delete the mock Supabase layer since we are replacing it with native Prisma implementations.

#### [DELETE] `lib/supabase/compat-client.ts`
#### [DELETE] `lib/supabase/client.ts`
#### [DELETE] `lib/supabase/server.ts`
#### [DELETE] `lib/supabase/query-engine.ts`
#### [DELETE] `app/api/supabase/query/route.ts`
#### [DELETE] `app/api/supabase/rpc/route.ts`

---

### Automations API & Engine

The Automations feature relies heavily on the `supabaseAdmin()` mock wrapper. We will rewrite the API to use standard Prisma ORM calls.

#### [DELETE] `lib/automations/admin-client.ts`
- Remove the `supabaseAdmin()` mock wrapper completely.

#### [MODIFY] `app/api/automations/route.ts`
- Rewrite `POST` (create automation) to use `prisma.waAutomation.create()`.

#### [MODIFY] `app/api/automations/[id]/route.ts`
- Rewrite `GET`, `PUT`, `DELETE` to use standard `prisma.waAutomation` queries instead of `supabaseAdmin()`.

#### [MODIFY] `app/api/automations/[id]/duplicate/route.ts`
- Rewrite to use Prisma for duplication logic.

#### [MODIFY] `lib/automations/engine.ts`
- Replace `supabaseAdmin()` fetches with direct `prisma` queries to lookup and execute active automations.
- Replace RPC calls like `increment_automation_execution_count` with standard `prisma.waAutomation.update({ data: { execution_count: { increment: 1 } } })`.

#### [MODIFY] `lib/automations/steps-tree.ts`
- Rewrite `replaceSteps`, `insertSteps`, and `loadStepsTree` to use `prisma.waAutomationStep` instead of `supabaseAdmin().from('automation_steps')`.

#### [MODIFY] `app/api/automations/cron/route.ts`
- Replace `supabaseAdmin()` with native `prisma` logic to check and run pending scheduled executions.

---

### Real-Time Syncing & UI

#### [MODIFY] `lib/use-total-unread.ts`
- Currently uses a dummy `supabase.channel` that fails to receive updates.
- Rewrite to use the new `useRealtime` WebSocket hook (`chat_events` -> `conversation_update`) so the unread badge updates instantly when new messages arrive.
- Use native `fetch('/api/whatsapp/conversations/unread')` for the initial fetch.

#### [NEW] `app/api/whatsapp/conversations/unread/route.ts`
- Native API route returning `prisma.waConversation.aggregate` for unread counts.

---

### Broadcast Sending Logic

The browser-based broadcast sending hook relies on the mock Supabase client to resolve audiences and insert recipients. 

#### [MODIFY] `lib/use-broadcast-sending.ts`
- Strip all `createClient()` usage.
- Refactor `resolveAudience` to use our updated backend API routes (`/api/whatsapp/contacts`).
- Refactor broadcast creation and recipient inserts to call a new backend API route (`POST /api/whatsapp/broadcasts`).
- Loop over `fetch('/api/whatsapp/broadcast')` and handle completion updates via native API routes instead of `supabase.from().update()`.

#### [NEW] `app/api/whatsapp/broadcasts/route.ts`
- Handles the initial insertion of a Broadcast and its Recipients into the database.
- Handles finalizing the status (`sent` or `failed`).

## Verification Plan

### Automated/Manual Tests
- Build verification: Run `npm run build` to ensure no lingering `createClient` or `supabase` imports exist.
- Automations verification: Create an automation and verify it triggers properly when a message is received (via Webhook POST simulation).
- Real-time verification: Open the Inbox tab and verify that simulating a webhook POST causes the unread badge and sidebar to update instantly without polling.
- Broadcast verification: Ensure that creating a broadcast correctly inserts recipients and sends messages through the native Prisma paths.

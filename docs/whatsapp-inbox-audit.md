# WhatsApp inbox UI and state audit — 2026-10-08

## Scope and data safety

This change addresses the WhatsApp Marketing page shell and inbox, not a full audit of broadcasts, automations, AI workers or Meta webhooks. Existing API contracts, permissions, database schema and saved chat records are unchanged. No database migrations, production messages, deployment or Git push were performed.

## Confirmed causes and changes

- **Unreadable outgoing text:** the purple bubble used the light theme's dark foreground; the legacy WhatsApp theme mapping also rewrites `text-white`. Bubbles now use dedicated incoming/outgoing classes, with white outgoing body text, readable timestamps/status icons and independent quote/template styling. Dark controls use a lighter accent.
- **Letter-column messages:** nested 75%/70% shrink-to-fit width constraints collapsed short incoming bubbles. There is now one maximum-width constraint on the message action wrapper. Normal words retain their natural width; long URLs and multiline/Hindi/emoji messages can wrap within the bubble.
- **Mobile/desktop crowding:** inbox typography is proportional; mobile headings/status are compact, controls wrap, and large desktop contact panels appear only at 2xl. Contact details remain accessible through a focus-managed sheet with close/Escape support. Outer-page scrolling/padding no longer competes with the chat/composer. Landscape and short-height layouts keep the composer in view.
- **Hidden mobile actions:** messages have an explicit mobile actions button. Reply/copy/reaction targets are larger; hidden toolbars do not intercept taps. Reply/react are disabled for pending or failed messages.
- **Premature send completion:** the composer now awaits acceptance, blocks duplicate clicks/IME composition submits and preserves text on failure. Failed bubbles show “Not sent”. Draft state is keyed per conversation instead of leaking into another chat.
- **Lost pending messages and duplicate ACKs:** an incoming INSERT no longer removes every temporary bubble. Only the acknowledged temporary ID is replaced, server IDs are deduplicated across HTTP/realtime/poll races, and read/delivered statuses do not regress on a late sent event. A bounded INSERT replay cache prevents repeated unread increments; older events cannot roll the preview timestamp backwards.
- **Stale and cross-chat updates:** late message/contact/reaction/status responses are scoped to their conversation/contact. Snapshots preserve newer live messages. Reaction failures roll back only the current user's affected reaction, not the entire reaction list; repeated mutations are guarded.
- **Socket outage and loading failures:** the active thread and reactions refresh every 15 seconds without overlapping fetches. Conversation/thread/template/contact loading errors surface retry controls rather than hanging indefinitely. Polling does not force a reader back to the newest message; a latest-messages button is available.
- **Session and template errors:** the 24-hour window uses the latest valid customer timestamp and updates on a timer. Empty/no-customer history requires a template. Template selection waits for the send result, preserves the parameter form on failure and handles spaces in numbered placeholders. Unsupported media/header/button/named/gapped parameter templates are explicitly explained and blocked rather than submitted with missing parameters. No new media-header or button-parameter composer was added.
- **Media lifecycle:** authenticated image requests can be aborted and blob URLs are revoked on replacement/unmount rather than retaining stale media state.

## Verification

- `npm run test:whatsapp-inbox`: 10 tests for merges, ACK races, conversation isolation, monotonic delivery state, session boundaries, template guards and actual bubble rendering.
- Combined inventory/manufacturing/commerce/walk-in/email/inbox suite: **131 passed, 0 failed**. Tests use isolated fixtures/mocks.
- Focused ESLint: no errors; three existing `next/image` advisory warnings remain for image elements.
- Production `npm run build`: passed, including 106 static pages. Existing Next configuration skips type validation, so this is **not** a clean-typecheck claim.
- Separate `npx tsc --noEmit`: seven existing errors remain in financials, Prisma configuration and five Vitest-based test files. No inbox/page errors appeared in the final check.
- `git diff --check`: passed.
- Background browser QA used the actual Marketing shell/inbox components with loopback-only mocked auth/API/socket responses; unrelated tabs were stubbed and were not functionally tested. The computer-use workflow was used for rendered geometry, theme contrast and real UI interactions rather than relying on static classes alone.
- Browser sizes: 320×740, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1536×864, 740×360 and 390×500. No document/header horizontal overflow was observed; the composer remained inside the viewport. “Nalanda” and “Bihar” each rendered on one line (~21.7px text height). Outgoing body text computed to white on `#4f46e5` in both themes.
- Mocked interaction checks: pending send plus incoming event; realtime echo before HTTP ACK (one final bubble); failed draft retention; switching chats before ACK; template failure retaining inputs and successful send closing the picker; contact sheet rendering; polling error/retry preserving history; mobile actions opening a reply draft; AI/human toggle, pending status and assignment remaining functional without header overflow.

## Remaining production checks / limits

Live WhatsApp delivery, webhook/Redis health, permissions on the VPS and real-device keyboard/browser behavior require deployment and a controlled test with actual infrastructure. This UI patch cannot repair a server that never receives inbound webhooks. Very large message histories still use the existing all-history API; pagination/virtualization was not introduced. Ambiguous network failures should be checked in the inbox/Meta logs before manually retrying; no automatic resend or server idempotency migration was added. These checks do not establish that every feature in WhatsApp Marketing is bug-free.

Reproduce the isolated preview with `node scripts/whatsapp-inbox-preview.mjs`, then open `http://127.0.0.1:4320`. It binds only to loopback, uses sample contacts/messages, and replaces API calls with mocks. Stop it with Ctrl+C; never use it as a production server.

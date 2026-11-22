import { prisma } from "@/lib/db";
import { getSession as getBaseSession } from "@/lib/session";

/**
 * WhatsApp Marketing, the Instagram/Facebook inbox and automations store
 * everything under a `user_id`, and the connection (access token, page, app
 * secret) is saved by whoever pressed "Connect". This is one business with one
 * set of connected accounts, so a Manager must see what the Admin connected
 * instead of an empty, "Not Connected" copy of their own.
 *
 * Rule: Admins and Managers all work in one shared workspace.
 *  - Someone who already has their own connection keeps using it (nothing
 *    changes for existing setups).
 *  - Everyone else uses the workspace owner: the user who holds the earliest
 *    WhatsApp / Facebook / Instagram connection, else the first active Admin.
 * Staff keep their own id and are not given access to this data.
 */

const WORKSPACE_ROLES = new Set(["ADMIN", "MANAGER"]);
const CACHE_MS = 30_000;
const cache = new Map<string, { id: string; at: number }>();

async function hasOwnConnection(userId: string) {
  const where = { where: { user_id: userId }, select: { id: true } } as const;
  const [wa, fb, ig] = await Promise.all([
    prisma.waWhatsappConfig.findFirst(where),
    prisma.fbConfig.findFirst(where),
    prisma.igConfig.findFirst(where),
  ]);
  return Boolean(wa || fb || ig);
}

async function findWorkspaceOwner(): Promise<string | null> {
  const first = { orderBy: { created_at: "asc" }, select: { user_id: true } } as const;
  const [wa, fb, ig] = await Promise.all([
    prisma.waWhatsappConfig.findFirst(first),
    prisma.fbConfig.findFirst(first),
    prisma.igConfig.findFirst(first),
  ]);
  const connected = [wa, fb, ig].filter(Boolean) as { user_id: string }[];
  if (connected.length) return connected[0].user_id;
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return admin ? String(admin.id) : null;
}

/** The user id that owns the shared WhatsApp / social data for this signed-in user. */
export async function resolveWorkspaceUserId(userId: string, role?: string | null): Promise<string> {
  if (!role || !WORKSPACE_ROLES.has(role)) return userId;

  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.id;

  let resolved = userId;
  try {
    if (!(await hasOwnConnection(userId))) resolved = (await findWorkspaceOwner()) ?? userId;
  } catch (error) {
    // Never block the page on this lookup; fall back to the user's own data.
    console.error("[workspace] could not resolve the shared workspace:", error);
    return userId;
  }
  cache.set(userId, { id: resolved, at: Date.now() });
  return resolved;
}

/** Same shape as `getSession()` from `@/lib/auth-helpers`, with `user.id` = the workspace owner. */
export async function getWorkspaceSession() {
  const session = await getBaseSession();
  if (!session) return null;
  const id = await resolveWorkspaceUserId(String(session.id), session.role);
  return {
    user: {
      id,
      actualId: session.id,
      email: session.email,
      name: session.name,
      role: session.role as "ADMIN" | "MANAGER" | "STAFF",
      staffId: session.staffId,
    },
  };
}

/** Same shape as `getSession()` from `@/lib/session`, with `id` = the workspace owner. */
export async function getWorkspaceSessionFlat() {
  const session = await getBaseSession();
  if (!session) return null;
  const id = await resolveWorkspaceUserId(String(session.id), session.role);
  return { ...session, id, actualId: session.id };
}

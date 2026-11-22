import { prisma } from "@/lib/db";
import { getSession as getBaseSession } from "@/lib/session";
import { loadSectionAccount } from "@/lib/section-access";

/**
 * WhatsApp Marketing, the Instagram/Facebook inbox and automations store
 * everything under a `user_id`, and the connection (access token, page, app
 * secret) is saved by whoever pressed "Connect". This is one business with one
 * set of connected accounts, so a Manager must see what the Admin connected
 * instead of an empty, "Not Connected" copy of their own.
 *
 * Resolve each channel separately, without moving credentials or history.
 * For this single-business installation, prefer a connected Admin, then a
 * connected Manager. Without a live config, preserve the Admin workspace.
 * Staff query their own records unless an Admin explicitly grants the section.
 */

const WORKSPACE_ROLES = new Set(["ADMIN", "MANAGER", "SHARED_STAFF"]);
type Channel = "whatsapp" | "facebook" | "instagram";
type SocialChannel = Exclude<Channel, "whatsapp">;

async function resolveOwners<C extends Channel>(userId: string, role: string | null | undefined, channels: readonly C[]) {
  if (!role || !WORKSPACE_ROLES.has(role)) return channels.map(platform => ({ platform, user_id: userId }));
  const users = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
    orderBy: { id: "asc" },
    select: { id: true, role: true } });
  // A session cookie can outlive a demotion or deactivation. Never grant a
  // shared owner's scope solely on the strength of the cookie's old role.
  if (role !== "SHARED_STAFF" && !users.some(u => String(u.id) === userId)) {
    return channels.map(platform => ({ platform, user_id: userId }));
  }
  const admins = users.filter(u => u.role === "ADMIN").map(u => String(u.id));
  const query = {
    where: { user_id: { in: users.map(u => String(u.id)) } }, select: { user_id: true, status: true },
    orderBy: [{ created_at: "asc" as const }, { user_id: "asc" as const }],
  };
  return Promise.all(channels.map(async platform => {
    const rows = platform === "facebook" ? await prisma.fbConfig.findMany(query)
      : platform === "instagram" ? await prisma.igConfig.findMany(query)
      : await prisma.waWhatsappConfig.findMany(query);
    const connected = rows.filter(row => row.status === "connected");
    const adminOwns = (row: { user_id: string }) => admins.includes(row.user_id);
    const owner = connected.find(adminOwns) ?? connected[0] ?? rows.find(adminOwns);
    return { platform, user_id: owner?.user_id ?? admins[0] ?? userId };
  }));
}

/** The user id that owns the shared WhatsApp / social data for this signed-in user. */
export async function resolveWorkspaceUserId(userId: string, role?: string | null, channel: Channel = "whatsapp"): Promise<string> {
  return (await resolveOwners(userId, role, [channel]))[0].user_id;
}

/** Keep platform/owner pairs together, including for requests with only a conversation id. */
export async function getSocialInboxScope(channels: readonly SocialChannel[] = ["facebook", "instagram"]) {
  const session = await getBaseSession();
  if (!session) return null;
  const id = String(session.id);
  return resolveOwners(id, await sharingRole(id, session.role, "social-inbox"), channels);
}

async function sharingRole(id: string, role: string, section: "whatsapp-marketing" | "social-inbox") {
  if (role !== "STAFF") return role;
  const account = await loadSectionAccount(id);
  return account?.sections.includes(section) ? "SHARED_STAFF" : role;
}

/** Same shape as `getSession()` from `@/lib/auth-helpers`, with `user.id` = the workspace owner. */
export async function getWorkspaceSession() {
  const session = await getBaseSession();
  if (!session) return null;
  const id = await resolveWorkspaceUserId(String(session.id), await sharingRole(String(session.id), session.role, "whatsapp-marketing"));
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
export async function getWorkspaceSessionFlat(channel: Channel = "whatsapp") {
  const session = await getBaseSession();
  if (!session) return null;
  const id = await resolveWorkspaceUserId(String(session.id), await sharingRole(String(session.id), session.role,
    channel === "whatsapp" ? "whatsapp-marketing" : "social-inbox"), channel);
  return { ...session, id, actualId: session.id };
}

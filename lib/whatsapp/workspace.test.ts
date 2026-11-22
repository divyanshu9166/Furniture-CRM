import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { getSocialInboxScope, getWorkspaceSession, resolveWorkspaceUserId } from "@/lib/workspace";
import { GET as listSocial } from "@/app/api/social/conversations/route";
import { GET as readMessages } from "@/app/api/social/conversations/[id]/messages/route";
import { GET as listWhatsapp } from "@/app/api/whatsapp/conversations/route";

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  waWhatsappConfig: { findMany: vi.fn() },
  fbConfig: { findMany: vi.fn() },
  igConfig: { findMany: vi.fn() },
  socialConversation: { findMany: vi.fn(), findFirst: vi.fn() },
  socialMessage: { findMany: vi.fn() },
  waConversation: { findMany: vi.fn() },
}));
const auth = vi.hoisted(() => vi.fn());
const access = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/session", () => ({ getSession: auth }));
vi.mock("@/lib/section-access", () => ({ loadSectionAccount: access }));
const req = (url: string) => new Request("http://localhost" + url) as NextRequest;
const row = (user_id: string, status = "connected") => ({ user_id, status });
beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ id: "2", role: "MANAGER" });
  access.mockResolvedValue(null);
  db.user.findMany.mockResolvedValue([
    { id: 1, role: "ADMIN" }, { id: 2, role: "MANAGER" }, { id: 3, role: "MANAGER" },
  ]);
  db.waWhatsappConfig.findMany.mockResolvedValue([row("2", "disconnected"), row("1")]);
  db.fbConfig.findMany.mockResolvedValue([row("3")]);
  db.igConfig.findMany.mockResolvedValue([row("1")]);
});

it("a stale Manager connection cannot shadow the Admin WhatsApp inbox or change the actor", async () => {
  expect((await getWorkspaceSession())?.user).toMatchObject({ id: "1", actualId: "2" });
  db.waConversation.findMany.mockResolvedValue([]);
  expect((await listWhatsapp(req("/"))).status).toBe(200);
  expect(db.waConversation.findMany.mock.calls[0][0].where).toEqual({ user_id: "1" });
});
it("prefers a connected Admin even if a Manager connected earlier", async () => {
  db.fbConfig.findMany.mockResolvedValue([row("2"), row("1")]);
  expect(await resolveWorkspaceUserId("2", "MANAGER", "facebook")).toBe("1");
});
it.each([["facebook", "3"], ["instagram", "1"]])("lists %s under its own owner", async (platform, owner) => {
  db.socialConversation.findMany.mockResolvedValue([{ id: "chat" }]);
  expect(await (await listSocial(req("/?platform=" + platform))).json()).toEqual([{ id: "chat" }]);
  expect(db.socialConversation.findMany.mock.calls[0][0].where).toEqual({ platform, user_id: owner });
});
it("message lookup pairs the specific platform with its owner; out-of-scope IDs return 404", async () => {
  db.socialConversation.findFirst.mockResolvedValue(null);
  const result = await readMessages(req("/"), { params: Promise.resolve({ id: "other-chat" }) });
  expect(result.status).toBe(404);
  expect(db.socialConversation.findFirst.mock.calls[0][0].where).toEqual({
    id: "other-chat", OR: [{ platform: "facebook", user_id: "3" }, { platform: "instagram", user_id: "1" }],
  });
  expect(db.socialMessage.findMany).not.toHaveBeenCalled();
});
it("defaults to the Admin for an unconnected channel without selecting an old Manager row", async () => {
  db.igConfig.findMany.mockResolvedValue([row("2", "disconnected")]);
  expect(await resolveWorkspaceUserId("2", "MANAGER", "instagram")).toBe("1");
});
it("does not resolve a shared scope for staff, signed-out users or stale manager sessions", async () => {
  auth.mockResolvedValue({ id: "4", role: "STAFF" });
  expect(await getSocialInboxScope(["instagram"])).toEqual([{ platform: "instagram", user_id: "4" }]);
  auth.mockResolvedValue(null);
  expect(await getSocialInboxScope()).toBeNull();
  expect(db.user.findMany).not.toHaveBeenCalled();
  expect(await resolveWorkspaceUserId("4", "MANAGER")).toBe("4");
  expect(db.waWhatsappConfig.findMany).not.toHaveBeenCalled();
});

it("a Staff account explicitly granted the social inbox resolves the existing social owners only", async () => {
  auth.mockResolvedValue({ id: "4", role: "STAFF" });
  access.mockResolvedValue({ role: "STAFF", sections: ["social-inbox"] });
  expect(await getSocialInboxScope()).toEqual([
    { platform: "facebook", user_id: "3" }, { platform: "instagram", user_id: "1" },
  ]);
  expect((await getWorkspaceSession())?.user).toMatchObject({ id: "4", actualId: "4", role: "STAFF" });
});

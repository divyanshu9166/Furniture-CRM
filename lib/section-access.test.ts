import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { allowedSections, isSection, sectionForPath } from "@/lib/section-catalog";
import { getDailyPayments } from "@/app/actions/payments";
import { saveSectionAccess } from "@/app/actions/section-access";
import { paymentReceipt } from "@/lib/payment-receipt";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  account: vi.fn(),
  target: vi.fn(),
  save: vi.fn(),
  paymentQuery: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ decrypt: mocks.auth, getSession: mocks.auth }));
vi.mock("@/lib/db", () => ({ prisma: {
  user: { findUnique: mocks.account, findFirst: mocks.target },
  userSectionAccess: { upsert: mocks.save },
  dailyPayment: { findMany: mocks.paymentQuery },
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const request = (path: string, method = "GET") => new NextRequest("http://localhost" + path, { method });
const account = (role: string, overrides = {}, isActive = true) =>
  mocks.account.mockResolvedValue({ role, isActive, sectionAccess: { overrides } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: "2", role: "MANAGER" });
  account("MANAGER");
});

it("keeps ordinary role access until overridden, never overrides admin recovery access", () => {
  expect(allowedSections("MANAGER")).toContain("whatsapp-marketing");
  expect(allowedSections("STAFF")).not.toContain("whatsapp-marketing");
  expect(allowedSections("ADMIN", { payments: false })).toContain("payments");
  expect(allowedSections("STAFF", { payments: false, billing: true })).toContain("billing");
  expect(isSection("__proto__")).toBe(false);
  expect(sectionForPath("/staff-portal")).toBe("staff-portal");
});

it("applies a revoked grant to URLs, actions, and receipt files with the same cookie", async () => {
  expect((await proxy(request("/payments"))).headers.get("x-middleware-next")).toBe("1");
  account("MANAGER", { payments: false });
  expect((await proxy(request("/payments"))).headers.get("location")).toBe("http://localhost/access-denied");
  expect((await proxy(request("/api/uploads/receipts/a.pdf?download=1"))).status).toBe(403);
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await getDailyPayments()).toMatchObject({ success: false });
  } finally {
    logger.mockRestore();
  }
  expect(mocks.paymentQuery).not.toHaveBeenCalled();
});

it("guards direct channel APIs, websocket tickets, legacy routes, and dotted paths", async () => {
  account("MANAGER", { "whatsapp-marketing": false, "social-inbox": false });
  for (const path of ["/api/whatsapp/conversations", "/api/auth/ws-token", "/api/social/conversations"]) {
    expect((await proxy(request(path))).status).toBe(403);
  }
  for (const path of ["/automations/abc.xyz/edit", "/facebook-inbox", "/broadcasts/new"]) {
    expect((await proxy(request(path))).headers.get("location")).toBe("http://localhost/access-denied");
  }
  expect((await proxy(request("/api/whatsapp/webhook", "POST"))).headers.get("x-middleware-next")).toBe("1");
});

it("an allowed payments account still reaches its normal data query", async () => {
  mocks.paymentQuery.mockResolvedValue([]);
  expect(await getDailyPayments()).toEqual({ success: true, data: [] });
  expect(mocks.paymentQuery).toHaveBeenCalledOnce();
});

it("grants a Staff section without allowing integration settings writes", async () => {
  account("STAFF", { "social-inbox": true });
  expect((await proxy(request("/social-inbox"))).headers.get("x-middleware-next")).toBe("1");
  expect((await proxy(request("/api/social/config/facebook", "DELETE"))).status).toBe(403);
  expect((await proxy(request("/settings"))).headers.get("location")).toBe("http://localhost/access-denied");
});

it("requires an active account and rejects non-admin permission changes", async () => {
  expect((await saveSectionAccess(3, { payments: false })).success).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled();
  account("MANAGER", {}, false);
  expect((await proxy(request("/api/whatsapp/conversations"))).status).toBe(401);
});

it("only an admin can save valid grants for eligible accounts", async () => {
  account("ADMIN");
  mocks.target.mockResolvedValue({ id: 3 });
  expect((await saveSectionAccess(3, { settings: true })).success).toBe(false);
  expect((await saveSectionAccess(3, { payments: "false" })).success).toBe(false);
  expect((await saveSectionAccess(3, { payments: false })).success).toBe(true);
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
    where: { userId: 3 }, create: { userId: 3, overrides: { payments: false } },
    update: { overrides: { payments: false } },
  });
});

it("recognizes old and current receipt paths, preserving download parameters", () => {
  const origin = "https://crm.example.com";
  expect(paymentReceipt("/uploads/receipts/scan.JPG", origin)?.kind).toBe("image");
  const pdf = paymentReceipt("/api/uploads/receipts/file.pdf?filename=paid.pdf", origin);
  expect(pdf?.kind).toBe("pdf");
  expect(new URL(pdf!.download).searchParams.get("download")).toBe("1");
  expect(new URL(pdf!.download).searchParams.get("filename")).toBe("paid.pdf");
  expect(paymentReceipt("javascript:alert(1)", origin)).toBeNull();
});

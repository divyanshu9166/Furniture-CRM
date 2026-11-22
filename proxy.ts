import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/session";
import { loadSectionAccount } from "@/lib/section-access";
import { sectionForApi, sectionForPath } from "@/lib/section-catalog";

const publicPaths = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/staff-options",
  "/api/auth/me",
  "/api/webhooks",
  "/api/social/webhook",
  "/walkin-form",
  "/api/walkin",
  "/api/email-track",
  "/api/calls/log",
  "/api/calls/schedule-callback",
  "/api/appointments/create",
  "/api/whatsapp/webhook",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (publicPaths.some(path => pathname === path || pathname.startsWith(path + "/"))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  const apiSection = sectionForApi(pathname);
  const section = apiSection ?? sectionForPath(pathname);
  const settings = pathname === "/settings" || pathname.startsWith("/settings/");
  if (pathname.startsWith("/_next/") || (!section && !settings && !pathname.startsWith("/api/") && pathname.includes("."))) {
    return NextResponse.next();
  }

  // Check custom session cookie
  const sessionCookie = req.cookies.get("session")?.value;
  const session = await decrypt(sessionCookie);
  const api = pathname.startsWith("/api/") || Boolean(apiSection);
  const signedOut = () => api
    ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    : NextResponse.redirect(new URL("/login", req.url));

  // Redirect unauthenticated users to login (without callbackUrl to avoid redirect loops)
  if (!session) return signedOut();
  if (section || settings) {
    const account = await loadSectionAccount(String(session.id));
    if (!account) return signedOut();
    if ((section && !account.sections.includes(section)) || (settings && account.role !== "ADMIN")) {
      return api
        ? NextResponse.json({ error: "Section access denied" }, { status: 403 })
        : NextResponse.redirect(new URL("/access-denied", req.url), 303);
    }
    if (account.role === "STAFF" && !["GET", "HEAD"].includes(req.method) &&
        (/^\/api\/social\/config\//.test(pathname) || pathname === "/api/whatsapp/config")) {
      return NextResponse.json({ error: "Manager or Admin access required to change integrations" }, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

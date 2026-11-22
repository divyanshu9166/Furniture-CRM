import { cache } from "react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { allowedSections, type Section, type SectionOverrides } from "@/lib/section-catalog";

// React caches within one render only. Never cache an account's grants across requests.
export async function loadSectionAccount(id: string) {
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2_147_483_647) return null;
  const account = await prisma.user.findUnique({
    where: { id: Number(id) },
    select: { role: true, isActive: true, sectionAccess: { select: { overrides: true } } },
  });
  if (!account?.isActive) return null;
  const overrides = (account.sectionAccess?.overrides ?? {}) as SectionOverrides;
  return { role: account.role, sections: allowedSections(account.role, overrides) };
}

export const getSectionSession = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const account = await loadSectionAccount(String(session.id));
  return account ? { ...session, ...account } : null;
});

export async function requireSection(...sections: Section[]) {
  const session = await getSectionSession();
  if (!session) throw new Error("Unauthorized");
  if (!sections.some(section => session.sections.includes(section))) throw new Error("Forbidden");
  return { user: session };
}

export async function requireSectionAdmin() {
  const session = await getSectionSession();
  if (session?.role !== "ADMIN") throw new Error("Admin access required");
  return session;
}

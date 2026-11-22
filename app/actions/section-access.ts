"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSectionAdmin } from "@/lib/section-access";
import { isSection, type SectionOverrides } from "@/lib/section-catalog";

export async function listSectionAccounts() {
  try {
    await requireSectionAdmin();
    const users = await prisma.user.findMany({
      where: { role: { in: ["STAFF", "MANAGER"] }, isActive: true },
      orderBy: [{ role: "asc" }, { name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, email: true, role: true, sectionAccess: { select: { overrides: true } } },
    });
    return { success: true as const, data: users.map(({ sectionAccess, ...user }) => ({
      ...user,
      overrides: (sectionAccess?.overrides ?? {}) as SectionOverrides,
    })) };
  } catch {
    return { success: false as const, error: "Unable to load access settings. Verify admin access and database migrations." };
  }
}

export async function saveSectionAccess(userId: number, input: unknown) {
  try {
    await requireSectionAdmin();
    if (!Number.isInteger(userId) || userId <= 0 || userId > 2_147_483_647 ||
        !input || typeof input !== "object" || Array.isArray(input)) {
      return { success: false, error: "Invalid account or section permissions." };
    }
    const overrides: SectionOverrides = {};
    for (const [key, value] of Object.entries(input)) {
      if (!isSection(key) || typeof value !== "boolean") {
        return { success: false, error: "Unrecognized section or permission value." };
      }
      overrides[key] = value;
    }
    const user = await prisma.user.findFirst({
      where: { id: userId, isActive: true, role: { in: ["MANAGER", "STAFF"] } },
      select: { id: true },
    });
    if (!user) return { success: false, error: "Select an active Manager or Staff login." };
    await prisma.userSectionAccess.upsert({
      where: { userId },
      create: { userId, overrides },
      update: { overrides },
    });
    revalidatePath("/", "layout");
    return { success: true };
  } catch {
    return { success: false, error: "Unable to save section access. Try again." };
  }
}

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool as any)
  return new PrismaClient({ adapter })
}

function shouldRefreshPrismaClient(client: PrismaClient | undefined) {
  if (!client) return true

  // In dev, global Prisma instances can survive schema changes.
  // If new models are missing, create a fresh client instance.
  return typeof (client as any).indiaMartConfig === 'undefined' || typeof (client as any).indiaMartLead === 'undefined'
}

const prismaClient = shouldRefreshPrismaClient(globalForPrisma.prisma)
  ? createPrismaClient()
  : globalForPrisma.prisma

export const prisma = prismaClient

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaClient

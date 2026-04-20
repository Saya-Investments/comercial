import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function getPrismaClient() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require('pg')
  const { PrismaPg } = require('@prisma/adapter-pg')

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL!,
  })
  const adapter = new PrismaPg(pool, { schema: 'comercial' })
  const client = new PrismaClient({ adapter })

  globalForPrisma.prisma = client

  return client
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient()
    return (client as unknown as Record<string | symbol, unknown>)[prop]
  },
})

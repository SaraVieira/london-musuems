import { asc } from 'drizzle-orm'
import { createTRPCRouter, publicProcedure } from './init'
import { db } from '@/db'
import { categories, museums } from '@/db/schema'
import type { TRPCRouterRecord } from '@trpc/server'

const museumsRouter = {
  list: publicProcedure.query(async () => {
    return db.select().from(museums).orderBy(asc(museums.name))
  }),
} satisfies TRPCRouterRecord

const categoriesRouter = {
  list: publicProcedure.query(async () => {
    return db.select().from(categories).orderBy(asc(categories.name))
  }),
} satisfies TRPCRouterRecord

export const trpcRouter = createTRPCRouter({
  museums: museumsRouter,
  categories: categoriesRouter,
})

export type TRPCRouter = typeof trpcRouter

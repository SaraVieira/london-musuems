import {
  pgTable,
  text,
  doublePrecision,
  jsonb,
  date,
} from 'drizzle-orm/pg-core'

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
})

export type HoursWindow = [number, number]
export type Hours = Record<string, HoursWindow>

export const museums = pgTable('museums', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  website: text('website'),
  address: text('address'),
  postcode: text('postcode'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  borough: text('borough'),
  admission: text('admission'),
  price: doublePrecision('price'),
  priceText: text('price_text'),
  category: text('category').references(() => categories.id),
  description: text('description'),
  openingHours: text('opening_hours'),
  hours: jsonb('hours').$type<Hours | null>(),
  hoursSource: text('hours_source'),
  note: text('note'),
  lastVerified: date('last_verified'),
  sourceUrl: text('source_url'),
})

export type Museum = typeof museums.$inferSelect
export type Category = typeof categories.$inferSelect

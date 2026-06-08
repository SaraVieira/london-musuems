import { config } from 'dotenv'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import * as schema from '../src/db/schema.ts'

config({ path: ['.env.local', '.env'] })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, '..', 'src', 'data')

type CategoryJson = {
  id: string
  name: string
  description: string
}

type MuseumJson = {
  id: string
  name: string
  website?: string
  address?: string
  postcode?: string
  latitude?: number
  longitude?: number
  borough?: string
  admission?: string
  price?: number | null
  price_text?: string
  category?: string
  description?: string
  opening_hours?: string
  hours?: Record<string, Array<number>> | null
  hours_source?: string
  note?: string
  last_verified?: string
  source_url?: string
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false })
  const db = drizzle(client, { schema })

  const categoriesJson: Array<CategoryJson> = JSON.parse(
    await readFile(join(DATA, 'categories.json'), 'utf8'),
  )
  const museumsJson: Array<MuseumJson> = JSON.parse(
    await readFile(join(DATA, 'museums.json'), 'utf8'),
  )

  console.log(`seeding ${categoriesJson.length} categories...`)
  await db
    .insert(schema.categories)
    .values(categoriesJson)
    .onConflictDoUpdate({
      target: schema.categories.id,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
      },
    })

  const rows = museumsJson.map((m) => ({
    id: m.id,
    name: m.name,
    website: m.website ?? null,
    address: m.address ?? null,
    postcode: m.postcode ?? null,
    latitude: typeof m.latitude === 'number' ? m.latitude : null,
    longitude: typeof m.longitude === 'number' ? m.longitude : null,
    borough: m.borough ?? null,
    admission: m.admission ?? null,
    price: typeof m.price === 'number' ? m.price : null,
    priceText: m.price_text ?? null,
    category: m.category ?? null,
    description: m.description ?? null,
    openingHours: m.opening_hours ?? null,
    hours: (m.hours as schema.Hours | null) ?? null,
    hoursSource: m.hours_source ?? null,
    note: m.note ?? null,
    lastVerified: m.last_verified ?? null,
    sourceUrl: m.source_url ?? null,
  }))

  console.log(`seeding ${rows.length} museums...`)
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    await db
      .insert(schema.museums)
      .values(chunk)
      .onConflictDoUpdate({
        target: schema.museums.id,
        set: {
          name: sql`excluded.name`,
          website: sql`excluded.website`,
          address: sql`excluded.address`,
          postcode: sql`excluded.postcode`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          borough: sql`excluded.borough`,
          admission: sql`excluded.admission`,
          price: sql`excluded.price`,
          priceText: sql`excluded.price_text`,
          category: sql`excluded.category`,
          description: sql`excluded.description`,
          openingHours: sql`excluded.opening_hours`,
          hours: sql`excluded.hours`,
          hoursSource: sql`excluded.hours_source`,
          note: sql`excluded.note`,
          lastVerified: sql`excluded.last_verified`,
          sourceUrl: sql`excluded.source_url`,
        },
      })
  }

  console.log('done.')
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

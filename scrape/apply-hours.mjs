// Adds the structured `hours` field to every museum in ../src/data/museums.json
// by parsing its `opening_hours` string. Idempotent — safe to re-run.
//   hours = { 0:[open,close], ... }  0=Mon … 6=Sun, 24h decimal, closed days omitted.
//   hours = null when the string has no clear numeric pattern (e.g. "By appointment").
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseOpeningHours } from './parse-hours.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PATH = join(__dirname, '..', 'src', 'data', 'museums.json')
const GEO_PATH = join(__dirname, 'geo.json')

const ORDER = [
  'id', 'name', 'website', 'address', 'postcode', 'latitude', 'longitude',
  'borough', 'admission', 'price', 'price_text', 'category', 'description',
  'opening_hours', 'hours', 'hours_source', 'note', 'last_verified', 'source_url',
]

// postcode -> [lat, lng], geocoded via postcodes.io
let geo = {}
try {
  geo = JSON.parse(await readFile(GEO_PATH, 'utf8'))
} catch {}

const museums = JSON.parse(await readFile(PATH, 'utf8'))
let ok = 0
let geocoded = 0
const nulls = []
for (const m of museums) {
  const h = parseOpeningHours(m.opening_hours)
  m.hours = h
  if (h) ok++
  else nulls.push(`${m.id} :: ${m.opening_hours}`)
  // latitude / longitude from postcode
  if (m.postcode && geo[m.postcode]) {
    m.latitude = geo[m.postcode][0]
    m.longitude = geo[m.postcode][1]
    geocoded++
  }
}
console.log(`geocoded: ${geocoded}/${museums.length}`)
const ordered = museums.map((m) => {
  const o = {}
  for (const k of ORDER) if (k in m) o[k] = m[k]
  for (const k of Object.keys(m)) if (!(k in o)) o[k] = m[k]
  return o
})
await writeFile(PATH, JSON.stringify(ordered, null, 2) + '\n')
console.log(`structured hours: ${ok}/${museums.length}`)
if (process.argv.includes('--show-nulls')) console.log(nulls.join('\n'))

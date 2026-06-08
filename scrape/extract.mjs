// Extraction helpers for the museum scraper.
// Pure functions so they can be unit-tested without a browser.

const DAY_MAP = {
  monday: 'Mon', mon: 'Mon', mo: 'Mon',
  tuesday: 'Tue', tue: 'Tue', tues: 'Tue', tu: 'Tue',
  wednesday: 'Wed', wed: 'Wed', we: 'Wed',
  thursday: 'Thu', thu: 'Thu', thurs: 'Thu', th: 'Thu',
  friday: 'Fri', fri: 'Fri', fr: 'Fri',
  saturday: 'Sat', sat: 'Sat', sa: 'Sat',
  sunday: 'Sun', sun: 'Sun', su: 'Sun',
}

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function normDay(token) {
  if (!token) return null
  const key = String(token).trim().toLowerCase().replace(/\.$/, '')
  // schema.org uses URLs like http://schema.org/Monday
  const tail = key.split('/').pop()
  return DAY_MAP[tail] ?? DAY_MAP[key] ?? null
}

function normTime(t) {
  if (!t) return null
  const m = String(t).trim().match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!m) return String(t).trim()
  const hh = m[1].padStart(2, '0')
  const mm = m[2] ?? '00'
  return `${hh}:${mm}`
}

// --- JSON-LD --------------------------------------------------------------

// Walk an arbitrarily nested JSON-LD blob and collect any object that looks
// like it carries opening hours or an offer/price.
function* walkJsonLd(node) {
  if (Array.isArray(node)) {
    for (const n of node) yield* walkJsonLd(n)
  } else if (node && typeof node === 'object') {
    yield node
    for (const v of Object.values(node)) yield* walkJsonLd(v)
  }
}

export function hoursFromJsonLd(jsonLdBlobs) {
  for (const blob of jsonLdBlobs) {
    for (const obj of walkJsonLd(blob)) {
      // 1. openingHoursSpecification (preferred — structured)
      const spec = obj.openingHoursSpecification
      if (spec) {
        const arr = Array.isArray(spec) ? spec : [spec]
        const parts = []
        for (const s of arr) {
          const days = [].concat(s.dayOfWeek ?? []).map(normDay).filter(Boolean)
          const opens = normTime(s.opens)
          const closes = normTime(s.closes)
          if (days.length && opens && closes) {
            parts.push(`${days.join(',')} ${opens}-${closes}`)
          }
        }
        if (parts.length) return collapseHours(parts.join('; '))
      }
      // 2. openingHours string array ("Mo-Fr 10:00-17:00")
      if (obj.openingHours) {
        const arr = [].concat(obj.openingHours)
        if (arr.length) return arr.join('; ')
      }
    }
  }
  return null
}

export function priceFromJsonLd(jsonLdBlobs) {
  const prices = []
  let freeSeen = false
  for (const blob of jsonLdBlobs) {
    for (const obj of walkJsonLd(blob)) {
      const offers = obj.offers
      if (!offers) continue
      for (const o of [].concat(offers)) {
        const p = o.price ?? o.lowPrice ?? o.highPrice
        if (p != null && p !== '') {
          const n = parseFloat(String(p).replace(/[^0-9.]/g, ''))
          if (!Number.isNaN(n)) {
            if (n === 0) freeSeen = true
            else prices.push(n)
          }
        }
      }
    }
  }
  if (prices.length) {
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    return {
      price: min,
      price_text: min === max ? `£${min}` : `£${min}–£${max}`,
    }
  }
  if (freeSeen) return { price: 0, price_text: 'Free' }
  return null
}

// --- Text heuristics ------------------------------------------------------

const TIME = '\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?'
const RANGE = new RegExp(
  `(${TIME})\\s*(?:-|–|—|to|until|till)\\s*(${TIME})`,
  'i',
)

// Pull lines that mention a day-of-week and a time range.
export function hoursFromText(text) {
  if (!text) return null
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const dayWord =
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|daily|every day|mon|tue|wed|thu|fri|sat|sun)/i

  const hits = []
  for (const line of lines) {
    if (line.length > 120) continue
    if (dayWord.test(line) && RANGE.test(line)) {
      hits.push(line)
    } else if (/daily|every day/i.test(line) && RANGE.test(line)) {
      hits.push(line)
    }
    if (hits.length >= 8) break
  }
  if (!hits.length) {
    // Fallback: a bare "10am - 5pm" near the word "open".
    const m = text.match(new RegExp(`open[^\\n]{0,40}?${RANGE.source}`, 'i'))
    if (m) return m[0].replace(/\s+/g, ' ').trim()
    return null
  }
  // De-dupe while preserving order.
  return [...new Set(hits)].join(' | ').slice(0, 300)
}

export function priceFromText(text) {
  if (!text) return null
  // Adult admission lines first.
  const adultLine = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .find((l) => /adult/i.test(l) && /£\s?\d/.test(l) && l.length < 100)
  const amounts = [...text.matchAll(/£\s?(\d{1,3}(?:\.\d{2})?)/g)]
    .map((m) => parseFloat(m[1]))
    .filter((n) => !Number.isNaN(n) && n > 0 && n < 200)

  const free = /\b(free admission|free entry|admission is free|entry is free|free to (?:enter|visit))\b/i.test(
    text,
  )

  if (adultLine) {
    const m = adultLine.match(/£\s?(\d{1,3}(?:\.\d{2})?)/)
    if (m) return { price: parseFloat(m[1]), price_text: adultLine.slice(0, 120) }
  }
  if (amounts.length) {
    const min = Math.min(...amounts)
    const max = Math.max(...amounts)
    return {
      price: min,
      price_text: min === max ? `£${min}` : `£${min}–£${max}`,
    }
  }
  if (free) return { price: 0, price_text: 'Free' }
  return null
}

// --- Formatting -----------------------------------------------------------

// Collapse "Mon 10:00-17:00; Tue 10:00-17:00; ..." into ranges where the
// times are identical, e.g. "Mon-Fri 10:00-17:00".
export function collapseHours(str) {
  if (!str) return str
  const entries = str.split(';').map((s) => s.trim()).filter(Boolean)
  const dayToTime = {}
  for (const e of entries) {
    const m = e.match(/^([A-Za-z,]+)\s+(.+)$/)
    if (!m) return str // not in expected shape, leave as-is
    const days = m[1].split(',').map(normDay).filter(Boolean)
    for (const d of days) dayToTime[d] = m[2]
  }
  // Group consecutive days with same time.
  const groups = []
  for (const day of DAY_ORDER) {
    const time = dayToTime[day]
    if (!time) continue
    const last = groups[groups.length - 1]
    if (last && last.time === time && DAY_ORDER.indexOf(day) === DAY_ORDER.indexOf(last.end) + 1) {
      last.end = day
    } else {
      groups.push({ start: day, end: day, time })
    }
  }
  return groups
    .map((g) => `${g.start === g.end ? g.start : `${g.start}-${g.end}`} ${g.time}`)
    .join('; ')
}

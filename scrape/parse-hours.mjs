// Parse a human "opening_hours" string into a structured map:
//   { 0:[open,close], ... }  where 0=Mon … 6=Sun, times are 24h decimal hours
//   (10.5 = 10:30, 20.5 = 20:30). Closed days are omitted.
// Returns null when no clear numeric day/time pattern is present
// (e.g. "By appointment", "Guided tours", "Check site").

const DAYNAME = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4,
  sat: 5, saturday: 5, sun: 6, sunday: 6,
}

function dayNum(tok) {
  if (!tok) return null
  const k = tok.trim().toLowerCase().replace(/[.,]/g, '').replace(/s$/, '')
  // "fridays" -> "friday" handled by trailing-s strip only for plural daynames
  return DAYNAME[k] ?? DAYNAME[k.replace(/day$/, '')] ?? null
}

// Expand a day token/range like "Mon", "Tue-Sun", "Wed–Mon", "Daily" -> [nums]
function expandDays(token) {
  const t = token.trim().toLowerCase()
  if (/^(daily|every ?day|open daily|7 days)$/.test(t)) return [0, 1, 2, 3, 4, 5, 6]
  const range = t.split(/\s*(?:–|—|-|to)\s*/)
  if (range.length === 2) {
    const a = dayNum(range[0])
    const b = dayNum(range[1])
    if (a != null && b != null) {
      const out = []
      let i = a
      for (let n = 0; n < 7; n++) {
        out.push(i)
        if (i === b) break
        i = (i + 1) % 7
      }
      return out
    }
  }
  const single = dayNum(t)
  return single != null ? [single] : null
}

// "10:00", "10.30", "5pm", "20.30", "9.30am" -> decimal hours
function parseTime(raw) {
  if (!raw) return null
  let s = raw.trim().toLowerCase()
  const pm = /pm/.test(s)
  const am = /am/.test(s)
  s = s.replace(/[apm.\s]*$/i, (m) => (/(am|pm)/.test(m) ? '' : m)).replace(/(am|pm)/g, '')
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?$/)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  if (pm && h < 12) h += 12
  if (am && h === 12) h = 0
  let val = h + min / 60
  return Math.round(val * 100) / 100
}

const TIME = '\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?'
const RANGE_RE = new RegExp(`(${TIME})\\s*(?:–|—|-|to|until|till)\\s*(${TIME})`, 'i')

export function parseOpeningHours(str) {
  if (!str || typeof str !== 'string') return null
  // Strip parenthetical notes but remember per-day overrides like
  // "(Fri until 21:00)", "(Fridays: 20.30)", "(Sun from 11:00)".
  const overrides = []
  const noteRe = /\(([^)]*)\)/g
  let mm
  while ((mm = noteRe.exec(str))) {
    const inner = mm[1]
    // day + single time  e.g. "Fri until 21:00", "Fridays: 20.30"
    const dm = inner.match(
      /(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*(?:until|till|to|:|from)?\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)/i,
    )
    if (dm) {
      const d = dayNum(dm[1])
      const t = parseTime(dm[2])
      const kind = /from/i.test(inner) ? 'open' : 'close'
      if (d != null && t != null) overrides.push({ d, t, kind })
    }
  }
  const clean = str.replace(/\([^)]*\)/g, ' ')

  const map = {}
  // Split into segments on ';' or ' and ' (each "Days time-time")
  const segments = clean.split(/[;]+/)
  for (const seg of segments) {
    const rm = seg.match(RANGE_RE)
    if (!rm) continue
    const open = parseTime(rm[1])
    const close = parseTime(rm[2])
    if (open == null || close == null) continue
    // Day part is everything before the time range.
    const dayPart = seg.slice(0, rm.index).trim().replace(/:/g, ' ')
    // Could be a list like "Wed, Sat & Sun" or a range "Tue-Sun" or "Daily".
    const tokens = dayPart.split(/\s*(?:,|&|\band\b|\+)\s*/).filter(Boolean)
    let days = []
    if (!tokens.length) continue
    // Each token is a range/daily, a single day, or whitespace-separated days.
    for (const tk of tokens) {
      let ex = expandDays(tk)
      if (!ex && /\s/.test(tk)) {
        // e.g. "Wed Sat Sun" — map each whitespace-separated day.
        ex = tk.split(/\s+/).map((d) => dayNum(d)).filter((n) => n != null)
        if (!ex.length) ex = null
      }
      if (ex) days.push(...ex)
    }
    days = [...new Set(days)]
    for (const d of days) map[d] = [open, close]
  }
  // apply overrides
  for (const o of overrides) {
    if (map[o.d]) {
      if (o.kind === 'close') map[o.d] = [map[o.d][0], o.t]
      else map[o.d] = [o.t, map[o.d][1]]
    }
  }
  return Object.keys(map).length ? map : null
}

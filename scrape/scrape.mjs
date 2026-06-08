#!/usr/bin/env node
/**
 * Config-driven Playwright scraper for London museum opening hours + prices.
 *
 * For every museum in ../src/data/museums.json it:
 *   1. Opens a page (config override URL, else the museum's `website`).
 *   2. Extracts opening hours + admission price using a layered strategy:
 *        a. per-museum CSS selectors from config.json   (most reliable)
 *        b. schema.org JSON-LD (openingHoursSpecification / offers)
 *        c. generic regex heuristics over the visible text
 *   3. Also captures the page <title> and meta description.
 *
 * Results are written to ./output/results.json (always). With --merge the
 * scraped opening_hours / price / price_text are written back into
 * ../src/data/museums.json (descriptions are only filled when missing).
 *
 * Usage:
 *   node scrape.mjs                       # scrape all, write report only
 *   node scrape.mjs --merge               # scrape all + update museums.json
 *   node scrape.mjs --ids tate-modern,science-museum
 *   node scrape.mjs --limit 10            # first 10 (handy for testing)
 *   node scrape.mjs --concurrency 6
 *   node scrape.mjs --report-only         # alias: never touch museums.json
 */
import { chromium } from 'playwright'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  hoursFromJsonLd,
  priceFromJsonLd,
  hoursFromText,
  priceFromText,
} from './extract.mjs'
import { parseOpeningHours } from './parse-hours.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MUSEUMS_PATH = join(__dirname, '..', 'src', 'data', 'museums.json')
const CONFIG_PATH = join(__dirname, 'config.json')
const OUTPUT_DIR = join(__dirname, 'output')

// ---- args ----------------------------------------------------------------
function parseArgs(argv) {
  const args = { merge: false, concurrency: 5, limit: 0, ids: null, timeout: 30000 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--merge') args.merge = true
    else if (a === '--report-only') args.merge = false
    else if (a === '--concurrency') args.concurrency = Number(argv[++i])
    else if (a === '--limit') args.limit = Number(argv[++i])
    else if (a === '--timeout') args.timeout = Number(argv[++i])
    else if (a === '--ids') args.ids = argv[++i].split(',').map((s) => s.trim())
  }
  return args
}

// ---- in-page extraction ---------------------------------------------------
// Runs in the browser context: grabs structured data + text we need.
function pagePayload() {
  const jsonLd = []
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      jsonLd.push(JSON.parse(s.textContent))
    } catch {
      /* ignore malformed blobs */
    }
  })
  const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null
  return {
    jsonLd,
    title: document.title || null,
    metaDescription:
      meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    bodyText: document.body ? document.body.innerText : '',
  }
}

async function selectorText(page, selector) {
  if (!selector) return null
  try {
    const el = await page.$(selector)
    if (!el) return null
    const t = (await el.innerText())?.replace(/\s+/g, ' ').trim()
    return t || null
  } catch {
    return null
  }
}

async function scrapeOne(context, museum, conf, timeout) {
  const url = conf?.url || museum.website
  const result = {
    id: museum.id,
    name: museum.name,
    url,
    opening_hours: null,
    price: null,
    price_text: null,
    meta_description: null,
    title: null,
    source: [], // which strategies produced data
    ok: false,
    error: null,
  }
  if (conf?.skip) {
    result.error = 'skipped (config)'
    return result
  }
  if (!url) {
    result.error = 'no url'
    return result
  }

  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    await page.waitForTimeout(1200) // let late hydration settle

    // (a) selector overrides
    if (conf?.selectors?.hours) {
      const t = await selectorText(page, conf.selectors.hours)
      if (t) {
        result.opening_hours = t.slice(0, 300)
        result.source.push('selector')
      }
    }
    if (conf?.selectors?.price) {
      const t = await selectorText(page, conf.selectors.price)
      if (t) {
        const p = priceFromText(t)
        if (p) {
          result.price = p.price
          result.price_text = p.price_text
          result.source.push('selector')
        }
      }
    }

    const payload = await page.evaluate(pagePayload)
    result.title = payload.title
    result.meta_description = payload.metaDescription

    // (b) JSON-LD
    if (!result.opening_hours) {
      const h = hoursFromJsonLd(payload.jsonLd)
      if (h) {
        result.opening_hours = h
        result.source.push('jsonld')
      }
    }
    if (result.price == null) {
      const p = priceFromJsonLd(payload.jsonLd)
      if (p) {
        result.price = p.price
        result.price_text = p.price_text
        result.source.push('jsonld')
      }
    }

    // (c) text heuristics
    if (!result.opening_hours) {
      const h = hoursFromText(payload.bodyText)
      if (h) {
        result.opening_hours = h
        result.source.push('text')
      }
    }
    if (result.price == null) {
      const p = priceFromText(payload.bodyText)
      if (p) {
        result.price = p.price
        result.price_text = p.price_text
        result.source.push('text')
      }
    }

    result.ok = Boolean(result.opening_hours || result.price != null)
  } catch (err) {
    result.error = String(err.message || err).split('\n')[0].slice(0, 200)
  } finally {
    await page.close().catch(() => {})
  }
  return result
}

// ---- simple promise pool ---------------------------------------------------
async function runPool(items, size, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const museums = JSON.parse(await readFile(MUSEUMS_PATH, 'utf8'))
  let config = {}
  try {
    config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'))
  } catch {
    console.warn('No config.json found — using website URLs + heuristics only.')
  }

  let targets = museums
  if (args.ids) targets = museums.filter((m) => args.ids.includes(m.id))
  if (args.limit) targets = targets.slice(0, args.limit)

  console.log(
    `Scraping ${targets.length} museum(s) · concurrency=${args.concurrency} · merge=${args.merge}`,
  )

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 (london-museums-scraper; +contact@example.com)',
    viewport: { width: 1280, height: 1600 },
  })
  // Block heavy assets for speed.
  await context.route('**/*', (route) => {
    const t = route.request().resourceType()
    if (t === 'image' || t === 'media' || t === 'font') return route.abort()
    return route.continue()
  })

  const started = Date.now()
  const results = await runPool(targets, args.concurrency, async (m, i) => {
    const r = await scrapeOne(context, m, config[m.id], args.timeout)
    const flag = r.ok ? 'ok ' : r.error ? 'ERR' : '— '
    console.log(`[${i + 1}/${targets.length}] ${flag} ${m.id}`)
    return r
  })

  await browser.close()

  await mkdir(OUTPUT_DIR, { recursive: true })
  const reportPath = join(OUTPUT_DIR, 'results.json')
  await writeFile(reportPath, JSON.stringify(results, null, 2))

  const okCount = results.filter((r) => r.ok).length
  console.log(
    `\nDone in ${((Date.now() - started) / 1000).toFixed(0)}s · ` +
      `${okCount}/${results.length} produced data · report: ${reportPath}`,
  )

  if (args.merge) {
    const byId = new Map(results.map((r) => [r.id, r]))
    let touched = 0
    for (const m of museums) {
      const r = byId.get(m.id)
      if (!r || !r.ok) continue
      if (r.opening_hours) {
        m.opening_hours = r.opening_hours
        m.hours = parseOpeningHours(r.opening_hours)
      }
      if (r.price != null) {
        m.price = r.price
        m.price_text = r.price_text
      }
      if (!m.description && r.meta_description) m.description = r.meta_description
      m.last_verified = new Date().toISOString().slice(0, 10)
      m.source_url = r.url
      touched++
    }
    await writeFile(MUSEUMS_PATH, JSON.stringify(museums, null, 2) + '\n')
    console.log(`Merged scraped data into ${touched} museum record(s) in museums.json`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

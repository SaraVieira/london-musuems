import { createFileRoute } from '@tanstack/react-router'

const UPSTREAM = 'https://tiles.stadiamaps.com'
const STYLE_PATH = '/styles/stamen_toner_lite.json'

function getKey() {
  const key = process.env.STADIA_KEY
  if (!key) throw new Error('STADIA_KEY is not set')
  return key
}

function withKey(url: URL): URL {
  url.searchParams.set('api_key', getKey())
  return url
}

function rewriteStadiaUrl(value: unknown, origin: string): unknown {
  if (typeof value === 'string' && value.startsWith(UPSTREAM)) {
    const stripped = value.slice(UPSTREAM.length).split('?')[0]
    return `${origin}/api/map${stripped}`
  }
  if (Array.isArray(value)) return value.map((v) => rewriteStadiaUrl(v, origin))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = rewriteStadiaUrl(v, origin)
    return out
  }
  return value
}

async function handler({ request, params }: { request: Request; params: { _splat?: string } }) {
  const splat = params._splat ?? ''

  if (splat === 'style.json') {
    const upstream = withKey(new URL(`${UPSTREAM}${STYLE_PATH}`))
    const res = await fetch(upstream)
    if (!res.ok) {
      return new Response(`Upstream ${res.status}`, { status: res.status })
    }
    const style = (await res.json()) as Record<string, unknown>
    const origin = new URL(request.url).origin
    const rewritten = rewriteStadiaUrl(style, origin) as Record<string, unknown>
    delete rewritten.sprite
    return new Response(JSON.stringify(rewritten), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300',
      },
    })
  }

  const incoming = new URL(request.url)
  const upstream = withKey(new URL(`${UPSTREAM}/${splat}`))
  for (const [k, v] of incoming.searchParams.entries()) {
    if (k === 'api_key') continue
    upstream.searchParams.set(k, v)
  }

  const res = await fetch(upstream, {
    headers: { accept: request.headers.get('accept') ?? '*/*' },
  })

  const headers = new Headers()
  const ct = res.headers.get('content-type')
  if (ct) headers.set('content-type', ct)
  const cc = res.headers.get('cache-control')
  headers.set('cache-control', cc ?? 'public, max-age=86400, immutable')

  return new Response(res.body, { status: res.status, headers })
}

export const Route = createFileRoute('/api/map/$')({
  server: {
    handlers: {
      GET: handler,
    },
  },
})

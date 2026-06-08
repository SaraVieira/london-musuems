import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import MuseumMap from '@/components/MuseumMap'
import MuseumList from '@/components/MuseumList'
import FilterBar, { initialFilters } from '@/components/FilterBar'
import type { Filters } from '@/components/FilterBar'
import { isOpenNow } from '@/lib/museums'
import { useTRPC } from '#/integrations/trpc/react'

export const Route = createFileRoute('/')({
  component: Home,
  loader: ({ context }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.museums.list.queryOptions(),
      ),
      context.queryClient.ensureQueryData(
        context.trpc.categories.list.queryOptions(),
      ),
    ])
  },
})

type View = 'split' | 'map' | 'list'

function Home() {
  const trpc = useTRPC()
  const { data: museums } = useSuspenseQuery(trpc.museums.list.queryOptions())
  const { data: categories } = useSuspenseQuery(
    trpc.categories.list.queryOptions(),
  )

  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('split')

  const boroughs = useMemo(
    () =>
      [...new Set(museums.map((m) => m.borough).filter((b): b is string => !!b))].sort(),
    [museums],
  )

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return museums.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q)) return false
      if (
        filters.categories.size > 0 &&
        (!m.category || !filters.categories.has(m.category))
      )
        return false
      if (filters.borough && m.borough !== filters.borough) return false
      if (filters.freeOnly && m.price !== 0) return false
      if (filters.openNow && !isOpenNow(m.hours)) return false
      return true
    })
  }, [filters, museums])

  const showMap = view !== 'list'
  const showList = view !== 'map'

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-6 sm:px-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="m-0 text-3xl font-black uppercase leading-none tracking-tight text-foreground sm:text-4xl">
            Every museum in London
          </h1>
          <p className="m-0 mt-1.5 text-sm font-bold uppercase tracking-widest text-muted-foreground">
            {museums.length} museums · filter, map, explore
          </p>
        </div>

        <div className="inline-flex border-3 border-foreground shadow-[4px_4px_0px_hsl(var(--shadow-color))]">
          {(['split', 'map', 'list'] as Array<View>).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`border-r-3 border-foreground px-3 py-2 text-xs font-black uppercase tracking-widest transition-colors last:border-r-0 ${
                view === v
                  ? 'bg-foreground text-background'
                  : 'bg-background text-foreground hover:bg-muted'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`grid gap-4 ${
          view === 'split' ? 'lg:grid-cols-[1fr_420px]' : 'lg:grid-cols-1'
        }`}
      >
        {showMap ? (
          <div
            className={`order-2 lg:order-1 ${
              view === 'map'
                ? 'h-[calc(100vh-220px)]'
                : 'h-[420px] lg:h-[calc(100vh-200px)]'
            } lg:sticky lg:top-24`}
          >
            <MuseumMap
              museums={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        ) : null}

        {showList ? (
          <div className="order-1 flex flex-col gap-4 lg:order-2">
            <FilterBar
              filters={filters}
              setFilters={setFilters}
              resultCount={filtered.length}
              totalCount={museums.length}
              categories={categories}
              boroughs={boroughs}
            />
            <div
              className={`${
                view === 'list'
                  ? ''
                  : 'lg:max-h-[calc(100vh-360px)] lg:overflow-y-auto lg:pr-2'
              }`}
            >
              <MuseumList
                museums={filtered}
                categories={categories}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}

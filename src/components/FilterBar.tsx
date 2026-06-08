import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import type { Category } from '@/db/schema'

export type Filters = {
  search: string
  categories: Set<string>
  borough: string
  freeOnly: boolean
  openNow: boolean
}

export const initialFilters: Filters = {
  search: '',
  categories: new Set<string>(),
  borough: '',
  freeOnly: false,
  openNow: false,
}

type Props = {
  filters: Filters
  setFilters: (f: Filters) => void
  resultCount: number
  totalCount: number
  categories: Array<Category>
  boroughs: Array<string>
}

export default function FilterBar({
  filters,
  setFilters,
  resultCount,
  totalCount,
  categories,
  boroughs,
}: Props) {
  const activeCount = useMemo(() => {
    let n = 0
    if (filters.search) n++
    n += filters.categories.size
    if (filters.borough) n++
    if (filters.freeOnly) n++
    if (filters.openNow) n++
    return n
  }, [filters])

  function toggleCategory(id: string) {
    const next = new Set(filters.categories)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setFilters({ ...filters, categories: next })
  }

  function reset() {
    setFilters(initialFilters)
  }

  return (
    <div className="flex flex-col gap-4 border-3 border-foreground bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-xs font-black uppercase tracking-widest text-foreground">
          {resultCount} of {totalCount} museums
        </p>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={reset}
            className="border-2 border-foreground bg-destructive px-2 py-1 text-[10px] font-black uppercase tracking-widest text-destructive-foreground transition-all hover:translate-x-0.5 hover:translate-y-0.5"
          >
            Clear {activeCount}
          </button>
        ) : null}
      </div>

      <Input
        type="search"
        placeholder="Search by name..."
        value={filters.search}
        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
      />

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const active = filters.categories.has(c.id)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCategory(c.id)}
              className={`border-2 border-foreground px-2.5 py-1 text-[11px] font-black uppercase tracking-wide transition-all hover:translate-x-0.5 hover:translate-y-0.5 ${
                active
                  ? 'bg-primary text-primary-foreground shadow-[2px_2px_0px_hsl(var(--shadow-color))]'
                  : 'bg-background text-foreground'
              }`}
            >
              {c.name}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Borough
          </span>
          <select
            value={filters.borough}
            onChange={(e) => setFilters({ ...filters, borough: e.target.value })}
            className="h-10 border-3 border-foreground bg-background px-2 text-sm font-bold text-foreground shadow-[3px_3px_0px_hsl(var(--shadow-color))] focus:outline-none"
          >
            <option value="">All boroughs</option>
            {boroughs.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Quick filters
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilters({ ...filters, freeOnly: !filters.freeOnly })}
              className={`border-2 border-foreground px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide transition-all hover:translate-x-0.5 hover:translate-y-0.5 ${
                filters.freeOnly
                  ? 'bg-accent text-accent-foreground shadow-[2px_2px_0px_hsl(var(--shadow-color))]'
                  : 'bg-background text-foreground'
              }`}
            >
              Free
            </button>
            <button
              type="button"
              onClick={() => setFilters({ ...filters, openNow: !filters.openNow })}
              className={`border-2 border-foreground px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide transition-all hover:translate-x-0.5 hover:translate-y-0.5 ${
                filters.openNow
                  ? 'bg-accent text-accent-foreground shadow-[2px_2px_0px_hsl(var(--shadow-color))]'
                  : 'bg-background text-foreground'
              }`}
            >
              Open now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

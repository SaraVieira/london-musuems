import { useEffect, useMemo, useRef } from 'react'
import type { Category } from '@/db/schema'
import type { Museum } from '@/lib/museums'
import { isOpenNow } from '@/lib/museums'

type Props = {
  museums: Array<Museum>
  categories: Array<Category>
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function MuseumList({
  museums,
  categories,
  selectedId,
  onSelect,
}: Props) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>())
  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  )

  useEffect(() => {
    if (!selectedId) return
    const el = itemRefs.current.get(selectedId)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedId])

  if (museums.length === 0) {
    return (
      <div className="border-3 border-foreground bg-background p-8 text-center">
        <p className="m-0 text-sm font-black uppercase tracking-widest text-foreground">
          No museums match these filters
        </p>
      </div>
    )
  }

  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0">
      {museums.map((m) => {
        const open = isOpenNow(m.hours)
        const selected = m.id === selectedId
        const catLabel = m.category
          ? (categoryName.get(m.category) ?? m.category)
          : null
        return (
          <li
            key={m.id}
            ref={(el) => {
              if (el) itemRefs.current.set(m.id, el)
              else itemRefs.current.delete(m.id)
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(m.id)}
              className={`block w-full border-3 border-foreground p-4 text-left transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none ${
                selected
                  ? 'bg-accent text-accent-foreground translate-x-1 translate-y-1 shadow-none'
                  : 'bg-background text-foreground shadow-[4px_4px_0px_hsl(var(--shadow-color))]'
              }`}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
                {m.borough ? (
                  <span className="border-2 border-foreground bg-background px-1.5 py-0.5 text-foreground">
                    {m.borough}
                  </span>
                ) : null}
                {catLabel ? (
                  <span className="border-2 border-foreground bg-background px-1.5 py-0.5 text-foreground">
                    {catLabel}
                  </span>
                ) : null}
                {m.price === 0 ? (
                  <span className="border-2 border-foreground bg-primary px-1.5 py-0.5 text-primary-foreground">
                    Free
                  </span>
                ) : m.priceText ? (
                  <span className="border-2 border-foreground bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                    {m.priceText}
                  </span>
                ) : null}
                {open ? (
                  <span className="border-2 border-foreground bg-success px-1.5 py-0.5 text-success-foreground">
                    Open
                  </span>
                ) : null}
              </div>
              <p className="m-0 text-base font-black uppercase leading-tight tracking-tight">
                {m.name}
              </p>
              {m.description ? (
                <p className="m-0 mt-1 line-clamp-2 text-sm font-medium">
                  {m.description}
                </p>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

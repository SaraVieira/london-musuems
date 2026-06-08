import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b-4 border-foreground bg-background">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-3 no-underline"
          aria-label="London Museums home"
        >
          <span className="grid h-10 w-10 place-items-center border-3 border-foreground bg-primary text-primary-foreground shadow-[4px_4px_0px_hsl(var(--shadow-color))]">
            <span className="text-lg font-black">LM</span>
          </span>
          <span className="text-xl font-black uppercase tracking-tight text-foreground">
            London Museums
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="https://github.com/SaraVieira/london-musuems"
            target="_blank"
            rel="noreferrer"
            className="hidden border-3 border-foreground bg-background px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground no-underline shadow-[4px_4px_0px_hsl(var(--shadow-color))] transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none sm:inline-block"
          >
            Source
          </a>
        </div>
      </nav>
    </header>
  )
}

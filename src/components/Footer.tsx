export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-24 border-t-4 border-foreground bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-3 px-4 py-8 text-sm font-bold uppercase tracking-wide text-foreground sm:flex-row sm:items-center sm:px-6">
        <p className="m-0">© {year} London Museums</p>
        <p className="m-0">Built in London · No cookies, no tracking</p>
      </div>
    </footer>
  )
}

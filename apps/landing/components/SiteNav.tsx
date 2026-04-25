import Link from "next/link"

interface Props {
  variant?: "home" | "content"
}

export function SiteNav({ variant = "content" }: Props) {
  const isHome = variant === "home"

  return (
    <header
      className={[
        "z-50 border-b border-border bg-bg/90 backdrop-blur-md",
        isHome ? "fixed top-0 left-0 right-0" : "sticky top-0",
      ].join(" ")}
    >
      <div
        className={[
          "mx-auto px-6 sm:px-8 flex items-center justify-between",
          isHome ? "max-w-5xl h-20" : "max-w-3xl h-14",
        ].join(" ")}
      >
        <Link href="/" className={`font-serif text-ink ${isHome ? "text-lg" : "text-xl"}`}>
          Trana
        </Link>

        <nav className="flex items-center gap-6 sm:gap-8 text-sm text-muted">
          <Link href="/docs/quickstart" className="hover:text-ink transition-colors">
            Resources
          </Link>
          <Link href="/protocol" className="hover:text-ink transition-colors hidden sm:block">
            Protocol
          </Link>
          <a
            href="https://github.com/beharefe/trana-guard"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink transition-colors"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}

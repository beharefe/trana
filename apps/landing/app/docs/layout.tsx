import type { ReactNode } from "react"
import type { PageMapItem } from "nextra"
import { Footer, Layout, Navbar } from "nextra-theme-docs"
import "nextra-theme-docs/style.css"
import { TranaWordmark } from "@/components/Logo"

type ThemePageMapItem = PageMapItem & { title: string }

const pageMap: ThemePageMapItem[] = [
  { name: "index", route: "/docs", title: "How it works", frontMatter: { title: "How it works" } },
  { name: "quickstart", route: "/docs/quickstart", title: "Quickstart", frontMatter: { title: "Quickstart" } },
  { name: "sdk", route: "/docs/sdk", title: "SDK Reference", frontMatter: { title: "SDK Reference" } },
  { name: "integration", route: "/docs/integration", title: "Integration", frontMatter: { title: "Integration" } },
  { name: "architecture", route: "/docs/architecture", title: "Architecture", frontMatter: { title: "Architecture" } },
  { name: "glossary", route: "/docs/glossary", title: "Glossary", frontMatter: { title: "Glossary" } },
]

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <Layout
      nextThemes={{ forcedTheme: "dark" }}
      navbar={
        <Navbar
          logo={<TranaWordmark size="22px" />}
          projectLink="https://github.com/beharefe/trana"
        >
          <a
            href="https://trana.so/try"
            className="font-mono text-[11.5px] tracking-[0.14em] uppercase font-semibold"
            style={{ color: "var(--lime)" }}
          >
            /try
          </a>
        </Navbar>
      }
      pageMap={pageMap}
      editLink={null}
      feedback={{ content: null }}
      copyPageButton={false}
      toc={{ float: true }}
      footer={<Footer>© 2026 Trana Guard</Footer>}
      sidebar={{ defaultMenuCollapseLevel: 1 }}
    >
      {children}
    </Layout>
  )
}

import type { ReactNode } from "react"
import { Footer, Layout, Navbar } from "nextra-theme-docs"
import { getPageMap } from "nextra/page-map"
import "nextra-theme-docs/style.css"
import { TranaWordmark } from "@/components/Logo"

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const pageMap = await getPageMap("/docs")
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

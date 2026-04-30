import type { ReactNode } from "react"
import { Footer, Layout, Navbar } from "nextra-theme-docs"
import { getPageMap } from "nextra/page-map"
import "nextra-theme-docs/style.css"

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const pageMap = await getPageMap("/docs")
  return (
    <Layout
      nextThemes={{ forcedTheme: "dark" }}
      navbar={
        <Navbar
          logo={<span style={{ fontWeight: 700, letterSpacing: "-0.02em" }}>Trana</span>}
        />
      }
      pageMap={pageMap}
      docsRepositoryBase="https://github.com/beharefe/trana"
      footer={<Footer>© 2026 Trana Guard</Footer>}
      sidebar={{ defaultMenuCollapseLevel: 1 }}
    >
      {children}
    </Layout>
  )
}

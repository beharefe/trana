import type { ReactNode } from "react"
import { Footer, Layout, Navbar } from "nextra-theme-docs"
import { getPageMap } from "nextra/page-map"
import "nextra-theme-docs/style.css"

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const pageMap = await getPageMap("/docs")
  return (
    <Layout
      navbar={
        <Navbar
          logo={
            <span style={{ fontWeight: 600, fontFamily: "var(--font-inter)" }}>
              Trana
            </span>
          }
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

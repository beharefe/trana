import type { ReactNode } from "react"
import { Footer, Layout, Navbar } from "nextra-theme-docs"
import { getPageMap } from "nextra/page-map"

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const pageMap = await getPageMap()
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

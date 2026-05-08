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
        />
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

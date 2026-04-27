import type { ReactNode } from 'react'
import { Inter, DM_Serif_Display } from 'next/font/google'
import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['300', '400', '500', '600'],
})

const serif = DM_Serif_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  weight: '400',
  style: ['normal', 'italic'],
})

export const metadata = {
  title: { template: '%s — Trana Docs' },
  description: 'Trana Guard documentation — WebAuthn second-factor authorization for Solana programs.',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pageMap = await getPageMap()
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={
            <Navbar
              logo={
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-inter)' }}>
                  Trana
                </span>
              }
            />
          }
          pageMap={pageMap}
          docsRepositoryBase="https://github.com/beharefe/trana"
          footer={<Footer>© {new Date().getFullYear()} Trana Guard</Footer>}
          sidebar={{ defaultMenuCollapseLevel: 1 }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}

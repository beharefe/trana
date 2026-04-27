import nextra from 'nextra'
import type { NextConfig } from 'next'

const withNextra = nextra({
  contentDirBasePath: '/docs',
})

const config: NextConfig = {
  reactStrictMode: true,
}

export default withNextra(config)

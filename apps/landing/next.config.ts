import type { NextConfig } from "next"
import nextra from "nextra"

const withNextra = nextra({
  contentDirBasePath: "/docs",
})

const config: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  async redirects() {
    return [
      {
        source:      "/docs/try-it-live",
        destination: "/docs/try-it-live/deposit",
        permanent:   false,
      },
    ]
  },
}

export default withNextra(config)

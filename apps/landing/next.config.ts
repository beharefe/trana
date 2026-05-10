import type { NextConfig } from "next"
import nextra from "nextra"

const withNextra = nextra({
  contentDirBasePath: "/docs",
})

const config: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
}

export default withNextra(config)

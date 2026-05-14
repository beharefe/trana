import type { NextConfig } from "next"
import nextra from "nextra"

const withNextra = nextra({
  contentDirBasePath: "/docs",
})

const config: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  transpilePackages: [
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@beharefe/sdk",
  ],
  async redirects() {
    if (process.env.NODE_ENV !== "production") return []
    return [
      {
        // Strip accidental /docs prefix on docs subdomain
        source: "/docs/:path*",
        has: [{ type: "host", value: "docs.trana.so" }],
        destination: "/:path*",
        permanent: false,
      },
      {
        // Main domain: /docs → docs subdomain
        source: "/docs/:path*",
        has: [{ type: "host", value: "trana.so" }],
        destination: "https://docs.trana.so/:path*",
        statusCode: 301,
      },
    ]
  },
}

export default withNextra(config)

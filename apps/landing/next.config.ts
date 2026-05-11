import path from "path"
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
    "@tranaprotocol/sdk",
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
  webpack(config, { isServer }) {
    if (!isServer) {
      // react-modal (from wallet-adapter) hoisted react-dom@16 to the root which
      // breaks Next.js's react-dom/client import. Point the client bundle at the
      // local react-dom@19 copy instead. Do NOT alias on the server — RSC needs
      // the react-server conditions that come from Next's own resolution.
      config.resolve.alias["react-dom"] = path.resolve(__dirname, "node_modules/react-dom")
    }
    return config
  },
}

export default withNextra(config)

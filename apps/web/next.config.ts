import type { NextConfig } from "next"

const config: NextConfig = {
  transpilePackages: ["@solana/wallet-adapter-react-ui"],
  // Silence Turbopack warning when webpack config is present (Next.js 16+)
  turbopack: {},
  webpack: (config) => {
    // Required for @solana/web3.js in Next.js
    config.externals = [...(config.externals ?? []), { bufferutil: "bufferutil", "utf-8-validate": "utf-8-validate" }]
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
    }
    return config
  },
}

export default config

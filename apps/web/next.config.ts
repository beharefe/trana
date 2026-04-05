import type { NextConfig } from "next"

const config: NextConfig = {
  // Wallet adapter requires some transpilation
  transpilePackages: ["@solana/wallet-adapter-react-ui"],
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

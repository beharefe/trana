import path from "path";
import type { NextConfig } from "next";
import nextra from "nextra";

const withNextra = nextra({
  contentDirBasePath: "/docs",
});

const config: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  transpilePackages: [
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@tranaprotocol/sdk",
  ],
  webpack(config, { isServer }) {
    if (!isServer) {
      // Ensure the client bundle resolves react-dom from the workspace root,
      // not from a nested copy that wallet-adapter may bring in.
      config.resolve.alias["react-dom"] = path.dirname(require.resolve("react-dom/package.json"));
    }
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "try.devnet.trana.so",
          },
        ],
        destination: "/try/:path*",
      },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "docs.trana.so",
          },
        ],
        destination: "/docs/:path*",
      },
    ];
  },
  redirects:
    process.env.NODE_ENV === "production"
      ? async () => {
          return Promise.resolve([
            {
              source: "/try/:path*",
              destination: "/:path*",
              permanent: false,
            },
            {
              source: "/docs/:path*",
              destination: "/:path*",
              permanent: false,
            },
            {
              source: "/docs/:path*",
              has: [
                {
                  type: "host",
                  value: "trana.so",
                },
              ],
              destination: "https://docs.trana.so/:path*",
              statusCode: 301,
            },
            {
              source: "/:path*",
              has: [
                {
                  type: "host",
                  value: "try.devnet.trana.so",
                },
              ],
              destination: "/try/:path*",
              statusCode: 301,
            },
          ]);
        }
      : () => Promise.resolve([]),
};

export default withNextra(config);

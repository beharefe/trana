import { defineConfig } from "vite";
import vinext from "vinext";
import type { VinextOptions } from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import nextConfig from "./next.config.shared";

const require = createRequire(import.meta.url);
const rpcWebSocketsBrowser = join(
  dirname(require.resolve("rpc-websockets")),
  "index.browser.mjs",
);

export default defineConfig({
  resolve: {
    // Solana web3's websocket client exposes browser and Node entry points,
    // but no dedicated workerd export. Workers provide the browser WebSocket API.
    alias: [{ find: /^rpc-websockets$/, replacement: rpcWebSocketsBrowser }],
  },
  plugins: [
    // vinext auto-injects @mdx-js/rollup with plugins from next.config
    vinext({
      // Next and vinext currently ship slightly different redirect typings.
      nextConfig: nextConfig as VinextOptions["nextConfig"],
      cache: { data: kvDataAdapter(), cdn: cdnAdapter() },
      images: { optimizer: imagesOptimizer() },
      prerender: { routes: "*" },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});

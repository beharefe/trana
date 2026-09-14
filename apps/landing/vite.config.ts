import { defineConfig } from "vite";
import vinext from "vinext";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const rpcWebSocketsBrowser = join(
  dirname(require.resolve("rpc-websockets")),
  "index.browser.mjs",
);

export default defineConfig({
  define: {
    // Nextra's client anchor module contains a harmless process.cwd() marker.
    // Replace it because browsers do not provide Node's global `process`.
    "process.cwd": "(() => '')",
  },
  resolve: {
    // Solana web3's websocket client exposes browser and Node entry points,
    // but no dedicated workerd export. Workers provide the browser WebSocket API.
    alias: [{ find: /^rpc-websockets$/, replacement: rpcWebSocketsBrowser }],
  },
  plugins: [
    mdx({ remarkPlugins: [remarkGfm] }),
    // vinext auto-injects @mdx-js/rollup with plugins from next.config
    vinext({
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

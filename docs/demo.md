# Demo and local UI

This repository does **not** ship a bundled sample integrator program. Add Trana Guard to **your** Anchor program using `INTEGRATION.md` and the snippets in `apps/landing/content/quickstart.mdx`.

For a browser demo, wire a Next.js app to `NEXT_PUBLIC_TRANA_GUARD_PROGRAM_ID` and the SDK (`@tranaprotocol/guard-sdk` / `@trana-guard/sdk`) as shown in the integration docs.

Local toolchain helpers:

- `./scripts/docker-dev.sh` — optional Docker flow; builds and deploys **only** the `trana` program to a local validator and writes `apps/web/.env.local` when that path exists.
- `anchor test` — runs `tests/guard.ts` against `workspace.Trana` on localnet.

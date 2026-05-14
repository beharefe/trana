# Contributing to Trana

Thanks for your interest in contributing. This document covers the basics for getting started.

For questions, reach out at [efe@efebehar.dev](mailto:efe@efebehar.dev).

---

## Before you start

- Check existing issues and PRs to avoid duplicate work
- For significant changes, open an issue first to discuss the approach
- Read the [architecture doc](docs/content/architecture.mdx) if you are touching the onchain programs

---

## Setup

```bash
# Prerequisites: Rust, Anchor CLI, Node.js >= 18

# Install dependencies
npm install

# Build programs
anchor build

# Build SDK
npm run build -w @tranaprotocol/sdk

# Run tests
anchor test
```

---

## Project structure

```
programs/          Rust/Anchor onchain programs
packages/sdk/      TypeScript SDK (@tranaprotocol/sdk)
apps/landing/      Next.js landing page and docs (trana.so)
tests/             Integration tests (TypeScript, runs against local validator)
docs/              Architecture, decisions, and integration guides
```

---

## Pull requests

- One concern per PR
- Keep PRs under ~300 lines where possible
- Match existing code style -- no new patterns without discussion
- Include a short description of what changed and why
- All tests must pass: `anchor test`

---

## Onchain programs

The programs in `programs/` are the security-critical core of Trana. Changes here require extra care:

- Never introduce a new PDA seed without updating all downstream consumers (SDK, docs, tests)
- All instruction renames must be propagated to the IDL, SDK, and docs simultaneously
- Failing to do this has caused real bugs -- see the `"2fa"` seed rename incident

---

## SDK

The TypeScript SDK lives in `packages/sdk/`. Build it before running the landing app:

```bash
npm run build -w @tranaprotocol/sdk
```

The SDK is published to npm as `@tranaprotocol/sdk`. Do not publish manually -- releases are handled by maintainers.

---

## Docs

Docs live in two places:

- `docs/` -- internal architecture and decision records
- `apps/landing/content/` -- public-facing docs at docs.trana.so (MDX, via Nextra)

When changing an instruction name, seed, or type, update both.

---

## Code of conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

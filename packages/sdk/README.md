# @tranaprotocol/sdk

TypeScript SDK for [Trana Guard](https://trana.so) — passkey-based second-factor authorization for Solana programs.

[![npm](https://img.shields.io/npm/v/@tranaprotocol/sdk.svg)](https://www.npmjs.com/package/@tranaprotocol/sdk)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](../../LICENSE)

Any Anchor program can enforce passkey authorization on any instruction via a single CPI call. No custody change. No trusted bridge. No server key.

---

## Documentation

Full reference at **[docs.trana.so](https://docs.trana.so)**

- [Quickstart](https://docs.trana.so/quickstart) — add passkey enforcement to your program in 5 minutes
- [SDK Reference](https://docs.trana.so/sdk) — hooks, functions, and types
- [Integration](https://docs.trana.so/integration) — complete Rust/Anchor + SDK reference
- [Architecture](https://docs.trana.so/architecture) — how the three layers fit together

---

## Examples

See [`examples/`](../../examples/) for runnable end-to-end integrations:

- [`examples/counter/`](../../examples/counter/) — passkey-gated counter, minimal integration

---

## Install

```sh
npm install @tranaprotocol/sdk
```

## Usage

```tsx
// Wrap your app
import { TranaProvider, TranaModal } from "@tranaprotocol/sdk/react"

function App() {
  return (
    <TranaProvider config={{ tranaGuardProgramId: TRANA_GUARD_ID }}>
      <TranaModal />
      {/* your app */}
    </TranaProvider>
  )
}
```

```tsx
// Inside a component
import { useTrana } from "@tranaprotocol/sdk/react"

function WithdrawButton() {
  const { authorizeAndSend } = useTrana()

  const withdraw = async () => {
    await authorizeAndSend({ instruction: withdrawIx, label: "Withdraw 1.5 SOL" })
  }

  return <button onClick={withdraw}>Withdraw</button>
}
```

See the [SDK Reference](https://docs.trana.so/sdk) for the full API.

---

## Exports

| Entry point | Contents |
|---|---|
| `@tranaprotocol/sdk` | Core utilities (intent hash, policy, secp256r1) |
| `@tranaprotocol/sdk/react` | React hooks and components (`useTrana`, `TranaProvider`, `TranaModal`) |
| `@tranaprotocol/sdk/guard` | Raw instruction builders for `trana_guard` |
| `@tranaprotocol/sdk/authority` | Instruction builders for `trana_authority` |
| `@tranaprotocol/sdk/testing` | Test helpers (LiteSVM / Mollusk utilities) |

---

## License

Apache-2.0 — see [LICENSE](../../LICENSE).

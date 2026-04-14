# Trana Guard — Documentation Index

Trana Guard is an onchain authorization primitive for Solana. It gives any program a second factor: a passkey (WebAuthn P-256) that must sign every sensitive instruction at execution time. No server. No custodian. Enforced atomically with the transaction.

---

## Documents

| File | What it answers |
|---|---|
| [architecture.md](./architecture.md) | How the whole system works end-to-end. Every component, every data flow, every byte on the wire. |
| [decisions.md](./decisions.md) | Why we made every non-obvious design choice. The "why not X?" answers. |
| [zero-trust.md](./zero-trust.md) | Security model, trust anchors, attack surface, what fails and why. |
| [integration.md](./integration.md) | How to integrate Trana into your own Solana program. Copy-paste patterns. |
| [demo.md](./demo.md) | What the demo vault is, how it works, and how to run it. |

---

## The Single Guarantee

```
Any instruction that calls guard::cpi::enforce() cannot execute
unless the wallet's registered passkey signed a hash that exactly
describes this transaction — same program, same accounts, same
parameters, same nonce, not expired.
```

This guarantee is enforced atomically by the Solana runtime. It is not a UI check. It cannot be bypassed by crafting raw transactions, replaying old proofs, or swapping instruction parameters.

---

## Repository Layout

```
trana-guard/
├── programs/
│   ├── guard/              ← The authorization primitive (deploy once, used by many)
│   └── demo_vault/         ← Integration reference (3 policies, copy the pattern)
├── packages/
│   └── sdk/                ← TypeScript SDK (WebAuthn, intent hash, tx building)
│       └── src/react/      ← React provider + hooks for dApp integration
├── tests/
│   ├── guard.ts            ← End-to-end tests via demo_vault::withdraw
│   └── demo_vault.ts       ← Demo vault unit + integration tests
├── apps/
│   └── web/                ← Hackathon demo UI (Next.js)
└── docs/                   ← You are here
```

---

## Quick Start

```bash
# Build
anchor build

# Test (all 12 scenarios)
anchor test

# Run demo UI
cd apps/web && pnpm dev
```

## Program IDs (devnet)

| Program | Address |
|---|---|
| `guard` | `572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6` |
| `demo_vault` | `Cm2jPgn1ipUAFarS7DpF2Y1X1HofKZgDKLmH65DtCNrZ` |

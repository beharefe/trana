# Trana Guard

Onchain second-factor authorization for Solana.

Any Anchor program can add execution-time passkey enforcement to any instruction
via a single CPI call. No custody change. No trusted bridge. No server key.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  dApp / Frontend  (React)                           │
└──────────────────┬──────────────────────────────────┘
                   │  @tranaprotocol/guard-sdk
┌──────────────────▼──────────────────────────────────┐
│  packages/sdk                                       │
│  Intent hash  │  WebAuthn  │  Tx builder            │
└──────────────────┬──────────────────────────────────┘
                   │  Signed transaction
┌──────────────────▼──────────────────────────────────┐
│  Solana Runtime                                     │
│  ix[N-2]  secp256r1 precompile  (SIMD-0075)         │
│  ix[N-1]  trana::record_proof   (data carrier)      │
│  ix[N]    your_program::action  → trana::enforce()  │
└─────────────────────────────────────────────────────┘
```

---

## How it works

1. **Registration**: the user registers a P-256 passkey (Touch ID, Face ID, YubiKey)
   once. The public key is stored in a Trana registry PDA seeded by their wallet.

2. **Authorization**: when a protected instruction is triggered, the SDK builds an
   intent hash (SHA-256 over the exact accounts, params, nonce). The
   user's passkey signs this hash via a WebAuthn ceremony — entirely in the browser.

3. **Enforcement**: the transaction carries three contiguous instructions: the
   secp256r1 native precompile (P-256 sig verify), `record_proof` (data carrier),
   and your protected instruction. `enforce()` via CPI reads the preceding two
   instructions from the Instructions sysvar and verifies everything. Any mismatch
   reverts the entire transaction atomically.

No backend required. No custody transfer. The private key never leaves the device.

---

## Onchain program

**Guard program ID:** `EWvLnEnw7d5xXJvCcS1Px4zpZ1KGZKB8weGUjL47y4e5`

### Instructions

| Instruction | Description |
|---|---|
| `init_config` | One-time setup of the global fee config PDA |
| `update_config` | Update registration/recovery fees or treasury address |
| `register_two_fa` | Register a passkey in the caller's registry PDA |
| `record_proof` | Data carrier — holds WebAuthn binding bytes for `enforce()` |
| `enforce` | CPI endpoint: verify proof and increment nonce |

### Policy enum

```rust
pub enum Policy {
    /// Always require a passkey.
    Require,
    /// Require passkey when current slot < slot (new feature rollout window).
    NotBefore { slot: u64 },
    /// Require passkey when current slot > slot (emergency freeze).
    NotAfter { slot: u64 },
    /// Require passkey when u64 at param_offset >= limit.
    Limit { param_offset: u8, limit: u64 },
}
```

### Fee system

Fees are charged at **registration time** only — not at enforcement.

- **`register_fee`**: charged when a wallet registers a passkey for the first time.
- **`recovery_fee`**: charged when re-registering (replacing an existing key).

The fee amount and treasury address live in the global `TranaConfig` PDA
(`seeds = [b"config"]`), publicly readable on-chain. `enforce()` charges nothing.

---

## Developer integration

See [INTEGRATION.md](./INTEGRATION.md) or the full docs at `apps/landing/content/`.

**Cargo.toml:**
```toml
trana = { version = "0.1", features = ["cpi"] }
```

**In your Anchor program:**
```rust
use trana::cpi::accounts::Enforce;
use trana::program::Trana;
use trana::Policy;

// Add a helper to your accounts struct — the enforce call becomes one line
impl<'info> Withdraw<'info> {
    pub fn trana_cpi_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Enforce<'info>> {
        CpiContext::new(self.trana_guard_program.to_account_info(), Enforce {
            registry:     self.trana_registry.to_account_info(),
            owner:        self.owner.to_account_info(),
            instructions: self.trana_instructions.to_account_info(),
        })
    }
}

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    trana::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::Limit { param_offset: 0, limit: 1_000_000_000 })?;
    // your logic here
    Ok(())
}
```

---

## Monorepo

```
programs/guard/      Anchor program — authorization primitive
packages/sdk/        @tranaprotocol/guard-sdk — TypeScript/React client
apps/landing/        Docs site and landing page
apps/web/            Demo UI
docs/                Internal architecture notes
```

---

## Security model

| Component | Trusted | Reason |
|---|---|---|
| Guard program | Yes | Onchain, audited once |
| Registry PDA | Yes | Onchain state, user-controlled |
| secp256r1 precompile | Yes | Solana native (SIMD-0075) |
| Frontend SDK | No | Client-side, UX only |
| Any bridge or server | No | Never holds keys |

A compromised frontend cannot produce valid P-256 proofs — only the user's
hardware authenticator holds the private key.

---

Built for Colosseum Frontier Hackathon · April 2026

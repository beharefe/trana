# Trana Guard

Onchain second-factor authorization for Solana.

Any Anchor program can add passkey enforcement to any instruction via a single
CPI call. No custody change. No trusted bridge. No server key.

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
│  ix[N-1]  trana_guard::record_proof  (data carrier) │
│  ix[N]    your_program::action  → trana::enforce()  │
└─────────────────────────────────────────────────────┘
```

---

## Programs

| Program | ID | Purpose |
|---|---|---|
| `trana_guard` | `GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn` | Passkey registry + enforcement |
| `trana_authority` | `KoXvrg4DBLKa5U6LCUpWXJE1FHYqwaozqDqDcBXvGEE` | PDA upgrade / mint / freeze authority |
| `trana_test_vault` | `8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa` | Demo shared pool (devnet) |

---

## How it works

1. **Registration** — the user registers a P-256 passkey (Touch ID, Face ID,
   YubiKey) once. The public key is stored in a registry PDA seeded by their
   wallet: `[b"2fa", owner]`.

2. **Authorization** — when a protected instruction is triggered, the SDK
   builds an intent hash (SHA-256 over the exact accounts, params, nonce, and
   expiry). The user's passkey signs this hash via a WebAuthn ceremony — entirely
   in the browser.

3. **Enforcement** — the transaction carries three contiguous instructions:
   the secp256r1 native precompile (P-256 sig verify), `record_proof` (data
   carrier), and your protected instruction. `enforce()` via CPI reads the
   preceding two instructions from the Instructions sysvar and verifies
   everything. Any mismatch reverts the entire transaction atomically.

No backend required. No custody transfer. The private key never leaves the device.

---

## Onchain integration

### 1. Add the dependency

```toml
# programs/your_program/Cargo.toml
[dependencies]
trana_guard = { path = "../../programs/trana_guard", features = ["cpi"] }
```

### 2. Add three accounts to your instruction struct

```rust
use trana_guard::cpi::accounts::Enforce;
use trana_guard::program::TranaGuard;
use trana_guard::TwoFactorRegistry;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    // --- your existing accounts ---
    #[account(mut)]
    pub pool:  Account<'info, Pool>,
    pub owner: Signer<'info>,

    // --- trana (3 accounts) ---
    pub trana_guard_program: Program<'info, TranaGuard>,

    #[account(
        mut,
        seeds  = [b"2fa", owner.key().as_ref()],
        bump,
        seeds::program = trana_guard_program.key(),
    )]
    pub trana_registry: Account<'info, TwoFactorRegistry>,

    /// CHECK: Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub trana_instructions: UncheckedAccount<'info>,
}
```

### 3. Call enforce with your policy

```rust
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    trana_guard::cpi::enforce(
        ctx.accounts.trana_cpi_ctx(),
        Policy::Limit { param_offset: 0, limit: 1_000_000_000 },
    )?;
    // your logic here
    Ok(())
}

impl<'info> Withdraw<'info> {
    fn trana_cpi_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Enforce<'info>> {
        CpiContext::new(self.trana_guard_program.to_account_info(), Enforce {
            registry:     self.trana_registry.to_account_info(),
            owner:        self.owner.to_account_info(),
            instructions: self.trana_instructions.to_account_info(),
        })
    }
}
```

---

## Policies

| Policy | Trigger | Example use |
|---|---|---|
| `Require` | Always | Admin actions, upgrade authority |
| `Limit { param_offset, limit }` | When `u64` at offset in params ≥ `limit` | Withdraw ≥ 1 SOL |
| `NotBefore { slot }` | When `clock.slot < slot` | Rollout window — new feature requires passkey until slot X |
| `NotAfter { slot }` | When `clock.slot > slot` | Emergency freeze — no action after slot X without passkey |

`Limit` reads the raw instruction data at `param_offset` as a little-endian
`u64`, so the amount doesn't need to be re-passed as an argument.

---

## Instructions (trana_guard)

| Instruction | Description |
|---|---|
| `init_config` | One-time global fee config setup |
| `update_config` | Change fees or treasury address |
| `register_two_fa` | Register a passkey (once per wallet — locked after first call) |
| `recover_two_fa` | Replace passkey using proof from the existing key |
| `record_proof` | Data carrier — holds WebAuthn binding bytes for `enforce()` |
| `enforce` | CPI endpoint: verify proof and increment nonce |

### Passkey rotation

`register_two_fa` is locked after the first registration — calling it again
returns `Unauthorized (6008)`. To replace a passkey, use `recover_two_fa`,
which requires a proof signed by the **existing** key:

```typescript
// The old passkey signs an intent that commits to the new pubkey_bytes.
// If the device is lost, key recovery requires out-of-band social recovery
// (not yet implemented — tracked separately).
await recoverTwoFa(program, owner, oldPasskey, newPasskey, treasury)
```

---

## trana_authority — PDA upgrade authority

`trana_authority` lets you transfer a program's upgrade authority to a PDA,
so that upgrading the program requires a passkey proof even if someone has the
wallet key.

```typescript
// Register the PDA as upgrade authority for a program
await authority.methods
  .register({ programUpgrade: {} })
  .accounts({ owner: yourWallet, target: TARGET_PROGRAM_ID })
  .rpc()

// Derive the PDA address
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from("trana-authority"), owner.toBuffer(), target.toBuffer()],
  TRANA_AUTHORITY_ID,
)

// Transfer upgrade authority to the PDA
// solana program set-upgrade-authority <TARGET> --new-upgrade-authority <PDA>

// Execute an upgrade (requires passkey proof)
await buildAndSendProof(tranaGuard, executeUpgradeIx, owner, passkey)
```

After this, upgrading the program requires:
1. Passkey proof signed by the owner
2. `trana_authority::execute_upgrade` CPI

Neither is possible with just the wallet key.

---

## Fee system

Fees are charged at registration time only — not at enforcement.

- `register_fee` (default 0.005 SOL) — first registration
- `recovery_fee` (default 0.01 SOL) — passkey replacement via `recover_two_fa`

`enforce()` charges nothing. Fee amounts and treasury address live in the
global `TranaConfig` PDA (`seeds = [b"config"]`), publicly readable on-chain.

---

## Security model

| Component | Trusted | Reason |
|---|---|---|
| `trana_guard` program | Yes | Onchain, auditable |
| Registry PDA | Yes | Onchain state, user-controlled |
| secp256r1 precompile | Yes | Solana native (SIMD-0075) |
| `trana_authority` PDA | Yes | Onchain, same trust model |
| Frontend SDK | No | Client-side, UX only |
| Any bridge or server | No | Never holds keys |

A compromised frontend cannot produce valid P-256 proofs — only the user's
hardware authenticator holds the private key.

---

## Devnet demo — trana_test_vault

A live shared SOL pool on devnet gated by passkey. The seed phrase is
published after deployment — anyone can try to drain it.

- Deposits open to anyone (`deposit` needs no passkey)
- Withdrawals ≥ 1 SOL require passkey (`Policy::Limit`)
- Rapid successive withdrawals escalate to `Policy::Require`
- Upgrade authority is the `trana_authority` PDA — wallet key alone cannot patch the program

See [`docs/deploy-devnet-vault.md`](docs/deploy-devnet-vault.md) for the full
setup guide.

---

## Repo layout

```
programs/
  trana_guard/        Authorization primitive (enforce, record_proof, registry)
  trana_authority/    PDA upgrade/mint/freeze authority
  trana_test_vault/   Demo shared pool
packages/
  sdk/                @tranaprotocol/guard-sdk — TypeScript/React client
tests/
  guard.test.ts       trana_guard integration tests
  trana_authority.test.ts  Upgrade authority tests (real BPF loader)
  trana_test_vault.test.ts Vault policy tests
docs/
  integration.md      Full copy-paste integration reference
  deploy-devnet-core.md   Deploy trana_guard + trana_authority
  deploy-devnet-vault.md  Deploy + lock demo vault
```

---

Built for Colosseum Frontier Hackathon · April 2026

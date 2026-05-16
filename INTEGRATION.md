# Trana Guard — Integration Guide

Trana is an onchain authorization library for Solana. Any Anchor program can
add execution-time passkey enforcement to any of its instructions via a single
CPI call — no custody change, no vault, no new infrastructure.

For the full reference see `apps/landing/content/integration.mdx` or the
quickstart at `apps/landing/content/quickstart.mdx`.

---

## How it works

1. The user registers a P-256 passkey once in their Trana registry PDA.
2. You add `trana` as a Rust dependency and call `trana::cpi::enforce(...)` at
   the top of any instruction you want protected.
3. At execution time, the transaction carries three contiguous instructions:
   - `ix[N-2]`: secp256r1 precompile — native P-256 signature verification
   - `ix[N-1]`: `trana::record_proof` — WebAuthn data carrier
   - `ix[N]`: your protected instruction, which calls `trana::cpi::enforce()`
4. `enforce()` reads the preceding two instructions from the Instructions sysvar
   and verifies the P-256 signature against the registry pubkey. If anything
   fails, the whole transaction reverts atomically.

---

## Step 1 — Add Trana as a dependency

```toml
# programs/your-program/Cargo.toml
[dependencies]
trana = { version = "0.1", features = ["cpi"] }
```

---

## Step 2 — Add Trana accounts to your instruction

Add a `trana_cpi_ctx()` helper so the enforce call is a single line at every use site.

```rust
use trana::cpi::accounts::Enforce;
use trana::program::Trana;
use trana::Policy;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = owner, seeds = [b"vault", owner.key().as_ref()], bump)]
    pub vault: Account<'info, VaultState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: withdrawal destination
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,

    pub trana_guard_program: Program<'info, Trana>,
    #[account(
        mut,
        seeds  = [b"passkey", owner.key().as_ref()],
        bump,
        seeds::program = trana_guard_program.key(),
        constraint = trana_registry.enabled @ VaultError::PasskeyNotRegistered,
    )]
    pub trana_registry: Account<'info, trana::PasskeyRegistry>,
    /// CHECK: Solana Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub trana_instructions: UncheckedAccount<'info>,
}

impl<'info> Withdraw<'info> {
    pub fn trana_cpi_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Enforce<'info>> {
        CpiContext::new(self.trana_guard_program.to_account_info(), Enforce {
            registry:     self.trana_registry.to_account_info(),
            owner:        self.owner.to_account_info(),
            instructions: self.trana_instructions.to_account_info(),
        })
    }
}
```

---

## Step 3 — Call enforce in your instruction

```rust
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0,                           VaultError::ZeroAmount);
    require!(amount <= ctx.accounts.vault.balance, VaultError::InsufficientFunds);

    // Passkey required when amount >= 1 SOL. Guard reads amount directly — caller can't fake it.
    trana::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::Limit { param_offset: 0, limit: 1_000_000_000 })?;

    let vault_info = ctx.accounts.vault.to_account_info();
    let dest_info  = ctx.accounts.destination.to_account_info();
    **vault_info.try_borrow_mut_lamports()? -= amount;
    **dest_info.try_borrow_mut_lamports()?  += amount;

    ctx.accounts.vault.balance = ctx.accounts.vault.balance
        .checked_sub(amount)
        .ok_or(VaultError::Overflow)?;

    Ok(())
}
```

`param_offset` is the byte offset of the target `u64` **after the 8-byte Anchor discriminator**:

| Instruction | `param_offset` |
|---|---|
| `fn action(ctx, amount: u64)` | `0` |
| `fn action(ctx, recipient: Pubkey, amount: u64)` | `32` |
| `fn action(ctx, flag: bool, amount: u64)` | `1` |
| `fn action(ctx, a: u32, b: u32, amount: u64)` | `8` |

Sum the byte sizes of all parameters before the target u64: `Pubkey`=32, `u64`=8, `u32`=4, `bool`/`u8`=1.

---

## Policies

| Variant | Fires when | Policy string |
|---|---|---|
| `Policy::Require` | Always | `trana.require` |
| `Policy::Limit { param_offset, limit }` | u64 at offset ≥ limit | `trana.limit` |
| `Policy::NotBefore { slot }` | current slot < slot | `trana.not_before` |
| `Policy::NotAfter { slot }` | current slot > slot | `trana.not_after` |

Conditional policies are no-ops when their condition is false — `enforce()` returns
`Ok(())` immediately and no passkey is required.

---

## Transaction shape

The three instructions must appear contiguously in this order:

```
ix[N-2]: secp256r1 precompile    — native P-256 sig verify (SIMD-0075)
ix[N-1]: trana::record_proof     — WebAuthn data carrier
ix[N]:   your instruction        — calls trana::cpi::enforce() via CPI
```

The SDK's `authorizeAndSend()` constructs this automatically. See the TypeScript
client section in `apps/landing/content/integration.mdx`.

---

## Step 4 — Register the passkey (once per user)

Use the SDK's `TranaModal` — it handles the WebAuthn ceremony and calls
`register_two_fa` automatically when a user first triggers a protected action.

For manual registration:

```typescript
import { TranaProvider, TranaModal, useTrana } from "@tranaprotocol/guard-sdk"
import { PublicKey } from "@solana/web3.js"

const TRANA_GUARD_PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_TRANA_GUARD_PROGRAM_ID!)

// Wrap your app once
<TranaProvider config={{ tranaGuardProgramId: TRANA_GUARD_PROGRAM_ID, policy: "trana.limit" }}>
  <App />
  <TranaModal />
</TranaProvider>

// Trigger a protected transaction — registration happens automatically on first use
const { authorizeAndSend } = useTrana()
await authorizeAndSend({ instruction: withdrawIx, label: "Withdraw 1 SOL" })
```

---

## Fee system

Fees are charged at **registration time** only — not at enforcement.

- **First registration** (`register_fee`): charged when the registry PDA is created.
- **Key recovery** (`recovery_fee`): charged when re-registering an existing registry.

The `enforce()` CPI has no fee. The fee amounts and treasury address live in the
`TranaConfig` PDA (`seeds = [b"config"]`) and are publicly readable on-chain.

---

## Error reference

| Error | Code | Meaning |
|---|---|---|
| `MissingProof` | `0x1770` | No `record_proof` at `ix[N-1]` or no `secp256r1` at `ix[N-2]` |
| `ProofExpired` | `0x1771` | `proof.expiry < clock.unix_timestamp` |
| `PayloadMismatch` | `0x1772` | Intent hash mismatch — accounts, params, or nonce changed |
| `WrongSigner` | `0x1773` | Pubkey in `secp256r1` doesn't match the registry |
| `PolicyMismatch` | `0x1777` | Policy string in `record_proof` doesn't match enforced policy |
---

## Program ID

**Guard:** `EWvLnEnw7d5xXJvCcS1Px4zpZ1KGZKB8weGUjL47y4e5`

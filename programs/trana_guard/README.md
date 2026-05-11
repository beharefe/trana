# trana_guard

Onchain passkey authorization primitive for Solana.

`trana_guard` enforces second-factor authorization at execution time. Integrate via CPI to require a WebAuthn/passkey proof before any high-risk instruction executes - enforced onchain, not in your app.

## CPI Integration

```toml
[dependencies]
trana_guard = { version = "0.1.0", features = ["cpi", "devnet"] }
# or: features = ["cpi", "localnet"] / ["cpi", "mainnet-beta"]
```

```rust
use trana_guard::{cpi::accounts::Enforce, program::TranaGuard, Policy};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    // trana_guard accounts
    pub trana_guard_program: Program<'info, TranaGuard>,
    /// CHECK: guard validates the registry internally
    #[account(mut)]
    pub trana_registry: UncheckedAccount<'info>,
    /// CHECK: instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    // Require passkey when amount >= 1 SOL; free below.
    trana_guard::cpi::enforce(
        CpiContext::new(
            ctx.accounts.trana_guard_program.to_account_info(),
            Enforce {
                registry:     ctx.accounts.trana_registry.to_account_info(),
                owner:        ctx.accounts.owner.to_account_info(),
                instructions: ctx.accounts.instructions.to_account_info(),
            },
        ),
        Policy::Limit { param_offset: 0, limit: 1_000_000_000 },
    )?;
    // ... rest of your logic
    Ok(())
}
```

The registry PDA is derived off-chain and passed in as `UncheckedAccount`. The guard validates ownership and proof internally.

**Registry PDA seeds:** `[b"passkey", owner_pubkey]` at program `trana_guard`.

## Policies

| Variant | Requires proof when |
|--------|-----------|
| `Policy::Require` | Always |
| `Policy::Limit { param_offset, limit }` | u64 at `param_offset` bytes into instruction data >= `limit` |
| `Policy::NotBefore { slot }` | current slot < `slot` |
| `Policy::NotAfter { slot }` | current slot > `slot` |

`param_offset` is counted from byte 0 after the 8-byte Anchor discriminator.
- `fn withdraw(ctx, amount: u64)` - `param_offset: 0`
- `fn transfer(ctx, recipient: Pubkey, amount: u64)` - `param_offset: 32`

## Transaction shape

Each protected instruction must be preceded by exactly this triplet:

```
ix[N-2]  secp256r1 precompile      P-256 signature verify (SIMD-0075)
ix[N-1]  trana_guard::record_proof WebAuthn data carrier
ix[N]    your instruction           calls trana_guard::cpi::enforce()
```

## Error codes

| Code | Name | Meaning |
|------|------|---------|
| 6000 | `MissingProof` | No proof triplet before the instruction |
| 6001 | `ProofExpired` | Proof TTL elapsed |
| 6002 | `PayloadMismatch` | Intent hash mismatch |
| 6003 | `WrongSigner` | Signing key not in registry |
| 6006 | `PolicyMismatch` | Policy string mismatch |

## Links

- [Documentation](https://trana.so/docs)
- [GitHub](https://github.com/beharefe/trana)
- [Website](https://trana.so)

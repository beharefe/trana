# trana_guard

Onchain passkey authorization primitive for Solana.

`trana_guard` enforces second-factor authorization at execution time. Integrate via CPI to require a WebAuthn/passkey proof before any high-risk instruction executes - enforced onchain, not in your app.

## CPI Integration

```toml
[dependencies]
trana_guard = { version = "0.1.0", features = ["cpi"] }
```

```rust
use trana_guard::{cpi::accounts::Enforce, program::TranaGuard, Policy};

trana_guard::cpi::enforce(
    CpiContext::new(
        ctx.accounts.trana_guard.to_account_info(),
        Enforce {
            registry:  ctx.accounts.passkey_registry.to_account_info(),
            proof:     ctx.accounts.proof.to_account_info(),
            clock:     ctx.accounts.clock.to_account_info(),
        },
    ),
    Policy::RequirePasskeyProof,
)?;
```

## Policies

| Policy | Condition |
|--------|-----------|
| `RequirePasskeyProof` | A valid secp256r1 proof must be present in the transaction |
| `AllowIfRegistered` | Passes if the user has a registered passkey |
| `Deny` | Always rejects (emergency lock) |

## Links

- [Documentation](https://trana.so/docs)
- [GitHub](https://github.com/beharefe/trana)
- [Website](https://trana.so)

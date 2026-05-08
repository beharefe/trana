# Integration Guide

Add passkey enforcement to any Anchor program in three steps.

---

## TL;DR

```rust
// 1. Add dependency
// trana_guard = { path = "../../programs/trana_guard", features = ["cpi"] }

// 2. Add 3 accounts to your instruction struct
pub trana_guard_program: Program<'info, TranaGuard>,
pub trana_registry:      Account<'info, TwoFactorRegistry>,  // seeds = [b"2fa", owner]
pub trana_instructions:  UncheckedAccount<'info>,            // instructions sysvar

// 3. Call enforce
trana_guard::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::Require)?;
```

That's the full onchain cost.

---

## Program IDs

```
trana_guard     GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn
trana_authority KoXvrg4DBLKa5U6LCUpWXJE1FHYqwaozqDqDcBXvGEE
```

---

## Onchain Integration (Rust / Anchor)

### Cargo.toml

```toml
[dependencies]
anchor-lang  = { version = "0.32.0", features = ["init-if-needed"] }
trana_guard  = { path = "../../programs/trana_guard", features = ["cpi"] }
```

### Full accounts struct

```rust
use trana_guard::cpi::accounts::Enforce;
use trana_guard::program::TranaGuard;
use trana_guard::TwoFactorRegistry;

#[derive(Accounts)]
pub struct YourProtectedAction<'info> {
    // --- your existing accounts ---
    #[account(mut, has_one = owner)]
    pub your_state: Account<'info, YourState>,
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

### CPI context helper (copy-paste)

```rust
impl<'info> YourProtectedAction<'info> {
    pub fn trana_cpi_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Enforce<'info>> {
        CpiContext::new(
            self.trana_guard_program.to_account_info(),
            Enforce {
                registry:     self.trana_registry.to_account_info(),
                owner:        self.owner.to_account_info(),
                instructions: self.trana_instructions.to_account_info(),
            },
        )
    }
}
```

### Policy selection

```rust
pub fn your_protected_action(ctx: Context<YourProtectedAction>, amount: u64) -> Result<()> {
    // Policy::Require — always needs passkey
    trana_guard::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::Require)?;

    // Policy::Limit — only when amount >= 1 SOL (reads param_offset=0 from ix data)
    trana_guard::cpi::enforce(
        ctx.accounts.trana_cpi_ctx(),
        Policy::Limit { param_offset: 0, limit: 1_000_000_000 },
    )?;

    // Policy::NotBefore — require passkey until rollout_slot passes
    trana_guard::cpi::enforce(
        ctx.accounts.trana_cpi_ctx(),
        Policy::NotBefore { slot: rollout_slot },
    )?;

    // Policy::NotAfter — emergency freeze after deadline_slot
    trana_guard::cpi::enforce(
        ctx.accounts.trana_cpi_ctx(),
        Policy::NotAfter { slot: deadline_slot },
    )?;

    // your logic
    Ok(())
}
```

### Policy reference

| Policy | Triggers when | Typical use |
|---|---|---|
| `Require` | Always | Admin, upgrade authority, high-value ops |
| `Limit { param_offset, limit }` | `u64` at offset in params ≥ limit | Withdraw ≥ 1 SOL |
| `NotBefore { slot }` | `clock.slot < slot` | New feature behind passkey until slot X |
| `NotAfter { slot }` | `clock.slot > slot` | Emergency freeze after slot X |

`Limit` reads raw instruction data at `param_offset` as little-endian `u64`.
Set `param_offset: 0` if `amount` is the first parameter.

---

## TypeScript Client

### Installation

```bash
npm install @tranaprotocol/guard-sdk @solana/web3.js
```

### Passkey registration (first time)

```typescript
import { Program } from "@coral-xyz/anchor"
import { TranaGuard } from "./target/types/trana_guard"
import { Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js"

const TRANA_GUARD_ID = new PublicKey("GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn")

// Browser WebAuthn — generates P-256 keypair on device
const credential = await navigator.credentials.create({
  publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: "Your App", id: window.location.hostname },
    user: { id: Uint8Array.from(owner.publicKey.toBytes()), name: "user", displayName: "User" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],  // ES256 = P-256
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
  },
})

const { pubkey, credentialId } = extractP256Key(credential)  // from SDK

const ix = await program.methods
  .registerTwoFa(
    { secp256R1Passkey: {} },
    Buffer.from(pubkey),
    Buffer.from(credentialId),
  )
  .accounts({ owner: owner.publicKey, treasury })
  .instruction()

await sendAndConfirmTransaction(connection, new Transaction().add(ix), [owner])
```

### Passkey rotation (replace existing key)

```typescript
// Old passkey signs an intent that commits to the new pubkey_bytes.
// recover_two_fa requires proof from the current key — wallet key alone is not enough.
const recoverIx = await program.methods
  .recoverTwoFa(
    { secp256R1Passkey: {} },
    Buffer.from(newPasskey.pubkey),
    Buffer.from(newPasskey.credentialId),
  )
  .accounts({ owner: owner.publicKey, treasury })
  .instruction()

// Build proof with old passkey (nonce = current registry nonce)
const proof = buildProofInstructions(oldPasskey, recoverIx, TRANA_GUARD_ID, owner.publicKey, nonce, "trana.require")
await sendV0(connection, [proof.secp256r1Ix, proof.recordProofIx, recoverIx], owner.publicKey, [owner])
```

### Protected call (with passkey proof)

```typescript
import { buildProofInstructions } from "./tests/helpers/proof"

const withdrawIx = await yourProgram.methods
  .withdraw(new anchor.BN(1_500_000_000))  // 1.5 SOL — above Limit threshold
  .accounts({
    pool:                 poolPda,
    owner:                owner.publicKey,
    tranaGuardProgram:    TRANA_GUARD_ID,
    tranaRegistry:        registryPda,
    tranaInstructions:    anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
  })
  .instruction()

// registry.nonce increments after each successful enforce()
const registry = await tranaGuard.account.twoFactorRegistry.fetch(registryPda)
const nonce    = BigInt(registry.nonce.toString())

const proof = buildProofInstructions(
  passkey,           // TestPasskeyHandle (or real WebAuthn response)
  withdrawIx,        // the protected instruction
  TRANA_GUARD_ID,    // guard program (where record_proof is sent)
  owner.publicKey,
  nonce,
  "trana.require",   // policy domain string
)

await sendV0(connection, [proof.secp256r1Ix, proof.recordProofIx, withdrawIx], owner.publicKey, [owner])
```

**Transaction layout is always:**
```
ix[N-2]  secp256r1 precompile
ix[N-1]  trana_guard::record_proof
ix[N]    your_program::protected_instruction
```

---

## trana_authority — PDA upgrade authority

Lets you hand upgrade authority to a PDA so that upgrading requires a passkey
even if the wallet key is compromised.

```typescript
const TRANA_AUTHORITY_ID = new PublicKey("KoXvrg4DBLKa5U6LCUpWXJE1FHYqwaozqDqDcBXvGEE")

// 1. Register the PDA as upgrade authority for target program
await authority.methods
  .register({ programUpgrade: {} })
  .accounts({ owner: yourWallet, target: TARGET_PROGRAM_ID })
  .rpc()

// 2. Derive the PDA address
const [upgradePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("trana-authority"), owner.toBuffer(), target.toBuffer()],
  TRANA_AUTHORITY_ID,
)

// 3. Transfer upgrade authority (CLI)
// solana program set-upgrade-authority <TARGET> --new-upgrade-authority <PDA> --url devnet

// 4. Execute an upgrade later (requires passkey proof)
const executeUpgradeIx = await authority.methods
  .executeUpgrade()
  .accounts({ owner: yourWallet, target: TARGET_PROGRAM_ID, buffer: upgradedBuffer })
  .instruction()
await buildAndSendProof(tranaGuard, executeUpgradeIx, owner, passkey)
```

See [`docs/deploy-devnet-vault.md`](deploy-devnet-vault.md) for the full
step-by-step demo setup.

---

## Error reference

| Code | Name | Meaning |
|---|---|---|
| 6000 | `MissingProof` | No secp256r1 + record_proof before the protected ix |
| 6001 | `ProofExpired` | Proof's `expiry_unix` is in the past |
| 6002 | `PayloadMismatch` | Intent hash doesn't match what was signed |
| 6003 | `WrongSigner` | Signature is valid but from the wrong P-256 key |
| 6004 | `InvalidProof` | ix[N-2] / ix[N-1] are malformed |
| 6005 | `InvalidProof` | Wrong instruction order |
| 6007 | `PolicyMismatch` | `enforce()` called with wrong policy for context |
| 6008 | `Unauthorized` | `register_two_fa` after first registration; use `recover_two_fa` |

---

## Integration checklist

**Onchain:**
- [ ] `trana_guard = { ..., features = ["cpi"] }` in Cargo.toml
- [ ] Three accounts added to each protected instruction struct
- [ ] `trana_cpi_ctx()` helper on each struct
- [ ] `trana_guard::cpi::enforce(...)` called with correct `Policy`
- [ ] Tests for: valid proof, no proof (`MissingProof`), wrong key (`WrongSigner`), replay (`PayloadMismatch`), tampered params (`PayloadMismatch`)

**Client:**
- [ ] Registration flow (one-time per wallet)
- [ ] Registry fetch before protected call (read current nonce)
- [ ] Correct transaction layout: `[secp256r1, record_proof, your_ix]`
- [ ] Handle `MissingProof` / `PayloadMismatch` errors gracefully
- [ ] Passkey rotation via `recover_two_fa` (not `register_two_fa`)

---

## Test reference

The full test suite in `tests/guard.test.ts` covers all policies, expiry,
replay protection, and error paths. `tests/trana_authority.test.ts` covers
real BPF loader upgrade flows (live `.so` buffer writes).

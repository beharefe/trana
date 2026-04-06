# Trana Guard

Onchain second-factor authorization for Solana.

Any Anchor program can add execution-time passkey enforcement to any instruction
via a single CPI call. No custody change. No trusted bridge. No server key.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         TRUSTED                              │
│                                                              │
│   Trana Guard Program (onchain)                              │
│   ├── registry PDA  [b"2fa", authority]                      │
│   │    └── stores: P-256 pubkey, key_kind, credential_id     │
│   └── enforce instruction (CPI endpoint)                     │
│        └── reads Instructions sysvar at runtime             │
│             └── verifies secp256r1 precompile at ix 0        │
│                  └── pubkey must match registry PDA          │
│                                                              │
│   Solana secp256r1 precompile                                │
│   └── verifies P-256 signatures natively, no trusted party  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      NOT TRUSTED                             │
│                                                              │
│   WebAuthn helper (apps/web)                                 │
│   ├── runs WebAuthn ceremony (registration / authentication) │
│   ├── returns raw P-256 signature to the client             │
│   └── does NOT sign, store keys, or authorize anything      │
│                                                              │
│   Frontend / SDK (@trana-guard/sdk)                         │
│   └── builds secp256r1 precompile instruction               │
└─────────────────────────────────────────────────────────────┘
```

---

## How passkeys work with Trana

WebAuthn passkeys (Touch ID, Face ID, YubiKey) use the P-256 / secp256r1
elliptic curve. Solana has a native secp256r1 precompile that verifies P-256
signatures onchain.

Trana bridges these:

1. **Registration**: the user's authenticator generates a P-256 keypair.
   The public key is stored in a Trana registry PDA onchain.

2. **Authorization**: to protect an instruction, the caller passes a
   `payload_hash` (sha256 of canonical JSON describing the action).
   The user's authenticator signs this hash. The secp256r1 precompile
   verifies the signature at the top level of the transaction.
   Trana's `enforce` CPI reads the result from the Instructions sysvar.

3. **Enforcement**: if the proof is absent, wrong key, or expired, the
   transaction fails atomically. The protected instruction never runs.

What Trana does NOT verify: RP ID, origin, authenticator extensions (not full
WebAuthn verification). Trana uses challenge-based signing: the payload hash
is the challenge, the P-256 signature is the proof.

---

## Onchain program

**Program ID (devnet):** `572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6`

### Instructions

| Instruction | Description |
|---|---|
| `register_two_fa` | Register a passkey key in the user's registry PDA |
| `enforce` | CPI endpoint: verify a passkey proof. Call from any Anchor program. |
| `initialize` | Deploy-time config |
| `update_config` | Update threshold / enabled flag |
| `init_vault` | Demo: personal vault PDA |
| `deposit` | Demo: deposit SOL |
| `vault_withdraw` | Demo: withdraw with Ed25519 bridge proof |
| `registry_vault_withdraw` | Demo: withdraw with secp256r1 proof |

### Policy enum

```rust
pub enum Policy {
    AdminAction,
    HighValueTransfer { amount: u64 },
    VaultWithdraw,
    Always,
}
```

---

## Developer integration

See [INTEGRATION.md](./INTEGRATION.md) for the full guide.

**Cargo.toml:**
```toml
guard = { git = "https://github.com/beharefe/trana-guard", features = ["cpi"] }
```

**In your Anchor instruction:**
```rust
pub fn your_protected_instruction(ctx: Context<...>, expiry: i64) -> Result<()> {
    let payload_hash = sha256(your_canonical_json(...));

    guard::cpi::enforce(
        CpiContext::new(
            ctx.accounts.trana_program.to_account_info(),
            guard::cpi::accounts::Enforce {
                registry:     ctx.accounts.trana_registry.to_account_info(),
                instructions: ctx.accounts.instructions.to_account_info(),
            },
        ),
        guard::Policy::AdminAction,
        payload_hash,
        expiry,
    )?;

    // Only reached if proof was valid.
    Ok(())
}
```

---

## Monorepo

```
programs/guard/     Anchor program
packages/sdk/       @trana-guard/sdk client library
apps/landing/       Landing page
apps/web/           WebAuthn helper (UX only, not a trust anchor)
INTEGRATION.md      Full developer integration guide
```

---

## Security model

| Component | Trusted | Reason |
|---|---|---|
| Anchor program | Yes | Onchain, immutable |
| Registry PDA | Yes | Onchain state, user-controlled |
| secp256r1 precompile | Yes | Solana native |
| `apps/web` backend | No | UX helper only |
| Frontend SDK | No | Client-side |
| Any bridge or server | No | Never holds keys |

A compromised backend cannot produce valid secp256r1 proofs.
Only the user's hardware authenticator holds the P-256 private key.

---

## Registration flow

```
browser                     helper backend          Solana
────────────────────────────────────────────────────────────
wallet.connect()
WebAuthn create()  ──────► /api/register/options
                             │ generate challenge
WebAuthn ceremony ◄──────────┘
assertion ──────────────► /api/register/verify
                             │ verify, return P-256 pubkey
p256PublicKey ◄──────────────┘
register_two_fa(p256Pubkey) ──────────────────────► registry PDA created
```

## Execution flow

```
browser                     helper backend          Solana
────────────────────────────────────────────────────────────
build payload_hash
redirect /approve ────────► /approve?payload=...
                             WebAuthn get()
                             /api/approve/verify (UX check only)
                             p256Signature (raw)
◄──────────────────────────── redirect back with sig
build secp256r1Ix(pubKey, sig, payloadHash)
tx = [secp256r1Ix, protectedIx] ──────────────────► enforce() verifies onchain
                                                      protected logic runs
```

---

Built for Colosseum Frontier Hackathon · April 2026

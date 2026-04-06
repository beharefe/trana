# Trana Guard — Integration Guide

Trana is an onchain authorization library for Solana. Any Anchor program can
add execution-time passkey enforcement to any of its instructions via a single
CPI call — no custody change, no vault, no new infrastructure.

---

## How it works

1. The authority registers a passkey (Touch ID, Face ID, YubiKey) once onchain
   in a Trana registry PDA.
2. You add `guard` as a Rust dependency and call `guard::cpi::enforce(...)` at
   the top of any instruction you want protected.
3. At execution time, Trana reads the Instructions sysvar, finds the
   secp256r1 precompile proof at index 0, and verifies it against the
   registered key. No proof or wrong proof → the transaction fails atomically.

Your program's logic never runs without a valid proof. No UI bypass possible.

---

## Step 1 — Add Trana as a dependency

```toml
# programs/your-program/Cargo.toml
[dependencies]
guard = { git = "https://github.com/beharefe/trana-guard", features = ["cpi"] }
```

---

## Step 2 — Add accounts to your instruction

```rust
use guard::cpi::accounts::Enforce;
use guard::program::Guard;

#[derive(Accounts)]
pub struct YourProtectedInstruction<'info> {
    // ... your existing accounts ...

    /// The authority's Trana registry PDA.
    /// Seeds: [b"2fa", authority.key()] on the Trana program.
    /// CHECK: validated by Trana's enforce instruction.
    pub trana_registry: UncheckedAccount<'info>,

    /// Trana Guard program.
    pub trana_program: Program<'info, Guard>,

    /// CHECK: Solana Instructions sysvar.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}
```

---

## Step 3 — Call enforce in your instruction

```rust
pub fn your_protected_instruction(
    ctx: Context<YourProtectedInstruction>,
    amount: u64,
    expiry: i64,
) -> Result<()> {
    // 1. Compute the payload hash — whatever canonical JSON your app defines.
    //    The user's passkey must have signed this exact hash.
    let payload_hash = your_payload_hash(
        ctx.program_id,
        &ctx.accounts.vault.key(),
        amount,
        expiry,
    );

    // 2. Enforce — Trana verifies the proof at instruction index 0.
    //    This line fails the entire transaction if proof is absent or invalid.
    guard::cpi::enforce(
        CpiContext::new(
            ctx.accounts.trana_program.to_account_info(),
            Enforce {
                registry:     ctx.accounts.trana_registry.to_account_info(),
                instructions: ctx.accounts.instructions.to_account_info(),
            },
        ),
        payload_hash,
        expiry,
    )?;

    // 3. Only reached if proof was valid.
    //    Execute your instruction logic here.
    // ...

    Ok(())
}
```

---

## Step 4 — Register the passkey (once per authority)

Call this once when the authority sets up their passkey. This writes a PDA on
the Trana program that `enforce` reads on every protected call.

```typescript
import { PublicKey, SystemProgram } from "@solana/web3.js"
import { p256 } from "@noble/curves/nist.js"

// Derive the registry PDA
const [registryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("2fa"), authority.publicKey.toBuffer()],
  TRANA_PROGRAM_ID
)

// p256PubKey = 33-byte compressed public key from the WebAuthn authenticator
await tranaProgram.methods
  .registerTwoFa(
    { secp256R1Passkey: {} },
    Buffer.from(p256PubKey),   // 33-byte compressed P-256 key
    Buffer.from(credentialId)  // WebAuthn credential ID (for UX lookup)
  )
  .accounts({
    registry: registryPda,
    owner: authority.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc()
```

---

## Step 5 — Build and send a protected transaction

On every call to your protected instruction, the client must:
1. Compute the same payload hash
2. Sign it with the passkey
3. Prepend the secp256r1 precompile instruction at index 0

```typescript
import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js"
import { p256 } from "@noble/curves/nist.js"
import { createHash } from "crypto"

// Must match what your program computes onchain
function payloadHash(programId, vault, amount, expiry) {
  const json = JSON.stringify({ programId, vault, amount, expiry })
  return createHash("sha256").update(json).digest()
}

const hash   = payloadHash(YOUR_PROGRAM_ID, vaultAddr, amount, expiry)
const privKey = /* P-256 private key from authenticator */
const sig    = p256.sign(hash, privKey)          // sign the hash directly
const pubKey = p256.getPublicKey(privKey, true)  // 33-byte compressed

const proofIx = buildSecp256r1Ix(pubKey, sig, hash)  // see below
const yourIx  = await yourProgram.methods
  .yourProtectedInstruction(new BN(amount), new BN(expiry))
  .accounts({ ..., tranaRegistry: registryPda, tranaProgram: TRANA_PROGRAM_ID })
  .instruction()

const tx = new Transaction()
tx.add(proofIx)  // MUST be instruction index 0
tx.add(yourIx)
await sendAndConfirmTransaction(connection, tx, [authority])
```

### buildSecp256r1Ix

```typescript
import { TransactionInstruction, PublicKey } from "@solana/web3.js"

const SECP256R1_PROGRAM_ID = "Secp256r1SigVerify1111111111111111111111111"

function buildSecp256r1Ix(pubkey: Uint8Array, sig: Uint8Array, message: Uint8Array) {
  const HEADER    = 16                        // count(1) + padding(1) + offsets(14)
  const pkOffset  = HEADER                    // 16
  const sigOffset = HEADER + 33              // 49
  const msgOffset = HEADER + 33 + 64         // 113
  const data = Buffer.alloc(msgOffset + message.length)
  data[0] = 1                                // num_signatures
  data[1] = 0                                // padding byte (required)
  data.writeUInt16LE(sigOffset,      2)
  data.writeUInt16LE(0xffff,         4)
  data.writeUInt16LE(pkOffset,       6)
  data.writeUInt16LE(0xffff,         8)
  data.writeUInt16LE(msgOffset,      10)
  data.writeUInt16LE(message.length, 12)
  data.writeUInt16LE(0xffff,         14)
  Buffer.from(pubkey).copy(data, pkOffset)
  Buffer.from(sig).copy(data, sigOffset)
  Buffer.from(message).copy(data, msgOffset)
  return new TransactionInstruction({
    keys: [],
    programId: new PublicKey(SECP256R1_PROGRAM_ID),
    data,
  })
}
```

---

## Precompile gotchas

| | Correct | Wrong |
|--|--|--|
| Header layout | `[count][padding][offsets at byte 2]` | `[count][offsets at byte 1]` |
| Signing | `p256.sign(payloadHash, privKey)` | `p256.sign(sha256(payloadHash), privKey)` |
| Pubkey format | 33-byte compressed SEC1 | 65-byte uncompressed |
| Sig format | 64-byte compact r‖s | DER-encoded |
| Proof position | Instruction index 0 | Any other index |

---

## What Trana does NOT do

- Hold custody of funds (that is your program's job)
- Define what a "valid action" is (you define the payload hash)
- Require any offchain bridge or server (registry path is fully onchain)

Trana enforces one thing: **a valid passkey proof must exist at execution time.**

---

## Program ID (devnet)

```
572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6
```

# Trana Guard — Developer Integration Guide

Trana Guard enforces a cryptographic second factor **onchain, at execution time**. No matter how a transaction is crafted, it cannot execute a protected instruction without a valid proof attached.

---

## Two integration paths

| | **Registry path** (recommended) | **Bridge path** |
|--|--|--|
| Trust anchor | Onchain PDA — no server | Off-chain Ed25519 server |
| Key type | secp256r1 / P-256 (WebAuthn, Touch ID, Face ID) | Ed25519 (any signing service) |
| Bridge required | No | Yes |
| Instructions | `register_two_fa` + `registry_vault_withdraw` | `vault_withdraw` / `protected_transfer` |

---

## Path 1 — Registry (secp256r1 passkey, no bridge)

### Step 1: Register a passkey key onchain

Call once per user when they register their authenticator.

```typescript
import { p256 } from "@noble/curves/nist.js"
import * as anchor from "@coral-xyz/anchor"
import { PublicKey, SystemProgram } from "@solana/web3.js"

const program = anchor.workspace.Guard

// Derive registry PDA
const [registryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("2fa"), owner.publicKey.toBuffer()],
  program.programId
)

// p256PubKey = 33-byte compressed public key from the authenticator
await program.methods
  .registerTwoFa(
    { secp256R1Passkey: {} },          // KeyKind enum variant
    Buffer.from(p256PubKey),           // 33-byte compressed P-256 pubkey
    Buffer.from(credentialId)          // WebAuthn credential ID (for UX lookup)
  )
  .accounts({ registry: registryPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
  .signers([owner])
  .rpc()
```

### Step 2: Withdraw with passkey proof

```typescript
import { p256 } from "@noble/curves/nist.js"
import {
  Transaction, TransactionInstruction, PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY, sendAndConfirmTransaction
} from "@solana/web3.js"
import { createHash } from "crypto"

const SECP256R1_PROGRAM_ID = "Secp256r1SigVerify1111111111111111111111111"

// 1. Build canonical payload hash (must match what the program computes)
function vaultPayloadHash(programId, vault, amount, nonce, expiry) {
  const json = JSON.stringify({ programId, instruction: "vault_withdraw", vault, amount, nonce, expiry })
  return createHash("sha256").update(json).digest()
}

// 2. Sign with P-256 private key
//    (precompile uses verify_prehash — sign the hash directly, no double-hashing)
function signP256(privKey, payloadHash) {
  return p256.sign(payloadHash, privKey) // returns 64-byte compact r‖s
}

// 3. Build secp256r1 precompile instruction
function buildSecp256r1Ix(pubkey, sig, message) {
  const HEADER = 16                        // count(1) + padding(1) + offsets(14)
  const pkOffset  = HEADER                 // 16
  const sigOffset = HEADER + 33            // 49
  const msgOffset = HEADER + 33 + 64       // 113
  const data = Buffer.alloc(msgOffset + message.length)
  data[0] = 1                              // num_signatures
  data[1] = 0                              // padding byte (required)
  data.writeUInt16LE(sigOffset, 2)
  data.writeUInt16LE(0xffff,    4)
  data.writeUInt16LE(pkOffset,  6)
  data.writeUInt16LE(0xffff,    8)
  data.writeUInt16LE(msgOffset, 10)
  data.writeUInt16LE(message.length, 12)
  data.writeUInt16LE(0xffff,    14)
  Buffer.from(pubkey).copy(data, pkOffset)
  Buffer.from(sig).copy(data, sigOffset)
  Buffer.from(message).copy(data, msgOffset)
  return new TransactionInstruction({ keys: [], programId: new PublicKey(SECP256R1_PROGRAM_ID), data })
}

// 4. Build and send the transaction
const vault     = await program.account.vaultState.fetch(vaultPda)
const nonce     = vault.nextNonce.toNumber()
const expiry    = Math.floor(Date.now() / 1000) + 300
const hash      = vaultPayloadHash(program.programId.toBase58(), vaultPda.toBase58(), amount, nonce, expiry)
const sig       = signP256(p256PrivKey, hash)
const pubKey    = p256.getPublicKey(p256PrivKey, true)   // 33-byte compressed

const proofIx   = buildSecp256r1Ix(pubKey, sig, hash)
const withdrawIx = await program.methods
  .registryVaultWithdraw(new anchor.BN(amount), new anchor.BN(expiry))
  .accounts({ vault: vaultPda, registry: registryPda, owner: owner.publicKey, to: dest, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
  .instruction()

const tx = new Transaction()
tx.add(proofIx)    // MUST be instruction 0
tx.add(withdrawIx)
await sendAndConfirmTransaction(connection, tx, [owner])
```

---

## Path 2 — Bridge (Ed25519 server key)

Use this if you have a backend service that verifies the second factor (WebAuthn, OTP, etc.) and signs proofs.

### Backend: sign a proof

```typescript
import nacl from "tweetnacl"
import { createHash } from "crypto"

// SERVER_SECRET_KEY = 64-byte Ed25519 secret key (stored in env, never exposed)
const serverKp = nacl.sign.keyPair.fromSecretKey(Buffer.from(process.env.SERVER_SECRET_KEY, "base64"))

function signProof(programId, vault, amount, nonce, expiry) {
  const json = JSON.stringify({ programId, instruction: "vault_withdraw", vault, amount, nonce, expiry })
  const hash = createHash("sha256").update(json).digest()
  const sig  = nacl.sign.detached(hash, serverKp.secretKey)
  return { payloadHash: hash, signature: sig, serverPublicKey: serverKp.publicKey }
}
```

### Frontend: attach proof and send

```typescript
import { Ed25519Program, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js"

const { payloadHash, signature, serverPublicKey } = await fetch("/api/approve", { ... }).then(r => r.json())

const proofIx = Ed25519Program.createInstructionWithPublicKey({
  publicKey:  Buffer.from(serverPublicKey),
  message:    Buffer.from(payloadHash),
  signature:  Buffer.from(signature),
})

const withdrawIx = await program.methods
  .vaultWithdraw(new BN(amount), new BN(nonce), Array.from(payloadHash), new BN(expiry))
  .accounts({ config: configPda, vault: vaultPda, owner, to: dest, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
  .instruction()

const tx = new Transaction()
tx.add(proofIx)    // MUST be instruction 0
tx.add(withdrawIx)
await sendAndConfirmTransaction(connection, tx, [owner])
```

---

## One-time setup (both paths)

```typescript
// Deploy once — initialize the guard config
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)

await program.methods
  .initialize(new BN(20 * 1_000_000_000), true) // threshold = 20 SOL
  .accounts({ config: configPda, serverKey, authority: payer.publicKey, systemProgram: SystemProgram.programId })
  .rpc()

// Create vault for each user
const [vaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), owner.publicKey.toBuffer()],
  program.programId
)
await program.methods.initVault(false)
  .accounts({ vault: vaultPda, owner: owner.publicKey, systemProgram: SystemProgram.programId })
  .rpc()
```

---

## Payload hash format

The canonical JSON **must match exactly** (key order matters):

```
vault_withdraw / registry_vault_withdraw:
{"programId":"<id>","instruction":"vault_withdraw","vault":"<addr>","amount":<lamports>,"nonce":<u64>,"expiry":<unix_ts>}

protected_transfer:
{"programId":"<id>","instruction":"transfer","amount":<lamports>,"nonce":"<32-byte-hex>","expiry":<unix_ts>}
```

---

## Secp256r1 precompile — gotchas

| | Correct | Wrong |
|--|--|--|
| Header | `[count][padding][offsets at byte 2]` | `[count][offsets at byte 1]` (no padding) |
| Signing | `p256.sign(payloadHash, privKey)` | `p256.sign(sha256(payloadHash), privKey)` |
| Pubkey format | 33-byte compressed SEC1 | 65-byte uncompressed |
| Sig format | 64-byte compact r‖s | DER-encoded |
| Proof position | Instruction 0 | Any other index |

---

## Program ID (devnet)

```
572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6
```

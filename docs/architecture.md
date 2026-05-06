# Architecture

## Overview

Trana Guard is structured as three cooperating layers:

```
┌─────────────────────────────────────────────────────┐
│  dApp / Demo UI  (apps/web)                         │
│  React + Phantom wallet                             │
└──────────────────┬──────────────────────────────────┘
                   │  TypeScript SDK
┌──────────────────▼──────────────────────────────────┐
│  packages/sdk                                       │
│  WebAuthn  │  Intent hash  │  Tx builder            │
└──────────────────┬──────────────────────────────────┘
                   │  Signed transaction
┌──────────────────▼──────────────────────────────────┐
│  Solana Runtime                                     │
│                                                     │
│  ix[N-2]  secp256r1 precompile  (SIMD-0075)        │
│  ix[N-1]  trana::record_proof   (data carrier)      │
│  ix[N]    your_program::action  → trana::enforce()  │
└─────────────────────────────────────────────────────┘
```

All three layers are required. The runtime enforces atomicity — all instructions succeed or all fail. There is no way to get ix[N] to land without ix[N-2] and ix[N-1].

---

## Components

### 1. `programs/guard` — The Authorization Primitive

A single deployed program. Anyone integrates against it. It has exactly three instructions:

**`register_two_fa`**
Writes a P-256 public key and WebAuthn credential ID into a PDA owned by the user's wallet. Seeds: `["2fa", wallet_pubkey]`. Idempotent — re-registering updates the key (useful for device rotation). Nonce is preserved across re-registration to prevent replay.

**`record_proof`**
A pure data carrier. Carries WebAuthn binding bytes (authenticatorData, clientDataJSON, expiry, policy, cluster) in its instruction data. Does nothing else. It exists so the protected instruction can read proof data from the Instructions sysvar without passing it as parameters.

**`enforce`**
Called by external programs via CPI. Reads the two preceding instructions from the Instructions sysvar, verifies the P-256 signature, checks the intent hash, increments the nonce. If any check fails, the entire transaction is reverted.

### 2. `programs/demo_vault` — The Integration Reference

Not a product. A complete, working example showing how to integrate Trana into your program. Contains three real policies. Copy the pattern, not the vault.

### 3. `packages/sdk` — TypeScript Client

Browser-first. No Node.js backend required. Key modules:

- `react/webauthn.ts` — `doRegistration()`, `doApproval()`, DER→compact, low-S normalization
- `react/intent.ts` — `buildIntent()`, `hashIntent()` (must match Rust exactly)
- `react/registry.ts` — PDA derivation, account parsing, live subscription
- `secp256r1.ts` — `buildSecp256r1Ix()`, `buildRecordProofIx()`, `buildWebAuthnMessage()`
- `react/provider.tsx` — React context, `useTrana()` hook, automatic proof injection

---

## Full Authorization Flow

Below is the complete flow for a protected instruction, step by step.

```
User device                   SDK                        Solana
──────────                    ───                        ──────

1.  dApp calls authorizeAndSend()
           │
2.         ├─ fetchRegistry() ──────────────────────────► read registry PDA
           │                  ◄────────── { pubkey, credentialId, nonce }
           │
3.         ├─ buildIntent()
           │    version=1, domain="trana:v1", cluster,
           │    wallet, tranaGuardProgramId, targetProgramId,
           │    policy, discriminator, accountsHash, paramsHash,
           │    nonce, expiryUnix
           │
4.         ├─ hashIntent()  →  32-byte SHA-256
           │
5.         ├─ navigator.credentials.get(challenge = intentHash)
           │                                         ◄── Touch ID / Face ID
           │    ◄── { sig (DER), authenticatorData, clientDataJSON }
           │
6.         ├─ derToCompact(sig) → lowS(compact) → 64-byte r‖s
           │
7.         ├─ buildWebAuthnMessage(authData, cdJSON)
           │    = SHA-256(authData ‖ SHA-256(cdJSON))   [32-byte e-value]
           │
8.         ├─ buildSecp256r1Ix(pubkey, sig, eValue)     [ix[N-2]]
           │
9.         ├─ buildRecordProofIx(authData, cdJSON,       [ix[N-1]]
           │       expiry, cluster, policy)
           │
10.        ├─ buildTransaction() → your_program::action  [ix[N]]
           │
11.        ├─ getLatestBlockhash()
           │
12.        ├─ signTransaction()  ◄────────── Phantom wallet signs
           │
13.        └─ sendRawTransaction()  ────────────────────► Solana runtime

                                        Runtime executes ix[N]:
                                          your_program::action()
                                            └─ trana::cpi::enforce()
                                                 │
14.                                              └─ verify_via_sysvar()
```

### verify_via_sysvar — What Happens Onchain

```
  Input: Instructions sysvar (contains all ixs in this tx)

  Step 0:  current_idx = load_current_index_checked()
           require!(current_idx >= 2)               → MissingProof if ≤ 1

  Step 1:  proof = ix[current_idx - 1]              → record_proof data
           Deserialize: version, expiry, cluster, policy, authData, cdJSON

  Step 2:  protected = ix[current_idx]              → your program's instruction
           target_program_id = protected.program_id
           discriminator     = protected.data[0..8]
           accounts_hash     = SHA-256(concat all protected.accounts[].pubkey)
           params_hash       = SHA-256(protected.data[8..])

  Step 3:  require!(clock.unix_timestamp < proof.expiry)  → ProofExpired

  Step 4:  intent_hash = compute_intent_hash(
             "trana:v1", proof.cluster,
             owner, trana_guard_program_id, target_program_id,
             proof.policy, discriminator,
             accounts_hash, params_hash,
             registry.nonce, proof.expiry
           )

  Step 5:  challenge = base64url_decode(cdJSON["challenge"])
           require!(challenge == intent_hash)         → PayloadMismatch

  Step 6:  e_value = SHA-256(authData ‖ SHA-256(cdJSON))

  Step 7:  secp_ix = ix[current_idx - 2]
           require!(secp_ix.program_id == secp256r1)  → MissingProof
           pubkey  = secp_ix.data[pk_offset..pk_offset+33]
           message = secp_ix.data[msg_offset..msg_offset+32]
           require!(pubkey  == registry.pubkey_bytes)  → WrongSigner
           require!(message == e_value)                → PayloadMismatch

  Step 8:  old_nonce = registry.nonce
           registry.nonce += 1                        → prevents replay

  Step 9:  msg!("TRANA enforce | policy=... | target=... | nonce=...")
           emit!(ProofVerified { owner, policy, target, nonce, expiry })
```

No value leaves the chain to be verified. The entire proof is read from the same transaction by the same program execution that calls enforce(). The Solana runtime guarantees atomicity.

---

## Intent Hash

The intent hash is the cryptographic binding between the passkey signature and the exact transaction. It commits to:

```
SHA-256(
  u8(1)                          version
  u16LE(len) + "trana:v1"        domain
  u16LE(len) + cluster           "devnet" | "mainnet-beta"
  32 bytes                       wallet pubkey
  32 bytes                       guard program ID
  32 bytes                       target program ID
  u16LE(len) + policy_id         "transfer.large", etc.
  8 bytes                        instruction discriminator
  32 bytes                       SHA-256(all account pubkeys)
  32 bytes                       SHA-256(instruction params)
  u64LE                          nonce (from registry PDA)
  i64LE                          expiry unix timestamp
)
```

The passkey signs this 32-byte hash as the WebAuthn challenge. If any field changes after the user approves, the hash changes, the challenge mismatch fails `PayloadMismatch` onchain.

This computation is done identically in:
- TypeScript: `packages/sdk/src/react/intent.ts` → `hashIntent()`
- Rust: `programs/guard/src/lib.rs` → `compute_intent_hash()`

They must match exactly. The tests verify this.

---

## Registry PDA Layout

Seeds: `["2fa", wallet_pubkey]`, program: `guard`.

```
Offset  Bytes  Field
──────  ─────  ─────
0       8      Anchor discriminator
8       32     owner (Pubkey)
40      1      key_kind (0 = Secp256r1Passkey, 1 = Ed25519)
41      4      pubkey_bytes length (u32 LE)
45      ≤33    pubkey_bytes (33-byte compressed P-256)
?       4      credential_id length (u32 LE)
?       ≤128   credential_id (WebAuthn credential ID)
?       1      enabled (bool)
?       8      nonce (u64 LE)
```

Total space allocated: 219 bytes (fixed at `init_if_needed`).

The `nonce` field is the replay counter. It starts at 0, increments on every successful `enforce()` call. A proof carrying nonce=5 is only valid when the registry reads 5; after use it reads 6, so the same proof cannot be reused.

---

## Transaction Layout Rules

The SDK assembles transactions in this exact order:

```
ix[0]:     secp256r1 precompile   (mandatory, always first when proof present)
ix[1]:     trana::record_proof    (mandatory, always second when proof present)
ix[2..N]:  your instruction(s)    (developer's transaction)
```

For transactions with existing compute budget or durable nonce instructions, the SDK uses `insertProofIx` which skips those when finding the insertion point. The rule is: proof instructions immediately precede the first non-system, non-budget instruction.

---

## SDK Architecture

```
packages/sdk/src/
├── index.ts              exports
├── secp256r1.ts          buildSecp256r1Ix, buildRecordProofIx, buildWebAuthnMessage
├── utils.ts              sha256Bytes, generateNonce
├── testing.ts            Node.js test helpers (never import in production)
└── react/
    ├── webauthn.ts       doRegistration, doApproval, derToCompact, lowS
    ├── intent.ts         buildIntent, hashIntent, TranaIntent type
    ├── registry.ts       findRegistryPda, fetchRegistry, subscribeRegistry
    ├── detector.ts       detectEnforcement, hasSecp256r1Ix
    ├── state.ts          TranaState, TranaConfig types
    ├── provider.tsx      TranaProvider, useTranaContext
    ├── useTrana.ts       useTrana() → authorizeAndSend()
    ├── modal.tsx         RegistrationModal, ApprovalModal
    └── error.ts          isTranaError, parseTranaError
```

The `react/` directory is browser-only. The `testing.ts` module is Node.js only. Everything else runs in both environments.

---

## Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                         Browser                                    │
│                                                                    │
│  wallet.publicKey ──┐                                              │
│  tranaGuardProgramId ──┤                                           │
│  targetProgramId  ──┤                                              │
│  policy           ──┤                                              │
│  accounts         ──┼──► buildIntent() ──► hashIntent()           │
│  params           ──┤         │                │                   │
│  nonce (PDA)      ──┘         │                ▼                   │
│                               │         32-byte challenge          │
│                               │                │                   │
│                               │      navigator.credentials.get()  │
│                               │                │                   │
│                               │         ◄── Touch ID               │
│                               │                │                   │
│                               │    { sig (DER), authData, cdJSON } │
│                               │                │                   │
│                               │     derToCompact + lowS            │
│                               │                │                   │
│                               │     64-byte compact sig            │
│                               │                │                   │
│  ┌────────────────────────────▼────────────────▼──────────────┐   │
│  │  Transaction                                                │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ ix[0] secp256r1  pubkey=33B  sig=64B  msg=SHA256(32) │  │   │
│  │  ├──────────────────────────────────────────────────────┤  │   │
│  │  │ ix[1] record_proof  authData | cdJSON | expiry | ... │  │   │
│  │  ├──────────────────────────────────────────────────────┤  │   │
│  │  │ ix[2] your_program::action  (no proof params needed) │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  │                                                             │   │
│  │  wallet.signTransaction()  → submit                        │   │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                            │
                            ▼ Solana runtime
              ┌─────────────────────────────┐
              │ secp256r1: verifies sig      │
              │ record_proof: noop           │
              │ your_program::action()       │
              │   └► trana::cpi::enforce()   │
              │       └► verify_via_sysvar() │
              │           reads ix[0],[1],[2]│
              │           from Instructions  │
              │           sysvar             │
              │           verifies all       │
              │           increments nonce   │
              │           emits ProofVerified│
              └─────────────────────────────┘
```

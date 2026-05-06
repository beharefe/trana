# Architecture Decision Records

Each section answers a "why not X?" question that naturally arises when reading this codebase.

---

## ADR-001: secp256r1 over Ed25519

**Decision:** Use the secp256r1 (P-256) precompile for signature verification, not Ed25519.

**Why secp256r1:**
WebAuthn — the browser standard for passkeys (Touch ID, Face ID, YubiKey, Windows Hello) — uses P-256 by default. All major operating systems, browsers, and authenticators support it natively. A user clicks "use Face ID" and gets a P-256 key. No custom hardware, no app installs, no seed phrases.

**Why not Ed25519:**
Ed25519 is Solana's native signature algorithm. Verifying it via the Instructions sysvar is straightforward. But WebAuthn authenticators don't produce Ed25519 signatures — they produce P-256. Bridging would require a server to hold an Ed25519 key that re-signs after WebAuthn verification, introducing a trusted third party. This defeats the purpose: now the server is the second factor, not the user's device.

**Why not a bridge server anyway:**
A bridge server is a central point of failure, a point of compromise, and a point of trust. If the bridge is down, the feature is down. If the bridge is compromised, every user's second factor is compromised. With secp256r1 native verification, the second factor lives on the user's device, verified by the Solana runtime — no server can fake it.

**Enabling technology:**
SIMD-0075 added the secp256r1 precompile to Solana mainnet in Agave v2.1 (February 2025). This is what makes the entire design possible.

---

## ADR-002: No Backend Required

**Decision:** The entire flow — registration, approval, proof verification — requires zero server infrastructure.

**The common question:** "But WebAuthn requires a relying party server (RP server) for verification, right?"

**The answer:** WebAuthn traditionally requires an RP server to *store* credentials and *verify* assertion responses server-side. Trana does neither:

- **Storage:** The P-256 public key is stored in the TwoFactorRegistry PDA on Solana. The blockchain is the credential store.
- **Verification:** The secp256r1 precompile plus `verify_via_sysvar` do all verification onchain. No server sees the assertion.

The browser's WebAuthn API is used only to produce the signature. The challenge is the intent hash. The "RP server" role is replaced by the guard program.

**Registration challenge:** For registration, we use a random 32-byte challenge (security comes from the public key being stored onchain, not from the challenge binding). For approval, the challenge IS the intent hash — cryptographically binding the passkey signature to the exact transaction.

---

## ADR-003: Guard is a Separate, Immutable Primitive

**Decision:** The guard program contains zero application logic. It is a pure authorization primitive, deployed once, used by many.

**Why separate:**
If every protocol embedded their own verification logic, you'd have N implementations, N audit surfaces, N upgrade paths. A bug in one doesn't affect others.

Trana's verification logic — intent hash, nonce, secp256r1 check — is a commodity. It should be audited once and trusted universally, like how Solana's SPL token program is audited once and trusted by all token holders.

**Why no vault/DeFi logic in guard:**
An earlier iteration had vault operations inside the guard program. This was wrong for two reasons:
1. It couples audit scope. Auditing "the authorization primitive" should be independent of "the specific DeFi logic".
2. It prevents reuse. A DAO wanting to guard admin proposals doesn't want vault code.

The guard program is now ~380 lines. Integration logic lives in each integrator’s program. This is the correct separation.

**Immutability goal:**
Once guard is audited and deployed on mainnet, it should not change. Protocols building on it need the guarantee that the program they integrated against today is the program that runs tomorrow. Upgrade authority will be burned after audit.

---

## ADR-004: Instructions Sysvar over Account Parameters

**Decision:** Proof data is carried via the Instructions sysvar, not via instruction parameters.

**The alternative:** Pass `authenticatorData`, `clientDataJSON` as arguments to the protected instruction, which passes them to `enforce()`.

**Why sysvar is better:**

1. **No proof data in application instructions.** The protected instruction's parameters are only application data (amount, recipient, etc.). This is cleaner, smaller, and more composable — the developer's instruction doesn't know or care about the proof format.

2. **Binding to the exact instruction.** When `verify_via_sysvar` reads ix[N] from the sysvar, it reads the exact instruction that called `enforce()`. The `accounts_hash` and `params_hash` are computed from this exact instruction. If the tx was modified after signing, the hash won't match.

3. **Atomic position binding.** The secp256r1 precompile MUST be at `current_idx - 2` and `record_proof` MUST be at `current_idx - 1`. This is enforced by index arithmetic on the sysvar. You cannot insert a proof for a different instruction and have it validate another.

**The caveat:** `load_current_index_checked()` returns the top-level instruction index even during CPI. This is by design — it means the protected instruction at index N is correctly identified even when `enforce()` is called via CPI from inside your program’s instruction (e.g. a withdraw handler). The Solana runtime maintains this invariant.

---

## ADR-005: Intent Hash Includes Everything

**Decision:** The intent hash commits to program ID, accounts, params, policy, nonce, expiry, cluster, and guard program.

**Why so much?**

Every field prevents a specific attack:

| Field | Attack prevented |
|---|---|
| `targetProgramId` | Using a proof for program A to authorize program B |
| `instructionDiscriminator` | Using a "deposit" proof to authorize "withdraw" |
| `accountsHash` | Swapping the recipient account after user approval |
| `paramsHash` | Changing the amount after user approval |
| `policy` | Using a "transfer.large" proof to satisfy "transfer.always" |
| `nonce` | Replaying an old proof (nonce consumed on use) |
| `expiryUnix` | Using a proof hours/days later |
| `cluster` | Using a devnet-approved proof on mainnet |
| `tranaGuardProgramId` | Using a proof from a different (possibly malicious) Trana Guard deployment |
| `wallet` | Using another user's proof for your transaction |

Omitting any of these creates an attack vector. The intent hash is conservative by design.

---

## ADR-006: Nonce Preserved on Re-registration

**Decision:** When a user re-registers their passkey (new device, lost device, key rotation), the nonce is preserved.

**Why:** The nonce is an anti-replay counter. If re-registration reset the nonce to 0, an attacker who obtained an old signed proof (nonce=5) could:
1. Wait for the user to re-register (nonce resets to 0)
2. Wait for 5 legitimate transactions (nonce = 5)
3. Replay the old proof (nonce matches again)

Preserving the nonce means old proofs remain permanently invalid even after key rotation.

---

## ADR-007: Low-S Normalization

**Decision:** All signatures are normalized to low-S form before submission.

**Why:** The secp256r1 precompile rejects high-S signatures. ECDSA signatures have two valid forms for any (r, s) pair: s and n-s (where n is the curve order). The precompile, following the bitcoin and Ethereum convention, only accepts the "canonical" low-S form where s ≤ n/2.

WebAuthn authenticators can produce either form. The SDK normalizes automatically.

Failure to normalize produces a `WrongSigner` or silent failure from the precompile — a confusing error. Normalization is applied in `doApproval()` before the signature is ever used.

---

## ADR-008: Policy Strings in the Intent Hash

**Decision:** Policy identifiers are human-readable strings (e.g. `"transfer.large"`), not integers.

**Why strings:**

1. **Readability in transaction logs.** `msg!("TRANA enforce | policy=transfer.large | ...")` is immediately understandable without a lookup table.

2. **Application-defined.** Different protocols define their own policies. A DAO might use `"governance.proposal"`. A lending protocol might use `"borrow.large"`. These don't collide — namespacing is natural.

3. **Bound in the intent hash.** A proof signed for `"transfer.large"` cannot satisfy `"transfer.rapid_drain"` because the hash differs. The policy string is part of the cryptographic commitment.

**Why not integers:** Integers require a global registry. Strings are self-describing and protocol-local.

---

## ADR-009: Simulate-First Detection (optional)

**Decision:** The SDK supports two detection modes: simulate-first and assume-enforcement.

**Simulate-first** calls `simulateTransaction` (no sig verify, replaced blockhash) and looks for the `TRANA_MISSING_PROOF` log marker. If found, the passkey UI is shown. If not found, the transaction proceeds without passkey overhead.

**Assume-enforcement** (the default in `authorizeAndSend`) always does the passkey flow if the registry is enabled.

**Why offer both:**
- Simulate-first is better UX for transactions that may or may not need a passkey (e.g. small withdrawals most of the time, occasionally large).
- Assume-enforcement is simpler, deterministic, and slightly faster (no extra RPC call). Good for flows where you know enforcement is always triggered.

**Why not simulate-only:** Simulation result is advisory. The policy must still be enforced onchain. Simulation tells you whether to trigger the UI, not whether the transaction will succeed.

---

## ADR-010: Single CPI Call as the Entire Integration

**Decision:** External programs integrate with exactly one CPI call: `trana::cpi::enforce(cpi_ctx)?`.

**Why this matters:**
The alternative is having the external program do its own sysvar reads, deserializations, and hash computations. This is error-prone, hard to audit, and creates N implementations of the same logic.

With the single CPI call, the guard program owns all verification. The external program only decides *when* to call it. That decision (the policy) is application logic — exactly what the external program should own.

**The three extra accounts** (`trana_guard_program`, `trana_registry`, `trana_instructions`) are the overhead. That's the full integration cost — three accounts and one function call.

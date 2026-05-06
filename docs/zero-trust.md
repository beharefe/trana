# Zero-Trust Security Model

## What "Zero Trust" Means Here

In Trana's context, zero trust means: **no party other than the user's passkey device can authorize a protected instruction**. Not the dApp. Not the SDK. Not the server (there is no server). Not the wallet. Not Trana's own team.

This is enforced by mathematics and the Solana runtime, not by policy agreements or legal contracts.

The term is sometimes overloaded in security marketing. Here we define it precisely: a specific list of what each party can and cannot do.

---

## Trust Anchors

These are the only things Trana trusts:

**1. The Solana secp256r1 precompile (SIMD-0075)**
Built into the validator. Verifies P-256 signatures. Cannot be forged. Its correctness is the same property you rely on for all Solana transactions.

**2. The TwoFactorRegistry PDA**
An account on the blockchain. Contains the user's P-256 public key. The user set this key by running `register_two_fa` and signing with their wallet. No one can change it without the user's wallet signature (the PDA is owned by the guard program, write access gated by `has_one = owner`).

**3. The user's passkey hardware**
Touch ID, Face ID, YubiKey, Windows Hello. The private key never leaves the device. The device requires biometric or PIN verification before signing. This is the browser's WebAuthn guarantee.

Nothing else. The SDK is not trusted. The dApp is not trusted. The RPC node is not fully trusted (we verify onchain). Trana as an organization is not trusted.

---

## What Each Party Can and Cannot Do

### The dApp / SDK
- **Can:** Build the transaction, show the passkey prompt, submit the signed transaction.
- **Cannot:** Forge a signature. Cannot change the intent hash after the user approves. Cannot reuse an old proof. Cannot impersonate the user's device.

If the dApp is completely compromised (XSS, supply chain attack), the attacker can:
- Show the user a deceptive prompt
- Not show the user what they're approving

But if the user clicks "approve" on a deceptive prompt, the proof is still only valid for the exact transaction described in the intent hash. The attacker cannot substitute a different transaction after approval.

### The RPC Node
- **Can:** Censor transactions, delay submission, return wrong state in simulations.
- **Cannot:** Forge proofs. Cannot construct a valid proof without the user's passkey private key.

Denial-of-service via censorship is possible but not unique to Trana. Trana doesn't make it worse.

### The Wallet (Phantom / etc.)
- **Can:** Sign the Solana transaction (both wallet + passkey are required).
- **Cannot:** Execute a protected instruction without a valid proof. The wallet signature alone is insufficient.

This is the key property: **private key compromise alone cannot drain a Trana-protected vault**. An attacker who steals the wallet's seed phrase still cannot produce a valid P-256 proof without the user's registered passkey hardware.

### Trana (the team)
- **Can:** Update the SDK, fix bugs in demo UI, write documentation.
- **Cannot:** Generate proofs. The guard program is permissionless — no admin key, no upgrade authority after audit. Once deployed, the verification logic is immutable.

---

## Attack Scenarios and Why They Fail

### Attack 1: Raw transaction without proof
Attacker constructs and submits a `demo_vault::withdraw` without `secp256r1` and `record_proof` instructions.

**Failure point:** `verify_via_sysvar` requires `current_idx >= 2` and checks that `ix[current_idx - 2]` is the secp256r1 precompile. If either is missing, `MissingProof` is returned and the transaction reverts.

Error: `GuardError::MissingProof (0x1770)`.

---

### Attack 2: Replay old proof
Attacker captures a valid transaction with a correct proof (nonce=3) and resubmits it later.

**Failure point:** Step 8 of `verify_via_sysvar` increments `registry.nonce` from 3 to 4 on the first use. On replay, the registry reads 4, but the intent hash was computed with nonce=3. The intent hash the proof commits to will no longer match.

Error: `GuardError::PayloadMismatch`.

---

### Attack 3: Tamper parameters after proof issued
User approves a 0.1 SOL withdrawal. Attacker intercepts and changes the amount to 100 SOL.

**Failure point:** `params_hash = SHA-256(instruction.data[8..])`. The intent hash includes the params_hash. If the amount changes, the params_hash changes, the intent hash changes, and the challenge embedded in `clientDataJSON` no longer matches.

Error: `GuardError::PayloadMismatch`.

---

### Attack 4: Substitute recipient account
User approves sending to address A. Attacker replaces address A with their own address B.

**Failure point:** `accounts_hash = SHA-256(concat all instruction.accounts[].pubkey)`. The accounts_hash is in the intent hash. Replacing any account key changes the accounts_hash.

Error: `GuardError::PayloadMismatch`.

---

### Attack 5: Use proof from one program on another
User approves action on program A. Attacker tries to use that proof on program B.

**Failure point:** `targetProgramId` is in the intent hash. The proof commits to program A's address. Program B's address is different.

Error: `GuardError::PayloadMismatch`.

---

### Attack 6: Wrong signing key (different device)
Attacker registers their own passkey for the victim's wallet (requires access to victim's wallet private key).

**Failure point:** `register_two_fa` requires the owner (wallet keypair) to sign. If the attacker has the wallet private key but not the passkey, they can re-register — but this is wallet compromise, not Trana's threat model. Trana protects against single-key compromise; if an attacker has the wallet key, wallet security is already broken at a deeper level.

**What Trana does protect:** An attacker who has the wallet key but NOT the passkey cannot authorize enforcement. They would need to re-register, which requires the wallet key, then use their new passkey. This is detectable (nonce resets... wait, no — nonce is preserved on re-registration per ADR-006). The victim's old proofs become invalid because the pubkey changed, but new ones can be issued. This is the key rotation scenario — it requires wallet compromise AND the attacker to notice the opportunity.

**Mitigation:** Future versions can add a 2FA guardian for re-registration itself.

---

### Attack 7: Use expired proof
Attacker captures a proof. User's device clock is fast, so the proof wasn't expired when captured, but now it is.

**Failure point:** `require!(clock.unix_timestamp < proof.expiry)`. The Solana clock is the authoritative timestamp. Default expiry is 120 seconds. There is no way to extend an expired proof.

Error: `GuardError::ProofExpired`.

---

### Attack 8: Devnet proof on mainnet
Attacker generates a valid proof on devnet (easy — free SOL, no real assets). Tries to replay on mainnet.

**Failure point:** `cluster` is in the intent hash. `"devnet"` and `"mainnet-beta"` produce different intent hashes. The proof committed to "devnet" will not match on mainnet.

Error: `GuardError::PayloadMismatch`.

---

### Attack 9: Malicious guard program
A protocol integrates against a fake guard program that always returns success.

**Failure point:** This is not Trana's attack surface — this is the protocol's responsibility to integrate against the correct program ID. The demo vault has `trana_guard_program` pinned to the real Trana Guard address. Any protocol integrating Trana should similarly pin `NEXT_PUBLIC_TRANA_GUARD_PROGRAM_ID` (or the equivalent in their stack).

Mitigation: Verification of the guard program's deployed bytecode hash against the audited version.

---

## Security Properties — Summary

| Property | Guaranteed by |
|---|---|
| Proof forgery impossible | secp256r1 precompile (cryptographic) |
| Replay impossible | Registry nonce (incremented on use) |
| Parameter tampering blocked | params_hash in intent |
| Account substitution blocked | accounts_hash in intent |
| Cross-program abuse blocked | targetProgramId in intent |
| Cross-cluster abuse blocked | cluster in intent |
| Expiry enforced | Solana clock + expiryUnix in intent |
| Wrong signer rejected | pubkey check vs registry PDA |
| Atomic with execution | Solana runtime (all-or-nothing tx) |
| No server to compromise | No server |
| No admin key | Permissionless program |

---

## What Trana Does Not Protect Against

Being honest about scope matters:

1. **Phishing / deceptive UX.** If the dApp shows "approve 0.1 SOL withdrawal" but the intent hash is for 100 SOL, the user approves the wrong thing. Trana enforces what the intent says — it doesn't independently render the intent for the user. The SDK provides `TranaIntent` to display in the modal, but a malicious dApp can lie in its UI while building a correct-but-different intent.

2. **Complete wallet compromise.** If an attacker has the wallet private key and re-registers a new passkey on the victim's PDA, they can authorize their own transactions. This requires wallet compromise to initiate — at that point the user's on-chain security is already broken.

3. **Passkey device compromise.** If the attacker has access to the user's device and can pass biometrics, they can produce valid proofs. Hardware passkeys (YubiKey) mitigate this better than device-based biometrics.

4. **Consensus-level attacks.** A validator majority that can reorder transactions or ignore sysvar state could theoretically bypass checks. This is outside Trana's scope and applies to all Solana programs.

---

## Zero-Trust Audit Trail

Every successful proof verification emits:

```
Program log: TRANA enforce | policy=transfer.large | target=Cm2jPgn... | nonce=7
```

And a structured `ProofVerified` event (visible via `getParsedTransaction`):

```json
{
  "owner":  "WalletPubkey...",
  "policy": "transfer.large",
  "target": "Cm2jPgn1ipUAFarS7DpF2Y1X1HofKZgDKLmH65DtCNrZ",
  "nonce":  7,
  "expiry": 1713456789
}
```

Any block explorer, indexer, or monitoring tool can read these. An operations team can alert on unexpected policies, unusual target programs, or nonce gaps. This is the zero-trust audit trail: every protected action is permanently recorded onchain with full context.

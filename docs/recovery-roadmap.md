# Trana Recovery — Proposed Roadmap

**Status: Not implemented. Design only.**

v1 ships with a single registered passkey per user. If the device is lost, the key is gone.
This document describes the three recovery tiers planned for future versions.
No code for any of these tiers exists yet.

---

## The problem

A passkey is hardware-bound. Losing the device means losing access.
Recovery must solve: _how does a user prove identity without the original passkey?_

Three answers exist, with different trust trade-offs:

| Tier | Name | Trust assumption |
|---|---|---|
| v2 | Backup passkey | None — second device, same user |
| v3 | Social recovery | N-of-M guardian wallets |
| v4 | SAS attestation | Solana Attestation Service KYC |

---

## v2 — Paranoid: Backup passkey

**Mechanism:** Force registration of a second passkey at setup time. If the primary is lost, the backup takes over.

**Why it's the right v2:**
- Zero new trust assumptions
- Fully onchain, no oracles, no governance
- No new program accounts or instructions beyond what already exists in `register_two_fa`

**How it would work:**
1. The SDK enforces at registration time: a second passkey on a different device must be enrolled before the wallet is considered protected.
2. Onchain, the `TwoFactorRegistry` could gain a `backup_pubkey_bytes` field and a `backup_credential_id` field.
3. Recovery = the user authenticates with the backup passkey to call a new `replace_primary` instruction, which swaps `pubkey_bytes` and `credential_id`.

**Open questions:**
- Should backup passkeys be stored in the same PDA or a separate `BackupRegistry` PDA?
- Should the SDK allow more than two passkeys (multi-device)?
- UX: how do we prevent users from skipping backup registration?

---

## v3 — Pragmatic: N-of-M Social Recovery

**Mechanism:** A set of guardian wallets stored onchain. N-of-M of them can collectively initiate a recovery, subject to a 72-hour timelock. The current passkey holder can cancel during the window.

**Why it's the right v3:**
- No new external infrastructure
- Timelock backstop means a compromised minority of guardians can't instantly take over
- The 72h cancellation window gives the legitimate user time to intervene

**How it would work:**
1. A new `RecoveryConfig` PDA (`seeds = [b"recovery", owner]`) stores: `guardians: Vec<Pubkey>`, `threshold: u8`, `timelock_seconds: u64`.
2. A `propose_recovery` instruction collects guardian signatures. Once threshold is reached, a `RecoveryProposal` PDA is written with `new_passkey_bytes` and `unlock_at = clock.unix_timestamp + timelock_seconds`.
3. Any guardian can call `cancel_recovery` during the window. The current passkey holder can also cancel (via a signed `cancel_recovery` requiring proof of the existing passkey).
4. After `unlock_at`, anyone can call `finalize_recovery` to swap in the new passkey and close the proposal PDA.

**Open questions:**
- What's the right default threshold? 2-of-3? 3-of-5?
- How does the user manage the guardian set over time (add/remove guardians)?
- Griefing: can a malicious majority lock out the user indefinitely?
- Should recovery require an additional fee to disincentivize spam proposals?

---

## v4 — Compliant: SAS Attestation

**Mechanism:** The Solana Attestation Service (SAS) KYC attestation acts as the recovery anchor. At registration time, a valid SAS attestation for the user's identity is linked to the registry. Recovery = new passkey + a matching SAS attestation for the same verified identity.

**Why it's the right v4:**
- No runtime oracle — the attestation is already onchain at recovery time
- No guardian management or social coordination
- Ideal for institutional wallets, DAO membership, and compliant DeFi
- Attestations can expire and be renewed independently of the passkey

**How it would work:**
1. `register_two_fa` gains an optional `attestation_account: Option<Account<SasAttestation>>` parameter. If provided, the registry stores the attested identity hash.
2. A new `recover_with_attestation` instruction takes the new passkey bytes and a valid SAS attestation account. The program verifies: attestation is valid, not expired, and the identity hash matches the one stored at registration.
3. If both checks pass, the passkey is replaced with no timelock (KYC is the trust anchor).

**Open questions:**
- Which SAS attestation schema should Trana target? (KYC, proof-of-humanity, institutional credential?)
- What happens if the user's attestation expires before they need to recover?
- Should SAS recovery be opt-in at registration time or always available?
- Cross-chain attestations: does the attestation need to be on Solana mainnet, or can devnet attestations be accepted for testing?

---

## Interaction between tiers

These tiers are not mutually exclusive. A user could have:
- A backup passkey (v2) for day-to-day convenience
- A social recovery config (v3) as a fallback if both passkeys are lost
- An SAS attestation (v4) as the final backstop for institutional accounts

The priority order for recovery should be explicit in the program to avoid ambiguity.

---

## What v1 ships without

To be clear about scope: v1 (`trana` today) has **no recovery mechanism**. If a user loses their only passkey:

- The `TwoFactorRegistry` PDA remains onchain but the passkey is inaccessible.
- There is no admin override, no program authority bypass, no emergency backdoor.
- This is a deliberate security property of v1: no trust in the deployer, no recovery path.

The absence of recovery in v1 is the correct trade-off for a minimal auditable primitive.
Recovery adds complexity and new trust assumptions — each tier above is explicit about those costs.

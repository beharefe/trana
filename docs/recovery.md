# Passkey Recovery — Design Spec

## The Problem

Trana's security guarantee is: **wallet key alone is not enough**. Every gated action
requires a passkey signature. This is the whole point — if your wallet is compromised,
the attacker still can't drain your vault.

Recovery breaks this guarantee by design. Every path that lets you replace a lost passkey
is also a path an attacker can try to exploit. There is no free lunch. This document
defines how Trana handles that tradeoff.

---

## Why "Lost Passkey" Is Rarer Than It Sounds

Modern WebAuthn passkeys are designed to survive device loss:

| Platform | Sync mechanism | Survives phone loss? |
|---|---|---|
| iPhone / Mac | iCloud Keychain | ✓ (if iCloud enabled) |
| Android | Google Password Manager | ✓ (if Google account) |
| Windows Hello | Microsoft account | ✓ (if account synced) |
| Hardware key (YubiKey) | None | ✗ — truly single device |

For most users, "I lost my phone" does not mean "I lost my passkey." They restore
their phone, sign in to iCloud or Google, and the passkey is there.

**The genuinely dangerous scenario** is a hardware security key with no backup copy —
physically lost, stolen, or destroyed. That key is gone and no cloud sync saves you.

**Recommendation to users:** Register two passkeys — one on your phone (cloud-synced)
and one on a hardware key stored somewhere safe. Losing one means you still have the other.

---

## Threat Model

Before speccing recovery, define who we're defending against:

| Scenario | Attacker has | Should they succeed? |
|---|---|---|
| Normal use | Nothing | No |
| Wallet key stolen | Wallet keypair only | No — passkey still required |
| Passkey device stolen | Passkey device only | No — wallet key still required |
| Both stolen | Wallet keypair + passkey | Yes — attacker has everything |
| Lost passkey, legit user | Wallet keypair only | Yes — but with friction + observable delay |
| Lost everything | Neither | No recovery possible without guardians |

The key invariant: **wallet key alone must never be sufficient to bypass trana**, except
through a time-locked path that gives the legitimate owner time to intervene.

---

## Recovery Layers (in priority order)

### Layer 1 — Cloud sync (no action required)

Most users never need recovery. Passkeys on iPhones and Android sync automatically.
Document this clearly in the SDK and onboarding flow. Prompt users to enable iCloud
Keychain / Google Password Manager during registration.

### Layer 2 — Second passkey (register upfront)

`register_two_fa` is idempotent — calling it again replaces the registered key.
A future version should support registering **up to N passkeys** (e.g., 3), any one
of which can authorize enforce(). If the primary is lost, use any other registered key
to deregister it and add a replacement.

This requires a new `TwoFactorRegistry` layout:
- `keys: Vec<PasskeyEntry>` instead of a single `pubkey_bytes`
- New instructions: `add_passkey`, `remove_passkey`
- `remove_passkey` requires a valid proof from any *other* registered key

### Layer 3 — Time-locked re-registration (emergency recovery)

When a user has lost ALL registered passkeys, the wallet key alone can initiate
recovery — but with a mandatory delay and an observable on-chain announcement.

**New fields on `TwoFactorRegistry`:**
```
pending_pubkey:    Option<Vec<u8>>   // new key waiting to activate
pending_kind:      Option<KeyKind>
pending_at:        Option<i64>       // unix timestamp when pending was set
```

**New instructions:**

`initiate_recovery(new_pubkey, new_key_kind)`
- Requires: wallet key signature only
- Effect: sets `pending_pubkey`, `pending_at = now`
- Does NOT change the active key
- Emits `RecoveryInitiated { owner, pending_at, effective_at }` event

`cancel_recovery()`
- Requires: **current passkey proof** OR wallet key (within first 1h only)
- Effect: clears `pending_*` fields
- Allows the legitimate owner (who still has their passkey) to abort an
  attacker-initiated recovery attempt

`finalize_recovery()`
- Requires: wallet key signature
- Condition: `now >= pending_at + RECOVERY_DELAY` (72 hours)
- Effect: replaces active key with `pending_pubkey`, clears `pending_*`
- Nonce is **not reset** — replay protection is preserved

**The 72-hour window:**
- Long enough for a legitimate owner to notice an unexpected recovery on-chain
  (via any block explorer, SDK notification, or on-chain event subscription)
- Short enough that genuine emergencies don't wait weeks
- Configurable per deployment? TBD — starting fixed at 72h

**What an attacker with only the wallet key can do:**
- Initiate recovery → observable on-chain immediately
- Must wait 72h — during which the real owner can cancel with their passkey
- Cannot shorten the window
- Cannot cancel once the real owner rejects it (cancel requires passkey after 1h)

**What a user who lost their passkey can do:**
- Initiate recovery with wallet key
- Wait 72h
- Finalize — new passkey active
- No way to speed this up (this friction is the security)

### Layer 4 — Guardian recovery (social / multisig)

For users who want maximum resilience — designate trusted addresses as guardians.
M-of-N guardians can authorize a passkey reset, subject to the same 72h time lock.

**New fields on `TwoFactorRegistry`:**
```
guardians:           Vec<Pubkey>   // up to 5
recovery_threshold:  u8            // min guardians required
```

**New instructions:**

`set_guardians(guardians: Vec<Pubkey>, threshold: u8)`
- Requires: current passkey proof (setting guardians is itself a privileged action)

`guardian_vote_recovery(new_pubkey)`
- Requires: guardian wallet signature
- Accumulates votes — once threshold reached, starts 72h time lock (same as Layer 3)

`cancel_recovery()` — same as Layer 3, passkey can cancel

This is the nuclear option. Recommended for protocols managing large TVL.

---

## What Happens If Everything Is Lost

If a user loses their passkey AND has no guardians AND loses their wallet key:

**There is no recovery.** Funds gated by `Policy::Always` or `Policy::Admin` are
permanently inaccessible. Funds below policy thresholds (e.g., small withdrawals that
don't trigger Threshold/Velocity) remain accessible.

This is a feature, not a bug. The security guarantee requires that some scenarios be
unrecoverable. Document this prominently. Encourage dual passkey registration and
guardian setup for anyone holding significant value.

---

## Implementation Priority

| Layer | Status | When |
|---|---|---|
| Layer 1 — Cloud sync docs | SDK + onboarding copy | v1 launch |
| Layer 2 — Multi-passkey registry | Spec ready, not implemented | v1.1 |
| Layer 3 — Time-locked recovery | Spec ready, not implemented | v1.1 |
| Layer 4 — Guardian recovery | Spec only | v2 |

Layers 2 and 3 should ship together — time-locked recovery without multi-passkey support
forces all emergency recovery through the 72h path, which is acceptable but not ideal.

---

## Open Questions

- **72h vs 48h vs 7d**: 72h is a gut feel. Needs user research. Longer = more secure,
  shorter = less friction for real emergencies.
- **Cancel window (1h)**: After 1h, only the passkey can cancel. Before 1h, the wallet
  key can also cancel (lets user immediately undo an accidental initiation). Is 1h right?
- **Nonce on recovery**: Should finalize_recovery reset the nonce? Currently no —
  preserving replay protection. An argument for reset: if the attacker used the old key
  between initiation and finalization, the nonce may have moved. In practice this is
  unlikely since the attacker presumably doesn't have the old passkey device.
- **Fee during recovery**: Should `finalize_recovery` charge a fee? Probably not —
  this is not an enforcement, it's account management. Keep it free.
- **Multiple pending recoveries**: Can there be two simultaneous pending recoveries
  (one from wallet key, one from guardians)? Spec says no — a new `initiate_recovery`
  while one is pending should fail. Require `cancel_recovery` first.

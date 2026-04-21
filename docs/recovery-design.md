# Key Recovery — Architecture Design Document
## Trana Guard · Initial Design · April 2026

---

## Problem Statement

A user registers a P-256 passkey (bound to their device) in their
`TwoFactorRegistry` PDA. Their wallet private key is then compromised.

The attacker can:
- Sign transactions with the stolen key
- Drain any unguarded funds immediately
- **But cannot bypass Trana** — guarded actions still require the passkey

The user cannot:
- Register a new passkey if the attacker controls the signing key
  (since `register_two_fa` requires a signer)
- Recover access to their own protocol position

**Goal:** Allow the user (or a trusted recovery party) to rotate the
`TwoFactorRegistry` authority to a new wallet — without introducing a new
attack vector that an attacker with only the stolen private key can abuse.

---

## Trust Model

| Actor | What they control |
|---|---|
| Attacker | Stolen private key (can sign txs) |
| Real user | Their passkey (device-bound, not stolen) |
| Protocol | Onchain program logic |
| Recovery contact | Pre-registered Pubkey (optional) |

**Invariant to preserve:** A stolen private key alone must never be sufficient
to change the `TwoFactorRegistry` to a key the attacker controls.

---

## Core Mechanism: Time-locked Recovery with Passkey Cancellation

### Recovery Account

A new PDA: `RecoveryState` seeded by `[b"recovery", owner]`

```rust
#[account]
pub struct RecoveryState {
    pub owner:          Pubkey,  // original owner (the PDA seed)
    pub new_authority:  Pubkey,  // proposed replacement wallet
    pub initiated_at:   i64,     // unix timestamp when recovery was initiated
    pub time_lock:      i64,     // seconds delay before recovery can complete
    pub recovery_key:   Pubkey,  // pre-registered recovery contact (optional)
    pub cancelled:      bool,    // set to true by passkey during time-lock
}
```

Seeds: `[b"recovery", owner]`

### Flow: Initiating Recovery

```
Caller: recovery_key (pre-registered) OR owner's wallet
Passkey: NOT required at initiation

ix[0]: guard::initiate_recovery {
    accounts: [owner_registry, recovery_state, payer, system_program],
    params:   { new_authority: Pubkey }
}
```

- `initiate_recovery` requires the **recovery key** as signer
  (not the compromised main key)
- If no recovery key was pre-registered, the instruction is disabled
- Sets `initiated_at = Clock::now()`, `cancelled = false`
- Emits `RecoveryInitiated { owner, new_authority, unlocks_at }`

### Flow: Completing Recovery (after time-lock)

```
Caller: recovery_key OR new_authority
Passkey: NOT required (passkey is what we're replacing)

ix[0]: guard::complete_recovery {
    accounts: [owner_registry, recovery_state, recovery_key],
}
```

- Requires `Clock::now() >= initiated_at + time_lock`
- Requires `recovery_state.cancelled == false`
- Writes `new_authority` as the new owner on the `TwoFactorRegistry`
- Disables the registry (`enabled = false`) — user must re-register passkey
  with the new wallet before Trana will protect again
- Closes the `RecoveryState` PDA (reclaims rent)
- Emits `RecoveryCompleted { owner, new_authority }`

### Flow: Cancelling Recovery (during time-lock)

```
Caller: original owner's wallet (may be attacker OR real user)
Passkey: REQUIRED — guard::cpi::enforce() with policy "admin.recovery_cancel"

ix[N-2]: secp256r1 precompile (passkey proof)
ix[N-1]: guard::record_proof
ix[N]:   guard::cancel_recovery { accounts: [owner_registry, recovery_state, owner] }
```

- Anyone who can produce a valid passkey proof can cancel
- Since the attacker does NOT have the passkey, they cannot cancel
- The real user (who has the passkey device) cancels during the window
- Emits `RecoveryCancelled { owner }`

---

## Time-lock Window

Recommended default: **72 hours** (259,200 seconds)

| Window | Trade-off |
|---|---|
| 24 hours | Faster recovery, less reaction time |
| 72 hours | Standard — enough time to notice and cancel |
| 7 days | Maximum safety for high-value vaults |

The time-lock should be configurable per-registry, set at registration time.
Changing the time-lock should itself require a passkey proof.

---

## Recovery Key Design

The `recovery_key` is a Pubkey stored in `TwoFactorRegistry` at registration time.

Options for what this key can be:
1. **Another wallet the user controls** (hardware wallet, paper wallet)
2. **A trusted contact's wallet** (team multisig, trusted friend)
3. **A DAO governance program** (for protocol-level recovery)
4. **Unset (zero Pubkey)** — recovery disabled entirely

Setting a recovery key should require a passkey proof. Changing it should also
require a passkey proof, preventing an attacker from silently registering a
recovery key before the owner notices the compromise.

---

## Attack Analysis

### Attack: Attacker initiates recovery to their own wallet

- Requires the recovery key as signer
- Attacker has the main private key but not the recovery key
- **Blocked** — attacker cannot initiate recovery

### Attack: Attacker initiates recovery using a recovery key they also stole

- Requires both private key AND recovery key to be compromised
- Attacker initiates recovery with `new_authority = attacker_wallet`
- Real user sees `RecoveryInitiated` event within the time-lock window
- Real user cancels using their passkey (device-bound, not stolen)
- **Blocked by cancellation** — passkey is the backstop

### Attack: Attacker tries to cancel a legitimate recovery

- Cancellation requires a passkey proof
- Attacker does not have the passkey device
- **Blocked** — cannot cancel

### Attack: Attacker races to complete recovery before user cancels

- Time-lock window (72h) gives user time to react
- User only needs their passkey device (not their compromised wallet) to cancel
- **Mitigated by time-lock + passkey cancellation**

### Attack: Attacker freezes the passkey by draining rent from registry PDA

- Registry PDA is rent-exempt (pre-paid at registration)
- Draining lamports from a PDA requires program authority
- **Not a valid attack vector**

---

## Remaining Open Questions

1. **Social recovery UX** — how does the user discover their recovery was
   initiated? Requires an event indexer or push notification service.

2. **Recovery key rotation** — if the recovery key is also compromised, can
   the user set a new one? Requires passkey proof, but now we're in the
   scenario where the user needs both passkey AND to be quick.

3. **Multiple recovery keys** — N-of-M recovery (e.g. 2-of-3 trusted contacts)
   adds complexity but reduces single-point-of-failure for the recovery key.

4. **Onchain notification** — consider a `WatchdogState` PDA that downstream
   programs can check for active recovery attempts, allowing protocols to
   auto-pause affected accounts during the time-lock.

5. **Fee for recovery initiation** — a small fee (e.g. 0.01 SOL) deters
   griefing attacks where an attacker repeatedly initiates/cancels recovery
   to harass the user.

---

## Proposed Account Layout

```
[b"2fa", owner]        → TwoFactorRegistry   (existing)
  + recovery_key: Pubkey  (NEW field — add to existing struct or separate)
  + time_lock: i64        (NEW field — seconds, set at registration)

[b"recovery", owner]   → RecoveryState       (NEW, created on initiation)
  owner:         Pubkey
  new_authority: Pubkey
  initiated_at:  i64
  time_lock:     i64      (snapshot from registry at initiation time)
  recovery_key:  Pubkey
  cancelled:     bool
```

Adding `recovery_key` and `time_lock` to `TwoFactorRegistry` requires a space
increase and an upgrade to the registration instruction. Consider versioning
the registry struct rather than breaking existing deployments.

---

## Implementation Priority

1. **Add `recovery_key` + `time_lock` to `TwoFactorRegistry`** (required first)
2. **`set_recovery_key` instruction** — passkey-gated, sets recovery key + time-lock
3. **`initiate_recovery` instruction** — recovery key signer, creates `RecoveryState`
4. **`cancel_recovery` instruction** — passkey-gated CPI, sets `cancelled = true`
5. **`complete_recovery` instruction** — recovery key signer, enforces time-lock

Target: implement during the last week of the Colosseum hackathon window,
after devnet launch is stable.

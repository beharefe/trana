# Trana Policy Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 14 policies from `docs/policy-sketch.md` in the guard program, complete the pending Threshold→Limit rename, and update the SDK's policy-string detector.

**Architecture:** The `Policy` enum in `programs/guard/src/lib.rs` is the single extension point. Each variant maps to a match arm in `enforce()`. Self-verifying policies read directly from Solana sysvars (Clock, Instructions). Guard-tracked policies (BurstFrequency, Cooldown) maintain their own PDAs passed via `remaining_accounts` — the calling program cannot read or reset these. Program-attested policies trust a boolean flag from the caller but bind the proof to a specific pubkey via the policy string.

**Tech Stack:** Anchor 0.32.1, Rust, `sha2`, Solana Instructions sysvar, Clock sysvar, `Pubkey::find_program_address`.

---

## File Map

| File | Change |
|------|--------|
| `programs/guard/src/lib.rs` | Complete rename, add 9 new Policy variants + match arms, new `init_burst_counter` / `init_cooldown_tracker` instructions |
| `programs/guard/src/state.rs` | Migrate `TwoFactorRegistry` + `TranaConfig` to `InitSpace`; add `BurstCounter`, `CooldownTracker`, `InitBurstCounter`, `InitCooldownTracker` account contexts |
| `programs/guard/src/error.rs` | Add 6 new error codes |
| `programs/guard/src/verify.rs` | Add `get_protected_ix_metadata()` helper |
| `programs/demo_vault/src/lib.rs` | Rename `Policy::Threshold` → `Policy::Limit`, rename field `threshold` → `limit` |
| `packages/sdk/src/react/detector.ts` | Add policy string mappings for new variants |

---

## Task 0 — Complete Threshold → Limit rename

**Context:** The `Policy` enum variant was renamed to `Limit` in a previous session but the match arm on line 228 and the Velocity field still use the old names. The demo vault also references the old names.

**Files:**
- Modify: `programs/guard/src/lib.rs:228-248` (match arms)
- Modify: `programs/guard/src/lib.rs:70-83` (comment block)
- Modify: `programs/demo_vault/src/lib.rs` (Policy::Threshold usages)

- [ ] **Step 1: Fix the match arm for Limit in guard/src/lib.rs**

Replace lines 228–238:

```rust
Policy::Limit { param_offset, limit } => {
    let amount = verify::read_u64_from_protected_ix(ix, param_offset)?;
    if amount >= limit {
        msg!(
            "TRANA require | policy=trana.limit | amount={} | limit={} | owner={}",
            amount, limit, owner_key,
        );
        verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.limit", &fee)?;
    }
    Ok(())
}
```

- [ ] **Step 2: Fix the Velocity match arm field name**

Replace lines 240–250 (the `threshold` field is now `limit`):

```rust
Policy::Velocity { param_offset, already_withdrawn, limit } => {
    let amount = verify::read_u64_from_protected_ix(ix, param_offset)?;
    let cumulative = already_withdrawn.saturating_add(amount);
    if cumulative > limit {
        msg!(
            "TRANA require | policy=trana.velocity | amount={} | already_withdrawn={} | cumulative={} | limit={} | owner={}",
            amount, already_withdrawn, cumulative, limit, owner_key,
        );
        verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.velocity", &fee)?;
    }
    Ok(())
}
```

- [ ] **Step 3: Update the comment block in lib.rs**

Replace the example CPI comment block (around lines 70–83) with:

```rust
//    guard::cpi::enforce(ctx, Policy::Limit    { param_offset: 0, limit: 1_000_000_000 })?
//    guard::cpi::enforce(ctx, Policy::Velocity { param_offset: 0, already_withdrawn, limit })?
//    guard::cpi::enforce(ctx, Policy::Admin)?
//    guard::cpi::enforce(ctx, Policy::Always)?
//    guard::cpi::enforce(ctx, Policy::RapidDrain { last_deposit_at, last_deposit_amount, .. })?
//    guard::cpi::enforce(ctx, Policy::Custom { policy_string: "myapp.action", context: vec![] })?
//
//  ── Standard policy strings (hardcoded inside this program, cannot be spoofed) ──
//
//    trana.always          — always require passkey
//    trana.admin           — privileged / irreversible admin action
//    trana.limit           — value at byte offset N >= limit
//    trana.velocity        — cumulative + current > limit (rate limiting)
//    trana.rapid_drain     — withdrawal within window of a large deposit
//    trana.not_before      — rejects execution before slot N
//    trana.not_after       — rejects execution after slot N
//    trana.burst_frequency — call count in window exceeds max
//    trana.cooldown        — call within min_slots of last call
```

- [ ] **Step 4: Update demo_vault/src/lib.rs**

Replace every `Policy::Threshold { param_offset, threshold }` with `Policy::Limit { param_offset, limit }`, and rename the constant:

```rust
// Line 30: rename constant
pub const LARGE_LIMIT: u64 = 1_000_000_000; // 1 SOL

// In deposit():
trana::cpi::enforce(
    ctx.accounts.trana_cpi_ctx(),
    Policy::Limit { param_offset: 0, limit: LARGE_LIMIT },
)?;

// In deposit() tracking block:
if amount >= LARGE_LIMIT {

// In withdraw() else-if branch:
} else if amount >= LARGE_LIMIT {
    trana::cpi::enforce(
        ctx.accounts.trana_cpi_ctx(),
        Policy::Limit {
            param_offset: WITHDRAW_AMOUNT_OFFSET,
            limit:        LARGE_LIMIT,
        },
    )?;
}

// Velocity: rename threshold field to limit
Policy::Velocity {
    param_offset:      WITHDRAW_AMOUNT_OFFSET,
    already_withdrawn: ctx.accounts.vault.velocity_withdrawn,
    limit:             VELOCITY_THRESHOLD,
},
```

- [ ] **Step 5: Build to verify no compilation errors**

```bash
cd /Users/textefe/Documents/work/trana
anchor build 2>&1 | grep -E "error|warning: unused"
```

Expected: no errors. If there are `threshold` field not found errors, search for remaining occurrences: `grep -rn "Policy::Threshold\|\.threshold" programs/`.

- [ ] **Step 6: Commit**

```bash
git add programs/guard/src/lib.rs programs/demo_vault/src/lib.rs
git commit -m "feat: rename Policy::Threshold to Limit and threshold field to limit"
```

---

## Task 1 — Semantic-label Always variants

**Context:** `AuthorityChange`, `ConfigMutation`, `EmergencyToggle` are mechanically identical to `Always` (unconditional passkey required) but emit a different policy string in the `ProofVerified` event. The policy string is the audit identifier visible to monitoring systems and indexers. No new verification logic needed — each just calls `verify_with_policy` with its own string.

**Files:**
- Modify: `programs/guard/src/lib.rs` (enum + match arms)

- [ ] **Step 1: Add three variants to the Policy enum**

After the `Admin` variant, add:

```rust
/// Authority transfer — administrative key rotation.
/// Mechanically identical to Always; distinct policy string for alert routing.
/// Policy string: "trana.authority_change"
AuthorityChange,

/// Config mutation — protocol parameter change.
/// Policy string: "trana.config_mutation"
ConfigMutation,

/// Emergency toggle — pause/unpause switch.
/// Policy string: "trana.emergency_toggle"
EmergencyToggle,
```

- [ ] **Step 2: Add three match arms in enforce()**

After the `Policy::Admin` arm:

```rust
Policy::AuthorityChange => {
    msg!("TRANA require | policy=trana.authority_change | owner={}", owner_key);
    verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.authority_change", &fee)
}

Policy::ConfigMutation => {
    msg!("TRANA require | policy=trana.config_mutation | owner={}", owner_key);
    verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.config_mutation", &fee)
}

Policy::EmergencyToggle => {
    msg!("TRANA require | policy=trana.emergency_toggle | owner={}", owner_key);
    verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.emergency_toggle", &fee)
}
```

- [ ] **Step 3: Build**

```bash
anchor build 2>&1 | grep "error"
```

Expected: no errors. The `match policy` block must be exhaustive — if you get "non-exhaustive patterns", the new variants aren't in the match.

- [ ] **Step 4: Commit**

```bash
git add programs/guard/src/lib.rs
git commit -m "feat: add AuthorityChange, ConfigMutation, EmergencyToggle policy variants"
```

---

## Task 2 — NotBefore / NotAfter time gate policies

**Context:** These are pure time locks. They do NOT require a passkey. They read the Clock sysvar directly (program cannot influence slot number) and either block execution with an error or pass through silently. `NotBefore` rejects calls that arrive before a given slot. `NotAfter` rejects calls that arrive after a given slot.

**Files:**
- Modify: `programs/guard/src/lib.rs` (enum + match arms)
- Modify: `programs/guard/src/error.rs` (2 new error codes)

- [ ] **Step 1: Add 2 new error codes to error.rs**

```rust
#[msg("Instruction submitted before the allowed slot — too early")]
NotBeforeViolation,

#[msg("Instruction submitted after the expiry slot — too late")]
NotAfterViolation,
```

- [ ] **Step 2: Add two variants to the Policy enum**

After `EmergencyToggle`:

```rust
/// Block execution until `slot` is reached.
/// Guard reads Clock sysvar — program cannot influence the check.
/// Returns NotBeforeViolation if current_slot < slot.
/// Policy string: n/a — no passkey, pure time gate.
NotBefore { slot: u64 },

/// Block execution after `slot` has passed.
/// Guard reads Clock sysvar — program cannot influence the check.
/// Returns NotAfterViolation if current_slot > slot.
/// Policy string: n/a — no passkey, pure time gate.
NotAfter { slot: u64 },
```

- [ ] **Step 3: Add match arms in enforce()**

These arms do NOT call `verify_with_policy` — they either error or return Ok silently:

```rust
Policy::NotBefore { slot } => {
    let current_slot = Clock::get()?.slot;
    if current_slot < slot {
        msg!(
            "TRANA reject | policy=trana.not_before | current={} | required={} | owner={}",
            current_slot, slot, owner_key,
        );
        return Err(error!(GuardError::NotBeforeViolation));
    }
    Ok(())
}

Policy::NotAfter { slot } => {
    let current_slot = Clock::get()?.slot;
    if current_slot > slot {
        msg!(
            "TRANA reject | policy=trana.not_after | current={} | expiry={} | owner={}",
            current_slot, slot, owner_key,
        );
        return Err(error!(GuardError::NotAfterViolation));
    }
    Ok(())
}
```

- [ ] **Step 4: Build**

```bash
anchor build 2>&1 | grep "error"
```

- [ ] **Step 5: Commit**

```bash
git add programs/guard/src/lib.rs programs/guard/src/error.rs
git commit -m "feat: add NotBefore and NotAfter time gate policies"
```

---

## Task 3 — RecipientNovelty / CallerNotApproved program-attested policies

**Context:** The calling program evaluates the condition (novelty check, approved-set lookup) and attests the result via a boolean flag. The guard trusts the flag but makes the proof non-reusable for a different target pubkey by embedding the pubkey in the policy string. A proof for `"trana.recipient_novelty:<alice_b58>"` cannot be replayed for a different recipient.

**Files:**
- Modify: `programs/guard/src/lib.rs` (enum + match arms)
- Modify: `programs/guard/src/verify.rs` (new helper for pubkey-bound policy string)

- [ ] **Step 1: Add a policy-string formatter to verify.rs**

Add below the `FeeAccounts` struct:

```rust
/// Build a pubkey-scoped policy string: e.g. "trana.recipient_novelty:3xK…abc"
/// The pubkey is embedded so the proof is bound to that specific address.
pub fn scoped_policy(prefix: &str, pubkey: &Pubkey) -> String {
    format!("{}:{}", prefix, pubkey)
}
```

- [ ] **Step 2: Add two variants to the Policy enum**

```rust
/// Require passkey when the calling program attests the recipient has never
/// received from this program before (novelty check is the program's responsibility).
/// Guard verifies proof is bound to `recipient` via the policy string.
/// Policy string: "trana.recipient_novelty:<recipient_b58>"
RecipientNovelty { recipient: Pubkey, is_novel: bool },

/// Require passkey when the calling program attests the caller/signer is not
/// in its known approved set (set management is the program's responsibility).
/// Guard verifies proof is bound to `caller` via the policy string.
/// Policy string: "trana.caller_not_approved:<caller_b58>"
CallerNotApproved { caller: Pubkey, is_approved: bool },
```

- [ ] **Step 3: Add match arms in enforce()**

```rust
Policy::RecipientNovelty { recipient, is_novel } => {
    if is_novel {
        let policy_string = verify::scoped_policy("trana.recipient_novelty", &recipient);
        msg!(
            "TRANA require | policy={} | owner={}",
            policy_string, owner_key,
        );
        verify::verify_with_policy(ix, registry, &owner_key, pid, &policy_string, &fee)?;
    }
    Ok(())
}

Policy::CallerNotApproved { caller, is_approved } => {
    if !is_approved {
        let policy_string = verify::scoped_policy("trana.caller_not_approved", &caller);
        msg!(
            "TRANA require | policy={} | owner={}",
            policy_string, owner_key,
        );
        verify::verify_with_policy(ix, registry, &owner_key, pid, &policy_string, &fee)?;
    }
    Ok(())
}
```

- [ ] **Step 4: Build**

```bash
anchor build 2>&1 | grep "error"
```

- [ ] **Step 5: Commit**

```bash
git add programs/guard/src/lib.rs programs/guard/src/verify.rs
git commit -m "feat: add RecipientNovelty and CallerNotApproved program-attested policies"
```

---

## Task 4 — Custom { policy_string, context } update

**Context:** The current `Custom` unit variant calls `verify_from_proof` which reads the policy string from the proof. The new variant accepts `policy_string` and `context` from the caller, switches to `verify_with_policy` for consistency with all other variants. The `context` bytes are logged — the SDK can display them in the confirmation modal.

**Files:**
- Modify: `programs/guard/src/lib.rs`

- [ ] **Step 1: Update the Custom variant**

Replace:

```rust
/// Application-defined policy. The policy string is read from the proof.
/// Use this when business logic doesn't fit a standard pattern.
Custom,
```

With:

```rust
/// Application-defined policy. The calling program provides the policy string
/// and optional context bytes. Guard verifies proof.policy == policy_string.
/// Context is logged for SDK display (e.g. "trana.concentration" with pct bytes).
Custom { policy_string: String, context: Vec<u8> },
```

- [ ] **Step 2: Update the Custom match arm**

Replace:

```rust
Policy::Custom => {
    msg!("TRANA require | policy=custom | owner={}", owner_key);
    verify::verify_from_proof(ix, registry, &owner_key, pid, &fee)
}
```

With:

```rust
Policy::Custom { policy_string, context } => {
    if !context.is_empty() {
        msg!("TRANA context | policy={} | context_hex={}", policy_string, hex_encode(&context));
    }
    msg!("TRANA require | policy={} | owner={}", policy_string, owner_key);
    verify::verify_with_policy(ix, registry, &owner_key, pid, &policy_string, &fee)
}
```

- [ ] **Step 3: Add hex_encode helper at top of lib.rs (inside the trana module)**

This is a minimal helper that avoids pulling in a hex dep for a logging-only use case:

```rust
fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
```

- [ ] **Step 4: Build**

```bash
anchor build 2>&1 | grep "error"
```

If you see "variant `Custom` has no fields" errors in other files, those are callers using the old unit variant — update them to `Policy::Custom { policy_string: "trana.custom".to_string(), context: vec![] }`.

- [ ] **Step 5: Commit**

```bash
git add programs/guard/src/lib.rs
git commit -m "feat: Custom policy now accepts policy_string and context fields"
```

---

## Task 5 — BurstCounter PDA state and init instruction

**Context:** `BurstFrequency` needs the guard to own and update a counter PDA that tracks call counts within a rolling slot window. The PDA is seeded by `[b"burst", protected_program_id, ix_discriminator, owner]`. Each program+instruction+owner combination gets its own counter. This must be initialized before `enforce(Policy::BurstFrequency {...})` is first called.

**Files:**
- Modify: `programs/guard/src/state.rs` (new struct + account context)
- Modify: `programs/guard/src/lib.rs` (new init instruction)

- [ ] **Step 1: Add BurstCounter struct to state.rs**

```rust
/// Guard-owned rate-limit counter per (program, instruction, owner) triple.
/// Seeds: [b"burst", protected_program_id(32), discriminator(8), owner(32)]
#[account]
#[derive(InitSpace)]
pub struct BurstCounter {
    /// Slot at which the current window started.
    pub window_start_slot: u64,
    /// Number of calls in the current window.
    pub call_count: u16,
    /// Canonical bump for this PDA.
    pub bump: u8,
}
```

- [ ] **Step 2: Add InitBurstCounter account context to state.rs**

```rust
/// Initialize a BurstCounter PDA for a specific program+instruction+owner.
/// `discriminator` is the 8-byte Anchor discriminator of the instruction to guard.
/// Anyone can pay to create this — ownership is entirely with the guard program.
#[derive(Accounts)]
#[instruction(discriminator: [u8; 8])]
pub struct InitBurstCounter<'info> {
    #[account(
        init,
        payer  = payer,
        space  = BurstCounter::DISCRIMINATOR.len() + BurstCounter::INIT_SPACE,
        seeds  = [b"burst", protected_program.key().as_ref(), &discriminator, owner.key().as_ref()],
        bump,
    )]
    pub burst_counter: Account<'info, BurstCounter>,

    /// CHECK: the program whose instruction this counter tracks — just a key
    pub protected_program: UncheckedAccount<'info>,

    /// CHECK: the wallet whose burst counter this is
    pub owner: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 3: Add init_burst_counter instruction to lib.rs**

Inside the `#[program] pub mod trana { ... }` block, add:

```rust
/// Initialize a BurstCounter PDA for a given (program, discriminator, owner) triple.
/// Must be called once before `enforce(Policy::BurstFrequency {...})` for that combination.
/// `discriminator`: the 8-byte Anchor discriminator of the instruction to guard.
pub fn init_burst_counter(
    ctx:           Context<InitBurstCounter>,
    discriminator: [u8; 8],
) -> Result<()> {
    let counter               = &mut ctx.accounts.burst_counter;
    counter.window_start_slot = 0;
    counter.call_count        = 0;
    counter.bump              = ctx.bumps.burst_counter;
    msg!(
        "TRANA burst_counter initialized | program={} | owner={}",
        ctx.accounts.protected_program.key(),
        ctx.accounts.owner.key(),
    );
    Ok(())
}
```

- [ ] **Step 4: Build**

```bash
anchor build 2>&1 | grep "error"
```

- [ ] **Step 5: Commit**

```bash
git add programs/guard/src/state.rs programs/guard/src/lib.rs
git commit -m "feat: add BurstCounter PDA state and init_burst_counter instruction"
```

---

## Task 6 — BurstFrequency enforce logic

**Context:** When the Policy is `BurstFrequency`, the guard reads the first `remaining_account` as the BurstCounter PDA, validates its seeds from the protected instruction's metadata (program_id + discriminator, read from the Instructions sysvar), updates the counter, and requires a passkey when the count exceeds `max_calls`.

**Files:**
- Modify: `programs/guard/src/verify.rs` (new helper)
- Modify: `programs/guard/src/lib.rs` (Policy variant + match arm)
- Modify: `programs/guard/src/error.rs` (2 new error codes)

- [ ] **Step 1: Add get_protected_ix_metadata to verify.rs**

The `run_verification` function already does this internally (lines 120–127). Expose it as a public helper so the enforce() handler can use it independently:

```rust
/// Return the (program_id, discriminator) of the protected instruction at
/// the current index in the Instructions sysvar.
/// Used by guard-tracked policies to derive their PDA seeds.
pub fn get_protected_ix_metadata(ix_sysvar: &AccountInfo) -> Result<(Pubkey, [u8; 8])> {
    let current_idx = load_current_index_checked(ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;
    let protected_ix = load_instruction_at_checked(current_idx as usize, ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;
    require!(protected_ix.data.len() >= 8, GuardError::InvalidProof);
    let mut discriminator = [0u8; 8];
    discriminator.copy_from_slice(&protected_ix.data[..8]);
    Ok((protected_ix.program_id, discriminator))
}
```

- [ ] **Step 2: Add 2 new error codes to error.rs**

```rust
#[msg("BurstFrequency or Cooldown tracker account missing from remaining_accounts")]
MissingTrackerAccount,

#[msg("Tracker account key or owner does not match expected PDA")]
InvalidTrackerAccount,
```

- [ ] **Step 3: Add BurstFrequency variant to the Policy enum**

```rust
/// Require passkey when the number of calls within `window_slots` exceeds `max_calls`.
/// Requires a BurstCounter PDA (created via init_burst_counter) passed as
/// remaining_accounts[0]. Guard owns the counter — the calling program cannot reset it.
/// Policy string: "trana.burst_frequency"
BurstFrequency { max_calls: u16, window_slots: u64 },
```

- [ ] **Step 4: Add the BurstFrequency match arm in enforce()**

```rust
Policy::BurstFrequency { max_calls, window_slots } => {
    // Read protected instruction metadata to derive PDA seeds.
    let (protected_program_id, discriminator) =
        verify::get_protected_ix_metadata(ix)?;

    // Caller must pass the BurstCounter PDA as remaining_accounts[0].
    require!(!ctx.remaining_accounts.is_empty(), GuardError::MissingTrackerAccount);
    let tracker_info = &ctx.remaining_accounts[0];

    // Derive expected PDA — guard validates seeds, program cannot spoof this.
    let (expected_pda, _) = Pubkey::find_program_address(
        &[b"burst", protected_program_id.as_ref(), &discriminator, owner_key.as_ref()],
        ctx.program_id,
    );
    require!(tracker_info.key() == &expected_pda, GuardError::InvalidTrackerAccount);
    require!(tracker_info.owner == ctx.program_id,  GuardError::InvalidTrackerAccount);
    require!(tracker_info.is_writable,              GuardError::InvalidTrackerAccount);

    // Deserialize counter.
    let mut counter: BurstCounter =
        BurstCounter::try_deserialize(&mut &tracker_info.try_borrow_data()?[..])?;

    let current_slot = Clock::get()?.slot;

    // Roll window if expired.
    if current_slot.saturating_sub(counter.window_start_slot) > window_slots {
        counter.window_start_slot = current_slot;
        counter.call_count        = 0;
    }

    counter.call_count = counter.call_count.saturating_add(1);

    // Serialize back before verification (atomically reverts if verify fails).
    counter.try_serialize(&mut &mut tracker_info.try_borrow_mut_data()?[..])?;

    if counter.call_count > max_calls {
        msg!(
            "TRANA require | policy=trana.burst_frequency | count={} | max={} | owner={}",
            counter.call_count, max_calls, owner_key,
        );
        verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.burst_frequency", &fee)?;
    }
    Ok(())
}
```

- [ ] **Step 5: Build**

```bash
anchor build 2>&1 | grep "error"
```

Common issue: `BurstCounter` not in scope in `lib.rs`. Make sure `pub use state::*;` is at the top of `lib.rs` (it already is).

- [ ] **Step 6: Commit**

```bash
git add programs/guard/src/lib.rs programs/guard/src/verify.rs programs/guard/src/error.rs
git commit -m "feat: implement BurstFrequency guard-tracked policy with PDA counter"
```

---

## Task 7 — CooldownTracker PDA and Cooldown policy

**Context:** `Cooldown` blocks rapid repeated calls from the same caller to the same instruction within `min_slots`. The pattern is identical to BurstFrequency: guard-tracked PDA, seed `[b"cooldown", program_id, discriminator, owner]`, passed as `remaining_accounts[0]`.

**Files:**
- Modify: `programs/guard/src/state.rs`
- Modify: `programs/guard/src/lib.rs`

- [ ] **Step 1: Add CooldownTracker struct to state.rs**

```rust
/// Guard-owned cooldown tracker per (program, instruction, owner) triple.
/// Seeds: [b"cooldown", protected_program_id(32), discriminator(8), owner(32)]
#[account]
#[derive(InitSpace)]
pub struct CooldownTracker {
    /// Slot of the most recent call.
    pub last_called_slot: u64,
    /// Canonical bump for this PDA.
    pub bump: u8,
}
```

- [ ] **Step 2: Add InitCooldownTracker account context to state.rs**

```rust
#[derive(Accounts)]
#[instruction(discriminator: [u8; 8])]
pub struct InitCooldownTracker<'info> {
    #[account(
        init,
        payer  = payer,
        space  = CooldownTracker::DISCRIMINATOR.len() + CooldownTracker::INIT_SPACE,
        seeds  = [b"cooldown", protected_program.key().as_ref(), &discriminator, owner.key().as_ref()],
        bump,
    )]
    pub cooldown_tracker: Account<'info, CooldownTracker>,

    /// CHECK: the program whose instruction this tracker guards — just a key
    pub protected_program: UncheckedAccount<'info>,

    /// CHECK: the wallet whose cooldown tracker this is
    pub owner: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 3: Add init_cooldown_tracker instruction to lib.rs**

```rust
/// Initialize a CooldownTracker PDA for a given (program, discriminator, owner) triple.
/// Must be called once before `enforce(Policy::Cooldown {...})` for that combination.
pub fn init_cooldown_tracker(
    ctx:           Context<InitCooldownTracker>,
    discriminator: [u8; 8],
) -> Result<()> {
    let tracker               = &mut ctx.accounts.cooldown_tracker;
    tracker.last_called_slot  = 0;
    tracker.bump              = ctx.bumps.cooldown_tracker;
    msg!(
        "TRANA cooldown_tracker initialized | program={} | owner={}",
        ctx.accounts.protected_program.key(),
        ctx.accounts.owner.key(),
    );
    Ok(())
}
```

- [ ] **Step 4: Add Cooldown variant to the Policy enum**

```rust
/// Require passkey when the calling wallet calls this instruction again within
/// `min_slots` of the previous call.
/// Requires a CooldownTracker PDA (created via init_cooldown_tracker) passed as
/// remaining_accounts[0]. Guard owns the tracker — calling program cannot reset it.
/// Policy string: "trana.cooldown"
Cooldown { min_slots: u64 },
```

- [ ] **Step 5: Add the Cooldown match arm in enforce()**

```rust
Policy::Cooldown { min_slots } => {
    let (protected_program_id, discriminator) =
        verify::get_protected_ix_metadata(ix)?;

    require!(!ctx.remaining_accounts.is_empty(), GuardError::MissingTrackerAccount);
    let tracker_info = &ctx.remaining_accounts[0];

    let (expected_pda, _) = Pubkey::find_program_address(
        &[b"cooldown", protected_program_id.as_ref(), &discriminator, owner_key.as_ref()],
        ctx.program_id,
    );
    require!(tracker_info.key() == &expected_pda, GuardError::InvalidTrackerAccount);
    require!(tracker_info.owner == ctx.program_id,  GuardError::InvalidTrackerAccount);
    require!(tracker_info.is_writable,              GuardError::InvalidTrackerAccount);

    let mut tracker: CooldownTracker =
        CooldownTracker::try_deserialize(&mut &tracker_info.try_borrow_data()?[..])?;

    let current_slot = Clock::get()?.slot;
    let slots_since  = current_slot.saturating_sub(tracker.last_called_slot);

    // Update last_called_slot before verification — reverts atomically on failure.
    tracker.last_called_slot = current_slot;
    tracker.try_serialize(&mut &mut tracker_info.try_borrow_mut_data()?[..])?;

    if slots_since < min_slots && tracker.last_called_slot != 0 {
        msg!(
            "TRANA require | policy=trana.cooldown | slots_since={} | min={} | owner={}",
            slots_since, min_slots, owner_key,
        );
        verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.cooldown", &fee)?;
    }
    Ok(())
}
```

Note: the `tracker.last_called_slot != 0` guard allows the FIRST call to pass without a proof (the tracker was just initialized to slot 0).

- [ ] **Step 6: Build**

```bash
anchor build 2>&1 | grep "error"
```

- [ ] **Step 7: Commit**

```bash
git add programs/guard/src/state.rs programs/guard/src/lib.rs
git commit -m "feat: add CooldownTracker PDA and Cooldown policy"
```

---

## Task 8 — Migrate TwoFactorRegistry and TranaConfig to InitSpace

**Context:** `TwoFactorRegistry::SPACE = 219` and `TranaConfig::SPACE = 80` are magic numbers. The `solana-anchor-claude-skill` requires `InitSpace` + `DISCRIMINATOR.len()` for all `space` calculations. The current `TwoFactorRegistry` also uses `Vec<u8>` without `#[max_len]` which prevents `InitSpace` from deriving correctly.

**Files:**
- Modify: `programs/guard/src/state.rs`

- [ ] **Step 1: Update TwoFactorRegistry to derive InitSpace**

Replace the current `TwoFactorRegistry` definition:

```rust
/// Per-user onchain 2FA registry.
/// Seeds: `[b"2fa", owner]`
#[account]
#[derive(InitSpace)]
pub struct TwoFactorRegistry {
    pub owner:         Pubkey,
    pub key_kind:      KeyKind,
    #[max_len(33)]
    pub pubkey_bytes:  Vec<u8>,
    #[max_len(128)]
    pub credential_id: Vec<u8>,
    pub enabled:       bool,
    pub nonce:         u64,
}

impl TwoFactorRegistry {
    pub const MAX_PUBKEY_LEN:  usize = 33;
    pub const MAX_CRED_ID_LEN: usize = 128;
}
```

Remove the old `SPACE` constant — it will be replaced by `DISCRIMINATOR.len() + INIT_SPACE` at usage sites.

- [ ] **Step 2: Update TranaConfig to derive InitSpace**

```rust
#[account]
#[derive(InitSpace)]
pub struct TranaConfig {
    pub authority:    Pubkey,
    pub treasury:     Pubkey,
    pub fee_lamports: u64,
}
```

Remove `TranaConfig::SPACE`.

- [ ] **Step 3: Update space usages in account contexts**

In `RegisterTwoFa`:

```rust
space = TwoFactorRegistry::DISCRIMINATOR.len() + TwoFactorRegistry::INIT_SPACE,
```

In `InitConfig`:

```rust
space = TranaConfig::DISCRIMINATOR.len() + TranaConfig::INIT_SPACE,
```

- [ ] **Step 4: Verify INIT_SPACE matches old magic numbers**

Add a compile-time assertion in state.rs to catch regressions:

```rust
const _: () = {
    // 8 (disc) + 32 + 1 + 4+33 + 4+128 + 1 + 8 = 219
    assert!(
        TwoFactorRegistry::DISCRIMINATOR.len() + TwoFactorRegistry::INIT_SPACE == 219,
        "TwoFactorRegistry space changed — verify all allocations"
    );
};
```

- [ ] **Step 5: Build**

```bash
anchor build 2>&1 | grep "error"
```

- [ ] **Step 6: Commit**

```bash
git add programs/guard/src/state.rs
git commit -m "refactor: migrate TwoFactorRegistry and TranaConfig to InitSpace"
```

---

## Task 9 — SDK detector.ts: add new policy string mappings

**Context:** The SDK's `detector.ts` parses `TRANA require | policy=X` log lines during simulation to decide which proof to build. New policy strings need to be recognised.

**Files:**
- Modify: `packages/sdk/src/react/detector.ts`

- [ ] **Step 1: Read the current parsePolicyFromLogs function**

```bash
grep -n "parsePolicyFromLogs\|trana\." packages/sdk/src/react/detector.ts | head -30
```

- [ ] **Step 2: Add new policy strings to the known-policies set**

Find where policy strings are listed/mapped and add:

```typescript
"trana.authority_change",
"trana.config_mutation",
"trana.emergency_toggle",
"trana.burst_frequency",
"trana.cooldown",
```

Note: `trana.not_before` and `trana.not_after` will never appear in `TRANA require` logs because those variants don't call `verify_with_policy` — they return errors. No SDK change needed for them.

For `RecipientNovelty` and `CallerNotApproved`, the policy string is dynamic (`"trana.recipient_novelty:<pubkey>"`). The parser should match on the prefix:

```typescript
// In the policy parsing logic, after exact matches, add prefix matching:
if (logLine.includes("policy=trana.recipient_novelty:")) {
  return logLine.split("policy=trana.recipient_novelty:")[1].split(" ")[0]
    ? `trana.recipient_novelty:${...}` : null
}
```

Specifically, wherever `parsePolicyFromLogs` or equivalent extracts the policy string from the log, it already captures the full `policy=X` value — confirm the existing regex/split already handles arbitrary strings after `policy=`. If it does, no extra handling needed for pubkey-scoped policies.

- [ ] **Step 3: Build the SDK**

```bash
cd /Users/textefe/Documents/work/trana
pnpm --filter sdk build 2>&1 | grep -E "error TS"
```

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/react/detector.ts
git commit -m "feat: add new policy string mappings to SDK detector"
```

---

## Task 10 — Demo vault: show new policy variants in action

**Context:** The demo vault is the integration reference for how to use Trana. Adding examples of the new policies makes the guard program's capabilities concrete and tests the full CPI path.

**Files:**
- Modify: `programs/demo_vault/src/lib.rs`

- [ ] **Step 1: Add a set_authority instruction showing AuthorityChange**

```rust
/// Transfer vault ownership to a new address.
/// Requires passkey with policy "trana.authority_change".
pub fn set_authority(ctx: Context<SetAuthority>, new_owner: Pubkey) -> Result<()> {
    trana::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::AuthorityChange)?;
    ctx.accounts.vault.owner = new_owner;
    Ok(())
}
```

Add a minimal `SetAuthority` account context (same shape as `EmergencyFreeze` — same accounts needed).

- [ ] **Step 2: Add NotBefore time-lock example as a comment in withdraw()**

At the top of the `withdraw` function, add a comment showing how a program would add a NotBefore guard:

```rust
// Example: enforce a time-lock (e.g. after a governance proposal delay)
// trana::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::NotBefore { slot: GOVERNANCE_UNLOCK_SLOT })?;
```

This keeps the demo clean while showing the pattern.

- [ ] **Step 3: Build**

```bash
anchor build 2>&1 | grep "error"
```

- [ ] **Step 4: Commit**

```bash
git add programs/demo_vault/src/lib.rs
git commit -m "feat: add set_authority example with AuthorityChange policy to demo vault"
```

---

## Policy Model Summary

| Policy | Model | Fires when | Passkey required |
|--------|-------|------------|-----------------|
| Always | self-verifying | always | yes |
| Admin | self-verifying | always | yes |
| AuthorityChange | self-verifying (label) | always | yes |
| ConfigMutation | self-verifying (label) | always | yes |
| EmergencyToggle | self-verifying (label) | always | yes |
| Limit | self-verifying | value @ offset >= limit | yes |
| Velocity | program-attested | cumulative + amount > limit | yes |
| RapidDrain | program-attested | withdrawal within window of large deposit | yes |
| RecipientNovelty | program-attested | program attests recipient is novel | yes |
| CallerNotApproved | program-attested | program attests caller not in approved set | yes |
| Custom | program-attested | program decides | yes |
| NotBefore | self-verifying | current_slot < slot | no — errors instead |
| NotAfter | self-verifying | current_slot > slot | no — errors instead |
| BurstFrequency | guard-tracked PDA | call count > max_calls in window | yes |
| Cooldown | guard-tracked PDA | call within min_slots of previous | yes |

---

## Security Checklist (from solana-vulnerability-scanner)

Before merging:
- [ ] All CPI calls in demo_vault use `Program<'info, Trana>` — no unchecked program ID
- [ ] BurstCounter + CooldownTracker PDAs: `tracker_info.owner == ctx.program_id` checked in every arm
- [ ] PDA seeds recomputed with `find_program_address` inside the guard — never trusted from caller
- [ ] Sysvar accounts use `load_instruction_at_checked` (already in verify.rs)
- [ ] `remaining_accounts[0]` validated for `is_writable` before mutation
- [ ] Nonce never reset — not touched by any new policy arm

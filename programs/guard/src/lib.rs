use anchor_lang::prelude::*;

pub mod error;
pub mod events;
pub mod state;
mod verify;

pub use error::GuardError;
pub use events::ProofVerified;
pub use state::*;

declare_id!("EWvLnEnw7d5xXJvCcS1Px4zpZ1KGZKB8weGUjL47y4e5");

// ── Policy enum ───────────────────────────────────────────────────────────────
//
// Defined at the crate root so Anchor's #[program] macro can resolve it as
// `crate::Policy` without going through a re-export chain.

/// Standard authorization policies. Pass one of these to `guard::cpi::enforce()`.
///
/// Condition evaluation and passkey checks both happen inside this program —
/// audited once, trusted everywhere.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum Policy {
    /// Always require a passkey. No conditions.
    /// Policy string: "trana.always"
    Always,

    /// Privileged / irreversible admin action.
    /// Policy string: "trana.admin"
    Admin,

    /// Authority transfer — administrative key rotation.
    /// Mechanically identical to Always; distinct policy string for alert routing.
    /// Policy string: "trana.authority_change"
    AuthorityChange,

    /// Protocol config mutation — any write to core configuration state.
    /// Policy string: "trana.config_mutation"
    ConfigMutation,

    /// Emergency pause / resume toggle.
    /// Policy string: "trana.emergency_toggle"
    EmergencyToggle,

    /// Block execution until `slot` is reached. Pure time gate — no passkey required.
    /// Returns NotBeforeViolation if Clock.slot < slot.
    /// Guard reads Clock sysvar directly; the program cannot influence the result.
    NotBefore { slot: u64 },

    /// Block execution after `slot` has passed. Pure time gate — no passkey required.
    /// Returns NotAfterViolation if Clock.slot > slot.
    /// Guard reads Clock sysvar directly; the program cannot influence the result.
    NotAfter { slot: u64 },

    /// Require passkey when the calling program attests this recipient has never
    /// received from this program before. Condition evaluation is the program's
    /// responsibility. Guard verifies proof binds to `recipient` via policy string.
    /// Policy string: "trana.recipient_novelty:<recipient_b58>"
    RecipientNovelty { recipient: Pubkey, is_novel: bool },

    /// Require passkey when the calling program attests the signer is not in its
    /// known approved set. Condition evaluation is the program's responsibility.
    /// Guard verifies proof binds to `caller` via policy string.
    /// Policy string: "trana.caller_not_approved:<caller_b58>"
    CallerNotApproved { caller: Pubkey, is_not_approved: bool },

    /// Require passkey when the u64 at `param_offset` bytes (after discriminator)
    /// in the protected instruction is >= `limit`.
    /// Guard reads the value directly — the caller cannot fake it.
    /// Policy string: "trana.limit"
    Limit { param_offset: u8, limit: u64 },

    /// Require passkey when `already_withdrawn` + current amount > `limit`
    /// (rolling rate-limit). Guard reads current amount from the instruction.
    /// Policy string: "trana.velocity"
    Velocity { param_offset: u8, already_withdrawn: u64, limit: u64 },

    /// Require passkey when a withdrawal occurs within `window_secs` of a
    /// deposit >= `deposit_threshold`.
    /// Policy string: "trana.rapid_drain"
    RapidDrain {
        last_deposit_at:     i64,
        last_deposit_amount: u64,
        deposit_threshold:   u64,
        window_secs:         i64,
    },

    /// Require passkey when the number of calls within `window_slots` exceeds `max_calls`.
    /// Requires a BurstCounter PDA (created via init_burst_counter) as remaining_accounts[0].
    /// The guard owns the counter — the calling program cannot reset it.
    /// Policy string: "trana.burst_frequency"
    BurstFrequency { max_calls: u16, window_slots: u64 },

    /// Require passkey when a call arrives within `min_slots` of the previous call.
    /// Requires a CooldownTracker PDA (created via init_cooldown_tracker) as remaining_accounts[0].
    /// The guard owns the tracker — the calling program cannot reset it.
    /// Policy string: "trana.cooldown"
    Cooldown { min_slots: u64 },

    /// Application-defined policy. The calling program provides the policy string
    /// and optional context bytes for SDK display (e.g. "trana.concentration" with
    /// pct bytes). Guard verifies proof.policy == policy_string exactly.
    /// Concentration is the canonical example: program passes amount*100/total
    /// as context with policy_string = "trana.concentration".
    Custom { policy_string: String, context: Vec<u8> },
}

// ─────────────────────────────────────────────────────────────────────────────
//  Trana Guard — Onchain Authorization Primitive
//
//  The single guarantee:
//    "This instruction cannot execute unless the registered passkey
//     signed an intent hash that exactly describes this transaction."
//
//  ── Integration ───────────────────────────────────────────────────────────
//
//  Pass a Policy variant to the single enforce() CPI call:
//
//    guard::cpi::enforce(ctx, Policy::Limit    { param_offset: 0, limit: 1_000_000_000 })?
//    guard::cpi::enforce(ctx, Policy::Velocity { param_offset: 0, already_withdrawn, limit })?
//    guard::cpi::enforce(ctx, Policy::Admin)?
//    guard::cpi::enforce(ctx, Policy::Always)?
//    guard::cpi::enforce(ctx, Policy::RapidDrain { last_deposit_at, last_deposit_amount, .. })?
//    guard::cpi::enforce(ctx, Policy::Custom { policy_string: "myapp.action".into(), context: vec![] })?
//
//  ── Standard policy strings (hardcoded inside this program, cannot be spoofed) ──
//
//    trana.always          — always require passkey
//    trana.admin           — privileged / irreversible admin action
//    trana.limit           — value at byte offset N >= limit
//    trana.velocity        — cumulative + current > limit (rate limiting)
//    trana.rapid_drain     — withdrawal within window of a large deposit
//    trana.authority_change / trana.config_mutation / trana.emergency_toggle — always, semantic label only
//    trana.not_before      — rejects execution before slot N (no passkey, pure gate)
//    trana.not_after       — rejects execution after slot N (no passkey, pure gate)
//    trana.burst_frequency — call count in window exceeds max
//    trana.cooldown        — call within min_slots of last call
//
//  ── Transaction shape (required by the SDK) ───────────────────────────────
//
//    ix[N-2]: secp256r1 precompile      — native P-256 sig verify (SIMD-0075)
//    ix[N-1]: guard::record_proof       — carries WebAuthn binding data
//    ix[N]:   your protected instruction — calls guard::cpi::enforce()
//
//  ── Module layout ─────────────────────────────────────────────────────────
//
//    state.rs  — Policy enum, ProofData, KeyKind, TwoFactorRegistry, account contexts
//    verify.rs — WebAuthn proof verification pipeline
//    error.rs  — GuardError codes
//    events.rs — ProofVerified event
//
// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod trana {
    use super::*;

    // ── Fee config ────────────────────────────────────────────────────────────

    /// One-time initialization of the global fee config PDA.
    /// Called once by the Trana team after deployment.
    /// Fee amount and treasury are publicly readable by anyone on-chain.
    pub fn init_config(
        ctx:          Context<InitConfig>,
        fee_lamports: u64,
        treasury:     Pubkey,
    ) -> Result<()> {
        let cfg          = &mut ctx.accounts.config;
        cfg.authority    = ctx.accounts.authority.key();
        cfg.treasury     = treasury;
        cfg.fee_lamports = fee_lamports;
        msg!("TRANA config | fee={} lamports | treasury={}", fee_lamports, treasury);
        Ok(())
    }

    /// Update fee amount or treasury address.
    /// Requires the config authority to sign — full audit trail on-chain.
    pub fn update_config(
        ctx:          Context<UpdateConfig>,
        fee_lamports: u64,
        treasury:     Pubkey,
    ) -> Result<()> {
        let cfg          = &mut ctx.accounts.config;
        cfg.fee_lamports = fee_lamports;
        cfg.treasury     = treasury;
        msg!("TRANA config updated | fee={} lamports | treasury={}", fee_lamports, treasury);
        Ok(())
    }

    /// Withdraw accumulated fees from the treasury PDA to any destination.
    /// Only the config authority can call this.
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        let treasury_info = ctx.accounts.treasury.to_account_info();
        let dest_info     = ctx.accounts.destination.to_account_info();
        **treasury_info.try_borrow_mut_lamports()? -= amount;
        **dest_info.try_borrow_mut_lamports()?     += amount;
        msg!("TRANA fees withdrawn | amount={} | destination={}", amount, ctx.accounts.destination.key());
        Ok(())
    }

    // ── Passkey registration ──────────────────────────────────────────────────

    /// Register a P-256 passkey in the caller's onchain registry PDA.
    /// Idempotent — re-registering updates the key without resetting the nonce.
    pub fn register_two_fa(
        ctx: Context<RegisterTwoFa>,
        key_kind: KeyKind,
        pubkey_bytes: Vec<u8>,
        credential_id: Vec<u8>,
    ) -> Result<()> {
        require!(
            pubkey_bytes.len() <= TwoFactorRegistry::MAX_PUBKEY_LEN,
            GuardError::InvalidProof
        );
        require!(
            credential_id.len() <= TwoFactorRegistry::MAX_CRED_ID_LEN,
            GuardError::InvalidProof
        );
        let r           = &mut ctx.accounts.registry;
        r.owner         = ctx.accounts.owner.key();
        r.key_kind      = key_kind;
        r.pubkey_bytes  = pubkey_bytes;
        r.credential_id = credential_id;
        r.enabled       = true;
        // Preserve nonce — re-registration must not reset replay protection
        Ok(())
    }

    // ── Data carrier ─────────────────────────────────────────────────────────

    /// Pure data-carrier instruction. Carries WebAuthn proof data for
    /// enforce() to read from the Instructions sysvar.
    /// Must be placed at ix[N-1] immediately before the protected instruction.
    pub fn record_proof(
        _ctx: Context<RecordProof>,
        version: u8,
        _expiry: i64,
        _cluster: String,
        _policy: String,
        _authenticator_data: Vec<u8>,
        _client_data_json: Vec<u8>,
    ) -> Result<()> {
        require!(version == 1, GuardError::InvalidProof);
        Ok(())
    }

    // ── Guard-tracked PDA init instructions ──────────────────────────────────

    /// Initialize a BurstCounter PDA for a (program, discriminator, owner) triple.
    /// Must be called once before using Policy::BurstFrequency for that combination.
    /// `discriminator`: 8-byte Anchor discriminator of the instruction to guard.
    pub fn init_burst_counter(
        ctx:           Context<InitBurstCounter>,
        _discriminator: [u8; 8],
    ) -> Result<()> {
        let counter               = &mut ctx.accounts.burst_counter;
        counter.window_start_slot = 0;
        counter.call_count        = 0;
        counter.bump              = ctx.bumps.burst_counter;
        msg!(
            "TRANA burst_counter init | program={} | owner={}",
            ctx.accounts.protected_program.key(),
            ctx.accounts.owner.key(),
        );
        Ok(())
    }

    /// Initialize a CooldownTracker PDA for a (program, discriminator, owner) triple.
    /// Must be called once before using Policy::Cooldown for that combination.
    pub fn init_cooldown_tracker(
        ctx:           Context<InitCooldownTracker>,
        _discriminator: [u8; 8],
    ) -> Result<()> {
        let tracker              = &mut ctx.accounts.cooldown_tracker;
        tracker.last_called_slot = 0;
        tracker.bump             = ctx.bumps.cooldown_tracker;
        msg!(
            "TRANA cooldown_tracker init | program={} | owner={}",
            ctx.accounts.protected_program.key(),
            ctx.accounts.owner.key(),
        );
        Ok(())
    }

    // ── Single enforcement entry point ────────────────────────────────────────
    //
    // All policy evaluation happens inside this program — audited once,
    // trusted everywhere. No-op for conditional policies when the condition
    // is not met (passkey not required).

    /// Enforce authorization according to the given policy.
    ///
    /// For standard policies the condition is evaluated here and passkey is
    /// required only when the condition fires. For `Policy::Custom` the
    /// policy string is read from the proof — the protocol defines the condition.
    pub fn enforce(ctx: Context<Enforce>, policy: Policy) -> Result<()> {
        let owner_key = ctx.accounts.owner.key();
        let ix        = &ctx.accounts.instructions;
        let registry  = &mut ctx.accounts.registry;
        let pid       = ctx.program_id;

        let fee = verify::FeeAccounts {
            fee_lamports:   ctx.accounts.config.fee_lamports,
            payer:          ctx.accounts.owner.as_ref(),
            treasury:       ctx.accounts.treasury.as_ref(),
            system_program: ctx.accounts.system_program.as_ref(),
        };

        match policy {
            Policy::Always => {
                msg!("TRANA require | policy=trana.always | owner={}", owner_key);
                verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.always", &fee)
            }

            Policy::Admin => {
                msg!("TRANA require | policy=trana.admin | owner={}", owner_key);
                verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.admin", &fee)
            }

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

            Policy::RecipientNovelty { recipient, is_novel } => {
                if is_novel {
                    let policy_string = verify::scoped_policy("trana.recipient_novelty", &recipient);
                    msg!("TRANA require | policy={} | owner={}", policy_string, owner_key);
                    verify::verify_with_policy(ix, registry, &owner_key, pid, &policy_string, &fee)?;
                }
                Ok(())
            }

            Policy::CallerNotApproved { caller, is_not_approved } => {
                if is_not_approved {
                    let policy_string = verify::scoped_policy("trana.caller_not_approved", &caller);
                    msg!("TRANA require | policy={} | owner={}", policy_string, owner_key);
                    verify::verify_with_policy(ix, registry, &owner_key, pid, &policy_string, &fee)?;
                }
                Ok(())
            }

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

            Policy::RapidDrain { last_deposit_at, last_deposit_amount, deposit_threshold, window_secs } => {
                if last_deposit_amount >= deposit_threshold {
                    let now           = Clock::get()?.unix_timestamp;
                    let seconds_since = now.saturating_sub(last_deposit_at);
                    if seconds_since < window_secs {
                        msg!(
                            "TRANA require | policy=trana.rapid_drain | deposit_amount={} | seconds_since_deposit={} | window={} | owner={}",
                            last_deposit_amount, seconds_since, window_secs, owner_key,
                        );
                        verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.rapid_drain", &fee)?;
                    }
                }
                Ok(())
            }

            Policy::BurstFrequency { max_calls, window_slots } => {
                let (protected_program_id, discriminator) =
                    verify::get_protected_ix_metadata(ix)?;

                require!(!ctx.remaining_accounts.is_empty(), GuardError::MissingTrackerAccount);
                let tracker_info = &ctx.remaining_accounts[0];

                // Validate PDA ownership + seeds — guard derives expected address,
                // program cannot substitute a fake account it controls.
                let (expected_pda, _) = Pubkey::find_program_address(
                    &[b"burst", protected_program_id.as_ref(), &discriminator, owner_key.as_ref()],
                    ctx.program_id,
                );
                require!(tracker_info.key()    == expected_pda, GuardError::InvalidTrackerAccount);
                require!(tracker_info.owner    == ctx.program_id, GuardError::InvalidTrackerAccount);
                require!(tracker_info.is_writable,                GuardError::InvalidTrackerAccount);

                let mut counter: BurstCounter =
                    BurstCounter::try_deserialize(&mut &tracker_info.try_borrow_data()?[..])?;

                let current_slot = Clock::get()?.slot;

                // Roll window when expired — reset count but preserve window boundary.
                if current_slot.saturating_sub(counter.window_start_slot) > window_slots {
                    counter.window_start_slot = current_slot;
                    counter.call_count        = 0;
                }
                counter.call_count = counter.call_count.saturating_add(1);

                // Serialize back before verification — atomically reverts on tx failure.
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

            Policy::Cooldown { min_slots } => {
                let (protected_program_id, discriminator) =
                    verify::get_protected_ix_metadata(ix)?;

                require!(!ctx.remaining_accounts.is_empty(), GuardError::MissingTrackerAccount);
                let tracker_info = &ctx.remaining_accounts[0];

                let (expected_pda, _) = Pubkey::find_program_address(
                    &[b"cooldown", protected_program_id.as_ref(), &discriminator, owner_key.as_ref()],
                    ctx.program_id,
                );
                require!(tracker_info.key()    == expected_pda, GuardError::InvalidTrackerAccount);
                require!(tracker_info.owner    == ctx.program_id, GuardError::InvalidTrackerAccount);
                require!(tracker_info.is_writable,                GuardError::InvalidTrackerAccount);

                let mut tracker: CooldownTracker =
                    CooldownTracker::try_deserialize(&mut &tracker_info.try_borrow_data()?[..])?;

                let current_slot = Clock::get()?.slot;

                // Save previous slot BEFORE updating — then check against the old value.
                let last = tracker.last_called_slot;
                tracker.last_called_slot = current_slot;
                tracker.try_serialize(&mut &mut tracker_info.try_borrow_mut_data()?[..])?;

                let slots_since = current_slot.saturating_sub(last);

                // last == 0 means first call ever — allow without passkey.
                if last != 0 && slots_since < min_slots {
                    msg!(
                        "TRANA require | policy=trana.cooldown | slots_since={} | min={} | owner={}",
                        slots_since, min_slots, owner_key,
                    );
                    verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.cooldown", &fee)?;
                }
                Ok(())
            }

            Policy::Custom { policy_string, context } => {
                if !context.is_empty() {
                    msg!("TRANA context | policy={} | context_hex={}", policy_string, hex_encode(&context));
                }
                msg!("TRANA require | policy={} | owner={}", policy_string, owner_key);
                verify::verify_with_policy(ix, registry, &owner_key, pid, &policy_string, &fee)
            }
        }
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

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

    /// Passkey required UNTIL `slot` is reached (current_slot < slot → proof required).
    /// Once the slot passes, calls proceed freely.
    /// Use case: new feature requiring manual approval during its rollout window.
    /// Guard reads Clock sysvar directly; the program cannot influence the result.
    /// Policy string: "trana.not_before"
    NotBefore { slot: u64 },

    /// Passkey required AFTER `slot` passes (current_slot > slot → proof required).
    /// Before the slot, calls proceed freely.
    /// Use case: emergency freeze that auto-activates at a specific slot without
    /// requiring an explicit pause instruction.
    /// Guard reads Clock sysvar directly; the program cannot influence the result.
    /// Policy string: "trana.not_after"
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
////
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
                    // Passkey required until `slot` is reached. After that, free.
                    msg!(
                        "TRANA require | policy=trana.not_before | current={} | required={} | owner={}",
                        current_slot, slot, owner_key,
                    );
                    verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.not_before", &fee)?;
                }
                Ok(())
            }

            Policy::NotAfter { slot } => {
                let current_slot = Clock::get()?.slot;
                if current_slot > slot {
                    // Passkey required after `slot` has passed. Before it, free.
                    msg!(
                        "TRANA require | policy=trana.not_after | current={} | expiry={} | owner={}",
                        current_slot, slot, owner_key,
                    );
                    verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.not_after", &fee)?;
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

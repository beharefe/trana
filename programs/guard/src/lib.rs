use anchor_lang::prelude::*;

pub mod error;
pub mod events;
pub mod state;
mod verify;

pub use error::GuardError;
pub use events::ProofVerified;
pub use state::{
    Enforce, InitConfig, UpdateConfig, WithdrawFees,
    KeyKind, ProofData, RecordProof, RegisterTwoFa,
    TranaConfig, TwoFactorRegistry,
};

declare_id!("BmevGCa642U4Zs1462wN1QQ3N921dFUijW52ULtDpqhb");

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

    /// Require passkey when the u64 at `param_offset` bytes (after discriminator)
    /// in the protected instruction is >= `threshold`.
    /// Guard reads the value directly — the caller cannot fake it.
    /// Policy string: "trana.threshold"
    Threshold { param_offset: u8, threshold: u64 },

    /// Require passkey when `already_withdrawn` + current amount > `threshold`
    /// (rolling rate-limit). Guard reads current amount from the instruction.
    /// Policy string: "trana.velocity"
    Velocity { param_offset: u8, already_withdrawn: u64, threshold: u64 },

    /// Require passkey when a withdrawal occurs within `window_secs` of a
    /// deposit >= `deposit_threshold`.
    /// Policy string: "trana.rapid_drain"
    RapidDrain {
        last_deposit_at:     i64,
        last_deposit_amount: u64,
        deposit_threshold:   u64,
        window_secs:         i64,
    },

    /// Application-defined policy. The policy string is read from the proof.
    /// Use this when business logic doesn't fit a standard pattern.
    Custom,
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
//    guard::cpi::enforce(ctx, Policy::Threshold { param_offset: 0, threshold: 1_000_000_000 })?
//    guard::cpi::enforce(ctx, Policy::Velocity  { param_offset: 0, already_withdrawn, threshold })?
//    guard::cpi::enforce(ctx, Policy::Admin)?
//    guard::cpi::enforce(ctx, Policy::Always)?
//    guard::cpi::enforce(ctx, Policy::RapidDrain { last_deposit_at, last_deposit_amount, .. })?
//    guard::cpi::enforce(ctx, Policy::Custom)?  // policy string read from proof
//
//  ── Standard policy strings (hardcoded inside this program, cannot be spoofed) ──
//
//    trana.always      — always require passkey
//    trana.admin       — privileged / irreversible admin action
//    trana.threshold   — amount at byte offset N >= threshold
//    trana.velocity    — cumulative + current > threshold (rate limiting)
//    trana.rapid_drain — withdrawal within window of a large deposit
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

            Policy::Threshold { param_offset, threshold } => {
                let amount = verify::read_u64_from_protected_ix(ix, param_offset)?;
                if amount >= threshold {
                    msg!(
                        "TRANA require | policy=trana.threshold | amount={} | threshold={} | owner={}",
                        amount, threshold, owner_key,
                    );
                    verify::verify_with_policy(ix, registry, &owner_key, pid, "trana.threshold", &fee)?;
                }
                Ok(())
            }

            Policy::Velocity { param_offset, already_withdrawn, threshold } => {
                let amount = verify::read_u64_from_protected_ix(ix, param_offset)?;
                let cumulative = already_withdrawn.saturating_add(amount);
                if cumulative > threshold {
                    msg!(
                        "TRANA require | policy=trana.velocity | amount={} | already_withdrawn={} | cumulative={} | threshold={} | owner={}",
                        amount, already_withdrawn, cumulative, threshold, owner_key,
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

            Policy::Custom => {
                msg!("TRANA require | policy=custom | owner={}", owner_key);
                verify::verify_from_proof(ix, registry, &owner_key, pid, &fee)
            }
        }
    }
}

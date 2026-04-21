use anchor_lang::prelude::*;

pub mod error;
pub mod events;
pub mod state;
mod verify;

pub use error::GuardError;
pub use events::ProofVerified;
pub use state::{Enforce, KeyKind, ProofData, RecordProof, RegisterTwoFa, TwoFactorRegistry};

declare_id!("BmevGCa642U4Zs1462wN1QQ3N921dFUijW52ULtDpqhb");

// ─────────────────────────────────────────────────────────────────────────────
//  Trana Guard — Onchain Authorization Primitive
//
//  The single guarantee:
//    "This instruction cannot execute unless the registered passkey
//     signed an intent hash that exactly describes this transaction."
//
//  ── Two integration styles ────────────────────────────────────────────────
//
//  1. Standard policies — the policy logic lives inside THIS program.
//     Audited once. Any protocol that imports it gets the same guarantee.
//     Users verify the policy by reading Trana's source, not each protocol's.
//
//       guard::cpi::enforce_threshold(ctx, amount_param_offset, 1_000_000_000)?
//       guard::cpi::enforce_velocity(ctx, already_withdrawn, 2_000_000_000)?
//       guard::cpi::enforce_admin(ctx)?
//       guard::cpi::enforce_always(ctx)?
//
//  2. Custom policy — the protocol defines when to call enforce().
//     Protocol provides its own policy string in the proof.
//     Useful when business logic doesn't fit a standard pattern.
//
//       if my_custom_condition { guard::cpi::enforce(ctx)?; }
//
//  ── Standard policy strings (hardcoded, cannot be spoofed) ────────────────
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
//    ix[N]:   your protected instruction — calls guard::cpi::enforce_*()
//
//  ── Module layout ─────────────────────────────────────────────────────────
//
//    state.rs  — ProofData, KeyKind, TwoFactorRegistry, account contexts
//    verify.rs — WebAuthn proof verification pipeline
//    error.rs  — GuardError codes
//    events.rs — ProofVerified event
//
// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod guard {
    use super::*;

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
    /// verify_from_proof / verify_with_policy to read from the Instructions sysvar.
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

    // ── Custom enforcement (application-defined policy) ───────────────────────

    /// Application-defined policy enforcement. The protocol decides when to call
    /// this and supplies the policy string in the proof. Useful for custom business
    /// logic that doesn't fit a standard policy.
    ///
    ///   if my_condition { guard::cpi::enforce(ctx)?; }
    pub fn enforce(ctx: Context<Enforce>) -> Result<()> {
        let owner_key = ctx.accounts.owner.key();
        verify::verify_from_proof(
            &ctx.accounts.instructions,
            &mut ctx.accounts.registry,
            &owner_key,
            ctx.program_id,
        )
    }

    // ── Standard policies — logic lives here, audited once ───────────────────
    //
    // These are the building blocks protocols should use. The condition
    // evaluation and passkey check both happen inside this program.
    // No-op if the policy condition is not met (passkey not required).

    /// Always require a passkey. No conditions.
    /// Policy string: "trana.always"
    pub fn enforce_always(ctx: Context<Enforce>) -> Result<()> {
        let owner_key = ctx.accounts.owner.key();
        verify::verify_with_policy(
            &ctx.accounts.instructions,
            &mut ctx.accounts.registry,
            &owner_key,
            ctx.program_id,
            "trana.always",
        )
    }

    /// Require passkey for privileged / irreversible admin actions.
    /// Policy string: "trana.admin"
    pub fn enforce_admin(ctx: Context<Enforce>) -> Result<()> {
        let owner_key = ctx.accounts.owner.key();
        verify::verify_with_policy(
            &ctx.accounts.instructions,
            &mut ctx.accounts.registry,
            &owner_key,
            ctx.program_id,
            "trana.admin",
        )
    }

    /// Require passkey when a u64 amount in the protected instruction's data
    /// is >= threshold. The guard reads `amount` directly from the instruction
    /// at `param_offset` bytes after the discriminator — the caller cannot fake it.
    ///
    /// `param_offset`: byte offset of the u64 within the instruction's parameter
    /// data (0 = first parameter, 8 = second u64 parameter, etc.).
    ///
    /// Policy string: "trana.threshold"
    pub fn enforce_threshold(
        ctx: Context<Enforce>,
        param_offset: u8,
        threshold: u64,
    ) -> Result<()> {
        let amount = verify::read_u64_from_protected_ix(&ctx.accounts.instructions, param_offset)?;
        if amount >= threshold {
            let owner_key = ctx.accounts.owner.key();
            verify::verify_with_policy(
                &ctx.accounts.instructions,
                &mut ctx.accounts.registry,
                &owner_key,
                ctx.program_id,
                "trana.threshold",
            )?;
        }
        Ok(())
    }

    /// Require passkey when cumulative withdrawn + current amount in the
    /// protected instruction exceeds threshold (rolling rate-limit guard).
    ///
    /// The protocol tracks `already_withdrawn` in its own state and passes it
    /// here. The guard reads the current amount from the instruction directly.
    /// The condition math (`already_withdrawn + current > threshold`) is
    /// evaluated inside this audited program.
    ///
    /// Policy string: "trana.velocity"
    pub fn enforce_velocity(
        ctx: Context<Enforce>,
        param_offset: u8,
        already_withdrawn: u64,
        threshold: u64,
    ) -> Result<()> {
        let amount = verify::read_u64_from_protected_ix(&ctx.accounts.instructions, param_offset)?;
        if already_withdrawn.saturating_add(amount) > threshold {
            let owner_key = ctx.accounts.owner.key();
            verify::verify_with_policy(
                &ctx.accounts.instructions,
                &mut ctx.accounts.registry,
                &owner_key,
                ctx.program_id,
                "trana.velocity",
            )?;
        }
        Ok(())
    }

    /// Require passkey when a recent large deposit makes a rapid drain likely.
    ///
    /// The protocol passes its deposit tracking state. The guard evaluates
    /// the condition: deposit >= deposit_threshold AND now - deposit_at < window_secs.
    ///
    /// Policy string: "trana.rapid_drain"
    pub fn enforce_rapid_drain(
        ctx: Context<Enforce>,
        last_deposit_at:     i64,
        last_deposit_amount: u64,
        deposit_threshold:   u64,
        window_secs:         i64,
    ) -> Result<()> {
        if last_deposit_amount >= deposit_threshold {
            let now           = Clock::get()?.unix_timestamp;
            let seconds_since = now.saturating_sub(last_deposit_at);
            if seconds_since < window_secs {
                let owner_key = ctx.accounts.owner.key();
                verify::verify_with_policy(
                    &ctx.accounts.instructions,
                    &mut ctx.accounts.registry,
                    &owner_key,
                    ctx.program_id,
                    "trana.rapid_drain",
                )?;
            }
        }
        Ok(())
    }
}

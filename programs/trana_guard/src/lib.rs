// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

use anchor_lang::prelude::*;

#[cfg(feature = "devnet")]
declare_id!("TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG");

#[cfg(not(feature = "devnet"))]
declare_id!("GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn");

pub mod error;
pub mod events;
pub mod state;
mod verify;

pub use error::GuardError;
pub use events::ProofVerified;
pub use state::*;

// ── Policy enum ───────────────────────────────────────────────────────────────
//
// Defined at the crate root so Anchor's #[program] macro can resolve it as
// `crate::Policy` without going through a re-export chain.

/// Standard authorization policies. Pass one of these to `trana::cpi::enforce()`.
///
/// Condition evaluation and passkey checks both happen inside this program —
/// audited once, trusted everywhere.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum Policy {
    /// Always require a passkey. No conditions.
    /// Policy string: "trana.require"
    Require,

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

    /// Require passkey when the u64 at `param_offset` bytes (after discriminator)
    /// in the protected instruction is >= `limit`.
    /// Guard reads the value directly — the caller cannot fake it.
    /// Policy string: "trana.limit"
    Limit { param_offset: u8, limit: u64 },
}

/// Canonical policy domain strings. Use these in your integration — not raw literals —
/// so a typo is a compile error rather than a runtime `PolicyMismatch`.
pub const POLICY_REQUIRE:    &str = "trana.require";
pub const POLICY_LIMIT:      &str = "trana.limit";
pub const POLICY_NOT_BEFORE: &str = "trana.not_before";
pub const POLICY_NOT_AFTER:  &str = "trana.not_after";

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
//    trana::cpi::enforce(ctx, Policy::Require)?
//    trana::cpi::enforce(ctx, Policy::Limit    { param_offset: 0, limit: 1_000_000_000 })?
//    trana::cpi::enforce(ctx, Policy::NotBefore { slot })?
//    trana::cpi::enforce(ctx, Policy::NotAfter  { slot })?
//
//  ── Standard policy strings (hardcoded inside this program, cannot be spoofed) ──
//
//    trana.require    — always require passkey
//    trana.limit      — value at byte offset N >= limit
//    trana.not_before — passkey required until slot N is reached
//    trana.not_after  — passkey required after slot N has passed
//
//  ── Transaction shape (required by the SDK) ───────────────────────────────
//
//    ix[N-2]: secp256r1 precompile      — native P-256 sig verify (SIMD-0075)
//    ix[N-1]: trana::record_proof       — carries WebAuthn binding data
//    ix[N]:   your protected instruction — calls trana::cpi::enforce()
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
pub mod trana_guard {
    use super::*;

    // ── Fee config ────────────────────────────────────────────────────────────

    /// One-time initialization of the global fee config PDA.
    /// Called once by the Trana team after deployment.
    pub fn init_config(
        ctx:          Context<InitConfig>,
        register_fee: u64,
        recovery_fee: u64,
        treasury:     Pubkey,
    ) -> Result<()> {
        let cfg           = &mut ctx.accounts.config;
        cfg.authority     = ctx.accounts.authority.key();
        cfg.treasury      = treasury;
        cfg.register_fee  = register_fee;
        cfg.recovery_fee  = recovery_fee;
        msg!(
            "TRANA config | register_fee={} | recovery_fee={} | treasury={}",
            register_fee, recovery_fee, treasury,
        );
        Ok(())
    }

    /// Update registration/recovery fees or treasury address.
    /// Requires the config authority to sign — full audit trail on-chain.
    pub fn update_config(
        ctx:          Context<UpdateConfig>,
        register_fee: u64,
        recovery_fee: u64,
        treasury:     Pubkey,
    ) -> Result<()> {
        let cfg           = &mut ctx.accounts.config;
        cfg.register_fee  = register_fee;
        cfg.recovery_fee  = recovery_fee;
        cfg.treasury      = treasury;
        msg!(
            "TRANA config updated | register_fee={} | recovery_fee={} | treasury={}",
            register_fee, recovery_fee, treasury,
        );
        Ok(())
    }

    // ── Passkey registration ──────────────────────────────────────────────────

    /// Register a P-256 passkey for the first time.
    /// Only works when no key is registered yet (registry.pubkey_bytes is empty).
    /// For replacing an existing key use recover_two_fa, which requires the
    /// current passkey to prove you still hold it.
    pub fn register_two_fa(
        ctx: Context<RegisterTwoFa>,
        key_kind: KeyKind,
        pubkey_bytes: Vec<u8>,
        credential_id: Vec<u8>,
    ) -> Result<()> {
        validate_key_inputs(&pubkey_bytes, &credential_id)?;
        let is_new = ctx.accounts.registry.pubkey_bytes.is_empty();
        // Block wallet-only re-registration — use recover_two_fa instead.
        // This closes the hijack vector: an attacker with just the wallet key
        // cannot overwrite the registered passkey.
        require!(is_new, GuardError::Unauthorized);

        collect_fee(
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.treasury.to_account_info(),
            ctx.accounts.config.register_fee,
        )?;
        let r           = &mut ctx.accounts.registry;
        r.owner         = ctx.accounts.owner.key();
        r.key_kind      = key_kind;
        r.pubkey_bytes  = pubkey_bytes;
        r.credential_id = credential_id;
        msg!("TRANA register | owner={}", r.owner);
        Ok(())
    }

    /// Replace the registered passkey. Requires a proof from the CURRENT key.
    ///
    /// The old passkey signs an intent whose params_hash covers the new
    /// pubkey_bytes and credential_id, so the replacement is approved by the
    /// existing device before it takes effect.
    ///
    /// Transaction shape (same as enforce):
    ///   ix[N-2]: secp256r1 precompile  (signed by OLD key)
    ///   ix[N-1]: trana_guard::record_proof
    ///   ix[N]:   trana_guard::recover_two_fa  ← this instruction
    pub fn recover_two_fa(
        ctx: Context<RecoverTwoFa>,
        key_kind: KeyKind,
        pubkey_bytes: Vec<u8>,
        credential_id: Vec<u8>,
    ) -> Result<()> {
        validate_key_inputs(&pubkey_bytes, &credential_id)?;

        let owner_key = ctx.accounts.owner.key();

        // Verify the OLD passkey signed this exact instruction (which carries the
        // new pubkey_bytes in its params). No separate enforce CPI needed.
        verify::verify_with_policy(
            &ctx.accounts.instructions,
            &mut ctx.accounts.registry,
            &owner_key,
            ctx.program_id,
            POLICY_REQUIRE,
        )?;

        collect_fee(
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.treasury.to_account_info(),
            ctx.accounts.config.recovery_fee,
        )?;

        let r           = &mut ctx.accounts.registry;
        r.key_kind      = key_kind;
        r.pubkey_bytes  = pubkey_bytes;
        r.credential_id = credential_id;
        // nonce was already incremented by verify_with_policy — do not reset it
        msg!("TRANA recover | owner={}", owner_key);
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
    /// For conditional policies (NotBefore, NotAfter, Limit) the condition is
    /// evaluated here and passkey is required only when the condition fires.
    /// For Policy::Require the passkey is always required unconditionally.
    pub fn enforce(ctx: Context<Enforce>, policy: Policy) -> Result<()> {
        let owner_key = ctx.accounts.owner.key();
        let ix        = &ctx.accounts.instructions;
        let registry  = &mut ctx.accounts.registry;
        let pid       = ctx.program_id;

        match policy {
            Policy::Require => {
                msg!("TRANA require | policy={} | owner={}", POLICY_REQUIRE, owner_key);
                verify::verify_with_policy(ix, registry, &owner_key, pid, POLICY_REQUIRE)
            }

            Policy::NotBefore { slot } => {
                let current_slot = Clock::get()?.slot;
                if current_slot < slot {
                    msg!(
                        "TRANA require | policy={} | current={} | required={} | owner={}",
                        POLICY_NOT_BEFORE, current_slot, slot, owner_key,
                    );
                    verify::verify_with_policy(ix, registry, &owner_key, pid, POLICY_NOT_BEFORE)?;
                }
                Ok(())
            }

            Policy::NotAfter { slot } => {
                let current_slot = Clock::get()?.slot;
                if current_slot > slot {
                    msg!(
                        "TRANA require | policy={} | current={} | expiry={} | owner={}",
                        POLICY_NOT_AFTER, current_slot, slot, owner_key,
                    );
                    verify::verify_with_policy(ix, registry, &owner_key, pid, POLICY_NOT_AFTER)?;
                }
                Ok(())
            }

            Policy::Limit { param_offset, limit } => {
                let (amount, current_idx) = verify::read_u64_from_protected_ix(ix, param_offset)?;
                if amount >= limit {
                    msg!(
                        "TRANA require | policy={} | amount={} | limit={} | owner={}",
                        POLICY_LIMIT, amount, limit, owner_key,
                    );
                    verify::verify_at_idx(ix, registry, &owner_key, pid, POLICY_LIMIT, current_idx)?;
                }
                Ok(())
            }
        }
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

fn validate_key_inputs(pubkey_bytes: &[u8], credential_id: &[u8]) -> Result<()> {
    require!(
        pubkey_bytes.len()  <= TwoFactorRegistry::MAX_PUBKEY_LEN,
        GuardError::InvalidProof
    );
    require!(
        credential_id.len() <= TwoFactorRegistry::MAX_CRED_ID_LEN,
        GuardError::InvalidProof
    );
    Ok(())
}

fn collect_fee<'info>(
    system_program: AccountInfo<'info>,
    from:           AccountInfo<'info>,
    to:             AccountInfo<'info>,
    fee:            u64,
) -> Result<()> {
    if fee > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                system_program,
                anchor_lang::system_program::Transfer { from, to },
            ),
            fee,
        )?;
    }
    Ok(())
}

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

/// Standard authorization policies. Pass one of these to `trana_guard::cpi::enforce()`.
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
    /// Policy string: "trana.not_before"
    NotBefore { slot: u64 },

    /// Passkey required AFTER `slot` passes (current_slot > slot → proof required).
    /// Before the slot, calls proceed freely.
    /// Policy string: "trana.not_after"
    NotAfter { slot: u64 },

    /// Require passkey when the u64 at `param_offset` bytes (after discriminator)
    /// in the protected instruction is >= `limit`.
    /// Policy string: "trana.limit"
    Limit { param_offset: u8, limit: u64 },
}

/// Canonical policy domain strings.
pub const POLICY_REQUIRE:    &str = "trana.require";
pub const POLICY_LIMIT:      &str = "trana.limit";
pub const POLICY_NOT_BEFORE: &str = "trana.not_before";
pub const POLICY_NOT_AFTER:  &str = "trana.not_after";

// ─────────────────────────────────────────────────────────────────────────────
//  Trana Guard — Onchain Authorization Primitive
//
//  The single guarantee:
//    "This instruction cannot execute unless one of the wallet's registered
//     passkeys signed an intent hash that exactly describes this transaction."
//
//  ── Multi-passkey model ───────────────────────────────────────────────────
//
//  Each wallet has one PasskeyRegistry PDA (seeds: ["passkey", wallet]).
//  Up to MAX_KEYS (10) passkeys can be registered. Any of them can sign
//  an enforce() proof. Add or remove passkeys at any time:
//
//    register_passkey  — first key, wallet signature only
//    add_passkey       — additional keys, requires proof from an existing key
//    remove_passkey    — remove a key by credential ID, requires existing key proof
//
//  ── Integration ───────────────────────────────────────────────────────────
//
//    trana_guard::cpi::enforce(ctx, Policy::Require)?
//    trana_guard::cpi::enforce(ctx, Policy::Limit { param_offset: 0, limit: 1_000_000_000 })?
//
//  ── Transaction shape ─────────────────────────────────────────────────────
//
//    ix[N-2]: secp256r1 precompile      — native P-256 sig verify (SIMD-0075)
//    ix[N-1]: trana_guard::record_proof — carries WebAuthn binding data
//    ix[N]:   your protected instruction — calls trana_guard::cpi::enforce()
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
        add_key_fee:  u64,
        treasury:     Pubkey,
    ) -> Result<()> {
        let cfg          = &mut ctx.accounts.config;
        cfg.authority    = ctx.accounts.authority.key();
        cfg.treasury     = treasury;
        cfg.register_fee = register_fee;
        cfg.add_key_fee  = add_key_fee;
        msg!(
            "TRANA config | register_fee={} | add_key_fee={} | treasury={}",
            register_fee, add_key_fee, treasury,
        );
        Ok(())
    }

    /// Update registration/add-key fees or treasury address.
    /// Requires the config authority to sign — full audit trail on-chain.
    pub fn update_config(
        ctx:          Context<UpdateConfig>,
        register_fee: u64,
        add_key_fee:  u64,
        treasury:     Pubkey,
    ) -> Result<()> {
        let cfg          = &mut ctx.accounts.config;
        cfg.register_fee = register_fee;
        cfg.add_key_fee  = add_key_fee;
        cfg.treasury     = treasury;
        msg!(
            "TRANA config updated | register_fee={} | add_key_fee={} | treasury={}",
            register_fee, add_key_fee, treasury,
        );
        Ok(())
    }

    // ── Passkey registration ──────────────────────────────────────────────────

    /// Register the first passkey for a wallet.
    /// Only succeeds when the registry is empty — subsequent passkeys require
    /// proof from an existing key via `add_passkey`.
    pub fn register_passkey(
        ctx:           Context<RegisterPasskey>,
        key_kind:      KeyKind,
        pubkey_bytes:  Vec<u8>,
        credential_id: Vec<u8>,
    ) -> Result<()> {
        validate_key_inputs(&pubkey_bytes, &credential_id)?;

        let r = &mut ctx.accounts.registry;

        // Block re-registration via this instruction — use add_passkey instead.
        // This closes the hijack vector: an attacker with just the wallet key
        // cannot overwrite or add a passkey after the first registration.
        require!(r.keys.is_empty(), GuardError::Unauthorized);

        collect_fee(
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.treasury.to_account_info(),
            ctx.accounts.config.register_fee,
        )?;

        r.owner = ctx.accounts.owner.key();
        r.keys.push(PasskeyEntry { key_kind, pubkey_bytes, credential_id });
        msg!("TRANA register_passkey | owner={}", r.owner);
        Ok(())
    }

    /// Add an additional passkey to an existing registry.
    ///
    /// Requires a proof signed by any currently registered passkey.
    /// Charges `add_key_fee` to prevent spam.
    /// Up to MAX_KEYS (10) passkeys per wallet.
    ///
    /// Transaction shape (same as enforce):
    ///   ix[N-2]: secp256r1 precompile  (signed by any existing key)
    ///   ix[N-1]: trana_guard::record_proof
    ///   ix[N]:   trana_guard::add_passkey  ← this instruction
    pub fn add_passkey(
        ctx:           Context<AddPasskey>,
        key_kind:      KeyKind,
        pubkey_bytes:  Vec<u8>,
        credential_id: Vec<u8>,
    ) -> Result<()> {
        validate_key_inputs(&pubkey_bytes, &credential_id)?;

        let owner_key = ctx.accounts.owner.key();

        require!(
            ctx.accounts.registry.keys.len() < MAX_KEYS,
            GuardError::MaxKeysReached
        );

        // Verify any registered passkey signs this exact instruction.
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
            ctx.accounts.config.add_key_fee,
        )?;

        ctx.accounts.registry.keys.push(PasskeyEntry { key_kind, pubkey_bytes, credential_id });
        msg!("TRANA add_passkey | owner={} | total_keys={}", owner_key, ctx.accounts.registry.keys.len());
        Ok(())
    }

    /// Remove a passkey by its credential ID.
    ///
    /// Requires a proof from any currently registered passkey.
    /// Cannot remove the last key — at least one must remain.
    /// Free (no fee).
    ///
    /// Transaction shape:
    ///   ix[N-2]: secp256r1 precompile  (signed by any existing key)
    ///   ix[N-1]: trana_guard::record_proof
    ///   ix[N]:   trana_guard::remove_passkey  ← this instruction
    pub fn remove_passkey(
        ctx:           Context<RemovePasskey>,
        credential_id: Vec<u8>,
    ) -> Result<()> {
        let owner_key = ctx.accounts.owner.key();

        require!(
            ctx.accounts.registry.keys.len() > 1,
            GuardError::LastKeyCannotBeRemoved
        );

        // Verify any registered passkey signs this exact instruction before removal.
        verify::verify_with_policy(
            &ctx.accounts.instructions,
            &mut ctx.accounts.registry,
            &owner_key,
            ctx.program_id,
            POLICY_REQUIRE,
        )?;

        let before = ctx.accounts.registry.keys.len();
        ctx.accounts.registry.keys.retain(|k| k.credential_id != credential_id);
        let after = ctx.accounts.registry.keys.len();

        require!(after < before, GuardError::CredentialNotFound);
        msg!("TRANA remove_passkey | owner={} | remaining_keys={}", owner_key, after);
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

    /// Enforce authorization according to the given policy.
    ///
    /// Any registered passkey in the wallet's PasskeyRegistry can provide
    /// the proof. For conditional policies, the condition is evaluated here —
    /// passkey is required only when the condition fires.
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
        pubkey_bytes.len()  <= PasskeyRegistry::MAX_PUBKEY_LEN,
        GuardError::InvalidProof
    );
    require!(
        credential_id.len() <= PasskeyRegistry::MAX_CRED_ID_LEN,
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

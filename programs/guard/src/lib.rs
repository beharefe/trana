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
//  Trust anchors (zero trusted backend):
//    1. secp256r1 precompile (SIMD-0075) — native P-256 sig verify
//    2. TwoFactorRegistry PDA — stores the user's P-256 pubkey onchain
//    3. Intent hash — cryptographically binds proof to program/accounts/params
//    4. Nonce — consumed on each proof, prevents replay
//
//  Transaction shape required by the SDK:
//    ix[N-2]: secp256r1 precompile      — native P-256 sig verify
//    ix[N-1]: guard::record_proof       — carries WebAuthn binding data
//    ix[N]:   your protected instruction — calls guard::cpi::enforce()
//
//  Integration (one CPI call):
//    1. Add accounts: guard_program, trana_registry (mut), trana_instructions
//    2. Call: guard::cpi::enforce(cpi_ctx)?
//    3. SDK prepends secp256r1 + record_proof automatically
//
//  Module layout:
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
    /// verify_via_sysvar to read from the Instructions sysvar.
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

    // ── Enforcement primitive ─────────────────────────────────────────────────

    /// The core integration point. External programs call this via CPI.
    /// Reads proof from the Instructions sysvar, verifies the P-256 signature,
    /// and increments the registry nonce to prevent replay.
    /// On success: emits ProofVerified with policy name in transaction logs.
    pub fn enforce(ctx: Context<Enforce>) -> Result<()> {
        let owner_key = ctx.accounts.owner.key();
        verify::verify_via_sysvar(
            &ctx.accounts.instructions,
            &mut ctx.accounts.registry,
            &owner_key,
            ctx.program_id,
        )
    }
}

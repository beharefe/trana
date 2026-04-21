use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_ID;
use crate::error::GuardError;

// ── Wire type ─────────────────────────────────────────────────────────────────

/// Borsh payload stored in the `record_proof` instruction data.
/// Deserialized by verify_via_sysvar from the Instructions sysvar.
#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct ProofData {
    pub version:            u8,
    pub expiry:             i64,
    pub cluster:            String,
    pub policy:             String,
    pub authenticator_data: Vec<u8>,
    pub client_data_json:   Vec<u8>,
}

// ── Onchain state ─────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum KeyKind {
    /// P-256 / secp256r1 — WebAuthn passkeys (Touch ID, Face ID, YubiKey).
    Secp256r1Passkey,
    /// Ed25519 — hardware signing devices or dedicated keypairs.
    Ed25519,
}

/// Per-user onchain 2FA registry.
///
/// Seeds: `[b"2fa", owner]`
///
/// `nonce` is incremented on every successful passkey proof verification —
/// old proofs cannot be replayed even if the signed intent was valid.
#[account]
pub struct TwoFactorRegistry {
    pub owner:         Pubkey,  // 32
    pub key_kind:      KeyKind, //  1
    pub pubkey_bytes:  Vec<u8>, //  4 + up to 33  (P-256 compressed)
    pub credential_id: Vec<u8>, //  4 + up to 128 (WebAuthn credential ID)
    pub enabled:       bool,    //  1
    pub nonce:         u64,     //  8  — replay prevention counter
}

impl TwoFactorRegistry {
    pub const MAX_PUBKEY_LEN:  usize = 33;
    pub const MAX_CRED_ID_LEN: usize = 128;
    /// discriminator(8) + owner(32) + key_kind(1) + pubkey(4+33) + cred_id(4+128) + enabled(1) + nonce(8)
    pub const SPACE: usize = 8 + 32 + 1 + (4 + 33) + (4 + 128) + 1 + 8; // = 219
}

// ── Account contexts ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RegisterTwoFa<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = TwoFactorRegistry::SPACE,
        seeds = [b"2fa", owner.key().as_ref()],
        bump,
    )]
    pub registry: Account<'info, TwoFactorRegistry>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// No on-chain accounts — record_proof is a pure data carrier.
/// Instructions sysvar included to satisfy Anchor's 'info lifetime.
#[derive(Accounts)]
pub struct RecordProof<'info> {
    /// CHECK: Solana Instructions sysvar — read-only context
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

/// Accounts for the enforce() CPI primitive.
/// External programs supply these when calling guard::cpi::enforce().
#[derive(Accounts)]
pub struct Enforce<'info> {
    /// Registry PDA — nonce is incremented on every successful verification.
    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        bump,
        constraint = registry.enabled @ GuardError::RegistryDisabled,
    )]
    pub registry: Account<'info, TwoFactorRegistry>,

    /// The wallet whose registered passkey must authorize this action.
    pub owner: Signer<'info>,

    /// CHECK: Solana Instructions sysvar — used to read proof + protected ix.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

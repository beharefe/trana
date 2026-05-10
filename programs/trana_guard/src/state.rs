// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_ID;
use crate::error::GuardError;

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum number of passkeys a single wallet can register.
pub const MAX_KEYS: usize = 10;

// ── Wire type ─────────────────────────────────────────────────────────────────

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct ProofData {
    pub version:            u8,
    pub expiry:             i64,
    pub policy:             String,
    pub authenticator_data: Vec<u8>,
    pub client_data_json:   Vec<u8>,
}

// ── Onchain state ─────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace)]
pub enum KeyKind {
    Secp256r1Passkey,
    Ed25519,
}

/// A single registered passkey credential.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct PasskeyEntry {
    pub key_kind: KeyKind,
    #[max_len(33)]
    pub pubkey_bytes:  Vec<u8>,
    #[max_len(128)]
    pub credential_id: Vec<u8>,
}

/// Per-user passkey registry.
/// Seeds: `[b"passkey", owner]`
///
/// Holds all registered passkeys for a wallet. Any entry can authorize
/// any `enforce()` call — sign with whichever device is available.
/// Add or remove entries at any time using `add_passkey` / `remove_passkey`.
#[account]
#[derive(InitSpace)]
pub struct PasskeyRegistry {
    pub owner: Pubkey,
    /// Incremented after every successful `enforce()`, `add_passkey`, or
    /// `remove_passkey` call to prevent proof replay.
    pub nonce: u64,
    #[max_len(10)]
    pub keys:  Vec<PasskeyEntry>,
}

impl PasskeyRegistry {
    pub const MAX_PUBKEY_LEN:  usize = 33;
    pub const MAX_CRED_ID_LEN: usize = 128;
}

// ── Fee config ────────────────────────────────────────────────────────────────

/// Global fee configuration.
/// Seeds: `[b"config"]`
///
/// Stores registration fees and the treasury destination.
/// Publicly readable — any auditor can verify exact fees without reading source.
/// Changes require a signed transaction from authority, full history on-chain.
#[account]
#[derive(InitSpace)]
pub struct TranaConfig {
    /// Who can call update_config.
    pub authority:    Pubkey,
    /// Where registration fees are sent.
    pub treasury:     Pubkey,
    /// Lamports charged for first-time passkey registration.
    pub register_fee: u64,
    /// Lamports charged for adding an additional passkey (`add_passkey`).
    pub add_key_fee:  u64,
}

// ── Account contexts ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RegisterPasskey<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = PasskeyRegistry::DISCRIMINATOR.len() + PasskeyRegistry::INIT_SPACE,
        seeds = [b"passkey", owner.key().as_ref()],
        bump,
    )]
    pub registry: Account<'info, PasskeyRegistry>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,

    /// Global fee config — determines which fee to charge.
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, TranaConfig>,

    /// CHECK: treasury — receives the registration fee.
    #[account(
        mut,
        constraint = treasury.key() == config.treasury @ GuardError::InvalidTreasury,
    )]
    pub treasury: UncheckedAccount<'info>,
}

/// Accounts for `add_passkey` — appends a new passkey to an existing registry.
/// Requires a proof from any currently registered key at ix[N-2..N-1].
#[derive(Accounts)]
pub struct AddPasskey<'info> {
    #[account(
        mut,
        seeds = [b"passkey", owner.key().as_ref()],
        bump,
    )]
    pub registry: Account<'info, PasskeyRegistry>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,

    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, TranaConfig>,

    /// CHECK: treasury — receives the add-key fee.
    #[account(
        mut,
        constraint = treasury.key() == config.treasury @ GuardError::InvalidTreasury,
    )]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: Instructions sysvar
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

/// Accounts for `remove_passkey` — removes a passkey entry by credential ID.
/// Requires a proof from any REMAINING key at ix[N-2..N-1]. Free (no fee).
#[derive(Accounts)]
pub struct RemovePasskey<'info> {
    #[account(
        mut,
        seeds = [b"passkey", owner.key().as_ref()],
        bump,
    )]
    pub registry: Account<'info, PasskeyRegistry>,

    pub owner: Signer<'info>,

    /// CHECK: Instructions sysvar
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct RecordProof<'info> {
    /// CHECK: Solana Instructions sysvar
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

/// Accounts for the enforce() CPI primitive.
#[derive(Accounts)]
pub struct Enforce<'info> {
    /// Registry PDA — nonce incremented on every successful verification.
    #[account(
        mut,
        seeds = [b"passkey", owner.key().as_ref()],
        bump,
    )]
    pub registry: Account<'info, PasskeyRegistry>,

    /// The wallet whose registered passkey must authorize this action.
    pub owner: Signer<'info>,

    /// CHECK: Solana Instructions sysvar
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

/// One-time initialization of the global fee config.
#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer     = authority,
        space     = TranaConfig::DISCRIMINATOR.len() + TranaConfig::INIT_SPACE,
        seeds     = [b"config"],
        bump,
    )]
    pub config: Account<'info, TranaConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Update registration/add-key fees or treasury address.
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump,
        has_one = authority @ GuardError::Unauthorized,
    )]
    pub config: Account<'info, TranaConfig>,

    pub authority: Signer<'info>,
}

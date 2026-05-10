// Copyright 2025 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_ID;
use crate::error::GuardError;

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

/// Per-user onchain 2FA registry.
/// Seeds: `[b"2fa", owner]`
#[account]
#[derive(InitSpace)]
pub struct TwoFactorRegistry {
    pub owner:    Pubkey,
    pub key_kind: KeyKind,
    #[max_len(33)]
    pub pubkey_bytes:  Vec<u8>,
    #[max_len(128)]
    pub credential_id: Vec<u8>,
    pub nonce: u64,
}

impl TwoFactorRegistry {
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
    /// Lamports charged for a first-time passkey registration.
    pub register_fee: u64,
    /// Lamports charged for a key recovery (re-registration).
    pub recovery_fee: u64,
}

// ── Account contexts ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RegisterTwoFa<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = TwoFactorRegistry::DISCRIMINATOR.len() + TwoFactorRegistry::INIT_SPACE,
        seeds = [b"2fa", owner.key().as_ref()],
        bump,
    )]
    pub registry: Account<'info, TwoFactorRegistry>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,

    /// Global fee config — determines which fee to charge.
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, TranaConfig>,

    /// CHECK: treasury — receives the registration or recovery fee.
    #[account(
        mut,
        constraint = treasury.key() == config.treasury @ GuardError::InvalidTreasury,
    )]
    pub treasury: UncheckedAccount<'info>,
}

/// Accounts for recover_two_fa — replaces an existing passkey.
/// Requires the current passkey proof at ix[N-2..N-1].
#[derive(Accounts)]
pub struct RecoverTwoFa<'info> {
    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        bump,
    )]
    pub registry: Account<'info, TwoFactorRegistry>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,

    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, TranaConfig>,

    /// CHECK: treasury — receives the recovery fee.
    #[account(
        mut,
        constraint = treasury.key() == config.treasury @ GuardError::InvalidTreasury,
    )]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: Solana Instructions sysvar
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
        seeds = [b"2fa", owner.key().as_ref()],
        bump,
    )]
    pub registry: Account<'info, TwoFactorRegistry>,

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

/// Update registration/recovery fees or treasury address.
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


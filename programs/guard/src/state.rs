use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_ID;
use crate::error::GuardError;

// ── Wire type ─────────────────────────────────────────────────────────────────

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
    Secp256r1Passkey,
    Ed25519,
}

/// Per-user onchain 2FA registry.
/// Seeds: `[b"2fa", owner]`
#[account]
pub struct TwoFactorRegistry {
    pub owner:         Pubkey,  // 32
    pub key_kind:      KeyKind, //  1
    pub pubkey_bytes:  Vec<u8>, //  4 + up to 33
    pub credential_id: Vec<u8>, //  4 + up to 128
    pub enabled:       bool,    //  1
    pub nonce:         u64,     //  8
}

impl TwoFactorRegistry {
    pub const MAX_PUBKEY_LEN:  usize = 33;
    pub const MAX_CRED_ID_LEN: usize = 128;
    pub const SPACE: usize = 8 + 32 + 1 + (4 + 33) + (4 + 128) + 1 + 8; // 219
}

// ── Fee config ────────────────────────────────────────────────────────────────

/// Global fee configuration.
/// Seeds: `[b"config"]`
///
/// Stores the per-enforcement fee and the treasury destination.
/// Both are publicly readable — any auditor can verify the exact fee
/// without reading source code. Changes require a signed transaction
/// from the authority, so the full history is on-chain.
#[account]
pub struct TranaConfig {
    /// Who can call update_config / withdraw_fees.
    pub authority:    Pubkey, // 32
    /// Where enforcement fees are sent.
    pub treasury:     Pubkey, // 32
    /// Lamports charged per successful proof verification.
    pub fee_lamports: u64,    //  8
}

impl TranaConfig {
    /// discriminator(8) + authority(32) + treasury(32) + fee_lamports(8)
    pub const SPACE: usize = 8 + 32 + 32 + 8; // 80
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
        constraint = registry.enabled @ GuardError::RegistryDisabled,
    )]
    pub registry: Account<'info, TwoFactorRegistry>,

    /// The wallet whose registered passkey must authorize this action.
    /// Must be mut so the fee can be deducted from its lamport balance.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Solana Instructions sysvar
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,

    /// Global fee config — determines fee amount and treasury destination.
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, TranaConfig>,

    /// Treasury PDA — receives the enforcement fee.
    /// CHECK: address validated against config.treasury
    #[account(
        mut,
        constraint = treasury.key() == config.treasury @ GuardError::InvalidTreasury,
    )]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// One-time initialization of the global fee config.
#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer     = authority,
        space     = TranaConfig::SPACE,
        seeds     = [b"config"],
        bump,
    )]
    pub config: Account<'info, TranaConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Update fee amount or treasury address.
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

/// Withdraw accumulated fees from the treasury PDA to any destination.
#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        seeds = [b"config"],
        bump,
        has_one = authority @ GuardError::Unauthorized,
    )]
    pub config: Account<'info, TranaConfig>,

    pub authority: Signer<'info>,

    /// CHECK: treasury PDA — validated against config
    #[account(
        mut,
        constraint = treasury.key() == config.treasury @ GuardError::InvalidTreasury,
    )]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: any destination the authority chooses
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
}

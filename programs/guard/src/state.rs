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
    pub enabled: bool,
    pub nonce:   u64,
}

impl TwoFactorRegistry {
    pub const MAX_PUBKEY_LEN:  usize = 33;
    pub const MAX_CRED_ID_LEN: usize = 128;
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
#[derive(InitSpace)]
pub struct TranaConfig {
    /// Who can call update_config / withdraw_fees.
    pub authority:    Pubkey,
    /// Where enforcement fees are sent.
    pub treasury:     Pubkey,
    /// Lamports charged per successful proof verification.
    pub fee_lamports: u64,
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
        space     = TranaConfig::DISCRIMINATOR.len() + TranaConfig::INIT_SPACE,
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

// ── Guard-tracked PDA structs ─────────────────────────────────────────────────

/// Rate-limit counter per (protected_program, instruction, owner) triple.
/// Seeds: [b"burst", protected_program_id(32), discriminator(8), owner(32)]
/// The guard owns this account — the calling program cannot reset or influence it.
#[account]
#[derive(InitSpace)]
pub struct BurstCounter {
    pub window_start_slot: u64,
    pub call_count:        u16,
    pub bump:              u8,
}

/// Cooldown tracker per (protected_program, instruction, owner) triple.
/// Seeds: [b"cooldown", protected_program_id(32), discriminator(8), owner(32)]
/// The guard owns this account — the calling program cannot reset or influence it.
#[account]
#[derive(InitSpace)]
pub struct CooldownTracker {
    pub last_called_slot: u64,
    pub bump:             u8,
}

// ── Guard-tracked PDA init contexts ──────────────────────────────────────────

/// Initialize a BurstCounter PDA for a given (program, discriminator, owner) triple.
/// `discriminator`: the 8-byte Anchor discriminator of the instruction to guard.
/// Anyone can pay to create this — guard owns the account unconditionally.
#[derive(Accounts)]
#[instruction(discriminator: [u8; 8])]
pub struct InitBurstCounter<'info> {
    #[account(
        init,
        payer  = payer,
        space  = BurstCounter::DISCRIMINATOR.len() + BurstCounter::INIT_SPACE,
        seeds  = [b"burst", protected_program.key().as_ref(), &discriminator, owner.key().as_ref()],
        bump,
    )]
    pub burst_counter: Account<'info, BurstCounter>,

    /// CHECK: the program whose instruction this counter tracks — key only
    pub protected_program: UncheckedAccount<'info>,

    /// CHECK: the wallet whose burst counter this is — key only
    pub owner: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Initialize a CooldownTracker PDA for a given (program, discriminator, owner) triple.
#[derive(Accounts)]
#[instruction(discriminator: [u8; 8])]
pub struct InitCooldownTracker<'info> {
    #[account(
        init,
        payer  = payer,
        space  = CooldownTracker::DISCRIMINATOR.len() + CooldownTracker::INIT_SPACE,
        seeds  = [b"cooldown", protected_program.key().as_ref(), &discriminator, owner.key().as_ref()],
        bump,
    )]
    pub cooldown_tracker: Account<'info, CooldownTracker>,

    /// CHECK: the program whose instruction this tracker guards — key only
    pub protected_program: UncheckedAccount<'info>,

    /// CHECK: the wallet whose cooldown tracker this is — key only
    pub owner: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

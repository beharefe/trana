use anchor_lang::prelude::*;
use anchor_lang::solana_program::{bpf_loader_upgradeable, program::invoke_signed};
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use anchor_spl::token::spl_token::instruction::AuthorityType;

pub mod error;
pub mod events;
pub mod state;

pub use error::AuthorityError;
pub use events::*;
pub use state::*;

use trana_guard::{
    cpi::accounts::Enforce,
    program::TranaGuard,
    state::TwoFactorRegistry,
    Policy,
};

#[cfg(feature = "devnet")]
declare_id!("TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN");

#[cfg(not(feature = "devnet"))]
declare_id!("KoXvrg4DBLKa5U6LCUpWXJE1FHYqwaozqDqDcBXvGEE");

// ── Seed prefix ────────────────────────────────────────────────────────────────

pub const AUTHORITY_SEED: &[u8] = b"trana-authority";

// ─────────────────────────────────────────────────────────────────────────────
//  Trana Authority
//
//  Secures any Solana authority (upgrade / mint / freeze) behind a passkey
//  second factor without requiring changes to the target program.
//
//  Transaction shape (same as trana_guard):
//    ix[N-2]: secp256r1 precompile
//    ix[N-1]: trana_guard::record_proof
//    ix[N]:   trana_authority::execute_*  ← calls enforce() then acts
//
//  Flow:
//    1. register()         — create AuthorityRecord PDA
//    2. (user) transfer authority to PDA address externally
//    3. execute_*()        — passkey proof required, PDA signs the CPI
//    4. reclaim_authority()— return authority to a new key (also passkey-gated)
// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod trana_authority {
    use super::*;

    // ── Register ──────────────────────────────────────────────────────────────

    /// Create an AuthorityRecord PDA for an (owner, target) pair.
    /// No passkey required — only the owner's wallet signature.
    /// After this, the user must transfer the real authority to the PDA address.
    pub fn register(ctx: Context<Register>, authority_kind: AuthorityKind) -> Result<()> {
        let rec        = &mut ctx.accounts.authority_record;
        rec.owner          = ctx.accounts.owner.key();
        rec.target         = ctx.accounts.target.key();
        rec.authority_kind = authority_kind;
        rec.bump           = ctx.bumps.authority_record;
        msg!(
            "TRANA_AUTHORITY register | owner={} | target={} | kind={:?}",
            rec.owner, rec.target, rec.authority_kind,
        );
        Ok(())
    }

    // ── Execute upgrade ───────────────────────────────────────────────────────

    /// Upgrade a BPF program. Requires passkey proof.
    ///
    /// The PDA (AuthorityRecord) must be the program's current upgrade_authority.
    pub fn execute_upgrade(ctx: Context<ExecuteUpgrade>) -> Result<()> {
        require!(
            ctx.accounts.authority_record.authority_kind == AuthorityKind::ProgramUpgrade,
            AuthorityError::KindMismatch
        );

        // Passkey verification — enforce reads ix[N-2] and ix[N-1] from sysvar
        trana_guard::cpi::enforce(
            CpiContext::new(
                ctx.accounts.trana_guard_program.to_account_info(),
                Enforce {
                    registry:     ctx.accounts.trana_registry.to_account_info(),
                    owner:        ctx.accounts.owner.to_account_info(),
                    instructions: ctx.accounts.instructions.to_account_info(),
                },
            ),
            Policy::Require,
        )?;

        let seeds: &[&[u8]] = &[
            AUTHORITY_SEED,
            ctx.accounts.authority_record.owner.as_ref(),
            ctx.accounts.authority_record.target.as_ref(),
            &[ctx.accounts.authority_record.bump],
        ];

        let upgrade_ix = bpf_loader_upgradeable::upgrade(
            &ctx.accounts.program.key(),
            &ctx.accounts.buffer.key(),
            &ctx.accounts.authority_record.key(),
            &ctx.accounts.spill.key(),
        );

        invoke_signed(
            &upgrade_ix,
            &[
                ctx.accounts.program_data.to_account_info(),
                ctx.accounts.program.to_account_info(),
                ctx.accounts.buffer.to_account_info(),
                ctx.accounts.spill.to_account_info(),
                ctx.accounts.rent.to_account_info(),
                ctx.accounts.clock.to_account_info(),
                ctx.accounts.authority_record.to_account_info(),
            ],
            &[seeds],
        )?;

        emit!(UpgradeExecuted {
            owner:   ctx.accounts.owner.key(),
            program: ctx.accounts.program.key(),
        });

        msg!(
            "TRANA_AUTHORITY upgrade | owner={} | program={}",
            ctx.accounts.owner.key(), ctx.accounts.program.key(),
        );
        Ok(())
    }

    // ── Execute mint ──────────────────────────────────────────────────────────

    /// Mint tokens. Requires passkey proof.
    ///
    /// The PDA must be the mint's current mint_authority.
    pub fn execute_mint(ctx: Context<ExecuteMint>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.authority_record.authority_kind == AuthorityKind::TokenMint,
            AuthorityError::KindMismatch
        );

        trana_guard::cpi::enforce(
            CpiContext::new(
                ctx.accounts.trana_guard_program.to_account_info(),
                Enforce {
                    registry:     ctx.accounts.trana_registry.to_account_info(),
                    owner:        ctx.accounts.owner.to_account_info(),
                    instructions: ctx.accounts.instructions.to_account_info(),
                },
            ),
            Policy::Require,
        )?;

        let seeds: &[&[u8]] = &[
            AUTHORITY_SEED,
            ctx.accounts.authority_record.owner.as_ref(),
            ctx.accounts.authority_record.target.as_ref(),
            &[ctx.accounts.authority_record.bump],
        ];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint:      ctx.accounts.mint.to_account_info(),
                    to:        ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.authority_record.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        emit!(MintExecuted {
            owner:  ctx.accounts.owner.key(),
            mint:   ctx.accounts.mint.key(),
            amount,
        });

        msg!(
            "TRANA_AUTHORITY mint | owner={} | mint={} | amount={}",
            ctx.accounts.owner.key(), ctx.accounts.mint.key(), amount,
        );
        Ok(())
    }

    // ── Execute freeze ────────────────────────────────────────────────────────

    /// Freeze a token account. Requires passkey proof.
    pub fn execute_freeze(ctx: Context<ExecuteFreeze>) -> Result<()> {
        require!(
            ctx.accounts.authority_record.authority_kind == AuthorityKind::TokenFreeze,
            AuthorityError::KindMismatch
        );

        trana_guard::cpi::enforce(
            CpiContext::new(
                ctx.accounts.trana_guard_program.to_account_info(),
                Enforce {
                    registry:     ctx.accounts.trana_registry.to_account_info(),
                    owner:        ctx.accounts.owner.to_account_info(),
                    instructions: ctx.accounts.instructions.to_account_info(),
                },
            ),
            Policy::Require,
        )?;

        let seeds: &[&[u8]] = &[
            AUTHORITY_SEED,
            ctx.accounts.authority_record.owner.as_ref(),
            ctx.accounts.authority_record.target.as_ref(),
            &[ctx.accounts.authority_record.bump],
        ];

        token::freeze_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::FreezeAccount {
                    account:   ctx.accounts.token_account.to_account_info(),
                    mint:      ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.authority_record.to_account_info(),
                },
                &[seeds],
            ),
        )?;

        emit!(FreezeExecuted { owner: ctx.accounts.owner.key(), mint: ctx.accounts.mint.key(), frozen: true });
        Ok(())
    }

    // ── Execute thaw ──────────────────────────────────────────────────────────

    /// Thaw a frozen token account. Requires passkey proof.
    pub fn execute_thaw(ctx: Context<ExecuteThaw>) -> Result<()> {
        require!(
            ctx.accounts.authority_record.authority_kind == AuthorityKind::TokenFreeze,
            AuthorityError::KindMismatch
        );

        trana_guard::cpi::enforce(
            CpiContext::new(
                ctx.accounts.trana_guard_program.to_account_info(),
                Enforce {
                    registry:     ctx.accounts.trana_registry.to_account_info(),
                    owner:        ctx.accounts.owner.to_account_info(),
                    instructions: ctx.accounts.instructions.to_account_info(),
                },
            ),
            Policy::Require,
        )?;

        let seeds: &[&[u8]] = &[
            AUTHORITY_SEED,
            ctx.accounts.authority_record.owner.as_ref(),
            ctx.accounts.authority_record.target.as_ref(),
            &[ctx.accounts.authority_record.bump],
        ];

        token::thaw_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::ThawAccount {
                    account:   ctx.accounts.token_account.to_account_info(),
                    mint:      ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.authority_record.to_account_info(),
                },
                &[seeds],
            ),
        )?;

        emit!(FreezeExecuted { owner: ctx.accounts.owner.key(), mint: ctx.accounts.mint.key(), frozen: false });
        Ok(())
    }

    // ── Reclaim authority ─────────────────────────────────────────────────────

    /// Return the authority from the PDA to a new pubkey. Requires passkey proof.
    /// Even the escape hatch is second-factor protected.
    /// Closes the AuthorityRecord PDA and returns rent to the owner.
    pub fn reclaim_authority(ctx: Context<ReclaimAuthority>, new_authority: Pubkey) -> Result<()> {
        trana_guard::cpi::enforce(
            CpiContext::new(
                ctx.accounts.trana_guard_program.to_account_info(),
                Enforce {
                    registry:     ctx.accounts.trana_registry.to_account_info(),
                    owner:        ctx.accounts.owner.to_account_info(),
                    instructions: ctx.accounts.instructions.to_account_info(),
                },
            ),
            Policy::Require,
        )?;

        let seeds: &[&[u8]] = &[
            AUTHORITY_SEED,
            ctx.accounts.authority_record.owner.as_ref(),
            ctx.accounts.authority_record.target.as_ref(),
            &[ctx.accounts.authority_record.bump],
        ];

        match ctx.accounts.authority_record.authority_kind {
            AuthorityKind::ProgramUpgrade => {
                let set_ix = bpf_loader_upgradeable::set_upgrade_authority(
                    &ctx.accounts.target.key(),
                    &ctx.accounts.authority_record.key(),
                    Some(&new_authority),
                );
                invoke_signed(
                    &set_ix,
                    &[
                        ctx.accounts.program_data.to_account_info(),
                        ctx.accounts.authority_record.to_account_info(),
                        ctx.accounts.new_authority_info.to_account_info(),
                    ],
                    &[seeds],
                )?;
            }

            AuthorityKind::TokenMint => {
                token::set_authority(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        token::SetAuthority {
                            account_or_mint: ctx.accounts.target.to_account_info(),
                            current_authority: ctx.accounts.authority_record.to_account_info(),
                        },
                        &[seeds],
                    ),
                    AuthorityType::MintTokens,
                    Some(new_authority),
                )?;
            }

            AuthorityKind::TokenFreeze => {
                token::set_authority(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        token::SetAuthority {
                            account_or_mint: ctx.accounts.target.to_account_info(),
                            current_authority: ctx.accounts.authority_record.to_account_info(),
                        },
                        &[seeds],
                    ),
                    AuthorityType::FreezeAccount,
                    Some(new_authority),
                )?;
            }
        }

        emit!(AuthorityReclaimed {
            owner:         ctx.accounts.owner.key(),
            target:        ctx.accounts.target.key(),
            new_authority,
        });

        msg!(
            "TRANA_AUTHORITY reclaim | owner={} | target={} | new_authority={}",
            ctx.accounts.owner.key(), ctx.accounts.target.key(), new_authority,
        );
        Ok(())
    }
}

// ── Account contexts ───────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Register<'info> {
    #[account(
        init,
        payer = owner,
        space = AuthorityRecord::DISCRIMINATOR.len() + AuthorityRecord::INIT_SPACE,
        seeds = [AUTHORITY_SEED, owner.key().as_ref(), target.key().as_ref()],
        bump,
    )]
    pub authority_record: Account<'info, AuthorityRecord>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: any pubkey — the program or mint being protected
    pub target: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}


// ── Execute upgrade ────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ExecuteUpgrade<'info> {
    #[account(
        seeds = [AUTHORITY_SEED, owner.key().as_ref(), program.key().as_ref()],
        bump  = authority_record.bump,
        constraint = authority_record.owner  == owner.key(),
        constraint = authority_record.target == program.key(),
    )]
    pub authority_record: Account<'info, AuthorityRecord>,

    pub owner: Signer<'info>,

    /// CHECK: the program being upgraded
    #[account(mut)]
    pub program: UncheckedAccount<'info>,

    /// CHECK: program data account
    #[account(mut)]
    pub program_data: UncheckedAccount<'info>,

    /// CHECK: the buffer holding the new .so
    #[account(mut)]
    pub buffer: UncheckedAccount<'info>,

    /// CHECK: rent reclaim destination
    #[account(mut)]
    pub spill: UncheckedAccount<'info>,

    pub rent:  Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,

    /// CHECK: BPF Loader Upgradeable program
    #[account(address = bpf_loader_upgradeable::ID)]
    pub bpf_loader: UncheckedAccount<'info>,

    // trana_guard enforce accounts
    pub trana_guard_program: Program<'info, TranaGuard>,

    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        seeds::program = trana_guard_program.key(),
        bump,
    )]
    pub trana_registry: Account<'info, TwoFactorRegistry>,

    /// CHECK: Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

// ── Execute mint ───────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ExecuteMint<'info> {
    #[account(
        seeds = [AUTHORITY_SEED, owner.key().as_ref(), mint.key().as_ref()],
        bump  = authority_record.bump,
        constraint = authority_record.owner  == owner.key(),
        constraint = authority_record.target == mint.key(),
    )]
    pub authority_record: Account<'info, AuthorityRecord>,

    pub owner: Signer<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    pub trana_guard_program: Program<'info, TranaGuard>,

    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        seeds::program = trana_guard_program.key(),
        bump,
    )]
    pub trana_registry: Account<'info, TwoFactorRegistry>,

    /// CHECK: Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

// ── Execute freeze / thaw ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ExecuteFreeze<'info> {
    #[account(
        seeds = [AUTHORITY_SEED, owner.key().as_ref(), mint.key().as_ref()],
        bump  = authority_record.bump,
        constraint = authority_record.owner  == owner.key(),
        constraint = authority_record.target == mint.key(),
    )]
    pub authority_record: Account<'info, AuthorityRecord>,

    pub owner: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    pub trana_guard_program: Program<'info, TranaGuard>,

    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        seeds::program = trana_guard_program.key(),
        bump,
    )]
    pub trana_registry: Account<'info, TwoFactorRegistry>,

    /// CHECK: Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ExecuteThaw<'info> {
    #[account(
        seeds = [AUTHORITY_SEED, owner.key().as_ref(), mint.key().as_ref()],
        bump  = authority_record.bump,
        constraint = authority_record.owner  == owner.key(),
        constraint = authority_record.target == mint.key(),
    )]
    pub authority_record: Account<'info, AuthorityRecord>,

    pub owner: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    pub trana_guard_program: Program<'info, TranaGuard>,

    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        seeds::program = trana_guard_program.key(),
        bump,
    )]
    pub trana_registry: Account<'info, TwoFactorRegistry>,

    /// CHECK: Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

// ── Reclaim authority ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ReclaimAuthority<'info> {
    #[account(
        mut,
        close  = owner,
        seeds  = [AUTHORITY_SEED, owner.key().as_ref(), target.key().as_ref()],
        bump   = authority_record.bump,
        constraint = authority_record.owner  == owner.key(),
        constraint = authority_record.target == target.key(),
    )]
    pub authority_record: Account<'info, AuthorityRecord>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: the program or mint whose authority is being returned
    #[account(mut)]
    pub target: UncheckedAccount<'info>,

    /// CHECK: program data account (only used for ProgramUpgrade kind)
    #[account(mut)]
    pub program_data: UncheckedAccount<'info>,

    /// CHECK: the new authority pubkey's account info (for BPF set_upgrade_authority)
    pub new_authority_info: UncheckedAccount<'info>,

    /// CHECK: BPF Loader (only used for ProgramUpgrade kind)
    #[account(address = bpf_loader_upgradeable::ID)]
    pub bpf_loader: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,

    pub trana_guard_program: Program<'info, TranaGuard>,

    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        seeds::program = trana_guard_program.key(),
        bump,
    )]
    pub trana_registry: Account<'info, TwoFactorRegistry>,

    /// CHECK: Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

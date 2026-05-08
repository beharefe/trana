// ⚠️  DEMO — not for production.
//
// trana_test_vault: minimal SOL vault showing trana_guard integration in ~1 line.
//
// Two vault kinds, two security stories:
//
//  VaultKind::Limit
//    "Large pulls need my passkey; small ones are free."
//    - withdrawal < 1 SOL                  → no proof needed
//    - withdrawal >= 1 SOL                 → passkey (Policy::Limit)
//    - consecutive small pulls >= 1 SOL    → passkey (Policy::Require, drain guard)
//      within 60 seconds
//
//  VaultKind::TimeLocked { slot }
//    "Locked until slot X. Solana's clock enforces it — not my code."
//    - current_slot < slot                 → passkey (Policy::NotBefore)
//    - current_slot >= slot                → free, no proof needed
//    The slot is embedded in the signed WebAuthn challenge; even a
//    redeployed program cannot change the unlock time retroactively.
//
// The entire trana_guard integration is one call:
//
//   trana_guard::cpi::enforce(ctx, policy)?;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;

use trana_guard::{
    cpi::accounts::Enforce,
    program::TranaGuard,
    state::TwoFactorRegistry,
    Policy,
};

pub mod error;
pub mod events;
pub mod state;

pub use error::VaultError;
pub use events::*;
pub use state::*;

declare_id!("8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa");

pub const VAULT_SEED:     &[u8] = b"trana-vault";
pub const WITHDRAW_LIMIT: u64   = 1_000_000_000; // 1 SOL
pub const DRAIN_WINDOW:   i64   = 60;            // seconds

#[program]
pub mod trana_test_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, kind: VaultKind, label: String) -> Result<()> {
        require!(label.len() <= 32, VaultError::LabelTooLong);

        let vault_key = ctx.accounts.vault.key();
        let owner_key = ctx.accounts.owner.key();
        let vault     = &mut ctx.accounts.vault;

        vault.owner            = owner_key;
        vault.bump             = ctx.bumps.vault;
        vault.kind             = kind;
        vault.label            = label.clone();
        vault.total_deposited  = 0;
        vault.window_withdrawn = 0;
        vault.last_withdraw_at = 0;

        emit!(VaultInitialized { vault: vault_key, owner: owner_key, label });
        Ok(())
    }

    /// Open to anyone — no proof required.
    /// The vault balance is the bait; the passkey is the lock.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        anchor_lang::solana_program::program::invoke(
            &system_instruction::transfer(
                &ctx.accounts.depositor.key(),
                &ctx.accounts.vault.key(),
                amount,
            ),
            &[
                ctx.accounts.depositor.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        ctx.accounts.vault.total_deposited =
            ctx.accounts.vault.total_deposited.saturating_add(amount);

        emit!(VaultDeposit {
            vault:     ctx.accounts.vault.key(),
            depositor: ctx.accounts.depositor.key(),
            amount,
        });
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        let rent = Rent::get()?.minimum_balance(Vault::space());
        require!(
            ctx.accounts.vault.to_account_info().lamports().saturating_sub(rent) >= amount,
            VaultError::InsufficientFunds,
        );

        let (policy, proof_used) = match &ctx.accounts.vault.kind {

            // ── TimeLocked ────────────────────────────────────────────────────
            // Slot is baked into the signed challenge — program cannot fake it.
            VaultKind::TimeLocked { slot } => {
                (Policy::NotBefore { slot: *slot }, false)
            }

            // ── Limit + drain guard ───────────────────────────────────────────
            VaultKind::Limit => {
                let now       = Clock::get()?.unix_timestamp;
                let vault     = &ctx.accounts.vault;
                let in_window = vault.last_withdraw_at > 0
                    && (now - vault.last_withdraw_at) < DRAIN_WINDOW;
                let window_now = if in_window {
                    vault.window_withdrawn.saturating_add(amount)
                } else {
                    amount
                };
                let is_drain = window_now >= WITHDRAW_LIMIT;
                let p = if is_drain {
                    Policy::Require
                } else {
                    Policy::Limit { param_offset: 0, limit: WITHDRAW_LIMIT }
                };
                let used = is_drain || amount >= WITHDRAW_LIMIT;
                (p, used)
            }
        };

        // ── The one trana_guard line ──────────────────────────────────────────
        trana_guard::cpi::enforce(
            CpiContext::new(
                ctx.accounts.trana_guard_program.to_account_info(),
                Enforce {
                    registry:     ctx.accounts.trana_registry.to_account_info(),
                    owner:        ctx.accounts.owner.to_account_info(),
                    instructions: ctx.accounts.instructions.to_account_info(),
                },
            ),
            policy,
        )?;

        // ── Transfer ──────────────────────────────────────────────────────────
        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.destination.to_account_info().try_borrow_mut_lamports()? += amount;

        // ── Update drain window (Limit only) ──────────────────────────────────
        if let VaultKind::Limit = ctx.accounts.vault.kind {
            let now      = Clock::get()?.unix_timestamp;
            let vault    = &mut ctx.accounts.vault;
            let in_win   = vault.last_withdraw_at > 0
                && (now - vault.last_withdraw_at) < DRAIN_WINDOW;
            let win_now  = if in_win {
                vault.window_withdrawn.saturating_add(amount)
            } else {
                amount
            };
            if proof_used {
                vault.window_withdrawn = 0;
                vault.last_withdraw_at = 0;
            } else if in_win {
                vault.window_withdrawn = win_now;
            } else {
                vault.window_withdrawn = amount;
                vault.last_withdraw_at = now;
            }
        }

        emit!(VaultWithdraw {
            vault:       ctx.accounts.vault.key(),
            owner:       ctx.accounts.owner.key(),
            destination: ctx.accounts.destination.key(),
            amount,
            proof_used,
        });
        Ok(())
    }

    /// Always requires passkey regardless of vault kind.
    pub fn close_vault(ctx: Context<CloseVault>) -> Result<()> {
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

        let balance = ctx.accounts.vault.to_account_info().lamports();
        let rent    = Rent::get()?.minimum_balance(Vault::space());
        let excess  = balance.saturating_sub(rent);
        if excess > 0 {
            **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= excess;
            **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += excess;
        }

        emit!(VaultClosed {
            vault: ctx.accounts.vault.key(),
            owner: ctx.accounts.owner.key(),
        });
        Ok(())
    }
}

// ── Account contexts ───────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer  = owner,
        space  = Vault::space(),
        seeds  = [VAULT_SEED, owner.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.owner.as_ref()],
        bump  = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds      = [VAULT_SEED, owner.key().as_ref()],
        bump       = vault.bump,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    pub owner: Signer<'info>,

    /// CHECK: receives the withdrawn SOL
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,

    pub trana_guard_program: Program<'info, TranaGuard>,

    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        seeds::program = trana_guard_program.key(),
        bump,
    )]
    pub trana_registry: Account<'info, TwoFactorRegistry>,

    /// CHECK: instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(
        mut,
        close  = owner,
        seeds  = [VAULT_SEED, owner.key().as_ref()],
        bump   = vault.bump,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub trana_guard_program: Program<'info, TranaGuard>,

    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        seeds::program = trana_guard_program.key(),
        bump,
    )]
    pub trana_registry: Account<'info, TwoFactorRegistry>,

    /// CHECK: instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

// ⚠️  DEMO — not for production.
//
// trana_test_vault: minimal SOL vault showing how simple trana_guard integration is.
//
// Rules:
//   - Anyone can deposit (open, intentional — the vault balance is the bait).
//   - Withdrawals < 1 SOL go through freely.
//   - Withdrawals >= 1 SOL require a passkey.
//   - Consecutive small withdrawals totalling >= 1 SOL within 60 seconds also
//     require a passkey (drain protection).
//   - Closing the vault always requires a passkey.
//
// The only trana_guard integration point is one line:
//
//   trana_guard::cpi::enforce(ctx, policy)?;
//
// Everything else is standard Anchor.

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

    pub fn initialize(ctx: Context<Initialize>, label: String) -> Result<()> {
        require!(label.len() <= 32, VaultError::LabelTooLong);

        let vault_key = ctx.accounts.vault.key();
        let owner_key = ctx.accounts.owner.key();
        let vault     = &mut ctx.accounts.vault;

        vault.owner           = owner_key;
        vault.bump            = ctx.bumps.vault;
        vault.label           = label.clone();
        vault.total_deposited = 0;
        vault.window_withdrawn = 0;
        vault.last_withdraw_at = 0;

        emit!(VaultInitialized { vault: vault_key, owner: owner_key, label });
        Ok(())
    }

    /// Open to anyone — no proof required. This is intentional.
    /// The vault balance is publicly visible; the challenge is draining it.
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

    /// Withdraw SOL.
    ///
    /// Passkey is required when:
    ///   (a) amount >= 1 SOL in a single transaction, OR
    ///   (b) cumulative withdrawals in the last 60 s hit 1 SOL (drain protection).
    ///
    /// Frontend hint: check vault.window_withdrawn + amount vs WITHDRAW_LIMIT
    /// and current_time - vault.last_withdraw_at vs DRAIN_WINDOW to decide
    /// whether to include the secp256r1 + record_proof preamble.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        let rent = Rent::get()?.minimum_balance(Vault::space());
        require!(
            ctx.accounts.vault.to_account_info().lamports().saturating_sub(rent) >= amount,
            VaultError::InsufficientFunds,
        );

        // ── Drain detection ───────────────────────────────────────────────────
        let now        = Clock::get()?.unix_timestamp;
        let vault      = &ctx.accounts.vault;
        let in_window  = vault.last_withdraw_at > 0
            && (now - vault.last_withdraw_at) < DRAIN_WINDOW;
        let window_now = if in_window {
            vault.window_withdrawn.saturating_add(amount)
        } else {
            amount
        };
        let is_drain   = window_now >= WITHDRAW_LIMIT;

        // ── Single trana_guard call ───────────────────────────────────────────
        //
        // Policy::Limit reads the `amount` arg directly from instruction data
        // (param_offset 0 = first u64 after the 8-byte discriminator).
        // If amount < WITHDRAW_LIMIT *and* no drain detected, enforce returns
        // Ok without requiring any proof — no tx rewrite needed for small pulls.
        let policy = if is_drain {
            Policy::Require
        } else {
            Policy::Limit { param_offset: 0, limit: WITHDRAW_LIMIT }
        };

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

        // ── Update drain window ───────────────────────────────────────────────
        let vault = &mut ctx.accounts.vault;
        let proof_used = is_drain || amount >= WITHDRAW_LIMIT;
        if proof_used {
            // Authenticated — reset window
            vault.window_withdrawn = 0;
            vault.last_withdraw_at = 0;
        } else if in_window {
            vault.window_withdrawn = window_now;
        } else {
            vault.window_withdrawn = amount;
            vault.last_withdraw_at = now;
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

    /// Close the vault and return all SOL to the owner. Always requires passkey.
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

        // Drain balance to owner before Anchor closes the account
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

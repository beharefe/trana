// ⚠️  DEMO — not for production.
//
// trana_test_vault: shared SOL pool where many users deposit and each
// user's withdrawal is independently gated by their own passkey.
//
// Two pool kinds:
//
//  PoolKind::Limit
//    Free for small pulls; passkey for >= 1 SOL or a drain burst.
//    Drain window is tracked per user — not globally.
//
//  PoolKind::TimeLocked { slot }
//    Whole pool locked until `slot`. The slot is committed inside the
//    signed WebAuthn challenge so the program cannot fake the unlock time.
//    After the slot every depositor can withdraw freely without a passkey.
//
// The entire trana_guard surface is one CPI call:
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

pub const POOL_SEED:      &[u8] = b"trana-pool";
pub const DEPOSIT_SEED:   &[u8] = b"deposit";
pub const WITHDRAW_LIMIT: u64   = 1_000_000_000; // 1 SOL
pub const DRAIN_WINDOW:   i64   = 60;            // seconds (Limit drain window)
pub const COOLDOWN_SLOTS: u64   = 150;           // ~1 min at 400 ms/slot (TimeLocked)

#[program]
pub mod trana_test_vault {
    use super::*;

    // ── Initialize pool ───────────────────────────────────────────────────────

    /// Create the shared pool. One pool per authority address.
    /// No passkey required — wallet signature only.
    pub fn initialize_pool(
        ctx:   Context<InitializePool>,
        kind:  PoolKind,
        label: String,
    ) -> Result<()> {
        require!(label.len() <= 32, VaultError::LabelTooLong);

        let pool_key   = ctx.accounts.pool.key();
        let auth_key   = ctx.accounts.authority.key();
        let pool       = &mut ctx.accounts.pool;

        pool.authority = auth_key;
        pool.bump      = ctx.bumps.pool;
        pool.kind      = kind;
        pool.label     = label.clone();

        emit!(PoolInitialized { pool: pool_key, authority: auth_key, label });
        Ok(())
    }

    // ── Deposit ───────────────────────────────────────────────────────────────

    /// Deposit SOL into the shared pool. Open to anyone.
    /// Creates the caller's UserDeposit record on first deposit.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        // Transfer SOL from depositor → pool PDA
        anchor_lang::solana_program::program::invoke(
            &system_instruction::transfer(
                &ctx.accounts.depositor.key(),
                &ctx.accounts.pool.key(),
                amount,
            ),
            &[
                ctx.accounts.depositor.to_account_info(),
                ctx.accounts.pool.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Init fields on first deposit
        let ud = &mut ctx.accounts.user_deposit;
        if ud.pool == Pubkey::default() {
            ud.pool = ctx.accounts.pool.key();
            ud.user = ctx.accounts.depositor.key();
            ud.bump = ctx.bumps.user_deposit;
        }
        ud.balance = ud.balance.saturating_add(amount);

        emit!(Deposited {
            pool:        ctx.accounts.pool.key(),
            user:        ctx.accounts.depositor.key(),
            amount,
            new_balance: ud.balance,
        });
        Ok(())
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────

    /// Withdraw SOL from the pool.
    ///
    /// PoolKind::Limit
    ///   - amount < 1 SOL and not in a drain burst → free, no proof needed
    ///   - amount >= 1 SOL                         → passkey (Policy::Limit)
    ///   - consecutive pulls totalling >= 1 SOL
    ///     within 60 s (per user)                  → passkey (Policy::Require)
    ///
    /// PoolKind::TimeLocked { slot }
    ///
    /// TimeLocked: after each withdrawal the user's next free pull is at
    ///   last_withdraw_slot + COOLDOWN_SLOTS (~1 min). That slot is passed
    ///   to Policy::NotBefore — it ends up signed inside the WebAuthn challenge.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);
        require!(ctx.accounts.user_deposit.balance >= amount, VaultError::InsufficientFunds);

        let clock = Clock::get()?;

        // ── Choose policy ─────────────────────────────────────────────────────
        let (policy, proof_used) = match ctx.accounts.pool.kind {
            PoolKind::TimeLocked => {
                // unlock_slot is derived from the user's last withdrawal on-chain.
                // Frontend reads last_withdraw_slot, adds COOLDOWN_SLOTS, and signs
                // that exact slot into the WebAuthn challenge. Program cannot fake it.
                let unlock_slot = ctx.accounts.user_deposit
                    .last_withdraw_slot
                    .saturating_add(COOLDOWN_SLOTS);
                (Policy::NotBefore { slot: unlock_slot }, false)
            }

            PoolKind::Limit => {
                let now       = clock.unix_timestamp;
                let ud        = &ctx.accounts.user_deposit;
                let in_window = ud.last_withdraw_at > 0
                    && (now - ud.last_withdraw_at) < DRAIN_WINDOW;
                let window_now = if in_window {
                    ud.window_withdrawn.saturating_add(amount)
                } else {
                    amount
                };
                // Drain only triggers when there IS a prior window — a fresh first
                // withdrawal at exactly the limit should fall through to Policy::Limit,
                // not escalate to Policy::Require.
                let is_drain = in_window && window_now >= WITHDRAW_LIMIT;
                let p = if is_drain {
                    Policy::Require
                } else {
                    Policy::Limit { param_offset: 0, limit: WITHDRAW_LIMIT }
                };
                (p, is_drain || amount >= WITHDRAW_LIMIT)
            }
        };

        // ── trana_guard: one line ─────────────────────────────────────────────
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

        // ── Transfer SOL from pool → destination ──────────────────────────────
        **ctx.accounts.pool.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.destination.to_account_info().try_borrow_mut_lamports()? += amount;

        // ── Update user state ─────────────────────────────────────────────────
        ctx.accounts.user_deposit.balance -= amount;

        match ctx.accounts.pool.kind {
            PoolKind::TimeLocked => {
                // Record this slot so next call can derive the cooldown window
                ctx.accounts.user_deposit.last_withdraw_slot = clock.slot;
            }
            PoolKind::Limit => {
                let now   = clock.unix_timestamp;
                let ud    = &mut ctx.accounts.user_deposit;
                let in_w  = ud.last_withdraw_at > 0
                    && (now - ud.last_withdraw_at) < DRAIN_WINDOW;
                let w_now = if in_w { ud.window_withdrawn.saturating_add(amount) } else { amount };

                if proof_used {
                    ud.window_withdrawn = 0;
                    ud.last_withdraw_at = 0;
                } else if in_w {
                    ud.window_withdrawn = w_now;
                } else {
                    ud.window_withdrawn = amount;
                    ud.last_withdraw_at = now;
                }
            }
        }

        emit!(Withdrawn {
            pool:        ctx.accounts.pool.key(),
            user:        ctx.accounts.owner.key(),
            destination: ctx.accounts.destination.key(),
            amount,
            proof_used,
        });
        Ok(())
    }
}

// ── Account contexts ───────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer  = authority,
        space  = Pool::space(),
        seeds  = [POOL_SEED, authority.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool.authority.as_ref()],
        bump  = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer  = depositor,
        space  = UserDeposit::space(),
        seeds  = [DEPOSIT_SEED, pool.key().as_ref(), depositor.key().as_ref()],
        bump,
    )]
    pub user_deposit: Account<'info, UserDeposit>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED, pool.authority.as_ref()],
        bump  = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds      = [DEPOSIT_SEED, pool.key().as_ref(), owner.key().as_ref()],
        bump       = user_deposit.bump,
        constraint = user_deposit.pool == pool.key(),
        constraint = user_deposit.user == owner.key(),
    )]
    pub user_deposit: Account<'info, UserDeposit>,

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

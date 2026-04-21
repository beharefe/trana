use anchor_lang::prelude::*;
use trana::cpi::accounts::Enforce;
use trana::program::Trana;
use trana::Policy;

declare_id!("RuY1hQfDuxojWEioSsQy81ByaK6LhB1UvKhDGygWxnW");

// ─────────────────────────────────────────────────────────────────────────────
//  Demo Vault — Trana Guard integration reference
//
//  This program shows how to use Trana's standard audited policies.
//  There is NO custom policy evaluation logic here — it all lives in
//  the guard program and is audited once for every protocol that imports it.
//
//  Integration pattern:
//    trana::cpi::enforce(ctx, Policy::Threshold { param_offset: 0, threshold: 1_000_000_000 })?
//
//  The condition evaluation happens inside guard, not here. Users can verify
//  the policy by reading Trana's source — they don't need to audit this vault.
//
//  Policies used:
//    Policy::Always      — emergency_freeze and set_opt_in mode
//    Policy::Admin       — emergency freeze / unfreeze
//    Policy::Threshold   — withdrawals >= LARGE_THRESHOLD (guard reads amount)
//    Policy::Velocity    — cumulative withdrawals exceed VELOCITY_THRESHOLD
//    Policy::RapidDrain  — withdrawal shortly after a large deposit
//
// ─────────────────────────────────────────────────────────────────────────────

pub const LARGE_THRESHOLD:        u64 = 1_000_000_000; // 1 SOL
pub const RAPID_WINDOW:           i64 = 300;            // 5 minutes
pub const RAPID_DEPOSIT_THRESHOLD: u64 = 5_000_000_000; // 5 SOL
pub const VELOCITY_WINDOW:        i64 = 60;             // 1 minute
pub const VELOCITY_THRESHOLD:     u64 = 2_000_000_000;  // 2 SOL

// withdraw() serializes: amount: u64 — first param after discriminator
const WITHDRAW_AMOUNT_OFFSET: u8 = 0;

#[program]
pub mod demo_vault {
    use super::*;

    pub fn init_vault(ctx: Context<InitVault>) -> Result<()> {
        let vault                       = &mut ctx.accounts.vault;
        vault.owner                     = ctx.accounts.owner.key();
        vault.balance                   = 0;
        vault.opt_in                    = false;
        vault.frozen                    = false;
        vault.last_large_deposit_at     = 0;
        vault.last_large_deposit_amount = 0;
        vault.velocity_window_start     = 0;
        vault.velocity_withdrawn        = 0;
        Ok(())
    }

    pub fn set_opt_in(ctx: Context<SetOptIn>, enabled: bool) -> Result<()> {
        ctx.accounts.vault.opt_in = enabled;
        Ok(())
    }

    // ── Emergency freeze — Policy::Admin ──────────────────────────────────────
    //
    // trana::cpi::enforce(ctx, Policy::Admin) is the entire trust story here.
    // Any user auditing this vault can see: "freeze requires trana.admin",
    // then read trana's source to verify what trana.admin does.

    pub fn emergency_freeze(ctx: Context<EmergencyFreeze>, freeze: bool) -> Result<()> {
        trana::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::Admin)?;
        ctx.accounts.vault.frozen = freeze;
        emit!(FreezeEvent { owner: ctx.accounts.owner.key(), frozen: freeze });
        Ok(())
    }

    // ── Deposit ───────────────────────────────────────────────────────────────

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0,                 VaultError::ZeroAmount);
        require!(!ctx.accounts.vault.frozen, VaultError::VaultFrozen);

        // Large deposits require passkey — guard reads amount from instruction directly
        trana::cpi::enforce(
            ctx.accounts.trana_cpi_ctx(),
            Policy::Threshold { param_offset: 0, threshold: LARGE_THRESHOLD },
        )?;

        // Track deposit time for rapid_drain policy on future withdrawals
        if amount >= LARGE_THRESHOLD {
            let vault                       = &mut ctx.accounts.vault;
            vault.last_large_deposit_at     = Clock::get()?.unix_timestamp;
            vault.last_large_deposit_amount = amount;
        }

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.owner.key(),
                &ctx.accounts.vault.key(),
                amount,
            ),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.vault.to_account_info(),
            ],
        )?;

        ctx.accounts.vault.balance = ctx.accounts.vault.balance
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;

        emit!(DepositEvent { owner: ctx.accounts.owner.key(), amount });
        Ok(())
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────
    //
    // Each enforce() call is a no-op if the policy condition is not met.
    // All condition evaluation and passkey enforcement happens in the guard
    // program — audited once, trusted everywhere.
    //
    // Priority: opt_in > rapid_drain > velocity > threshold
    // (The enforce() CPIs are ordered; first one that fires ends the chain.)

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0,                           VaultError::ZeroAmount);
        require!(amount <= ctx.accounts.vault.balance, VaultError::InsufficientFunds);
        require!(!ctx.accounts.vault.frozen,           VaultError::VaultFrozen);

        let now = Clock::get()?.unix_timestamp;

        if ctx.accounts.vault.opt_in {
            // User opted into always-require passkey
            trana::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::Always)?;
        } else {
            // Rapid drain: guard evaluates deposit time + amount inside guard
            trana::cpi::enforce(
                ctx.accounts.trana_cpi_ctx(),
                Policy::RapidDrain {
                    last_deposit_at:     ctx.accounts.vault.last_large_deposit_at,
                    last_deposit_amount: ctx.accounts.vault.last_large_deposit_amount,
                    deposit_threshold:   RAPID_DEPOSIT_THRESHOLD,
                    window_secs:         RAPID_WINDOW,
                },
            )?;

            // Velocity: guard evaluates already_withdrawn + current > threshold
            trana::cpi::enforce(
                ctx.accounts.trana_cpi_ctx(),
                Policy::Velocity {
                    param_offset:      WITHDRAW_AMOUNT_OFFSET,
                    already_withdrawn: ctx.accounts.vault.velocity_withdrawn,
                    threshold:         VELOCITY_THRESHOLD,
                },
            )?;

            // Threshold: guard reads amount from instruction, checks >= LARGE_THRESHOLD
            trana::cpi::enforce(
                ctx.accounts.trana_cpi_ctx(),
                Policy::Threshold {
                    param_offset: WITHDRAW_AMOUNT_OFFSET,
                    threshold:    LARGE_THRESHOLD,
                },
            )?;
        }

        let vault_info = ctx.accounts.vault.to_account_info();
        let dest_info  = ctx.accounts.destination.to_account_info();
        **vault_info.try_borrow_mut_lamports()? -= amount;
        **dest_info.try_borrow_mut_lamports()?  += amount;

        ctx.accounts.vault.balance = ctx.accounts.vault.balance
            .checked_sub(amount)
            .ok_or(VaultError::Overflow)?;

        // Update velocity tracking for future withdrawals
        if now.saturating_sub(ctx.accounts.vault.velocity_window_start) >= VELOCITY_WINDOW {
            ctx.accounts.vault.velocity_window_start = now;
            ctx.accounts.vault.velocity_withdrawn    = amount;
        } else {
            ctx.accounts.vault.velocity_withdrawn =
                ctx.accounts.vault.velocity_withdrawn.saturating_add(amount);
        }

        emit!(WithdrawEvent {
            owner:       ctx.accounts.owner.key(),
            destination: ctx.accounts.destination.key(),
            amount,
        });
        Ok(())
    }
}

// ── Accounts ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(
        init,
        payer  = owner,
        space  = 8 + VaultState::INIT_SPACE,
        seeds  = [b"vault", owner.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, VaultState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetOptIn<'info> {
    #[account(mut, has_one = owner, seeds = [b"vault", owner.key().as_ref()], bump)]
    pub vault: Account<'info, VaultState>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyFreeze<'info> {
    #[account(mut, has_one = owner, seeds = [b"vault", owner.key().as_ref()], bump)]
    pub vault: Account<'info, VaultState>,
    pub owner: Signer<'info>,
    pub guard_program: Program<'info, Trana>,
    #[account(
        mut,
        seeds  = [b"2fa", owner.key().as_ref()],
        bump,
        seeds::program = guard_program.key(),
        constraint = trana_registry.enabled @ VaultError::PasskeyNotRegistered,
    )]
    pub trana_registry: Account<'info, trana::TwoFactorRegistry>,
    /// CHECK: Solana Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub trana_instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, has_one = owner, seeds = [b"vault", owner.key().as_ref()], bump)]
    pub vault: Account<'info, VaultState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub guard_program: Program<'info, Trana>,
    #[account(
        mut,
        seeds  = [b"2fa", owner.key().as_ref()],
        bump,
        seeds::program = guard_program.key(),
        constraint = trana_registry.enabled @ VaultError::PasskeyNotRegistered,
    )]
    pub trana_registry: Account<'info, trana::TwoFactorRegistry>,
    /// CHECK: Solana Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub trana_instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = owner, seeds = [b"vault", owner.key().as_ref()], bump)]
    pub vault: Account<'info, VaultState>,
    pub owner: Signer<'info>,
    /// CHECK: withdrawal destination
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
    pub guard_program: Program<'info, Trana>,
    #[account(
        mut,
        seeds  = [b"2fa", owner.key().as_ref()],
        bump,
        seeds::program = guard_program.key(),
        constraint = trana_registry.enabled @ VaultError::PasskeyNotRegistered,
    )]
    pub trana_registry: Account<'info, trana::TwoFactorRegistry>,
    /// CHECK: Solana Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub trana_instructions: UncheckedAccount<'info>,
}

// ── Trana CPI helpers ─────────────────────────────────────────────────────────

impl<'info> EmergencyFreeze<'info> {
    pub fn trana_cpi_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Enforce<'info>> {
        CpiContext::new(self.guard_program.to_account_info(), Enforce {
            registry:     self.trana_registry.to_account_info(),
            owner:        self.owner.to_account_info(),
            instructions: self.trana_instructions.to_account_info(),
        })
    }
}

impl<'info> Deposit<'info> {
    pub fn trana_cpi_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Enforce<'info>> {
        CpiContext::new(self.guard_program.to_account_info(), Enforce {
            registry:     self.trana_registry.to_account_info(),
            owner:        self.owner.to_account_info(),
            instructions: self.trana_instructions.to_account_info(),
        })
    }
}

impl<'info> Withdraw<'info> {
    pub fn trana_cpi_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Enforce<'info>> {
        CpiContext::new(self.guard_program.to_account_info(), Enforce {
            registry:     self.trana_registry.to_account_info(),
            owner:        self.owner.to_account_info(),
            instructions: self.trana_instructions.to_account_info(),
        })
    }
}

// ── State ─────────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub owner:   Pubkey, // 32
    pub balance: u64,    //  8
    pub opt_in:  bool,   //  1
    pub frozen:  bool,   //  1

    pub last_large_deposit_at:     i64, //  8
    pub last_large_deposit_amount: u64, //  8

    pub velocity_window_start: i64, //  8
    pub velocity_withdrawn:    u64, //  8
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct DepositEvent {
    pub owner:  Pubkey,
    pub amount: u64,
}

#[event]
pub struct WithdrawEvent {
    pub owner:       Pubkey,
    pub destination: Pubkey,
    pub amount:      u64,
}

#[event]
pub struct FreezeEvent {
    pub owner:  Pubkey,
    pub frozen: bool,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum VaultError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient vault balance")]
    InsufficientFunds,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Register a passkey before performing this action")]
    PasskeyNotRegistered,
    #[msg("Vault is frozen — call emergency_freeze(false) with a valid passkey to unfreeze")]
    VaultFrozen,
}

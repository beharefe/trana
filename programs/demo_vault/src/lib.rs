use anchor_lang::prelude::*;
use guard::cpi::accounts::Enforce;
use guard::program::Guard;

declare_id!("RuY1hQfDuxojWEioSsQy81ByaK6LhB1UvKhDGygWxnW");

// ─────────────────────────────────────────────────────────────────────────────
//  Demo Vault — Trana Guard integration reference
//
//  Copy the pattern, not the vault.
//
//  Five policies demonstrate the full design space:
//
//    POLICY_OPT_IN   — user opted into always-require-passkey mode
//    POLICY_RAPID    — withdrawal within RAPID_WINDOW of a large deposit
//    POLICY_VELOCITY — cumulative withdrawals exceed threshold in rolling window
//    POLICY_LARGE    — single transfer above LARGE_THRESHOLD
//    POLICY_FREEZE   — emergency freeze / unfreeze (admin action, always guarded)
//
//  Integrating Trana takes three things:
//    1. Three extra accounts  (guard_program, trana_registry, trana_instructions)
//    2. One CPI call          (guard::cpi::enforce(...))
//    3. A policy decision     (when does your protocol require approval?)
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Thresholds ────────────────────────────────────────────────────────────────

/// Any single transfer of this many lamports or more requires a passkey.
pub const LARGE_THRESHOLD: u64 = 1_000_000_000; // 1 SOL

/// A withdrawal within this many seconds of a large deposit triggers
/// rapid-drain protection.
pub const RAPID_WINDOW: i64 = 300; // 5 minutes

/// A deposit is "large" for rapid-drain purposes if it exceeds this.
pub const RAPID_DEPOSIT_THRESHOLD: u64 = 5_000_000_000; // 5 SOL

/// Rolling window for velocity tracking.
pub const VELOCITY_WINDOW: i64 = 60; // 1 minute

/// Total withdrawn within VELOCITY_WINDOW that triggers rate-limit protection.
pub const VELOCITY_THRESHOLD: u64 = 2_000_000_000; // 2 SOL

// ── Policy identifiers ────────────────────────────────────────────────────────
//
// Bound into the intent hash — a proof signed for POLICY_LARGE cannot
// authorize a POLICY_RAPID action, even on the same vault.

pub const POLICY_OPT_IN:   &str = "transfer.always";
pub const POLICY_RAPID:    &str = "transfer.rapid_drain";
pub const POLICY_VELOCITY: &str = "transfer.velocity";
pub const POLICY_LARGE:    &str = "transfer.large";
pub const POLICY_FREEZE:   &str = "admin.freeze";

#[program]
pub mod demo_vault {
    use super::*;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

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

    // ── Emergency freeze — admin.freeze policy ────────────────────────────────
    //
    // Requires a valid passkey regardless of vault state.
    // While frozen, all deposits and withdrawals are blocked.
    // Unfreeze also requires a passkey — prevents an attacker from freezing
    // the vault and then immediately unfreezing it.

    pub fn emergency_freeze(ctx: Context<EmergencyFreeze>, freeze: bool) -> Result<()> {
        guard::cpi::enforce(ctx.accounts.trana_cpi_ctx())?;
        ctx.accounts.vault.frozen = freeze;
        emit!(FreezeEvent {
            owner:  ctx.accounts.owner.key(),
            frozen: freeze,
        });
        Ok(())
    }

    // ── Deposit ───────────────────────────────────────────────────────────────
    //
    // Large deposits are tracked so the rapid-drain policy can fire on
    // subsequent withdrawals within RAPID_WINDOW seconds.

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0,                   VaultError::ZeroAmount);
        require!(!ctx.accounts.vault.frozen,   VaultError::VaultFrozen);

        if amount >= LARGE_THRESHOLD {
            guard::cpi::enforce(ctx.accounts.trana_cpi_ctx())?;

            let vault = &mut ctx.accounts.vault;
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

        emit!(DepositEvent {
            owner:            ctx.accounts.owner.key(),
            amount,
            passkey_required: amount >= LARGE_THRESHOLD,
        });

        Ok(())
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────
    //
    // Four independent withdrawal policies evaluated in priority order.
    // First match wins — one CPI call per protected transaction.

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0,                           VaultError::ZeroAmount);
        require!(amount <= ctx.accounts.vault.balance, VaultError::InsufficientFunds);
        require!(!ctx.accounts.vault.frozen,           VaultError::VaultFrozen);

        let now    = Clock::get()?.unix_timestamp;
        let policy = evaluate_policy(&ctx.accounts.vault, amount, now);

        if policy.is_some() {
            guard::cpi::enforce(ctx.accounts.trana_cpi_ctx())?;
        }

        let vault_info = ctx.accounts.vault.to_account_info();
        let dest_info  = ctx.accounts.destination.to_account_info();
        **vault_info.try_borrow_mut_lamports()? -= amount;
        **dest_info.try_borrow_mut_lamports()?  += amount;

        ctx.accounts.vault.balance = ctx.accounts.vault.balance
            .checked_sub(amount)
            .ok_or(VaultError::Overflow)?;

        // Update velocity window
        if now.saturating_sub(ctx.accounts.vault.velocity_window_start) >= VELOCITY_WINDOW {
            ctx.accounts.vault.velocity_window_start = now;
            ctx.accounts.vault.velocity_withdrawn    = amount;
        } else {
            ctx.accounts.vault.velocity_withdrawn =
                ctx.accounts.vault.velocity_withdrawn.saturating_add(amount);
        }

        emit!(WithdrawEvent {
            owner:            ctx.accounts.owner.key(),
            destination:      ctx.accounts.destination.key(),
            amount,
            policy_triggered: policy.map(|s| s.to_string()),
        });

        Ok(())
    }
}

// ── Policy evaluation ─────────────────────────────────────────────────────────
//
// Pure function — easy to unit test, easy to read, easy to audit.
// Returns the policy ID string, or None if no passkey is required.
//
// Priority (first match wins):
//   opt_in > rapid_drain > velocity > large > None

pub fn evaluate_policy(vault: &VaultState, amount: u64, now: i64) -> Option<&'static str> {
    // 1. opt_in — user always wants passkey regardless of amount
    if vault.opt_in {
        return Some(POLICY_OPT_IN);
    }

    // 2. rapid drain — withdrawal shortly after a large deposit
    if vault.last_large_deposit_amount >= RAPID_DEPOSIT_THRESHOLD {
        let seconds_since = now.saturating_sub(vault.last_large_deposit_at);
        if seconds_since < RAPID_WINDOW {
            return Some(POLICY_RAPID);
        }
    }

    // 3. velocity — cumulative withdrawals in rolling window exceed threshold
    let in_window = now.saturating_sub(vault.velocity_window_start) < VELOCITY_WINDOW;
    if in_window && vault.velocity_withdrawn.saturating_add(amount) > VELOCITY_THRESHOLD {
        return Some(POLICY_VELOCITY);
    }

    // 4. large single transfer
    if amount >= LARGE_THRESHOLD {
        return Some(POLICY_LARGE);
    }

    None
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

    pub guard_program: Program<'info, Guard>,

    #[account(
        mut,
        seeds  = [b"2fa", owner.key().as_ref()],
        bump,
        seeds::program = guard_program.key(),
        constraint = trana_registry.enabled @ VaultError::PasskeyNotRegistered,
    )]
    pub trana_registry: Account<'info, guard::TwoFactorRegistry>,

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

    pub guard_program: Program<'info, Guard>,

    #[account(
        mut,
        seeds  = [b"2fa", owner.key().as_ref()],
        bump,
        seeds::program = guard_program.key(),
        constraint = trana_registry.enabled @ VaultError::PasskeyNotRegistered,
    )]
    pub trana_registry: Account<'info, guard::TwoFactorRegistry>,

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

    pub guard_program: Program<'info, Guard>,

    #[account(
        mut,
        seeds  = [b"2fa", owner.key().as_ref()],
        bump,
        seeds::program = guard_program.key(),
        constraint = trana_registry.enabled @ VaultError::PasskeyNotRegistered,
    )]
    pub trana_registry: Account<'info, guard::TwoFactorRegistry>,

    /// CHECK: Solana Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub trana_instructions: UncheckedAccount<'info>,
}

// ── Trana CPI helper (copy this pattern into your program) ───────────────────

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
    pub opt_in:  bool,   //  1 — always require passkey
    pub frozen:  bool,   //  1 — emergency freeze (admin.freeze policy)

    // Rapid-drain tracking — updated on every large deposit
    pub last_large_deposit_at:     i64, //  8
    pub last_large_deposit_amount: u64, //  8

    // Velocity window tracking — updated on every withdrawal
    pub velocity_window_start: i64, //  8
    pub velocity_withdrawn:    u64, //  8
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct DepositEvent {
    pub owner:            Pubkey,
    pub amount:           u64,
    pub passkey_required: bool,
}

#[event]
pub struct WithdrawEvent {
    pub owner:            Pubkey,
    pub destination:      Pubkey,
    pub amount:           u64,
    pub policy_triggered: Option<String>,
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

// ── Unit tests ────────────────────────────────────────────────────────────────
//
// Pure policy evaluation — no on-chain state required.
// Run with: cargo test --package demo_vault

#[cfg(test)]
mod tests {
    use super::*;

    fn make_vault(
        opt_in:             bool,
        last_deposit_at:    i64,
        last_deposit_amount: u64,
        velocity_start:     i64,
        velocity_withdrawn: u64,
    ) -> VaultState {
        VaultState {
            owner:                      Pubkey::default(),
            balance:                    100 * 1_000_000_000,
            opt_in,
            frozen:                     false,
            last_large_deposit_at:      last_deposit_at,
            last_large_deposit_amount:  last_deposit_amount,
            velocity_window_start:      velocity_start,
            velocity_withdrawn,
        }
    }

    fn base() -> VaultState { make_vault(false, 0, 0, 0, 0) }

    // ── POLICY_OPT_IN ─────────────────────────────────────────────────────────

    #[test]
    fn opt_in_always_requires_passkey() {
        let v = make_vault(true, 0, 0, 0, 0);
        assert_eq!(evaluate_policy(&v, 1, 0), Some(POLICY_OPT_IN));
    }

    #[test]
    fn opt_in_triggers_even_for_tiny_amount() {
        let v = make_vault(true, 0, 0, 0, 0);
        assert_eq!(evaluate_policy(&v, 1, 0), Some(POLICY_OPT_IN));
    }

    // ── POLICY_RAPID ──────────────────────────────────────────────────────────

    #[test]
    fn rapid_drain_within_window_requires_passkey() {
        let now = 1_000_000i64;
        let v   = make_vault(false, now - 60, RAPID_DEPOSIT_THRESHOLD, 0, 0);
        assert_eq!(evaluate_policy(&v, 100_000, now), Some(POLICY_RAPID));
    }

    #[test]
    fn rapid_drain_outside_window_no_passkey() {
        let now = 1_000_000i64;
        let v   = make_vault(false, now - 600, RAPID_DEPOSIT_THRESHOLD, 0, 0);
        assert_eq!(evaluate_policy(&v, 100_000, now), None);
    }

    #[test]
    fn rapid_drain_only_triggers_if_deposit_large_enough() {
        let now = 1_000_000i64;
        let v   = make_vault(false, now - 60, RAPID_DEPOSIT_THRESHOLD - 1, 0, 0);
        assert_eq!(evaluate_policy(&v, 100_000, now), None);
    }

    // ── POLICY_VELOCITY ───────────────────────────────────────────────────────

    #[test]
    fn velocity_triggers_when_cumulative_exceeds_threshold() {
        let now = 1_000_000i64;
        // 1.5 SOL already withdrawn; this 0.6 SOL would push total to 2.1 SOL > 2 SOL
        let v = make_vault(false, 0, 0, now - 30, 1_500_000_000);
        assert_eq!(evaluate_policy(&v, 600_000_000, now), Some(POLICY_VELOCITY));
    }

    #[test]
    fn velocity_does_not_trigger_within_threshold() {
        let now = 1_000_000i64;
        // 0.5 + 0.5 = 1 SOL — below VELOCITY_THRESHOLD (2 SOL)
        let v = make_vault(false, 0, 0, now - 30, 500_000_000);
        assert_eq!(evaluate_policy(&v, 500_000_000, now), None);
    }

    #[test]
    fn velocity_resets_after_window_expires() {
        let now = 1_000_000i64;
        // Window started 90s ago — VELOCITY_WINDOW is 60s, so window is expired
        let v = make_vault(false, 0, 0, now - 90, 1_900_000_000);
        assert_eq!(evaluate_policy(&v, 500_000_000, now), None);
    }

    #[test]
    fn velocity_exactly_at_threshold_does_not_trigger() {
        let now = 1_000_000i64;
        // 1.5 SOL + 0.5 SOL = 2.0 SOL == VELOCITY_THRESHOLD; check is >, not >=
        let v = make_vault(false, 0, 0, now - 30, 1_500_000_000);
        assert_eq!(evaluate_policy(&v, 500_000_000, now), None);
    }

    // ── POLICY_LARGE ──────────────────────────────────────────────────────────

    #[test]
    fn large_transfer_requires_passkey() {
        assert_eq!(evaluate_policy(&base(), LARGE_THRESHOLD, 0), Some(POLICY_LARGE));
    }

    #[test]
    fn below_threshold_no_passkey() {
        assert_eq!(evaluate_policy(&base(), LARGE_THRESHOLD - 1, 0), None);
    }

    // ── Policy precedence — opt_in > rapid > velocity > large ─────────────────

    #[test]
    fn opt_in_beats_rapid_drain() {
        let now = 1_000_000i64;
        let v   = make_vault(true, now - 60, RAPID_DEPOSIT_THRESHOLD, 0, 0);
        assert_eq!(evaluate_policy(&v, 100_000, now), Some(POLICY_OPT_IN));
    }

    #[test]
    fn opt_in_beats_velocity() {
        let now = 1_000_000i64;
        let v   = make_vault(true, 0, 0, now - 30, 1_900_000_000);
        assert_eq!(evaluate_policy(&v, 200_000_000, now), Some(POLICY_OPT_IN));
    }

    #[test]
    fn opt_in_beats_large_transfer() {
        let v = make_vault(true, 0, 0, 0, 0);
        assert_eq!(evaluate_policy(&v, LARGE_THRESHOLD * 2, 0), Some(POLICY_OPT_IN));
    }

    #[test]
    fn rapid_beats_velocity() {
        let now = 1_000_000i64;
        let v   = make_vault(false, now - 60, RAPID_DEPOSIT_THRESHOLD, now - 30, 1_900_000_000);
        assert_eq!(evaluate_policy(&v, 200_000_000, now), Some(POLICY_RAPID));
    }

    #[test]
    fn rapid_beats_large_transfer() {
        let now = 1_000_000i64;
        let v   = make_vault(false, now - 60, RAPID_DEPOSIT_THRESHOLD, 0, 0);
        assert_eq!(evaluate_policy(&v, LARGE_THRESHOLD, now), Some(POLICY_RAPID));
    }

    #[test]
    fn velocity_beats_large_transfer() {
        let now = 1_000_000i64;
        // Velocity triggered AND amount >= LARGE_THRESHOLD
        let v = make_vault(false, 0, 0, now - 30, 1_500_000_000);
        assert_eq!(evaluate_policy(&v, LARGE_THRESHOLD, now), Some(POLICY_VELOCITY));
    }

    // ── No policy ─────────────────────────────────────────────────────────────

    #[test]
    fn no_policy_small_amount_clean_state() {
        assert_eq!(evaluate_policy(&base(), 500_000_000, 0), None); // 0.5 SOL
    }
}

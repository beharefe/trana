use anchor_lang::prelude::*;
use guard::cpi::accounts::Enforce;
use guard::program::Guard;

declare_id!("RuY1hQfDuxojWEioSsQy81ByaK6LhB1UvKhDGygWxnW");

// ─────────────────────────────────────────────────────────────────────────────
//  Demo Vault — Trana Guard integration example
//
//  This program is the integration reference. Copy the pattern, not the vault.
//
//  Three policies are evaluated onchain:
//
//    POLICY_LARGE     — any single transfer above LARGE_THRESHOLD lamports
//    POLICY_RAPID     — withdrawal within RAPID_WINDOW seconds of a large deposit
//    POLICY_OPT_IN    — user has permanently opted into always-require-passkey
//
//  Integrating Trana takes three things:
//    1. Three extra accounts  (guard_program, trana_registry, trana_instructions)
//    2. One CPI call          (guard::cpi::enforce(...))
//    3. A policy decision     (when does your protocol require approval?)
//
//  That's it. Everything else — WebAuthn, secp256r1, intent hash, nonce — is
//  handled by the guard program and the Trana SDK.
// ─────────────────────────────────────────────────────────────────────────────

/// Any transfer of this many lamports or more requires a passkey.
pub const LARGE_THRESHOLD: u64 = 1_000_000_000; // 1 SOL

/// A withdrawal within this many seconds of a large deposit triggers rapid-drain protection.
pub const RAPID_WINDOW: i64 = 300; // 5 minutes

/// A deposit is "large" for rapid-drain purposes if it exceeds this.
pub const RAPID_DEPOSIT_THRESHOLD: u64 = 5_000_000_000; // 5 SOL

// ── Policy identifiers ────────────────────────────────────────────────────────
//
// These strings are bound into the intent hash — a proof signed for
// POLICY_LARGE cannot be used to authorize a POLICY_RAPID action.

pub const POLICY_LARGE:  &str = "transfer.large";
pub const POLICY_RAPID:  &str = "transfer.rapid_drain";
pub const POLICY_OPT_IN: &str = "transfer.always";

#[program]
pub mod demo_vault {
    use super::*;

    // ── init ──────────────────────────────────────────────────────────────────

    pub fn init_vault(ctx: Context<InitVault>) -> Result<()> {
        let vault       = &mut ctx.accounts.vault;
        vault.owner     = ctx.accounts.owner.key();
        vault.balance   = 0;
        vault.opt_in    = false;
        vault.last_large_deposit_at     = 0;
        vault.last_large_deposit_amount = 0;
        Ok(())
    }

    pub fn set_opt_in(ctx: Context<SetOptIn>, enabled: bool) -> Result<()> {
        ctx.accounts.vault.opt_in = enabled;
        Ok(())
    }

    // ── deposit ───────────────────────────────────────────────────────────────
    //
    // Large deposits are tracked for the rapid-drain policy.
    // If the deposit is above LARGE_THRESHOLD, we record its timestamp.

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        // Policy: large deposit requires passkey
        if amount >= LARGE_THRESHOLD {
            guard::cpi::enforce(ctx.accounts.trana_cpi_ctx())?;

            // Track this deposit for rapid-drain detection on future withdrawals
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
            owner: ctx.accounts.owner.key(),
            amount,
            passkey_required: amount >= LARGE_THRESHOLD,
        });

        Ok(())
    }

    // ── withdraw ──────────────────────────────────────────────────────────────
    //
    // Three independent policies are evaluated. Any match triggers enforcement.
    // The SDK picks the first matching policy for the intent hash.
    //
    // This is the whole integration — the rest is just normal vault logic.

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0,                                VaultError::ZeroAmount);
        require!(amount <= ctx.accounts.vault.balance,      VaultError::InsufficientFunds);

        let vault = &ctx.accounts.vault;
        let now   = Clock::get()?.unix_timestamp;

        let policy = evaluate_policy(vault, amount, now);

        if policy.is_some() {
            // One CPI call. That's the entire Trana integration.
            guard::cpi::enforce(ctx.accounts.trana_cpi_ctx())?;
        }

        // Transfer lamports from vault PDA to destination
        let vault_info = ctx.accounts.vault.to_account_info();
        let dest_info  = ctx.accounts.destination.to_account_info();

        **vault_info.try_borrow_mut_lamports()? -= amount;
        **dest_info.try_borrow_mut_lamports()?  += amount;

        ctx.accounts.vault.balance = ctx.accounts.vault.balance
            .checked_sub(amount)
            .ok_or(VaultError::Overflow)?;

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

pub fn evaluate_policy(vault: &VaultState, amount: u64, now: i64) -> Option<&'static str> {
    // Policy 1: opt-in (user always wants passkey regardless of amount)
    if vault.opt_in {
        return Some(POLICY_OPT_IN);
    }

    // Policy 2: rapid drain — withdrawal within RAPID_WINDOW seconds of a large deposit
    if vault.last_large_deposit_amount >= RAPID_DEPOSIT_THRESHOLD {
        let seconds_since = now.saturating_sub(vault.last_large_deposit_at);
        if seconds_since < RAPID_WINDOW {
            return Some(POLICY_RAPID);
        }
    }

    // Policy 3: large single transfer
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
pub struct Deposit<'info> {
    #[account(mut, has_one = owner, seeds = [b"vault", owner.key().as_ref()], bump)]
    pub vault: Account<'info, VaultState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,

    // ── Trana (only present when policy requires passkey) ─────────────────────
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

    // ── Trana ─────────────────────────────────────────────────────────────────
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

impl<'info> Deposit<'info> {
    pub fn trana_cpi_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Enforce<'info>> {
        CpiContext::new(
            self.guard_program.to_account_info(),
            Enforce {
                registry:     self.trana_registry.to_account_info(),
                owner:        self.owner.to_account_info(),
                instructions: self.trana_instructions.to_account_info(),
            },
        )
    }
}

impl<'info> Withdraw<'info> {
    pub fn trana_cpi_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Enforce<'info>> {
        CpiContext::new(
            self.guard_program.to_account_info(),
            Enforce {
                registry:     self.trana_registry.to_account_info(),
                owner:        self.owner.to_account_info(),
                instructions: self.trana_instructions.to_account_info(),
            },
        )
    }
}

// ── State ─────────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub owner:   Pubkey,  // 32
    pub balance: u64,     //  8
    pub opt_in:  bool,    //  1  — always require passkey

    // Rapid-drain tracking — updated on every large deposit
    pub last_large_deposit_at:     i64,  // 8 — unix timestamp
    pub last_large_deposit_amount: u64,  // 8 — amount of that deposit
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
}

// ── Unit tests ────────────────────────────────────────────────────────────────
//
// Pure policy evaluation — no on-chain state required.
// Run with: cargo test --package demo_vault

#[cfg(test)]
mod tests {
    use super::*;

    fn make_vault(opt_in: bool, last_deposit_at: i64, last_deposit_amount: u64) -> VaultState {
        VaultState {
            owner:                      Pubkey::default(),
            balance:                    100 * 1_000_000_000,
            opt_in,
            last_large_deposit_at:      last_deposit_at,
            last_large_deposit_amount:  last_deposit_amount,
        }
    }

    // ── POLICY_OPT_IN ─────────────────────────────────────────────────────────

    #[test]
    fn opt_in_always_requires_passkey() {
        let vault = make_vault(true, 0, 0);
        assert_eq!(evaluate_policy(&vault, 1, 0), Some(POLICY_OPT_IN));
    }

    #[test]
    fn opt_in_triggers_even_for_tiny_amount() {
        let vault = make_vault(true, 0, 0);
        assert_eq!(evaluate_policy(&vault, 1, 0), Some(POLICY_OPT_IN));
    }

    // ── POLICY_RAPID ──────────────────────────────────────────────────────────

    #[test]
    fn rapid_drain_within_window_requires_passkey() {
        let now = 1_000_000i64;
        // Large deposit 60 seconds ago
        let vault = make_vault(false, now - 60, RAPID_DEPOSIT_THRESHOLD);
        assert_eq!(
            evaluate_policy(&vault, 100_000, now),
            Some(POLICY_RAPID)
        );
    }

    #[test]
    fn rapid_drain_outside_window_no_passkey() {
        let now = 1_000_000i64;
        // Large deposit 10 minutes ago — outside RAPID_WINDOW (300s)
        let vault = make_vault(false, now - 600, RAPID_DEPOSIT_THRESHOLD);
        // Amount is below LARGE_THRESHOLD, no opt-in → no policy triggered
        assert_eq!(evaluate_policy(&vault, 100_000, now), None);
    }

    #[test]
    fn rapid_drain_only_triggers_if_deposit_large_enough() {
        let now = 1_000_000i64;
        // Recent deposit but below RAPID_DEPOSIT_THRESHOLD
        let vault = make_vault(false, now - 60, RAPID_DEPOSIT_THRESHOLD - 1);
        assert_eq!(evaluate_policy(&vault, 100_000, now), None);
    }

    // ── POLICY_LARGE ──────────────────────────────────────────────────────────

    #[test]
    fn large_transfer_requires_passkey() {
        let vault = make_vault(false, 0, 0);
        assert_eq!(
            evaluate_policy(&vault, LARGE_THRESHOLD, 0),
            Some(POLICY_LARGE)
        );
    }

    #[test]
    fn below_threshold_no_passkey() {
        let vault = make_vault(false, 0, 0);
        assert_eq!(evaluate_policy(&vault, LARGE_THRESHOLD - 1, 0), None);
    }

    // ── Policy precedence ─────────────────────────────────────────────────────
    //
    // opt_in > rapid_drain > large — first match wins.

    #[test]
    fn opt_in_takes_priority_over_rapid_drain() {
        let now = 1_000_000i64;
        let vault = make_vault(true, now - 60, RAPID_DEPOSIT_THRESHOLD);
        // opt_in = true AND rapid drain conditions met → opt_in wins
        assert_eq!(evaluate_policy(&vault, 100_000, now), Some(POLICY_OPT_IN));
    }

    #[test]
    fn opt_in_takes_priority_over_large_transfer() {
        let vault = make_vault(true, 0, 0);
        assert_eq!(
            evaluate_policy(&vault, LARGE_THRESHOLD * 2, 0),
            Some(POLICY_OPT_IN)
        );
    }

    #[test]
    fn rapid_drain_takes_priority_over_large_transfer() {
        let now = 1_000_000i64;
        let vault = make_vault(false, now - 60, RAPID_DEPOSIT_THRESHOLD);
        // Rapid drain applies AND amount >= LARGE_THRESHOLD → rapid wins
        assert_eq!(
            evaluate_policy(&vault, LARGE_THRESHOLD, now),
            Some(POLICY_RAPID)
        );
    }

    // ── No policy ─────────────────────────────────────────────────────────────

    #[test]
    fn no_policy_when_small_amount_no_flags() {
        let vault = make_vault(false, 0, 0);
        assert_eq!(evaluate_policy(&vault, 500_000_000, 0), None);  // 0.5 SOL
    }
}

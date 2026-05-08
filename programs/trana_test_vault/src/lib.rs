// ⚠️  DEMO PROGRAM — not for production use.
//
// trana_test_vault: passkey-gated SOL vault for devnet demos and end-to-end tests.
//
// The "aha moment" flow:
//   1. owner calls initialize(label, policy)  — picks one of 4 guard policies
//   2. anyone calls deposit()                 — open to all; balance is publicly visible
//   3. try calling withdraw() yourself        — fails per the chosen policy
//   4. owner + passkey calls withdraw()       — succeeds when policy conditions are met
//
// Four policy flavours (choose at create time):
//
//   Require               → passkey always required          policyId: "trana.require"
//   Limit { lamports }    → free for small amounts,          policyId: "trana.limit"
//                           passkey for withdrawals ≥ limit
//   NotBefore { slot }    → passkey required until slot       policyId: "trana.not_before"
//                           passes, then vault unlocks freely
//   NotAfter  { slot }    → vault free until slot passes,    policyId: "trana.not_after"
//                           then passkey required forever
//
// Transaction shape for gated withdrawals (same as every trana_guard consumer):
//   ix[N-2]: secp256r1 precompile
//   ix[N-1]: trana_guard::record_proof
//   ix[N]:   trana_test_vault::withdraw | close_vault

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

pub const VAULT_SEED: &[u8] = b"trana-vault";

// ── Policy mapping ─────────────────────────────────────────────────────────────

fn to_guard_policy(vp: &VaultPolicy) -> Policy {
    match vp {
        VaultPolicy::Require                     => Policy::Require,
        VaultPolicy::Limit    { lamports }       => Policy::Limit { param_offset: 0, limit: *lamports },
        VaultPolicy::NotBefore { slot }          => Policy::NotBefore { slot: *slot },
        VaultPolicy::NotAfter  { slot }          => Policy::NotAfter  { slot: *slot },
    }
}

// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod trana_test_vault {
    use super::*;

    // ── Initialize ────────────────────────────────────────────────────────────

    /// Create the vault PDA and choose its withdrawal policy.
    /// No passkey required — wallet signature only.
    ///
    /// After this, the owner must register a passkey via trana_guard.
    pub fn initialize(ctx: Context<Initialize>, label: String, policy: VaultPolicy) -> Result<()> {
        require!(label.len() <= 32, VaultError::LabelTooLong);

        let vault_key = ctx.accounts.vault.key();
        let owner_key = ctx.accounts.owner.key();
        let vault     = &mut ctx.accounts.vault;

        vault.owner           = owner_key;
        vault.bump            = ctx.bumps.vault;
        vault.label           = label.clone();
        vault.policy          = policy;
        vault.total_deposited = 0;

        emit!(VaultInitialized { vault: vault_key, owner: owner_key, label });

        msg!("TRANA_VAULT init | owner={} | vault={}", owner_key, vault_key);
        Ok(())
    }

    // ── Deposit ───────────────────────────────────────────────────────────────

    /// Deposit SOL into the vault. Open to anyone — no proof required.
    ///
    /// This is intentional: anyone can fund the vault (great for demos where
    /// audience members top it up), but only the passkey owner can drain it.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        let ix = system_instruction::transfer(
            &ctx.accounts.depositor.key(),
            &ctx.accounts.vault.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
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

        msg!("TRANA_VAULT deposit | amount={} | vault={}", amount, ctx.accounts.vault.key());
        Ok(())
    }

    // ── Withdraw ──────────────────────────────────────────────────────────────

    /// Withdraw SOL from the vault, subject to the vault's policy.
    ///
    /// Policy behaviour:
    ///   Require               → always needs secp256r1 + record_proof preamble
    ///   Limit { lamports }    → free if amount < lamports; proof required if ≥ limit
    ///   NotBefore { slot }    → proof required until slot passes; free after
    ///   NotAfter  { slot }    → free until slot passes; proof required after
    ///
    /// Frontend: check vault.policy before building the transaction.
    /// For Limit, add the proof triple only when amount ≥ vault.policy.lamports.
    /// For NotBefore/NotAfter, add the proof triple according to current slot.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);

        let lamports = ctx.accounts.vault.to_account_info().lamports();
        let rent     = Rent::get()?.minimum_balance(Vault::space());
        require!(lamports.saturating_sub(rent) >= amount, VaultError::InsufficientFunds);

        // Map vault-stored policy → trana_guard Policy and enforce
        let guard_policy = to_guard_policy(&ctx.accounts.vault.policy);
        trana_guard::cpi::enforce(
            CpiContext::new(
                ctx.accounts.trana_guard_program.to_account_info(),
                Enforce {
                    registry:     ctx.accounts.trana_registry.to_account_info(),
                    owner:        ctx.accounts.owner.to_account_info(),
                    instructions: ctx.accounts.instructions.to_account_info(),
                },
            ),
            guard_policy,
        )?;

        // Transfer from PDA — direct lamport manipulation (PDA is program-owned)
        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.destination.to_account_info().try_borrow_mut_lamports()? += amount;

        emit!(VaultWithdraw {
            vault:       ctx.accounts.vault.key(),
            owner:       ctx.accounts.owner.key(),
            destination: ctx.accounts.destination.key(),
            amount,
        });

        msg!(
            "TRANA_VAULT withdraw | amount={} | dest={}",
            amount, ctx.accounts.destination.key(),
        );
        Ok(())
    }

    // ── Close vault ───────────────────────────────────────────────────────────

    /// Drain all remaining SOL and permanently close the vault.
    ///
    /// Always requires passkey (Policy::Require) regardless of the vault's
    /// configured withdrawal policy — closing is irreversible.
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

        // Move all SOL above rent to destination before Anchor closes the account
        let rent   = Rent::get()?.minimum_balance(Vault::space());
        let excess = ctx.accounts.vault.to_account_info().lamports().saturating_sub(rent);
        if excess > 0 {
            **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= excess;
            **ctx.accounts.destination.to_account_info().try_borrow_mut_lamports()? += excess;
        }

        emit!(VaultClosed {
            vault: ctx.accounts.vault.key(),
            owner: ctx.accounts.owner.key(),
        });

        msg!("TRANA_VAULT close | vault={}", ctx.accounts.vault.key());
        Ok(())
    }
}

// ── Account contexts ───────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(label: String, policy: VaultPolicy)]
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

    /// CHECK: destination receives the withdrawn SOL
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

    /// CHECK: Instructions sysvar
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

    /// CHECK: destination receives any remaining SOL above rent
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

    /// CHECK: Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

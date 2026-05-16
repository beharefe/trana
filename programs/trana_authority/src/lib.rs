// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{bpf_loader_upgradeable, program::invoke_signed};

pub mod error;
pub mod events;
pub mod state;

pub use error::AuthorityError;
pub use events::*;
pub use state::*;

use trana_guard::{
    cpi::accounts::Enforce,
    program::TranaGuard,
    state::PasskeyRegistry,
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
//  Secures a program's upgrade authority behind a passkey second factor
//  without requiring changes to the target program.
//
//  Transaction shape (same as trana_guard):
//    ix[N-2]: secp256r1 precompile
//    ix[N-1]: trana_guard::record_proof
//    ix[N]:   trana_authority::execute_*  ← calls enforce() then acts
//
//  Flow:
//    1. register()          — create AuthorityRecord PDA
//    2. (user) set-upgrade-authority <PROG> --new-upgrade-authority <PDA>
//    3. execute_upgrade()   — passkey proof required, PDA signs the CPI
//    4. reclaim_authority() — return upgrade authority to a new key (passkey-gated)
// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod trana_authority {
    use super::*;

    // ── Register ──────────────────────────────────────────────────────────────

    /// Create an AuthorityRecord PDA for an (owner, target) pair.
    /// No passkey required — only the owner's wallet signature.
    /// After this, transfer the program's upgrade authority to the PDA address:
    ///   solana program set-upgrade-authority <PROG> --new-upgrade-authority <PDA>
    pub fn register(ctx: Context<Register>) -> Result<()> {
        let rec    = &mut ctx.accounts.authority_record;
        rec.owner  = ctx.accounts.owner.key();
        rec.target = ctx.accounts.target.key();
        rec.bump   = ctx.bumps.authority_record;
        msg!(
            "TRANA_AUTHORITY register | owner={} | target={}",
            rec.owner, rec.target,
        );
        Ok(())
    }

    // ── Execute upgrade ───────────────────────────────────────────────────────

    /// Upgrade a BPF program. Requires passkey proof.
    ///
    /// The PDA (AuthorityRecord) must be the program's current upgrade_authority.
    pub fn execute_upgrade(ctx: Context<ExecuteUpgrade>) -> Result<()> {
        enforce_proof(
            ctx.accounts.trana_guard_program.to_account_info(),
            ctx.accounts.trana_registry.to_account_info(),
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.instructions.to_account_info(),
        )?;

        let bump  = [ctx.accounts.authority_record.bump];
        let seeds = authority_seeds(&ctx.accounts.authority_record, &bump);

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
            &[seeds.as_slice()],
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

    // ── Reclaim authority ─────────────────────────────────────────────────────

    /// Return the upgrade authority from the PDA to a new pubkey. Requires passkey proof.
    /// Closes the AuthorityRecord PDA and returns rent to the owner.
    pub fn reclaim_authority(ctx: Context<ReclaimAuthority>, new_authority: Pubkey) -> Result<()> {
        enforce_proof(
            ctx.accounts.trana_guard_program.to_account_info(),
            ctx.accounts.trana_registry.to_account_info(),
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.instructions.to_account_info(),
        )?;

        let bump  = [ctx.accounts.authority_record.bump];
        let seeds = authority_seeds(&ctx.accounts.authority_record, &bump);

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
            &[seeds.as_slice()],
        )?;

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

    /// CHECK: the program being protected
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

    pub trana_guard_program: Program<'info, TranaGuard>,

    #[account(
        mut,
        seeds = [b"passkey", owner.key().as_ref()],
        seeds::program = trana_guard_program.key(),
        bump,
    )]
    pub trana_registry: Account<'info, PasskeyRegistry>,

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

    /// CHECK: the program whose upgrade authority is being returned
    #[account(mut)]
    pub target: UncheckedAccount<'info>,

    /// CHECK: program data account
    #[account(mut)]
    pub program_data: UncheckedAccount<'info>,

    /// CHECK: the new upgrade authority pubkey's account info
    pub new_authority_info: UncheckedAccount<'info>,

    /// CHECK: BPF Loader Upgradeable program
    #[account(address = bpf_loader_upgradeable::ID)]
    pub bpf_loader: UncheckedAccount<'info>,

    pub trana_guard_program: Program<'info, TranaGuard>,

    #[account(
        mut,
        seeds = [b"passkey", owner.key().as_ref()],
        seeds::program = trana_guard_program.key(),
        bump,
    )]
    pub trana_registry: Account<'info, PasskeyRegistry>,

    /// CHECK: Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

// ── Private helpers ────────────────────────────────────────────────────────────

fn enforce_proof<'info>(
    guard_program: AccountInfo<'info>,
    registry:      AccountInfo<'info>,
    owner:         AccountInfo<'info>,
    instructions:  AccountInfo<'info>,
) -> Result<()> {
    trana_guard::cpi::enforce(
        CpiContext::new(
            guard_program,
            Enforce { registry, owner, instructions },
        ),
        Policy::Require,
    )
}

fn authority_seeds<'a>(rec: &'a AuthorityRecord, bump: &'a [u8]) -> [&'a [u8]; 4] {
    [AUTHORITY_SEED, rec.owner.as_ref(), rec.target.as_ref(), bump]
}

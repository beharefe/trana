use anchor_lang::prelude::*;
use trana_guard::{cpi::accounts::Enforce, program::TranaGuard, Policy};

declare_id!("BF3AS5PQSbGvipTZo99CzPJmnLUJkyq3z8cY8RTimwTv");

#[program]
pub mod counter {
    use super::*;

    /// Create a passkey-gated counter for the signing wallet.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.counter.count = 0;
        ctx.accounts.counter.owner = ctx.accounts.owner.key();
        ctx.accounts.counter.bump  = ctx.bumps.counter;
        Ok(())
    }

    /// Increment the counter — passkey required every time.
    pub fn increment(ctx: Context<Increment>) -> Result<()> {
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

        ctx.accounts.counter.count += 1;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer  = owner,
        space  = 8 + Counter::INIT_SPACE,
        seeds  = [b"counter", owner.key().as_ref()],
        bump,
    )]
    pub counter: Account<'info, Counter>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(
        mut,
        seeds   = [b"counter", owner.key().as_ref()],
        bump    = counter.bump,
        has_one = owner,
    )]
    pub counter: Account<'info, Counter>,

    pub owner: Signer<'info>,

    pub trana_guard_program: Program<'info, TranaGuard>,

    /// CHECK: guard validates ownership and proof
    #[account(mut)]
    pub trana_registry: UncheckedAccount<'info>,

    /// CHECK: instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub count: u64,
    pub owner: Pubkey,
    pub bump:  u8,
}

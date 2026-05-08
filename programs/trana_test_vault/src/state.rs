use anchor_lang::prelude::*;

/// Policy governing withdrawals from this pool.
///
/// Limit      — small pulls free, large ones gated. Per-user drain window
///              catches burst withdrawals below the single-tx threshold.
///
/// TimeLocked — 1-minute cooldown between withdrawals, per user, automatic.
///              After each withdrawal the next unlock slot is stored on-chain as
///              `last_withdraw_slot + COOLDOWN_SLOTS`. The program passes that
///              computed slot to Policy::NotBefore — it ends up baked into the
///              signed WebAuthn challenge, so the program cannot fake the timing.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace, Debug)]
pub enum PoolKind {
    Limit,
    TimeLocked, // no parameter — cooldown is always last_withdraw_slot + ~1 min
}

/// Shared pool — holds all deposited SOL in its lamport balance.
/// Seeds: [b"trana-pool", authority]
#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    pub kind:      PoolKind,

    #[max_len(32)]
    pub label: String,

    pub bump: u8,
}

impl Pool {
    pub fn space() -> usize { 8 + Pool::INIT_SPACE }
}

/// Per-user deposit record — tracks balance and drain window inside the pool.
/// Seeds: [b"deposit", pool, user]
#[account]
#[derive(InitSpace)]
pub struct UserDeposit {
    pub pool:    Pubkey,
    pub user:    Pubkey,
    pub balance: u64,

    // TimeLocked: slot of the user's last withdrawal.
    // unlock_slot = last_withdraw_slot + COOLDOWN_SLOTS each call.
    // 0 = never withdrawn → first pull is always free.
    pub last_withdraw_slot: u64,

    // Limit: drain-window tracking
    pub window_withdrawn: u64,
    pub last_withdraw_at: i64,

    pub bump: u8,
}

impl UserDeposit {
    pub fn space() -> usize { 8 + UserDeposit::INIT_SPACE }
}

use anchor_lang::prelude::*;

/// Policy governing withdrawals from this pool.
///
/// Limit      — small pulls free, large pulls gated. Threshold per-user drain
///              window prevents death-by-a-thousand-cuts.
///
/// TimeLocked — whole pool locked until `slot`. The slot is signed inside the
///              WebAuthn challenge so even a redeployed program cannot alter it.
///              Before unlock: passkey needed. After: withdraw freely.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace, Debug)]
pub enum PoolKind {
    Limit,
    TimeLocked { slot: u64 },
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

    // Drain-window state (Limit pools only)
    pub window_withdrawn: u64,
    pub last_withdraw_at: i64,

    pub bump: u8,
}

impl UserDeposit {
    pub fn space() -> usize { 8 + UserDeposit::INIT_SPACE }
}

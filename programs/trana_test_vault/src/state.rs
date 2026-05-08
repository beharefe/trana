use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub owner: Pubkey,

    #[max_len(32)]
    pub label: String,

    pub total_deposited:  u64,
    pub window_withdrawn: u64, // SOL withdrawn in the current 1-minute window
    pub last_withdraw_at: i64, // unix timestamp when the current window opened

    pub bump: u8,
}

impl Vault {
    pub fn space() -> usize {
        8 + Vault::INIT_SPACE
    }
}

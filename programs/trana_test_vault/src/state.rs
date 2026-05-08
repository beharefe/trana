use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Wallet that owns this vault and whose passkey must sign withdrawals.
    pub owner: Pubkey,

    /// Human-readable label for the vault (max 32 bytes, for demo/explorer visibility).
    #[max_len(32)]
    pub label: String,

    /// Cumulative SOL deposited (does not decrease on withdraw — for analytics/display).
    pub total_deposited: u64,

    /// PDA bump stored for signer seeds.
    pub bump: u8,
}

impl Vault {
    pub fn space() -> usize {
        8 + Vault::INIT_SPACE
    }
}

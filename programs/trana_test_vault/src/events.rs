use anchor_lang::prelude::*;

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub label: String,
}

#[event]
pub struct VaultDeposit {
    pub vault:     Pubkey,
    pub depositor: Pubkey,
    pub amount:    u64,
}

#[event]
pub struct VaultWithdraw {
    pub vault:       Pubkey,
    pub owner:       Pubkey,
    pub destination: Pubkey,
    pub amount:      u64,
}

#[event]
pub struct VaultClosed {
    pub vault: Pubkey,
    pub owner: Pubkey,
}

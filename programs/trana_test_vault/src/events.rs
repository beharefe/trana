use anchor_lang::prelude::*;

#[event]
pub struct PoolInitialized {
    pub pool:      Pubkey,
    pub authority: Pubkey,
    pub label:     String,
}

#[event]
pub struct Deposited {
    pub pool:        Pubkey,
    pub user:        Pubkey,
    pub amount:      u64,
    pub new_balance: u64,
}

#[event]
pub struct Withdrawn {
    pub pool:        Pubkey,
    pub user:        Pubkey,
    pub destination: Pubkey,
    pub amount:      u64,
    pub proof_used:  bool,
}

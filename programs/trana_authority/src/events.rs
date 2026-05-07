use anchor_lang::prelude::*;

#[event]
pub struct UpgradeExecuted {
    pub owner:   Pubkey,
    pub program: Pubkey,
}

#[event]
pub struct MintExecuted {
    pub owner:  Pubkey,
    pub mint:   Pubkey,
    pub amount: u64,
}

#[event]
pub struct FreezeExecuted {
    pub owner:  Pubkey,
    pub mint:   Pubkey,
    pub frozen: bool,
}

#[event]
pub struct AuthorityReclaimed {
    pub owner:         Pubkey,
    pub target:        Pubkey,
    pub new_authority: Pubkey,
}

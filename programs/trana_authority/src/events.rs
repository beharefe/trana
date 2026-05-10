use anchor_lang::prelude::*;

#[event]
pub struct UpgradeExecuted {
    pub owner:   Pubkey,
    pub program: Pubkey,
}

#[event]
pub struct AuthorityReclaimed {
    pub owner:         Pubkey,
    pub target:        Pubkey,
    pub new_authority: Pubkey,
}

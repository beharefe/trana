use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Only the vault owner can call this instruction")]
    Unauthorized,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Insufficient funds — vault balance minus rent-exemption is less than requested amount")]
    InsufficientFunds,

    #[msg("Vault label must be 32 bytes or fewer")]
    LabelTooLong,
}

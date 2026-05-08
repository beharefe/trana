use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Only the pool authority can call this")]
    Unauthorized,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient balance")]
    InsufficientFunds,
    #[msg("Label must be 32 bytes or fewer")]
    LabelTooLong,
}

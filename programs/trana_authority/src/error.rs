use anchor_lang::prelude::*;

#[error_code]
pub enum AuthorityError {
    #[msg("Target account does not match the registered record")]
    TargetMismatch,
}

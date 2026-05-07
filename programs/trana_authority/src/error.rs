use anchor_lang::prelude::*;

#[error_code]
pub enum AuthorityError {
    #[msg("Authority kind does not match the registered record")]
    KindMismatch,

    #[msg("Target account does not match the registered record")]
    TargetMismatch,
}

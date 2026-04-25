use anchor_lang::prelude::*;

#[error_code]
pub enum GuardError {
    #[msg("Missing secp256r1 or record_proof instruction before the protected instruction")]
    MissingProof,

    #[msg("Proof has expired")]
    ProofExpired,

    #[msg("Intent hash does not match — transaction parameters were tampered")]
    PayloadMismatch,

    #[msg("Proof was signed by a key not in the registry")]
    WrongSigner,

    #[msg("Registry is disabled — register a passkey first")]
    RegistryDisabled,

    #[msg("Invalid proof data")]
    InvalidProof,

    #[msg("Nonce overflow")]
    NonceOverflow,

    #[msg("Proof policy does not match the expected trana standard policy")]
    PolicyMismatch,

    #[msg("Caller is not the config authority")]
    Unauthorized,

    #[msg("Treasury account does not match config.treasury")]
    InvalidTreasury,

    #[msg("Instruction submitted before the allowed slot — too early")]
    NotBeforeViolation,

    #[msg("Instruction submitted after the expiry slot — too late")]
    NotAfterViolation,

    #[msg("BurstFrequency or Cooldown tracker account missing from remaining_accounts")]
    MissingTrackerAccount,

    #[msg("Tracker account key or owner does not match expected PDA")]
    InvalidTrackerAccount,
}

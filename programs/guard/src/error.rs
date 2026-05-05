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

    #[msg("Proof cluster does not match the expected cluster for this deployment")]
    ClusterMismatch,
}

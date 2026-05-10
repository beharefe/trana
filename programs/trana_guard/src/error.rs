// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

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

    #[msg("Registry already has the maximum number of passkeys (10)")]
    MaxKeysReached,

    #[msg("Cannot remove the last registered passkey")]
    LastKeyCannotBeRemoved,

    #[msg("No passkey with that credential ID found in the registry")]
    CredentialNotFound,
}

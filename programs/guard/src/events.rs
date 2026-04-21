use anchor_lang::prelude::*;

/// Emitted on every successful proof verification.
/// Policy + target program are visible in on-chain transaction logs.
/// This is the zero-trust audit trail.
#[event]
pub struct ProofVerified {
    /// The wallet that authorized the action.
    pub owner:  Pubkey,
    /// Application-defined policy that triggered enforcement (e.g. "transfer.large").
    pub policy: String,
    /// The program whose instruction was protected.
    pub target: Pubkey,
    /// The nonce that was consumed (now invalid — cannot be replayed).
    pub nonce:  u64,
    /// Unix timestamp when this proof expires.
    pub expiry: i64,
}

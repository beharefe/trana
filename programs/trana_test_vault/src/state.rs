use anchor_lang::prelude::*;

/// Two demo policies, each telling a different security story.
///
/// Limit      — "large pulls need my passkey; the program enforces the threshold."
/// TimeLocked — "vault is locked until slot X; Solana's clock enforces it, not the program."
///              The slot is signed inside the WebAuthn challenge — even a compromised
///              program binary cannot fake the unlock time.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace, Debug)]
pub enum VaultKind {
    /// Passkey required when withdrawal >= 1 SOL, or when consecutive small
    /// withdrawals in a 60-second window accumulate to >= 1 SOL (drain guard).
    Limit,
    /// Passkey required until `slot` passes; after that the vault is open.
    /// policyId to sign: "trana.not_before"
    TimeLocked { slot: u64 },
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub owner: Pubkey,
    pub kind:  VaultKind,

    #[max_len(32)]
    pub label: String,

    pub total_deposited:  u64,

    // Drain-window state (only meaningful for VaultKind::Limit)
    pub window_withdrawn: u64,
    pub last_withdraw_at: i64,

    pub bump: u8,
}

impl Vault {
    pub fn space() -> usize {
        8 + Vault::INIT_SPACE
    }
}

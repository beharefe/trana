use anchor_lang::prelude::*;

/// Which trana_guard policy governs withdrawals from this vault.
///
/// Selected at initialize() time and stored on-chain — the frontend reads
/// this to know (a) whether a proof triple is required and (b) which
/// policyId string to sign in the WebAuthn challenge.
///
/// Policy semantics (mirrors trana_guard::Policy):
///
///  Require           — passkey always required
///  Limit {lamports}  — passkey only when withdrawal ≥ lamports (small withdrawals free)
///  NotBefore {slot}  — passkey required until slot passes, then vault unlocks freely
///  NotAfter  {slot}  — vault free until slot passes, then passkey required forever
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace, Debug)]
pub enum VaultPolicy {
    Require,
    Limit    { lamports: u64 },
    NotBefore { slot: u64 },
    NotAfter  { slot: u64 },
}

/// Frontend policyId strings — clients must use these when building the
/// proof instructions so the signed challenge matches what enforce() expects.
impl VaultPolicy {
    pub fn policy_id(&self) -> &'static str {
        match self {
            VaultPolicy::Require          => "trana.require",
            VaultPolicy::Limit { .. }     => "trana.limit",
            VaultPolicy::NotBefore { .. } => "trana.not_before",
            VaultPolicy::NotAfter  { .. } => "trana.not_after",
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Wallet that owns this vault.
    pub owner: Pubkey,

    /// Human-readable label (max 32 bytes, visible on explorer).
    #[max_len(32)]
    pub label: String,

    /// Authorization policy governing withdrawals.
    pub policy: VaultPolicy,

    /// Cumulative SOL deposited (never decremented — for analytics/display).
    pub total_deposited: u64,

    /// PDA bump.
    pub bump: u8,
}

impl Vault {
    pub fn space() -> usize {
        8 + Vault::INIT_SPACE
    }
}

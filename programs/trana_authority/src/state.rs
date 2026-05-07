use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace, Debug)]
pub enum AuthorityKind {
    /// target = program being protected (upgrade_authority)
    ProgramUpgrade,
    /// target = mint account (mint_authority)
    TokenMint,
    /// target = mint account (freeze_authority)
    TokenFreeze,
}

/// PDA record that IS the on-chain authority for a program or mint.
///
/// Seeds: [b"trana-authority", owner.key(), target.key()]
///
/// After `register()`, the user transfers the real authority externally:
///   - Program upgrade:  solana program set-upgrade-authority <PROG> --new-upgrade-authority <PDA>
///   - Token mint/freeze: spl-token authorize <MINT> mint|freeze <PDA>
///
/// Every instruction that uses the authority (execute_upgrade, execute_mint, …)
/// must be preceded by secp256r1 + trana_guard::record_proof in the same tx.
#[account]
#[derive(InitSpace)]
pub struct AuthorityRecord {
    /// Wallet that owns this record and whose passkey must sign.
    pub owner:          Pubkey,
    /// The program ID or mint address being protected.
    pub target:         Pubkey,
    pub authority_kind: AuthorityKind,
    /// PDA bump — stored so execute_* can sign without re-deriving.
    pub bump:           u8,
}

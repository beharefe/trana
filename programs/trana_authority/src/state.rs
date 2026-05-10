// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

use anchor_lang::prelude::*;

/// PDA record that IS the on-chain upgrade authority for a program.
///
/// Seeds: [b"trana-authority", owner.key(), target.key()]
///
/// After `register()`, transfer the program's upgrade authority to this PDA:
///   solana program set-upgrade-authority <PROG> --new-upgrade-authority <PDA>
#[account]
#[derive(InitSpace)]
pub struct AuthorityRecord {
    /// Wallet that owns this record and whose passkey must sign.
    pub owner:  Pubkey,
    /// The program ID being protected.
    pub target: Pubkey,
    /// PDA bump — stored so execute_upgrade can sign without re-deriving.
    pub bump:   u8,
}

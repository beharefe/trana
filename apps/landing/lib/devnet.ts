// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

export const DEVNET_RPC = "https://api.devnet.solana.com"

export const TRANA_GUARD_ID      = "TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG"
export const TRANA_AUTHORITY_ID  = "TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN"
export const TRANA_VAULT_ID      = "8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa"

// Authority that initialized the demo pool on devnet.
// Set NEXT_PUBLIC_DEMO_VAULT_AUTHORITY in .env.local once you run init-vault.mjs.
export const DEMO_VAULT_AUTHORITY = process.env.NEXT_PUBLIC_DEMO_VAULT_AUTHORITY ?? ""

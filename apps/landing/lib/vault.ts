// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Helpers for interacting with the trana_test_vault program on devnet.
// All instruction data is encoded manually — no Anchor client needed in the browser.

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type SendOptions,
} from "@solana/web3.js"
import { TRANA_GUARD_ID, TRANA_VAULT_ID } from "./devnet"

const POOL_SEED    = Buffer.from("trana-pool")
const DEPOSIT_SEED = Buffer.from("deposit")
const REGISTRY_SEED = Buffer.from("passkey")

export const VAULT_PROGRAM  = new PublicKey(TRANA_VAULT_ID)
export const GUARD_PROGRAM  = new PublicKey(TRANA_GUARD_ID)
export const WITHDRAW_LIMIT = 1_000_000_000n  // 1 SOL in lamports

// ── PDAs ──────────────────────────────────────────────────────────────────────

export function getPoolPda(authority: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [POOL_SEED, authority.toBuffer()],
    VAULT_PROGRAM,
  )
  return pda
}

export function getUserDepositPda(pool: PublicKey, user: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [DEPOSIT_SEED, pool.toBuffer(), user.toBuffer()],
    VAULT_PROGRAM,
  )
  return pda
}

export function getRegistryPda(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [REGISTRY_SEED, owner.toBuffer()],
    GUARD_PROGRAM,
  )
  return pda
}

// ── On-chain reads ─────────────────────────────────────────────────────────────

export interface PoolState {
  lamports: number
  exists:   boolean
}

export async function fetchPoolState(
  connection: Connection,
  poolPda: PublicKey,
): Promise<PoolState> {
  const info = await connection.getAccountInfo(poolPda)
  if (!info) return { lamports: 0, exists: false }
  // Subtract the rent-exempt minimum (Pool account is ~120 bytes)
  const rent = await connection.getMinimumBalanceForRentExemption(info.data.length)
  return { lamports: Math.max(0, info.lamports - rent), exists: true }
}

export interface UserDepositState {
  balance: bigint
  exists:  boolean
}

export async function fetchUserDeposit(
  connection: Connection,
  depositPda: PublicKey,
): Promise<UserDepositState> {
  const info = await connection.getAccountInfo(depositPda)
  if (!info) return { balance: 0n, exists: false }
  // UserDeposit layout: 8 (disc) + 32 (pool) + 32 (user) + 8 (balance) + ...
  if (info.data.length < 80) return { balance: 0n, exists: true }
  const balance = info.data.readBigUInt64LE(8 + 32 + 32)
  return { balance, exists: true }
}

// ── Instructions ───────────────────────────────────────────────────────────────

// sha256("global:deposit")[0..8]
const DEPOSIT_DISC  = Buffer.from([242, 35, 198, 137, 82, 225, 242, 182])
// sha256("global:withdraw")[0..8]
const WITHDRAW_DISC = Buffer.from([183, 18, 70, 156, 148, 109, 161, 34])

export function buildDepositIx(
  pool:      PublicKey,
  userDeposit: PublicKey,
  depositor: PublicKey,
  lamports:  bigint,
): TransactionInstruction {
  const amtBuf = Buffer.alloc(8)
  amtBuf.writeBigUInt64LE(lamports)
  return new TransactionInstruction({
    programId: VAULT_PROGRAM,
    keys: [
      { pubkey: pool,              isSigner: false, isWritable: true  },
      { pubkey: userDeposit,       isSigner: false, isWritable: true  },
      { pubkey: depositor,         isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DEPOSIT_DISC, amtBuf]),
  })
}

export function buildWithdrawIx(
  pool:       PublicKey,
  userDeposit: PublicKey,
  owner:      PublicKey,
  destination: PublicKey,
  registry:   PublicKey,
  lamports:   bigint,
): TransactionInstruction {
  const amtBuf = Buffer.alloc(8)
  amtBuf.writeBigUInt64LE(lamports)
  return new TransactionInstruction({
    programId: VAULT_PROGRAM,
    keys: [
      { pubkey: pool,             isSigner: false, isWritable: true  },
      { pubkey: userDeposit,      isSigner: false, isWritable: true  },
      { pubkey: owner,            isSigner: true,  isWritable: false },
      { pubkey: destination,      isSigner: false, isWritable: true  },
      { pubkey: GUARD_PROGRAM,    isSigner: false, isWritable: false },
      { pubkey: registry,         isSigner: false, isWritable: true  },
      { pubkey: new PublicKey("Sysvar1nstructions1111111111111111111111111"),
                                  isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([WITHDRAW_DISC, amtBuf]),
  })
}

// ── Send helper ────────────────────────────────────────────────────────────────

export type SendTx = (tx: Transaction) => Promise<string>

export async function sendAndConfirm(
  connection: Connection,
  tx:         Transaction,
  feePayer:   PublicKey,
  sendTx:     SendTx,
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
  tx.recentBlockhash = blockhash
  tx.feePayer = feePayer
  const sig = await sendTx(tx)
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
  return sig
}

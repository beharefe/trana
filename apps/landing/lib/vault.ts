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

export const COOLDOWN_SLOTS = 150n   // ~60 s at 400 ms/slot
export const DRAIN_WINDOW_SEC = 60   // seconds

export interface UserDepositState {
  balance:          bigint
  exists:           boolean
  // Limit pool drain-window tracking
  windowWithdrawn:  bigint   // cumulative SOL withdrawn in current window
  lastWithdrawAt:   bigint   // Unix timestamp of last withdrawal (0 = never)
  // Slot of last withdrawal (used for NotBefore unlock on burst)
  lastWithdrawSlot: bigint
}

export async function fetchUserDeposit(
  connection: Connection,
  depositPda: PublicKey,
): Promise<UserDepositState> {
  const empty = { balance: 0n, exists: false, windowWithdrawn: 0n, lastWithdrawAt: 0n, lastWithdrawSlot: 0n }
  const info = await connection.getAccountInfo(depositPda)
  if (!info) return empty
  // UserDeposit layout: 8(disc) + 32(pool) + 32(user) + 8(balance) + 8(last_withdraw_slot) + 8(window_withdrawn) + 8(last_withdraw_at) + 1(bump)
  if (info.data.length < 97) return { ...empty, exists: true }
  const dv = new DataView(info.data.buffer, info.data.byteOffset)
  const balance          = dv.getBigUint64(8 + 32 + 32,      true)
  const lastWithdrawSlot = dv.getBigUint64(8 + 32 + 32 + 8,  true)
  const windowWithdrawn  = dv.getBigUint64(8 + 32 + 32 + 16, true)
  const lastWithdrawAt   = dv.getBigInt64( 8 + 32 + 32 + 24, true)
  return { balance, exists: true, windowWithdrawn, lastWithdrawAt, lastWithdrawSlot }
}

// ── Instructions ───────────────────────────────────────────────────────────────

// sha256("global:deposit")[0..8]
const DEPOSIT_DISC  = Uint8Array.from([242, 35, 198, 137, 82, 225, 242, 182])
// sha256("global:withdraw")[0..8]
const WITHDRAW_DISC = Uint8Array.from([183, 18, 70, 156, 148, 109, 161, 34])

function u64LE(n: bigint): Uint8Array {
  const buf = new Uint8Array(8)
  new DataView(buf.buffer).setBigUint64(0, n, true)
  return buf
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let offset = 0
  for (const p of parts) { out.set(p, offset); offset += p.length }
  return out
}

export function buildDepositIx(
  pool:        PublicKey,
  userDeposit: PublicKey,
  depositor:   PublicKey,
  lamports:    bigint,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: VAULT_PROGRAM,
    keys: [
      { pubkey: pool,                    isSigner: false, isWritable: true  },
      { pubkey: userDeposit,             isSigner: false, isWritable: true  },
      { pubkey: depositor,               isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concat(DEPOSIT_DISC, u64LE(lamports)),
  })
}

export function buildWithdrawIx(
  pool:        PublicKey,
  userDeposit: PublicKey,
  owner:       PublicKey,
  destination: PublicKey,
  registry:    PublicKey,
  lamports:    bigint,
): TransactionInstruction {
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
    data: concat(WITHDRAW_DISC, u64LE(lamports)),
  })
}

// ── Passkey registration ───────────────────────────────────────────────────────

const CONFIG_SEED = Buffer.from("config")

// Config layout: 8 (disc) + 32 (authority) + 32 (treasury) + ...
// Treasury is at offset 40.
export async function fetchTreasury(connection: Connection): Promise<PublicKey> {
  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], GUARD_PROGRAM)
  const info = await connection.getAccountInfo(configPda)
  if (!info) throw new Error("Guard config not initialized")
  return new PublicKey(info.data.slice(40, 72))
}

// sha256("global:register_passkey")[0..8]
const REGISTER_PASSKEY_DISC = Uint8Array.from([16, 2, 121, 116, 194, 17, 247, 233])

function borshBytes(b: Uint8Array): Uint8Array {
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, b.length, true)
  return concat(len, b)
}


export async function buildRegisterPasskeyIx(
  owner:        PublicKey,
  connection:   Connection,
  pubkeyBytes:  Uint8Array,
  credentialId: Uint8Array,
): Promise<TransactionInstruction> {
  const treasury      = await fetchTreasury(connection)
  const [configPda]   = PublicKey.findProgramAddressSync([CONFIG_SEED], GUARD_PROGRAM)
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("passkey"), owner.toBuffer()], GUARD_PROGRAM,
  )
  // KeyKind::Secp256r1Passkey = variant 0 (borsh enum)
  const data = concat(REGISTER_PASSKEY_DISC, Uint8Array.from([0]), borshBytes(pubkeyBytes), borshBytes(credentialId))
  return new TransactionInstruction({
    programId: GUARD_PROGRAM,
    keys: [
      { pubkey: registryPda,             isSigner: false, isWritable: true  },
      { pubkey: owner,                   isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: configPda,               isSigner: false, isWritable: false },
      { pubkey: treasury,                isSigner: false, isWritable: true  },
    ],
    data,
  })
}

// Registry layout: 8 (disc) + 32 (owner) + 8 (nonce) + 4 (vec len) + entries
// PasskeyEntry: 1 (KeyKind) + 4+N (pubkey_bytes) + 4+M (credential_id)
export async function fetchRegistryNonce(connection: Connection, owner: PublicKey): Promise<bigint> {
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("passkey"), owner.toBuffer()], GUARD_PROGRAM,
  )
  const info = await connection.getAccountInfo(registryPda)
  if (!info) return 0n
  return new DataView(info.data.buffer, info.data.byteOffset + 40, 8).getBigUint64(0, true)
}

export type StoredPasskey = { credentialId: Uint8Array; pubkeyBytes: Uint8Array }

// Parse ALL PasskeyEntries from the on-chain registry.
export async function fetchAllPasskeys(connection: Connection, owner: PublicKey): Promise<StoredPasskey[]> {
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("passkey"), owner.toBuffer()], GUARD_PROGRAM,
  )
  const info = await connection.getAccountInfo(registryPda)
  if (!info || info.data.length < 53) return []
  const d      = info.data
  let off      = 8 + 32 + 8  // disc + owner + nonce
  const vecLen = new DataView(d.buffer, d.byteOffset + off, 4).getUint32(0, true); off += 4
  const entries: StoredPasskey[] = []
  for (let i = 0; i < vecLen; i++) {
    off += 1  // KeyKind byte
    const pkLen      = new DataView(d.buffer, d.byteOffset + off, 4).getUint32(0, true); off += 4
    const pubkeyBytes  = d.slice(off, off + pkLen); off += pkLen
    const cidLen     = new DataView(d.buffer, d.byteOffset + off, 4).getUint32(0, true); off += 4
    const credentialId = d.slice(off, off + cidLen); off += cidLen
    entries.push({ pubkeyBytes, credentialId })
  }
  return entries
}

// Parse the first PasskeyEntry from the on-chain registry.
export async function fetchFirstPasskey(connection: Connection, owner: PublicKey): Promise<StoredPasskey | null> {
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("passkey"), owner.toBuffer()], GUARD_PROGRAM,
  )
  const info = await connection.getAccountInfo(registryPda)
  if (!info || info.data.length < 53) return null
  const d   = info.data
  let off   = 8 + 32 + 8 + 4 // disc + owner + nonce + vec_len
  off      += 1               // KeyKind byte
  const pkLen  = new DataView(d.buffer, d.byteOffset + off, 4).getUint32(0, true); off += 4
  const pubkeyBytes  = d.slice(off, off + pkLen); off += pkLen
  const cidLen = new DataView(d.buffer, d.byteOffset + off, 4).getUint32(0, true); off += 4
  const credentialId = d.slice(off, off + cidLen)
  return { pubkeyBytes, credentialId }
}

const LS_KEY = (owner: string) => `trana:passkey:${owner}`

export function savePasskeyToStorage(owner: PublicKey, passkey: StoredPasskey) {
  try {
    localStorage.setItem(LS_KEY(owner.toBase58()), JSON.stringify({
      credentialId: Array.from(passkey.credentialId),
      pubkeyBytes:  Array.from(passkey.pubkeyBytes),
    }))
  } catch {}
}

export function loadPasskeyFromStorage(owner: PublicKey): StoredPasskey | null {
  try {
    const raw = localStorage.getItem(LS_KEY(owner.toBase58()))
    if (!raw) return null
    const { credentialId, pubkeyBytes } = JSON.parse(raw)
    return { credentialId: Uint8Array.from(credentialId), pubkeyBytes: Uint8Array.from(pubkeyBytes) }
  } catch { return null }
}

// sha256("global:add_passkey")[0..8]
const ADD_PASSKEY_DISC = Uint8Array.from([173, 230, 84, 153, 54, 144, 214, 37])

export async function buildAddPasskeyIx(
  owner:        PublicKey,
  connection:   Connection,
  pubkeyBytes:  Uint8Array,
  credentialId: Uint8Array,
): Promise<TransactionInstruction> {
  const treasury    = await fetchTreasury(connection)
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], GUARD_PROGRAM)
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("passkey"), owner.toBuffer()], GUARD_PROGRAM,
  )
  const SYSVAR_IX = new PublicKey("Sysvar1nstructions1111111111111111111111111")
  const data = concat(ADD_PASSKEY_DISC, Uint8Array.from([0]), borshBytes(pubkeyBytes), borshBytes(credentialId))
  return new TransactionInstruction({
    programId: GUARD_PROGRAM,
    keys: [
      { pubkey: registryPda,             isSigner: false, isWritable: true  },
      { pubkey: owner,                   isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: configPda,               isSigner: false, isWritable: false },
      { pubkey: treasury,                isSigner: false, isWritable: true  },
      { pubkey: SYSVAR_IX,               isSigner: false, isWritable: false },
    ],
    data,
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

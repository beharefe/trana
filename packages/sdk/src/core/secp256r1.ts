// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * secp256r1 precompile utilities (SIMD-0075).
 *
 * The Solana secp256r1 native precompile verifies P-256/ES256 signatures.
 * Live on mainnet since Agave v2.1 (February 2025).
 *
 * Trust model:
 *   - The on-chain registry PDA stores the P-256 public key
 *   - The secp256r1 precompile verifies the signature cryptographically
 *   - No off-chain server holds or mediates any authorization secret
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js"
import { sha256Bytes } from "./sha256"

export const SECP256R1_PROGRAM_ID = new PublicKey(
  "Secp256r1SigVerify1111111111111111111111111"
)

// ── Instruction builder ───────────────────────────────────────────────────────

/**
 * Build a secp256r1 verify instruction for a single P-256 signature.
 *
 * Instruction data layout (SIMD-0075):
 *   [count:u8][padding:u8]
 *   [Secp256r1SignatureOffsets × 14 bytes]
 *   [pubkey:33][sig:64][message:N]
 *
 * Secp256r1SignatureOffsets (7 × u16 LE = 14 bytes):
 *   signature_offset             byte offset of sig within instruction data
 *   signature_instruction_index  0xFFFF = "this instruction"
 *   public_key_offset            byte offset of pubkey
 *   public_key_instruction_index 0xFFFF = "this instruction"
 *   message_data_offset          byte offset of message
 *   message_data_size            message byte length
 *   message_instruction_index    0xFFFF = "this instruction"
 *
 * @param pubkey   33-byte compressed P-256 public key from the registry PDA
 * @param sig      64-byte compact (r‖s) low-S normalized signature
 * @param message  authenticatorData ‖ SHA-256(clientDataJSON) — precompile hashes with SHA-256 internally
 */
export function buildSecp256r1Ix(
  pubkey:  Uint8Array,
  sig:     Uint8Array,
  message: Uint8Array,
): TransactionInstruction {
  const pubkeyOff = 16
  const sigOff    = 49
  const msgOff    = 113

  const data = Buffer.allocUnsafe(msgOff + message.length)
  const dv   = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let i = 0

  data[i++] = 1     // count = 1 signature
  data[i++] = 0     // padding

  dv.setUint16(i, sigOff,         true); i += 2
  dv.setUint16(i, 0xffff,         true); i += 2
  dv.setUint16(i, pubkeyOff,      true); i += 2
  dv.setUint16(i, 0xffff,         true); i += 2
  dv.setUint16(i, msgOff,         true); i += 2
  dv.setUint16(i, message.length, true); i += 2
  dv.setUint16(i, 0xffff,         true); i += 2

  data.set(pubkey,  pubkeyOff)
  data.set(sig,     sigOff)
  data.set(message, msgOff)

  return new TransactionInstruction({ programId: SECP256R1_PROGRAM_ID, keys: [], data })
}

// ── WebAuthn message construction ─────────────────────────────────────────────

/**
 * Build the message bytes for a secp256r1 instruction from WebAuthn assertion data.
 *
 * The Solana secp256r1 precompile hashes the message with SHA-256 internally,
 * so we pass the pre-hash data: authenticatorData ‖ SHA-256(clientDataJSON).
 *
 * The precompile computes SHA-256(authenticatorData ‖ SHA-256(clientDataJSON))
 * producing the ECDSA e-value — the same value the browser authenticator signed.
 *
 * @returns Raw bytes (authenticatorData.length + 32) — do NOT pre-hash.
 */
export function buildWebAuthnMessage(
  authenticatorData: Uint8Array,
  clientDataJSON:    Uint8Array,
): Uint8Array {
  const clientDataHash = sha256Bytes(clientDataJSON)
  const combined       = new Uint8Array(authenticatorData.length + 32)
  combined.set(authenticatorData, 0)
  combined.set(clientDataHash, authenticatorData.length)
  return combined
}

// ── record_proof instruction builder ─────────────────────────────────────────

/**
 * Build the `trana_guard::record_proof` data-carrier instruction.
 *
 * This instruction carries the WebAuthn proof bytes in the Solana Instructions
 * sysvar so `enforce()` can read and verify them without re-deriving from a CPI.
 *
 * Transaction shape expected by `enforce()`:
 *   ix[N-2]: secp256r1 precompile  (native P-256 sig verify)
 *   ix[N-1]: trana_guard::record_proof  ← this instruction
 *   ix[N]:   protected instruction (calls trana_guard::cpi::enforce internally)
 *
 * Payload layout (after 8-byte Anchor discriminator):
 *   version            u8   = 1
 *   expiry             i64 LE
 *   policy             u32-LE length + UTF-8 bytes  (Borsh string)
 *   authenticator_data u32-LE length + bytes        (Borsh Vec<u8>)
 *   client_data_json   u32-LE length + bytes
 */
export function buildRecordProofIx(
  tranaGuardProgramId: PublicKey,
  authenticatorData:   Uint8Array,
  clientDataJSON:      Uint8Array,
  expiryUnix:          number,
  policy:              string,
): TransactionInstruction {
  const disc = Buffer.from(sha256Bytes(Buffer.from("global:record_proof"))).slice(0, 8)

  const u32le      = (n: number) => { const b = Buffer.allocUnsafe(4); new DataView(b.buffer, b.byteOffset, 4).setUint32(0, n, true); return b }
  const borshStr   = (s: string)     => { const b = Buffer.from(s, "utf8");  return Buffer.concat([u32le(b.length),           b]) }
  const borshBytes = (b: Uint8Array) => Buffer.concat([u32le(b.length), Buffer.from(b)])

  const expiryBuf = Buffer.allocUnsafe(8)
  new DataView(expiryBuf.buffer, expiryBuf.byteOffset, 8).setBigInt64(0, BigInt(expiryUnix), true)

  const data = Buffer.concat([
    disc,
    Buffer.from([1]),      // version u8 = 1
    expiryBuf,
    borshStr(policy),
    borshBytes(authenticatorData),
    borshBytes(clientDataJSON),
  ])

  const SYSVAR_INSTRUCTIONS = new PublicKey("Sysvar1nstructions1111111111111111111111111")

  return new TransactionInstruction({
    programId: tranaGuardProgramId,
    keys:      [{ pubkey: SYSVAR_INSTRUCTIONS, isSigner: false, isWritable: false }],
    data,
  })
}

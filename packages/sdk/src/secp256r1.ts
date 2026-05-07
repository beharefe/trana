/**
 * secp256r1 precompile utilities (SIMD-0075).
 *
 * The secp256r1 precompile verifies P-256 (ES256) signatures natively on Solana.
 * Live on mainnet since Agave v2.1 (February 2025).
 *
 * Trust anchors:
 *   - onchain registry PDA stores the P-256 public key
 *   - secp256r1 precompile verifies the signature cryptographically
 *   - no offchain server holds authorization secrets
 */

import { PublicKey, TransactionInstruction } from "@solana/web3.js"
import { sha256Bytes } from "./utils"

// ── Program ID ────────────────────────────────────────────────────────────────

export const SECP256R1_PROGRAM_ID = new PublicKey(
  "Secp256r1SigVerify1111111111111111111111111"
)

// ── Instruction builder ───────────────────────────────────────────────────────

/**
 * Build a secp256r1 verify instruction for a single P-256 signature.
 *
 * Instruction data layout (SIMD-0075):
 *   [count:u8][padding:u8][Secp256r1SignatureOffsets×14bytes][pubkey:33][sig:64][message:N]
 *
 * Secp256r1SignatureOffsets (7 × u16 LE = 14 bytes):
 *   signature_offset             — byte offset of sig in this instruction's data
 *   signature_instruction_index  — 0xFFFF = this instruction
 *   public_key_offset            — byte offset of pubkey
 *   public_key_instruction_index — 0xFFFF = this instruction
 *   message_data_offset          — byte offset of message
 *   message_data_size            — byte length of message
 *   message_instruction_index    — 0xFFFF = this instruction
 *
 * @param pubkey   33-byte compressed P-256 public key (from registry PDA)
 * @param sig      64-byte compact (r‖s) low-S normalized signature
 * @param message  authenticatorData ‖ SHA-256(clientDataJSON) — raw bytes, precompile hashes with SHA-256 internally
 */
export function buildSecp256r1Ix(
  pubkey:  Uint8Array,
  sig:     Uint8Array,
  message: Uint8Array
): TransactionInstruction {
  // Byte offsets within instruction data:
  //   0–1:   count + padding
  //   2–15:  offsets struct (14 bytes)
  //   16–48: pubkey (33 bytes)
  //   49–112: sig (64 bytes)
  //   113+:  message
  const pubkeyOff = 16
  const sigOff    = 49
  const msgOff    = 113

  const data = Buffer.allocUnsafe(msgOff + message.length)
  const dv   = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let i = 0

  // Header
  data[i++] = 1   // count = 1 signature
  data[i++] = 0   // padding

  // Secp256r1SignatureOffsets — 7 fields × 2 bytes LE = 14 bytes
  dv.setUint16(i, sigOff,          true); i += 2  // signature_offset
  dv.setUint16(i, 0xffff,          true); i += 2  // signature_instruction_index (self)
  dv.setUint16(i, pubkeyOff,       true); i += 2  // public_key_offset
  dv.setUint16(i, 0xffff,          true); i += 2  // public_key_instruction_index (self)
  dv.setUint16(i, msgOff,          true); i += 2  // message_data_offset
  dv.setUint16(i, message.length,  true); i += 2  // message_data_size
  dv.setUint16(i, 0xffff,          true); i += 2  // message_instruction_index (self)

  // Payload data (must match offsets above)
  data.set(pubkey,  pubkeyOff)
  data.set(sig,     sigOff)
  data.set(message, msgOff)

  return new TransactionInstruction({
    programId: SECP256R1_PROGRAM_ID,
    keys:      [],
    data,
  })
}

// ── WebAuthn message construction ─────────────────────────────────────────────

/**
 * Build the raw message bytes for a WebAuthn assertion secp256r1 instruction.
 *
 * The Solana secp256r1 precompile hashes the message field with SHA-256
 * internally before ECDSA verification. So we pass the raw pre-hash data:
 *   authenticatorData ‖ SHA-256(clientDataJSON)
 *
 * The precompile computes SHA-256(authenticatorData ‖ SHA-256(clientDataJSON))
 * to produce the ECDSA e-value, which is what the browser authenticator signed.
 *
 * This is consistent with noble/curves p256.sign() in tests, which also
 * applies SHA-256 to its msg argument before signing.
 */
export function buildWebAuthnMessage(
  authenticatorData: Uint8Array,
  clientDataJSON:    Uint8Array
): Uint8Array {
  const clientDataHash = sha256Bytes(clientDataJSON)
  const combined = new Uint8Array(authenticatorData.length + 32)
  combined.set(authenticatorData, 0)
  combined.set(clientDataHash, authenticatorData.length)
  return combined  // raw 69 bytes — precompile hashes internally
}

// ── record_proof instruction builder ─────────────────────────────────────────

/**
 * Build the `trana::record_proof` data-carrier instruction.
 *
 * The SDK inserts this (and a secp256r1 ix) automatically before the protected
 * instruction so protocol programs never need to handle proof data directly.
 *
 * Transaction shape Trana Guard expects:
 *   ix[N-2]: secp256r1 precompile  (native P-256 sig verify)
 *   ix[N-1]: trana::record_proof   (this instruction, data carrier)
 *   ix[N]:   protected instruction (typically ends with trana::cpi::enforce)
 *
 * Payload layout (after 8-byte Anchor discriminator):
 *   version            u8
 *   expiry             i64 LE (Borsh)
 *   policy             u32-LE length + UTF-8 bytes
 *   authenticator_data u32-LE length + bytes (Borsh Vec<u8>)
 *   client_data_json   u32-LE length + bytes
 */
export function buildRecordProofIx(
  tranaGuardProgramId: PublicKey,
  authenticatorData: Uint8Array,
  clientDataJSON:    Uint8Array,
  expiryUnix:        number,
  policy:            string,
): TransactionInstruction {
  // Anchor discriminator = SHA-256("global:record_proof")[0..8]
  const disc = Buffer.from(sha256Bytes(Buffer.from("global:record_proof"))).slice(0, 8)

  const u32le = (n: number) => { const b = Buffer.allocUnsafe(4); new DataView(b.buffer, b.byteOffset, 4).setUint32(0, n, true); return b }
  const borshStr   = (s: string)     => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u32le(b.length), b]) }
  const borshBytes = (b: Uint8Array) => Buffer.concat([u32le(b.length), Buffer.from(b)])

  const expiryBuf = Buffer.allocUnsafe(8)
  new DataView(expiryBuf.buffer, expiryBuf.byteOffset, 8).setBigInt64(0, BigInt(expiryUnix), true)

  const data = Buffer.concat([
    disc,
    Buffer.from([1]),          // version u8 = 1
    expiryBuf,                 // i64 LE
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

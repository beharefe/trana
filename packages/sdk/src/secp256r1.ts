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
 * @param message  authenticatorData ‖ SHA-256(clientDataJSON)
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
  let i = 0

  // Header
  data[i++] = 1   // count = 1 signature
  data[i++] = 0   // padding

  // Secp256r1SignatureOffsets — 7 fields × 2 bytes LE = 14 bytes
  data.writeUInt16LE(sigOff,          i); i += 2  // signature_offset
  data.writeUInt16LE(0xffff,          i); i += 2  // signature_instruction_index (self)
  data.writeUInt16LE(pubkeyOff,       i); i += 2  // public_key_offset
  data.writeUInt16LE(0xffff,          i); i += 2  // public_key_instruction_index (self)
  data.writeUInt16LE(msgOff,          i); i += 2  // message_data_offset
  data.writeUInt16LE(message.length,  i); i += 2  // message_data_size
  data.writeUInt16LE(0xffff,          i); i += 2  // message_instruction_index (self)

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
 * Compute the ECDSA e-value (32-byte prehash) for a WebAuthn assertion.
 *
 * The secp256r1 precompile uses verify_prehash — the message field must be
 * the 32-byte ECDSA e-value, NOT raw bytes. This matches how noble/curves
 * p256.sign() works: it treats the `msg` parameter as the prehash directly.
 *
 * WebAuthn e-value = SHA-256(authenticatorData ‖ SHA-256(clientDataJSON))
 *
 * This is:
 *   - What a real browser authenticator produces internally before signing
 *   - What noble/curves p256.sign() in tests should receive as its msg argument
 *   - What the secp256r1 instruction's message field must contain (32 bytes)
 *
 * Do NOT pass the raw concatenation — the precompile does not hash internally.
 */
export function buildWebAuthnMessage(
  authenticatorData: Uint8Array,
  clientDataJSON:    Uint8Array
): Uint8Array {
  const clientDataHash = sha256Bytes(clientDataJSON)
  const combined = new Uint8Array(authenticatorData.length + 32)
  combined.set(authenticatorData, 0)
  combined.set(clientDataHash, authenticatorData.length)
  return sha256Bytes(combined)  // 32-byte e-value
}

// ── record_proof instruction builder ─────────────────────────────────────────

/**
 * Build the `guard::record_proof` data-carrier instruction.
 *
 * The SDK inserts this (and a secp256r1 ix) automatically before the protected
 * instruction so protocol programs never need to handle proof data directly.
 *
 * Transaction shape the guard expects:
 *   ix[N-2]: secp256r1 precompile  (native P-256 sig verify)
 *   ix[N-1]: guard::record_proof   (this instruction, data carrier)
 *   ix[N]:   protected instruction (calls enforce() or is registry_vault_withdraw)
 *
 * Payload layout (after 8-byte Anchor discriminator):
 *   version            u8
 *   expiry             i64 LE (Borsh)
 *   cluster            u32-LE length + UTF-8 bytes (Borsh String)
 *   policy             u32-LE length + UTF-8 bytes
 *   authenticator_data u32-LE length + bytes (Borsh Vec<u8>)
 *   client_data_json   u32-LE length + bytes
 */
export function buildRecordProofIx(
  guardProgramId:    PublicKey,
  authenticatorData: Uint8Array,
  clientDataJSON:    Uint8Array,
  expiryUnix:        number,
  cluster:           string,
  policy:            string,
): TransactionInstruction {
  // Anchor discriminator = SHA-256("global:record_proof")[0..8]
  const disc = Buffer.from(sha256Bytes(Buffer.from("global:record_proof"))).slice(0, 8)

  const u32le = (n: number) => { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n); return b }
  const borshStr   = (s: string)     => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u32le(b.length), b]) }
  const borshBytes = (b: Uint8Array) => Buffer.concat([u32le(b.length), Buffer.from(b)])

  const expiryBuf = Buffer.allocUnsafe(8)
  expiryBuf.writeBigInt64LE(BigInt(expiryUnix))

  const data = Buffer.concat([
    disc,
    Buffer.from([1]),          // version u8 = 1
    expiryBuf,                 // i64 LE
    borshStr(cluster),
    borshStr(policy),
    borshBytes(authenticatorData),
    borshBytes(clientDataJSON),
  ])

  const SYSVAR_INSTRUCTIONS = new PublicKey("Sysvar1nstructions1111111111111111111111111")

  return new TransactionInstruction({
    programId: guardProgramId,
    keys:      [{ pubkey: SYSVAR_INSTRUCTIONS, isSigner: false, isWritable: false }],
    data,
  })
}

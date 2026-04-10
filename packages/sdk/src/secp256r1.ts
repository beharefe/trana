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
 * Construct the exact message the WebAuthn authenticator signed.
 *
 * Authenticators sign: authenticatorData ‖ SHA-256(clientDataJSON)
 * The clientDataJSON embeds the challenge (= intent hash) as base64url.
 * This concatenation is what the secp256r1 precompile verifies.
 *
 * Onchain the program reconstructs the same message from the
 * authenticatorData and clientDataJSON it receives via the instruction.
 */
export function buildWebAuthnMessage(
  authenticatorData: Uint8Array,
  clientDataJSON:    Uint8Array
): Uint8Array {
  const clientDataHash = sha256Bytes(clientDataJSON)
  const msg = new Uint8Array(authenticatorData.length + 32)
  msg.set(authenticatorData, 0)
  msg.set(clientDataHash, authenticatorData.length)
  return msg
}

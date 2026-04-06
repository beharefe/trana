import { TransactionInstruction, PublicKey } from "@solana/web3.js"

/**
 * secp256r1 precompile program ID on Solana.
 * Verifies P-256 / secp256r1 signatures natively.
 */
export const SECP256R1_PROGRAM_ID = new PublicKey(
  "Secp256r1SigVerify1111111111111111111111111"
)

/**
 * Build a secp256r1 precompile verify instruction.
 *
 * This must be instruction index 0 in the transaction.
 * The Trana guard reads this instruction from the Instructions sysvar.
 *
 * Instruction data layout:
 *   [0]      num_signatures = 1
 *   [1]      padding = 0  (required — same layout as Ed25519 precompile)
 *   [2..4]   sig_offset   (u16 LE)
 *   [4..6]   sig_ix_idx   = 0xffff (same instruction)
 *   [6..8]   pk_offset    (u16 LE)
 *   [8..10]  pk_ix_idx    = 0xffff
 *   [10..12] msg_offset   (u16 LE)
 *   [12..14] msg_size     (u16 LE)
 *   [14..16] msg_ix_idx   = 0xffff
 *   [16..]   pubkey (33 bytes compressed) | signature (64 bytes compact) | message
 *
 * @param pubkey  33-byte compressed P-256 public key (SEC1)
 * @param sig     64-byte compact P-256 signature (r ‖ s)
 * @param message The exact bytes the private key signed (e.g. payloadHash)
 */
export function buildSecp256r1Ix(
  pubkey:  Uint8Array,
  sig:     Uint8Array,
  message: Uint8Array
): TransactionInstruction {
  if (pubkey.length !== 33) throw new Error(`pubkey must be 33 bytes, got ${pubkey.length}`)
  if (sig.length    !== 64) throw new Error(`sig must be 64 bytes, got ${sig.length}`)

  const HEADER    = 16           // count(1) + padding(1) + offsets(14)
  const pkOffset  = HEADER       // 16
  const sigOffset = HEADER + 33  // 49
  const msgOffset = HEADER + 33 + 64  // 113

  const data = Buffer.alloc(msgOffset + message.length)
  data[0] = 1       // num_signatures
  data[1] = 0       // padding (required)
  data.writeUInt16LE(sigOffset,      2)   // sig_offset
  data.writeUInt16LE(0xffff,         4)   // sig_ix_idx  (same ix)
  data.writeUInt16LE(pkOffset,       6)   // pk_offset
  data.writeUInt16LE(0xffff,         8)   // pk_ix_idx   (same ix)
  data.writeUInt16LE(msgOffset,      10)  // msg_offset
  data.writeUInt16LE(message.length, 12)  // msg_size
  data.writeUInt16LE(0xffff,         14)  // msg_ix_idx  (same ix)

  Buffer.from(pubkey).copy(data, pkOffset)
  Buffer.from(sig).copy(data, sigOffset)
  Buffer.from(message).copy(data, msgOffset)

  return new TransactionInstruction({
    keys:      [],
    programId: SECP256R1_PROGRAM_ID,
    data,
  })
}

/**
 * Compute the canonical Trana payload hash.
 *
 * This is the hash that the passkey signs and the onchain program verifies.
 * Key order is fixed — changing it breaks onchain verification.
 *
 * @param domain     "trana.solana" (domain separator)
 * @param userPubkey base58 user/authority wallet pubkey
 * @param programId  base58 calling program ID
 * @param policy     policy type string (e.g. "AdminAction")
 * @param nonce      monotonic nonce from calling program state
 * @param expiry     unix timestamp
 */
export function computePayloadHash(
  domain:     string,
  userPubkey: string,
  programId:  string,
  policy:     string,
  nonce:      number,
  expiry:     number
): Uint8Array {
  const json = JSON.stringify({ domain, userPubkey, programId, policy, nonce, expiry })
  return sha256Bytes(new TextEncoder().encode(json))
}

/**
 * Build the WebAuthn signing message for the secp256r1 precompile.
 *
 * WebAuthn authenticators sign: `authenticatorData || SHA256(clientDataJSON)`.
 * This is the message that must be passed to `buildSecp256r1Ix` when using
 * a real passkey, and the same message the onchain program reconstructs to
 * verify the proof.
 *
 * @param authenticatorData raw authenticatorData bytes from WebAuthn assertion
 * @param clientDataJSON    raw clientDataJSON bytes from WebAuthn assertion
 */
export function buildWebAuthnMessage(
  authenticatorData: Uint8Array,
  clientDataJSON:    Uint8Array
): Uint8Array {
  const clientDataHash = sha256Bytes(clientDataJSON)
  const message = new Uint8Array(authenticatorData.length + 32)
  message.set(authenticatorData, 0)
  message.set(clientDataHash, authenticatorData.length)
  return message
}

function sha256Bytes(data: Uint8Array): Uint8Array {
  if (typeof process !== "undefined" && process.versions?.node) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createHash } = require("crypto") as typeof import("crypto")
    return new Uint8Array(createHash("sha256").update(data).digest())
  }
  throw new Error("sha256 requires Node.js crypto — use utils.sha256 in browser")
}

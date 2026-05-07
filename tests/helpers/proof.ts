import { p256 } from "@noble/curves/nist"
import { PublicKey, TransactionInstruction } from "@solana/web3.js"
import { buildSecp256r1Ix, buildRecordProofIx } from "../../packages/sdk/src/secp256r1"
import { buildIntent, hashIntent, intentFromInstruction } from "../../packages/sdk/src/react/intent"
import { sha256Bytes } from "../../packages/sdk/src/utils"
import type { TestPasskeyHandle } from "../../packages/sdk/src/testing"

export type { TestPasskeyHandle }

export type ProofInstructions = {
  secp256r1Ix:    TransactionInstruction
  recordProofIx:  TransactionInstruction
  authData:       Uint8Array
  clientDataJSON: Uint8Array
  combined:       Uint8Array
}

/**
 * Build secp256r1 + record_proof instructions for a protected instruction.
 *
 * Transaction layout expected by enforce():
 *   ix[N-2]: secp256r1 precompile  (returned as secp256r1Ix)
 *   ix[N-1]: record_proof          (returned as recordProofIx)
 *   ix[N]:   protected instruction
 */
export function buildProofInstructions(
  handle:          TestPasskeyHandle,
  protectedIx:     TransactionInstruction,
  programId:       PublicKey,
  ownerPubkey:     PublicKey,
  nonce:           bigint,
  policyId:        string,
  rpId            = "localhost",
  overridePolicy?:  string,
  overrideExpiry?:  number,
): ProofInstructions {
  const input  = intentFromInstruction(protectedIx)
  const intent = buildIntent(ownerPubkey, programId, input, nonce, {
    policy:  policyId,
    expiryTtlSec: overrideExpiry !== undefined ? overrideExpiry - Math.floor(Date.now() / 1000) : 300,
  })

  const expiryUnix = overrideExpiry ?? intent.expiryUnix
  const policy     = overridePolicy  ?? intent.policyId

  const challenge      = hashIntent({ ...intent, expiryUnix, policyId: overridePolicy ?? intent.policyId })
  const rpIdHash       = sha256Bytes(new TextEncoder().encode(rpId))
  const authData       = new Uint8Array(37)
  authData.set(rpIdHash, 0)
  authData[32]         = 0x05  // UP + UV flags

  const clientDataJSON = new TextEncoder().encode(JSON.stringify({
    type:        "webauthn.get",
    challenge:   Buffer.from(challenge).toString("base64url"),
    origin:      `http://${rpId}`,
    crossOrigin: false,
  }))

  const clientDataHash = sha256Bytes(clientDataJSON)
  const combined       = new Uint8Array(authData.length + 32)
  combined.set(authData, 0)
  combined.set(clientDataHash, authData.length)

  const sig = p256.sign(combined, handle.privKey)

  return {
    secp256r1Ix:    buildSecp256r1Ix(handle.pubkey, sig, combined),
    // record_proof always goes to the real trana program; `programId` only
    // affects the intent hash that the passkey signed (used in wrong-program tests).
    recordProofIx:  buildRecordProofIx(protectedIx.programId, authData, clientDataJSON, expiryUnix, policy),
    authData,
    clientDataJSON,
    combined,
  }
}

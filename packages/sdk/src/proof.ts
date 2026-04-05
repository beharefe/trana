import { Transaction, Ed25519Program } from "@solana/web3.js"
import type { PasskeyProof } from "./types"

/**
 * Prepend an Ed25519 signature verify instruction to the transaction.
 *
 * The Anchor program reads the instruction at index 0 from the instructions
 * sysvar and validates:
 *   - signer == config.server_key
 *   - message == sha256(ProofPayload)
 *   - not expired
 *
 * This instruction MUST be at index 0.
 */
export function attachProof(tx: Transaction, proof: PasskeyProof): Transaction {
  const verifyIx = Ed25519Program.createInstructionWithPublicKey({
    publicKey: proof.serverPubkey,
    message: proof.payloadHash,
    signature: proof.signature,
  })

  tx.instructions = [verifyIx, ...tx.instructions]
  return tx
}

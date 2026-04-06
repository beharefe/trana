import { Transaction, Ed25519Program } from "@solana/web3.js"
import type { PrepareTransactionArgs, TranaPayload, PasskeyProof, Ed25519BridgeProof } from "./types"
import { isSecp256r1Proof } from "./types"
import { buildSecp256r1Ix } from "./secp256r1"
import { generateNonce } from "./utils"

/**
 * High-level API: prepare a protected transaction.
 *
 * 1. Evaluates policy (always enforces when called — the caller decides when)
 * 2. Builds the canonical payload and calls approve() for the passkey signature
 * 3. Prepends the proof instruction at index 0
 * 4. Returns the modified transaction ready to be signed and sent
 *
 * @example
 * ```typescript
 * const protectedTx = await prepareTransaction({
 *   connection,
 *   walletPubkey: wallet.publicKey,
 *   transaction: myTx,
 *   policy: { type: "AdminAction" },
 *   registryPda,
 *   approve: (payload) => redirectApprove(payload, "https://trana.network"),
 * })
 * const signed = await wallet.signTransaction(protectedTx)
 * await sendAndConfirmTransaction(connection, signed, [])
 * ```
 */
export async function prepareTransaction({
  walletPubkey,
  transaction,
  policy,
  approve,
}: PrepareTransactionArgs): Promise<Transaction> {
  const expiry  = Math.floor(Date.now() / 1000) + 300  // 5 min
  const nonce   = Date.now()  // caller should pass a real monotonic nonce

  const payload: TranaPayload = {
    domain:     "trana.solana",
    userPubkey: walletPubkey.toBase58(),
    programId:  transaction.instructions[0]?.programId.toBase58() ?? "",
    policy:     policy.type,
    nonce,
    expiry,
  }

  const proof = await approve(payload)
  return attachProofToTransaction(transaction, proof)
}

/**
 * Attach a proof to a transaction, prepending the verify instruction at index 0.
 * Works with both secp256r1 and Ed25519 (bridge) proofs.
 */
export function attachProofToTransaction(
  tx:    Transaction,
  proof: PasskeyProof
): Transaction {
  const proofIx = isSecp256r1Proof(proof)
    ? buildSecp256r1Ix(proof.publicKey, proof.signature, proof.payloadHash)
    : buildEd25519Ix(proof as Ed25519BridgeProof)

  tx.instructions = [proofIx, ...tx.instructions]
  return tx
}

function buildEd25519Ix(proof: Ed25519BridgeProof): ReturnType<typeof Ed25519Program.createInstructionWithPublicKey> {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey:  proof.serverPubkey,
    message:    proof.payloadHash,
    signature:  proof.signature,
  })
}

/**
 * Redirect-based approve flow.
 *
 * Navigates the user to the Trana helper app to complete the WebAuthn ceremony,
 * then redirects back with the proof. The helper never holds secrets — it only
 * runs the WebAuthn ceremony and returns the raw P-256 signature.
 *
 * @param payload   The canonical payload to be signed
 * @param helperUrl Base URL of the Trana helper (e.g. "https://trana.network")
 * @param redirectUrl Where to redirect after approval (defaults to current page)
 */
export function buildApproveRedirectUrl(
  payload:     TranaPayload,
  helperUrl:   string,
  redirectUrl?: string
): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const redirect = redirectUrl ?? (typeof window !== "undefined" ? window.location.href : "")
  return `${helperUrl}/approve?payload=${encoded}&redirect=${encodeURIComponent(redirect)}`
}

/**
 * Parse a Secp256r1Proof returned via URL params after a redirect-based approval.
 * Call this on your callback page after returning from the Trana helper.
 */
export function parseApproveRedirectResult(
  searchParams: URLSearchParams
): Secp256r1ProofResult | null {
  const sig = searchParams.get("sig")
  const pub = searchParams.get("pub")
  const hash = searchParams.get("hash")
  if (!sig || !pub || !hash) return null
  return {
    signature:   Buffer.from(sig,  "base64url"),
    publicKey:   Buffer.from(pub,  "base64url"),
    payloadHash: Buffer.from(hash, "base64url"),
  }
}

interface Secp256r1ProofResult {
  signature:   Uint8Array
  publicKey:   Uint8Array
  payloadHash: Uint8Array
}

export { generateNonce }

import { startAuthentication, startRegistration } from "@simplewebauthn/browser"
import type { ProofPayload, PasskeyProof } from "./types"
import { sha256 } from "./utils"
import {
  fetchRegistrationOptions,
  verifyRegistration,
  fetchApprovalOptions,
  verifyApproval,
} from "./client"
import bs58 from "bs58"

/**
 * Register a passkey for the given wallet.
 *
 * Flow:
 *   1. Fetch registration options from /api/register/options
 *   2. Browser WebAuthn registration ceremony
 *   3. Send credential to /api/register/verify
 *
 * Note: the chain is never involved. Registration is fully offchain.
 */
export async function startPasskeyRegistration(
  wallet: string,
  serverUrl: string
): Promise<void> {
  const optionsJSON = await fetchRegistrationOptions(wallet, serverUrl)
  const response = await startRegistration({ optionsJSON: optionsJSON as Parameters<typeof startRegistration>[0]["optionsJSON"] })
  await verifyRegistration(wallet, response, serverUrl)
}

/**
 * Obtain a bridge-signed proof for the given payload.
 *
 * Flow:
 *   1. Compute sha256(canonical ProofPayload JSON) → payloadHash
 *   2. Fetch authentication options from /api/approve/options (challenge = payloadHash)
 *   3. Browser WebAuthn assertion ceremony
 *   4. Send assertion + payload to /api/approve/verify
 *   5. Bridge returns Ed25519 signature over payloadHash
 *
 * Trust model: passkey proves to bridge → bridge proves to chain.
 */
export async function getPasskeyProof(
  payload: ProofPayload,
  serverUrl: string
): Promise<PasskeyProof> {
  const payloadHash = sha256(canonicalJson(payload))

  const payloadHashHex = Buffer.from(payloadHash).toString("hex")
  const optionsJSON = await fetchApprovalOptions(
    payload.programId,
    payloadHashHex,
    serverUrl
  )

  const assertion = await startAuthentication({
    optionsJSON: optionsJSON as Parameters<typeof startAuthentication>[0]["optionsJSON"],
  })

  const { signature, serverPubkey } = await verifyApproval(
    assertion,
    payload,
    serverUrl
  )

  return {
    signature: Buffer.from(signature, "base64"),
    serverPubkey: bs58.decode(serverPubkey),
    payloadHash,
  }
}

/**
 * Produce the canonical JSON representation of a ProofPayload.
 * Key order is fixed — must match what the Anchor program hashes onchain.
 */
export function canonicalJson(payload: ProofPayload): string {
  return JSON.stringify({
    programId: payload.programId,
    instruction: payload.instruction,
    amount: payload.amount,
    nonce: payload.nonce,
    expiry: payload.expiry,
  })
}

import { startAuthentication, startRegistration } from "@simplewebauthn/browser"
import type { ProofPayload, VaultProofPayload, PasskeyProof } from "./types"
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
 * Registration is fully offchain — the chain is never involved.
 * No passkey details are stored onchain.
 */
export async function startPasskeyRegistration(
  wallet: string,
  serverUrl: string
): Promise<void> {
  const optionsJSON = await fetchRegistrationOptions(wallet, serverUrl)
  const response = await startRegistration({
    optionsJSON: optionsJSON as Parameters<typeof startRegistration>[0]["optionsJSON"],
  })
  await verifyRegistration(wallet, response, serverUrl)
}

/**
 * Obtain a bridge-signed proof for a `protected_transfer` payload.
 *
 * Trust model: passkey → bridge → chain.
 * The bridge verifies the WebAuthn assertion, then signs sha256(payload).
 */
export async function getPasskeyProof(
  payload: ProofPayload,
  serverUrl: string
): Promise<PasskeyProof> {
  return _getProof(canonicalJson(payload), serverUrl)
}

/**
 * Obtain a bridge-signed proof for a `vault_withdraw` payload.
 */
export async function getVaultProof(
  payload: VaultProofPayload,
  serverUrl: string
): Promise<PasskeyProof> {
  return _getProof(canonicalVaultJson(payload), serverUrl)
}

async function _getProof(
  json: string,
  serverUrl: string
): Promise<PasskeyProof> {
  const payloadHash    = sha256(json)
  const payloadHashHex = Buffer.from(payloadHash).toString("hex")

  const optionsJSON = await fetchApprovalOptions(payloadHashHex, serverUrl)
  const assertion   = await startAuthentication({
    optionsJSON: optionsJSON as Parameters<typeof startAuthentication>[0]["optionsJSON"],
  })

  const { signature, serverPubkey } = await verifyApproval(
    assertion,
    json,
    serverUrl
  )

  return {
    signature:   Buffer.from(signature, "base64"),
    serverPubkey: bs58.decode(serverPubkey),
    payloadHash,
  }
}

/**
 * Canonical JSON for `protected_transfer` ProofPayload.
 * Key order is fixed — must match the Anchor program's `compute_payload_hash`.
 */
export function canonicalJson(payload: ProofPayload): string {
  return JSON.stringify({
    programId:   payload.programId,
    instruction: payload.instruction,
    amount:      payload.amount,
    nonce:       payload.nonce,
    expiry:      payload.expiry,
  })
}

/**
 * Canonical JSON for `vault_withdraw` VaultProofPayload.
 * Key order is fixed — must match `compute_vault_payload_hash`.
 */
export function canonicalVaultJson(payload: VaultProofPayload): string {
  return JSON.stringify({
    programId:   payload.programId,
    instruction: payload.instruction,
    vault:       payload.vault,
    amount:      payload.amount,
    nonce:       payload.nonce,
    expiry:      payload.expiry,
  })
}

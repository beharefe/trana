import type { StatusResponse, VaultStatusResponse } from "./types"

// ── Status ────────────────────────────────────────────────────────────────────

/** Fetch passkey status for a wallet. UX signal — not used for enforcement. */
export async function getPasskeyStatus(
  wallet: string,
  serverUrl: string
): Promise<StatusResponse> {
  try {
    const res = await fetch(
      `${serverUrl}/api/status?wallet=${encodeURIComponent(wallet)}`
    )
    if (!res.ok) return { has_passkey: false, opt_in: false }
    return res.json() as Promise<StatusResponse>
  } catch {
    return { has_passkey: false, opt_in: false }
  }
}

/** Fetch vault status for a wallet. */
export async function getVaultStatus(
  wallet: string,
  serverUrl: string
): Promise<VaultStatusResponse> {
  try {
    const res = await fetch(
      `${serverUrl}/api/vault?wallet=${encodeURIComponent(wallet)}`
    )
    if (!res.ok) return { initialized: false, balance_sol: 0, next_nonce: 0, opt_in: false }
    return res.json() as Promise<VaultStatusResponse>
  } catch {
    return { initialized: false, balance_sol: 0, next_nonce: 0, opt_in: false }
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

export async function fetchRegistrationOptions(
  wallet: string,
  serverUrl: string
): Promise<unknown> {
  const res = await fetch(`${serverUrl}/api/register/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function verifyRegistration(
  wallet: string,
  response: unknown,
  serverUrl: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${serverUrl}/api/register/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, response }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Approval ──────────────────────────────────────────────────────────────────

/** Fetch WebAuthn authentication options. Challenge = payloadHashHex. */
export async function fetchApprovalOptions(
  payloadHashHex: string,
  serverUrl: string
): Promise<unknown> {
  const res = await fetch(`${serverUrl}/api/approve/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payloadHash: payloadHashHex }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * Verify WebAuthn assertion and receive bridge Ed25519 signature.
 *
 * `canonicalJson` — the canonical JSON string of the ProofPayload (or VaultProofPayload).
 * The bridge recomputes sha256(canonicalJson) and signs it.
 */
export async function verifyApproval(
  assertion: unknown,
  canonicalJson: string,
  serverUrl: string
): Promise<{ signature: string; serverPubkey: string }> {
  const res = await fetch(`${serverUrl}/api/approve/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assertion, canonicalJson }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

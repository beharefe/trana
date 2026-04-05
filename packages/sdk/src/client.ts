import type { StatusResponse } from "./types"

/** Fetch passkey status for a wallet. UX signal only — not used for enforcement. */
export async function getPasskeyStatus(
  wallet: string,
  serverUrl: string
): Promise<StatusResponse> {
  const url = `${serverUrl}/api/status?wallet=${encodeURIComponent(wallet)}`
  const res = await fetch(url)
  if (!res.ok) {
    return { has_passkey: false, opt_in: false }
  }
  return res.json() as Promise<StatusResponse>
}

/** Fetch registration options from the bridge. */
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

/** Send registration verification to the bridge. */
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

/** Fetch approval (authentication) options from the bridge. */
export async function fetchApprovalOptions(
  wallet: string,
  payloadHash: string,
  serverUrl: string
): Promise<unknown> {
  const res = await fetch(`${serverUrl}/api/approve/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, payloadHash }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/** Send approval verification to the bridge and receive the server signature. */
export async function verifyApproval(
  assertion: unknown,
  payload: unknown,
  serverUrl: string
): Promise<{ signature: string; serverPubkey: string }> {
  const res = await fetch(`${serverUrl}/api/approve/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assertion, payload }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

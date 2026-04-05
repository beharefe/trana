import { createClient } from "@supabase/supabase-js"

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing Supabase env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
  )
}

/**
 * Server-side Supabase client using the service role key.
 * Never expose this to the browser.
 */
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// ── Types matching Supabase schema ────────────────────────────────────────────

export interface Credential {
  wallet: string
  credential_id: string
  public_key: Buffer | Uint8Array
  counter: number
  opt_in: boolean
}

export interface Challenge {
  id: string
  wallet: string
  challenge: string
  payload: unknown | null
  created_at: string
}

// ── Credential helpers ────────────────────────────────────────────────────────

export async function getCredential(wallet: string): Promise<Credential | null> {
  const { data, error } = await supabase
    .from("credentials")
    .select("*")
    .eq("wallet", wallet)
    .single()
  if (error || !data) return null
  return data as Credential
}

export async function upsertCredential(cred: Credential): Promise<void> {
  const { error } = await supabase
    .from("credentials")
    .upsert(cred, { onConflict: "wallet" })
  if (error) throw error
}

export async function updateCounter(wallet: string, counter: number): Promise<void> {
  const { error } = await supabase
    .from("credentials")
    .update({ counter })
    .eq("wallet", wallet)
  if (error) throw error
}

// ── Challenge helpers ─────────────────────────────────────────────────────────

export async function storeChallenge(
  wallet: string,
  challenge: string,
  payload?: unknown
): Promise<string> {
  const { data, error } = await supabase
    .from("challenges")
    .insert({ wallet, challenge, payload: payload ?? null })
    .select("id")
    .single()
  if (error || !data) throw new Error("Failed to store challenge")
  return (data as { id: string }).id
}

export async function consumeChallenge(
  challengeId: string
): Promise<Challenge | null> {
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", challengeId)
    .single()
  if (error || !data) return null

  // Delete immediately — challenges are one-time use.
  await supabase.from("challenges").delete().eq("id", challengeId)

  // Reject challenges older than 10 minutes.
  const created = new Date(data.created_at).getTime()
  if (Date.now() - created > 10 * 60 * 1000) return null

  return data as Challenge
}

export async function findChallengeByValue(
  challenge: string
): Promise<Challenge | null> {
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("challenge", challenge)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()
  if (error || !data) return null

  // Delete after retrieval.
  await supabase.from("challenges").delete().eq("id", data.id)

  const created = new Date(data.created_at).getTime()
  if (Date.now() - created > 10 * 60 * 1000) return null

  return data as Challenge
}

import { Connection, PublicKey, AccountInfo } from "@solana/web3.js"

// ── Constants ─────────────────────────────────────────────────────────────────

export const REGISTRY_SEED = Buffer.from("passkey")

// ── Types ─────────────────────────────────────────────────────────────────────

export type PasskeyEntry = {
  pubkey:       Uint8Array   // 33-byte compressed P-256 key
  credentialId: Uint8Array   // WebAuthn credential ID
}

export type RegistryState = {
  owner: Uint8Array          // 32-byte Pubkey
  keys:  PasskeyEntry[]      // up to 10 registered passkeys
  nonce: bigint              // u64 replay-protection counter
}

// ── PDA derivation ────────────────────────────────────────────────────────────

/**
 * Derive the registry PDA for a given wallet + Trana Guard program.
 * Seeds: [b"passkey", walletPubkey]
 */
export function findRegistryPda(
  walletPubkey:   PublicKey,
  tranaGuardProgramId: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [REGISTRY_SEED, walletPubkey.toBuffer()],
    tranaGuardProgramId
  )
  return pda
}

// ── Deserialization ───────────────────────────────────────────────────────────

/**
 * Parse a raw PasskeyRegistry account buffer.
 *
 * PasskeyRegistry layout (after 8-byte Anchor discriminator):
 *   owner:   Pubkey         (32 bytes)
 *   nonce:   u64            (8 bytes LE)
 *   keys:    Vec<PasskeyEntry>  (4-byte LE count, then each entry:)
 *     key_kind:      u8     (1 byte — skipped, always Secp256r1Passkey)
 *     pubkey_bytes:  Vec<u8> (4-byte LE len + bytes)
 *     credential_id: Vec<u8> (4-byte LE len + bytes)
 */
function parseRegistryAccount(data: Buffer): RegistryState {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let offset = 8 // skip 8-byte Anchor discriminator

  const owner = new Uint8Array(data.slice(offset, offset + 32))
  offset += 32

  const nonce = view.getBigUint64(offset, true)
  offset += 8

  const keyCount = view.getUint32(offset, true)
  offset += 4

  const keys: PasskeyEntry[] = []
  for (let i = 0; i < keyCount; i++) {
    offset += 1 // key_kind

    const pkLen = view.getUint32(offset, true)
    offset += 4
    const pubkey = new Uint8Array(data.slice(offset, offset + pkLen))
    offset += pkLen

    const credLen = view.getUint32(offset, true)
    offset += 4
    const credentialId = new Uint8Array(data.slice(offset, offset + credLen))
    offset += credLen

    keys.push({ pubkey, credentialId })
  }

  return { owner, keys, nonce }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetch and parse the registry PDA for a wallet.
 * Returns null if the account does not exist (not registered).
 */
export async function fetchRegistry(
  connection:     Connection,
  walletPubkey:   PublicKey,
  tranaGuardProgramId: PublicKey
): Promise<RegistryState | null> {
  const pda = findRegistryPda(walletPubkey, tranaGuardProgramId)
  const info = await connection.getAccountInfo(pda)
  // minimum: 8 disc + 32 owner + 8 nonce + 4 vec len = 52 bytes
  if (!info || !info.data || info.data.length < 52) return null
  return parseRegistryAccount(Buffer.from(info.data))
}

// ── Subscribe ─────────────────────────────────────────────────────────────────

/**
 * Subscribe to live updates of the registry PDA.
 * Calls `cb` immediately with the parsed state (or null) and on every change.
 * Returns the subscription ID — call `connection.removeAccountChangeListener(id)`
 * to clean up.
 */
export function subscribeRegistry(
  connection:     Connection,
  pda:            PublicKey,
  cb:             (state: RegistryState | null) => void
): number {
  return connection.onAccountChange(
    pda,
    (accountInfo: AccountInfo<Buffer>) => {
      if (!accountInfo.data || accountInfo.data.length < 52) {
        cb(null)
        return
      }
      try {
        cb(parseRegistryAccount(Buffer.from(accountInfo.data)))
      } catch {
        cb(null)
      }
    },
    "confirmed"
  )
}

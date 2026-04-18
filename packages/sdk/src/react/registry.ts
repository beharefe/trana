import { Connection, PublicKey, AccountInfo } from "@solana/web3.js"

// ── Constants ─────────────────────────────────────────────────────────────────

export const REGISTRY_SEED = Buffer.from("2fa")

// ── Types ─────────────────────────────────────────────────────────────────────

export type RegistryState = {
  owner:        Uint8Array   // 32-byte Pubkey
  pubkey:       Uint8Array   // 33-byte compressed P-256 key
  credentialId: Uint8Array   // WebAuthn credential ID
  enabled:      boolean
  nonce:        bigint        // u64, reserved for future replay protection
}

// ── PDA derivation ────────────────────────────────────────────────────────────

/**
 * Derive the registry PDA for a given wallet + guard program.
 * Seeds: [b"2fa", walletPubkey]
 */
export function findRegistryPda(
  walletPubkey:   PublicKey,
  guardProgramId: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [REGISTRY_SEED, walletPubkey.toBuffer()],
    guardProgramId
  )
  return pda
}

// ── Deserialization ───────────────────────────────────────────────────────────

/**
 * Parse a raw TwoFactorRegistry account buffer.
 *
 * TwoFactorRegistry layout (after 8-byte Anchor discriminator):
 *   owner:         Pubkey    (32 bytes)
 *   key_kind:      u8        (1 byte  — 0 = Secp256r1Passkey, 1 = Ed25519)
 *   pubkey_bytes:  Vec<u8>   (4-byte LE len + bytes)
 *   credential_id: Vec<u8>   (4-byte LE len + bytes)
 *   enabled:       bool      (1 byte)
 *   nonce:         u64       (8 bytes LE)
 */
function parseRegistryAccount(data: Buffer): RegistryState {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let offset = 8 // skip 8-byte Anchor discriminator

  // owner
  const owner = new Uint8Array(data.slice(offset, offset + 32))
  offset += 32

  // key_kind (we just skip it — provider always uses secp256r1)
  offset += 1

  // pubkey_bytes
  const pkLen = view.getUint32(offset, true)
  offset += 4
  const pubkey = new Uint8Array(data.slice(offset, offset + pkLen))
  offset += pkLen

  // credential_id
  const credLen = view.getUint32(offset, true)
  offset += 4
  const credentialId = new Uint8Array(data.slice(offset, offset + credLen))
  offset += credLen

  // enabled
  const enabled = data[offset] === 1
  offset += 1

  // nonce (u64 LE — DataView for browser compat)
  const nonce = view.getBigUint64(offset, true)

  return { owner, pubkey, credentialId, enabled, nonce }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Fetch and parse the registry PDA for a wallet.
 * Returns null if the account does not exist (not registered).
 */
export async function fetchRegistry(
  connection:     Connection,
  walletPubkey:   PublicKey,
  guardProgramId: PublicKey
): Promise<RegistryState | null> {
  const pda = findRegistryPda(walletPubkey, guardProgramId)
  const info = await connection.getAccountInfo(pda)
  if (!info || !info.data || info.data.length < 46) return null
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
      if (!accountInfo.data || accountInfo.data.length < 46) {
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

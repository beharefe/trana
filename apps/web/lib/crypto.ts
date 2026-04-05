import nacl from "tweetnacl"
import bs58 from "bs58"
import { createHash } from "crypto"

let _keypair: nacl.SignKeyPair | null = null

/**
 * Load the server Ed25519 keypair from the SERVER_SECRET_KEY env var.
 *
 * The env var must hold a base58-encoded 64-byte secret key (seed + public key).
 * Generate one with:
 *   node -e "const nacl=require('tweetnacl');const bs58=require('bs58');
 *            const kp=nacl.sign.keyPair();console.log(bs58.encode(kp.secretKey))"
 *
 * Trust model: this key is the bridge signer. The Anchor program verifies
 * Ed25519 signatures from this key — it trusts the bridge, not WebAuthn directly.
 */
function getKeypair(): nacl.SignKeyPair {
  if (_keypair) return _keypair
  const raw = process.env.SERVER_SECRET_KEY
  if (!raw) {
    throw new Error(
      "SERVER_SECRET_KEY env var is missing. " +
      "Generate one and add it to .env.local."
    )
  }
  const secret = bs58.decode(raw)
  _keypair = nacl.sign.keyPair.fromSecretKey(secret)
  return _keypair
}

/** Sign a 32-byte payload hash with the server Ed25519 key. */
export function signPayloadHash(payloadHash: Uint8Array): Uint8Array {
  return nacl.sign.detached(payloadHash, getKeypair().secretKey)
}

/** Return the server public key as a base58 string (for clients). */
export function getServerPublicKeyBase58(): string {
  return bs58.encode(getKeypair().publicKey)
}

/** SHA-256 hash of arbitrary bytes. */
export function sha256(data: string | Uint8Array): Uint8Array {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data
  return new Uint8Array(createHash("sha256").update(buf).digest())
}

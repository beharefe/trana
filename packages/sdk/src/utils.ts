/**
 * SHA-256 over raw bytes — works in both Node.js and browser environments.
 * Returns a 32-byte Uint8Array.
 */
export function sha256Bytes(input: Uint8Array): Uint8Array {
  return sha256Sync(input)
}

/**
 * SHA-256 hash — works in both Node.js and browser environments.
 * Returns a 32-byte Uint8Array.
 */
export function sha256(input: string): Uint8Array {
  // Browser / bundler path: SubtleCrypto is sync-unfriendly so we bundle
  // a small pure-JS implementation via the Web Crypto API polyfill.
  // For Node we fall back to the built-in crypto module.
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    // We return a sync result by computing it synchronously in Node or by using
    // a pre-computed path. For simplicity in this POC we use a synchronous
    // implementation based on the SHA-2 spec via the sha256 function below.
    return sha256Sync(new TextEncoder().encode(input))
  }
  return sha256Sync(new TextEncoder().encode(input))
}

// Minimal synchronous SHA-256 (RFC 6234 reference implementation, pure JS).
// This avoids an async boundary when calling getPasskeyProof().
function sha256Sync(data: Uint8Array): Uint8Array {
  // Use Node crypto when available (fast path).
  if (typeof process !== "undefined" && process.versions?.node) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createHash } = require("crypto") as typeof import("crypto")
    return new Uint8Array(createHash("sha256").update(data).digest())
  }

  // Pure-JS fallback (browser).
  return pureSha256(data)
}

// ── Pure-JS SHA-256 ───────────────────────────────────────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function pureSha256(msg: Uint8Array): Uint8Array {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])

  const length = msg.length
  const bitLength = length * 8
  // Pad to 512-bit boundary.
  const padLength = ((length + 9 + 63) & ~63)
  const padded = new Uint8Array(padLength)
  padded.set(msg)
  padded[length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padLength - 4, bitLength >>> 0, false)
  view.setUint32(padLength - 8, Math.floor(bitLength / 2 ** 32), false)

  const W = new Uint32Array(64)
  for (let offset = 0; offset < padLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3)
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10)
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0
  }

  const result = new Uint8Array(32)
  const out = new DataView(result.buffer)
  for (let i = 0; i < 8; i++) out.setUint32(i * 4, H[i], false)
  return result
}

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

/** Read the first 8 bytes of a params buffer as a little-endian u64. Returns null if too short. */
export function decodeParamsU64(params: Uint8Array): bigint | null {
  if (params.length < 8) return null
  return new DataView(params.buffer, params.byteOffset, 8).getBigUint64(0, true)
}

/** Generate a random 32-byte nonce, hex-encoded. */
export function generateNonce(): string {
  const bytes = new Uint8Array(32)
  if (typeof globalThis.crypto !== "undefined") {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    // Node.js fallback
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { randomBytes } = require("crypto") as typeof import("crypto")
    const buf = randomBytes(32)
    bytes.set(buf)
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

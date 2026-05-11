#!/usr/bin/env node
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Remove a passkey from the registry by credential ID.
// Requires proof from any remaining registered passkey.
// Cannot remove the last key.
//
// Usage:
//   ANCHOR_WALLET=<keypair.json> node scripts/remove-passkey.mjs <guard-id> <cred-id-hex>
//
// To get the old CLI credential ID:
//   node -e "
//     const { Connection, PublicKey } = require('@solana/web3.js');
//     const c = new Connection('https://api.devnet.solana.com');
//     const [pda] = PublicKey.findProgramAddressSync(
//       [Buffer.from('passkey'), new PublicKey('<YOUR_WALLET>').toBuffer()],
//       new PublicKey('<GUARD_ID>'),
//     );
//     c.getAccountInfo(pda).then(i => {
//       let off = 8+32+8+4+1+4;
//       const pkLen = i.data.readUInt32LE(off-4);
//       off += pkLen + 4;  // skip pubkey + cred_len
//       const cidLen = i.data.readUInt32LE(off-4);
//       // back up
//       off = 8+32+8+4;
//       off += 1; // KeyKind
//       const pl = i.data.readUInt32LE(off); off += 4 + pl;
//       const cl = i.data.readUInt32LE(off); off += 4;
//       console.log(Buffer.from(i.data.slice(off, off+cl)).toString('hex'));
//     });
//   "

import { readFileSync } from "fs"
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js"
import { createHash } from "crypto"
import { p256 } from "@noble/curves/nist.js"

const [,, guardId, credIdHex] = process.argv
if (!guardId || !credIdHex) {
  console.error("Usage: ANCHOR_WALLET=<keypair.json> node remove-passkey.mjs <guard-id> <cred-id-hex>")
  process.exit(1)
}

const RPC    = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com"
const WALLET = process.env.ANCHOR_WALLET
if (!WALLET) { console.error("ANCHOR_WALLET not set"); process.exit(1) }

const conn   = new Connection(RPC, "confirmed")
const secret = JSON.parse(readFileSync(WALLET, "utf8"))
const owner  = Keypair.fromSecretKey(Uint8Array.from(secret))

const GUARD_PROG = new PublicKey(guardId)
const credId     = Buffer.from(credIdHex, "hex")

const [registryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("passkey"), owner.publicKey.toBuffer()], GUARD_PROG,
)
const regInfo = await conn.getAccountInfo(registryPda)
if (!regInfo) { console.error("No registry found"); process.exit(1) }
const nonce = new DataView(regInfo.data.buffer, regInfo.data.byteOffset + 40, 8).getBigUint64(0, true)

// Count keys in registry
const vecLen = new DataView(regInfo.data.buffer, regInfo.data.byteOffset + 8+32+8, 4).getUint32(0, true)
if (vecLen <= 1) { console.error("Cannot remove the last passkey — add a new one first"); process.exit(1) }

console.log(`Owner:       ${owner.publicKey.toBase58()}`)
console.log(`Removing:    ${credIdHex.slice(0, 16)}…`)
console.log(`Keys before: ${vecLen}`)
console.log(`Nonce:       ${nonce}`)
console.log()

// ── Build remove_passkey instruction ──────────────────────────────────────────

const REMOVE_DISC = Buffer.from([121, 198, 177, 145, 248, 134, 170, 239])
const SYSVAR_IX   = new PublicKey("Sysvar1nstructions1111111111111111111111111")
const u32le       = n => { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n); return b }
const borshBytes  = b => Buffer.concat([u32le(b.length), Buffer.from(b)])

const removeData  = Buffer.concat([REMOVE_DISC, borshBytes(credId)])
const removeIx    = new TransactionInstruction({
  programId: GUARD_PROG,
  keys: [
    { pubkey: registryPda,     isSigner: false, isWritable: true  },
    { pubkey: owner.publicKey, isSigner: true,  isWritable: false },
    { pubkey: SYSVAR_IX,       isSigner: false, isWritable: false },
  ],
  data: removeData,
})

// ── Proof from CLI P-256 key ──────────────────────────────────────────────────

const seed        = createHash("sha256").update("trana:passkey:v1").update(owner.secretKey.slice(0, 32)).digest()
const privKeyBig = seed
const pubkeyBytes = p256.getPublicKey(privKeyBig, true)

// Compute accounts_hash and params_hash from the actual protected instruction
const ixAccsBytes = Buffer.concat([
  registryPda.toBuffer(), owner.publicKey.toBuffer(), SYSVAR_IX.toBuffer(),
])
const accountsHash = createHash("sha256").update(ixAccsBytes).digest()
const paramsHash   = createHash("sha256").update(removeData.slice(8)).digest()

const u16le     = n => { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(n); return b }
const enc       = new TextEncoder()
const domain    = enc.encode("trana:v1")
const policy    = enc.encode("trana.require")
const nonceBuf  = Buffer.allocUnsafe(8); new DataView(nonceBuf.buffer, nonceBuf.byteOffset, 8).setBigUint64(0, nonce, true)
const expiryUnix = Math.floor(Date.now() / 1000) + 120
const expiryBuf = Buffer.allocUnsafe(8); new DataView(expiryBuf.buffer, expiryBuf.byteOffset, 8).setBigInt64(0, BigInt(expiryUnix), true)

const payload = Buffer.concat([
  Buffer.from([1]),
  u16le(domain.length), Buffer.from(domain),
  owner.publicKey.toBuffer(),
  GUARD_PROG.toBuffer(), GUARD_PROG.toBuffer(),
  u16le(policy.length), Buffer.from(policy),
  REMOVE_DISC,
  accountsHash, paramsHash,
  nonceBuf, expiryBuf,
])
const challenge  = createHash("sha256").update(payload).digest()
const rpIdHash   = createHash("sha256").update("localhost").digest()
const authData   = Buffer.concat([rpIdHash, Buffer.from([0x05, 0, 0, 0, 0])])
const clientJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: challenge.toString("base64url") }))
const clientHash = createHash("sha256").update(clientJSON).digest()
const message = Buffer.concat([authData, clientHash])
const compact = p256.sign(message, privKeyBig, { lowS: true })

const pubkeyOff = 16, sigOff = 49, msgOff = 113
const secpData  = Buffer.allocUnsafe(msgOff + message.length)
secpData[0] = 1; secpData[1] = 0
const sdv = new DataView(secpData.buffer, secpData.byteOffset, secpData.byteLength)
sdv.setUint16(2, sigOff, true); sdv.setUint16(4, 0xffff, true)
sdv.setUint16(6, pubkeyOff, true); sdv.setUint16(8, 0xffff, true)
sdv.setUint16(10, msgOff, true); sdv.setUint16(12, message.length, true)
sdv.setUint16(14, 0xffff, true)
secpData.set(pubkeyBytes, pubkeyOff); secpData.set(compact, sigOff); secpData.set(message, msgOff)

const secp256r1Ix = new TransactionInstruction({
  programId: new PublicKey("Secp256r1SigVerify1111111111111111111111111"),
  keys: [], data: secpData,
})

const RECORD_DISC   = Buffer.from(createHash("sha256").update("global:record_proof").digest()).slice(0, 8)
const borshStr      = s => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u32le(b.length), b]) }
const expBuf2       = Buffer.allocUnsafe(8); new DataView(expBuf2.buffer, expBuf2.byteOffset, 8).setBigInt64(0, BigInt(expiryUnix), true)
const recordData    = Buffer.concat([RECORD_DISC, Buffer.from([1]), expBuf2, borshStr("trana.require"), borshBytes(authData), borshBytes(clientJSON)])
const recordProofIx = new TransactionInstruction({
  programId: GUARD_PROG,
  keys: [{ pubkey: SYSVAR_IX, isSigner: false, isWritable: false }],
  data: recordData,
})

// ── Send ──────────────────────────────────────────────────────────────────────

const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed")
const tx = new Transaction({ recentBlockhash: blockhash, feePayer: owner.publicKey })
tx.add(secp256r1Ix, recordProofIx, removeIx)
tx.sign(owner)

console.log("Removing passkey...")
const sig    = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true })
const result = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
if (result.value.err) { console.error("Failed:", JSON.stringify(result.value.err)); process.exit(1) }

console.log(`✓ Removed: ${sig}`)
console.log(`  Registry now has ${vecLen - 1} passkey(s)`)

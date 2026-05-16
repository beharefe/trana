import * as anchor from "@coral-xyz/anchor"
import { Keypair, PublicKey } from "@solana/web3.js"
import type { TranaGuard } from "../../target/types/trana_guard"
import { airdrop, sendV0 } from "./transactions"
import { generateTestPasskey } from "../../packages/sdk/src/testing/index"
import { buildProofInstructions } from "./proof"

export type { TestPasskeyHandle } from "../../packages/sdk/src/testing/index"
export { generateTestPasskey }

export const SOL = 1_000_000_000

export function getProgram(): anchor.Program<TranaGuard> {
  return anchor.workspace.TranaGuard as anchor.Program<TranaGuard>
}

export function registryPda(owner: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("passkey"), owner.toBuffer()],
    programId,
  )
  return pda
}

export function configPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId,
  )
  return pda
}

export type ConfigContext = {
  treasury:    PublicKey
  registerFee: number
  addKeyFee:   number
}

/** Initialize the config PDA if it doesn't exist, otherwise read existing values. */
export async function ensureConfig(
  program: anchor.Program<TranaGuard>,
  payer:   anchor.Wallet,
): Promise<ConfigContext> {
  try {
    const data = await program.account.tranaConfig.fetch(configPda(program.programId))
    return {
      treasury:    data.treasury,
      registerFee: (data.registerFee as anchor.BN).toNumber(),
      addKeyFee:   (data.addKeyFee   as anchor.BN).toNumber(),
    }
  } catch {
    const treasury    = payer.publicKey
    const registerFee = 5_000_000
    const addKeyFee   = 10_000_000
    const ix = await program.methods
      .initConfig(new anchor.BN(registerFee), new anchor.BN(addKeyFee), treasury)
      .accounts({ authority: payer.publicKey })
      .instruction()
    const payerKeypair = (payer as unknown as { payer: Keypair }).payer
    await sendV0(program.provider.connection, [ix], payer.publicKey, [payerKeypair])
    return { treasury, registerFee, addKeyFee }
  }
}

/** Generate a funded wallet ready for testing. */
export async function setupWallet(
  program: anchor.Program<TranaGuard>,
  lamports = 5 * SOL,
): Promise<{ owner: Keypair }> {
  const owner = Keypair.generate()
  await airdrop(program.provider.connection, owner.publicKey, lamports)
  return { owner }
}

export async function registerPasskey(
  program:  anchor.Program<TranaGuard>,
  owner:    Keypair,
  passkey:  { pubkey: Uint8Array; credentialId: Uint8Array },
  treasury: PublicKey,
): Promise<void> {
  const ix = await program.methods
    .registerPasskey(
      { secp256R1Passkey: {} },
      Buffer.from(passkey.pubkey),
      Buffer.from(passkey.credentialId),
    )
    .accounts({ owner: owner.publicKey, treasury })
    .instruction()
  await sendV0(program.provider.connection, [ix], owner.publicKey, [owner])
}

export async function addPasskey(
  program:      anchor.Program<TranaGuard>,
  owner:        Keypair,
  signingKey:   ReturnType<typeof generateTestPasskey>,
  newKey:       { pubkey: Uint8Array; credentialId: Uint8Array },
  treasury:     PublicKey,
  nonce:        bigint,
): Promise<void> {
  const addIx = await program.methods
    .addPasskey(
      { secp256R1Passkey: {} },
      Buffer.from(newKey.pubkey),
      Buffer.from(newKey.credentialId),
    )
    .accounts({ owner: owner.publicKey, treasury })
    .instruction()

  const { secp256r1Ix, recordProofIx } = buildProofInstructions(
    signingKey,
    addIx,
    program.programId,
    owner.publicKey,
    nonce,
    "trana.require",
  )

  await sendV0(program.provider.connection, [secp256r1Ix, recordProofIx, addIx], owner.publicKey, [owner])
}

export async function removePasskey(
  program:      anchor.Program<TranaGuard>,
  owner:        Keypair,
  signingKey:   ReturnType<typeof generateTestPasskey>,
  credentialId: Uint8Array,
  nonce:        bigint,
): Promise<void> {
  const removeIx = await program.methods
    .removePasskey(Buffer.from(credentialId))
    .accounts({ owner: owner.publicKey })
    .instruction()

  const { secp256r1Ix, recordProofIx } = buildProofInstructions(
    signingKey,
    removeIx,
    program.programId,
    owner.publicKey,
    nonce,
    "trana.require",
  )

  await sendV0(program.provider.connection, [secp256r1Ix, recordProofIx, removeIx], owner.publicKey, [owner])
}

/**
 * Emergency recovery: clear all passkeys and register a fresh one.
 * Calls recover_registry — owner wallet signature only, no passkey proof.
 */
export async function recoverPasskey(
  program:    anchor.Program<TranaGuard>,
  owner:      Keypair,
  _oldPasskey: ReturnType<typeof generateTestPasskey>,
  newPasskey: { pubkey: Uint8Array; credentialId: Uint8Array },
  _treasury:   PublicKey,
  _nonce = 0n,
): Promise<void> {
  const recoverIx = await program.methods
    .recoverRegistry(
      { secp256R1Passkey: {} },
      Buffer.from(newPasskey.pubkey),
      Buffer.from(newPasskey.credentialId),
    )
    .accounts({ owner: owner.publicKey })
    .instruction()

  await sendV0(
    program.provider.connection,
    [recoverIx],
    owner.publicKey,
    [owner],
  )
}

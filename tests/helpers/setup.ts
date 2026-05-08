import * as anchor from "@coral-xyz/anchor"
import { Keypair, PublicKey } from "@solana/web3.js"
import type { TranaGuard } from "../../target/types/trana_guard"
import { airdrop, sendV0 } from "./transactions"
import { generateTestPasskey } from "../../packages/sdk/src/testing"
import { buildProofInstructions } from "./proof"

export type { TestPasskeyHandle } from "../../packages/sdk/src/testing"
export { generateTestPasskey }

export const SOL = 1_000_000_000

export function getProgram(): anchor.Program<TranaGuard> {
  return anchor.workspace.TranaGuard as anchor.Program<TranaGuard>
}

export function registryPda(owner: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("2fa"), owner.toBuffer()],
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
  recoveryFee: number
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
      recoveryFee: (data.recoveryFee as anchor.BN).toNumber(),
    }
  } catch {
    const treasury    = payer.publicKey
    const registerFee = 5_000_000
    const recoveryFee = 10_000_000
    const ix = await program.methods
      .initConfig(new anchor.BN(registerFee), new anchor.BN(recoveryFee), treasury)
      .accounts({ authority: payer.publicKey })
      .instruction()
    const payerKeypair = (payer as unknown as { payer: Keypair }).payer
    await sendV0(program.provider.connection, [ix], payer.publicKey, [payerKeypair])
    return { treasury, registerFee, recoveryFee }
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
    .registerTwoFa(
      { secp256R1Passkey: {} },
      Buffer.from(passkey.pubkey),
      Buffer.from(passkey.credentialId),
    )
    .accounts({ owner: owner.publicKey, treasury })
    .instruction()
  await sendV0(program.provider.connection, [ix], owner.publicKey, [owner])
}

/**
 * Replace an existing passkey using the OLD passkey as proof.
 * Calls recover_two_fa — requires secp256r1 + record_proof from the current key.
 *
 * Transaction shape:
 *   ix[N-2]: secp256r1  (signed by oldPasskey)
 *   ix[N-1]: record_proof
 *   ix[N]:   recover_two_fa
 */
export async function recoverPasskey(
  program:    anchor.Program<TranaGuard>,
  owner:      Keypair,
  oldPasskey: ReturnType<typeof generateTestPasskey>,
  newPasskey: { pubkey: Uint8Array; credentialId: Uint8Array },
  treasury:   PublicKey,
  nonce = 0n,
): Promise<void> {
  const recoverIx = await program.methods
    .recoverTwoFa(
      { secp256R1Passkey: {} },
      Buffer.from(newPasskey.pubkey),
      Buffer.from(newPasskey.credentialId),
    )
    .accounts({ owner: owner.publicKey, treasury })
    .instruction()

  const proof = buildProofInstructions(
    oldPasskey, recoverIx, program.programId, owner.publicKey, nonce, "trana.require",
  )
  await sendV0(
    program.provider.connection,
    [proof.secp256r1Ix, proof.recordProofIx, recoverIx],
    owner.publicKey,
    [owner],
  )
}

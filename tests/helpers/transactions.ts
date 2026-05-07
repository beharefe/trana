import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js"

export async function sendV0(
  connection:   Connection,
  instructions: TransactionInstruction[],
  feePayer:     PublicKey,
  signers:      Keypair[],
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
  const message = new TransactionMessage({
    payerKey:        feePayer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message()
  const tx = new VersionedTransaction(message)
  tx.sign(signers)

  let signature: string
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries:    5,
    })
  } catch (err) {
    // Simulation failed before hitting the chain — re-throw in the same
    // JSON shape as an on-chain failure so test assertions stay uniform.
    if (err instanceof SendTransactionError) {
      const m = err.message.match(
        /Error processing Instruction (\d+): custom program error: (0x[0-9a-fA-F]+)/,
      )
      if (m) {
        const ixIdx = parseInt(m[1], 10)
        const code  = parseInt(m[2], 16)
        throw new Error(
          `Transaction failed: ${JSON.stringify({ InstructionError: [ixIdx, { Custom: code }] })}`,
        )
      }
    }
    throw err
  }

  const result = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  )
  if (result.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`)
  }
  return signature
}

export async function airdrop(
  connection: Connection,
  pubkey:     PublicKey,
  lamports:   number,
): Promise<void> {
  const signature = await connection.requestAirdrop(pubkey, lamports)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
  const result = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  )
  if (result.value.err) {
    throw new Error(`Airdrop failed: ${JSON.stringify(result.value.err)}`)
  }
}

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js"

const POLL_MS    = 400
const TIMEOUT_MS = 60_000

export async function confirmSignature(connection: Connection, signature: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    const { value: statuses } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: false,
    })
    const status = statuses[0]
    if (status !== null) {
      if (status.err) throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`)
      return
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
  throw new Error(`Signature confirmation timeout: ${signature}`)
}

export async function sendV0(
  connection:   Connection,
  instructions: TransactionInstruction[],
  feePayer:     PublicKey,
  signers:      Keypair[],
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed")
  const message = new TransactionMessage({
    payerKey:        feePayer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message()
  const tx = new VersionedTransaction(message)
  tx.sign(signers)
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries:    3,
  })
  await confirmSignature(connection, signature)
  return signature
}

export async function airdrop(
  connection: Connection,
  pubkey:     PublicKey,
  lamports:   number,
): Promise<void> {
  const signature = await connection.requestAirdrop(pubkey, lamports)
  await confirmSignature(connection, signature)
}

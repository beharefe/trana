/**
 * WebAuthn helpers wrapping @simplewebauthn/server.
 *
 * RP configuration is loaded from env vars so the same codebase works
 * locally (localhost) and in production (Vercel domain).
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server"
import type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server"
import type { Credential } from "./db"

export function getRpConfig() {
  return {
    rpName: process.env.RP_NAME ?? "Trana Guard",
    rpID: process.env.NEXT_PUBLIC_RP_ID ?? "localhost",
    origin: process.env.RP_ORIGIN ?? "http://localhost:3000",
  }
}

export async function createRegistrationOptions(
  wallet: string,
  challenge: string
) {
  const { rpName, rpID } = getRpConfig()
  const opts: GenerateRegistrationOptionsOpts = {
    rpName,
    rpID,
    userName: wallet,
    userDisplayName: `${wallet.slice(0, 6)}…${wallet.slice(-4)}`,
    challenge: Buffer.from(challenge, "base64url"),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  }
  return generateRegistrationOptions(opts)
}

export async function verifyRegistration(
  response: VerifyRegistrationResponseOpts["response"],
  challenge: string
) {
  const { rpID, origin } = getRpConfig()
  return verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedRPID: rpID,
    expectedOrigin: origin,
  })
}

export async function createAuthenticationOptions(challenge: string, credentialId?: string) {
  const { rpID } = getRpConfig()
  const opts: GenerateAuthenticationOptionsOpts = {
    rpID,
    challenge: Buffer.from(challenge, "hex"),
    userVerification: "preferred",
    allowCredentials: credentialId
      ? [{ id: credentialId, type: "public-key" }]
      : [],
    timeout: 120_000,
  }
  return generateAuthenticationOptions(opts)
}

export async function verifyAuthentication(
  response: VerifyAuthenticationResponseOpts["response"],
  cred: Credential,
  challenge: string
) {
  const { rpID, origin } = getRpConfig()
  return verifyAuthenticationResponse({
    response,
    expectedChallenge: `0x${challenge}`,
    expectedRPID: rpID,
    expectedOrigin: origin,
    credential: {
      id: cred.credential_id,
      publicKey: new Uint8Array(cred.public_key as unknown as ArrayBuffer),
      counter: cred.counter,
    },
  })
}

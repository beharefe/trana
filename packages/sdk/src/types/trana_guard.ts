/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/trana_guard.json`.
 */
export type TranaGuard = {
  "address": "GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn",
  "metadata": {
    "name": "tranaGuard",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Trana Guard — Onchain passkey authorization primitive for Solana"
  },
  "instructions": [
    {
      "name": "enforce",
      "discriminator": [145, 247, 86, 94, 97, 48, 101, 169],
      "accounts": [
        { "name": "registry",     "writable": true },
        { "name": "owner",        "signer": true },
        { "name": "instructions" }
      ],
      "args": [
        { "name": "policy", "type": { "defined": { "name": "Policy" } } }
      ]
    },
    {
      "name": "initConfig",
      "discriminator": [23, 235, 115, 232, 168, 96, 1, 231],
      "accounts": [
        { "name": "config",        "writable": true },
        { "name": "authority",     "writable": true, "signer": true },
        { "name": "systemProgram" }
      ],
      "args": [
        { "name": "registerFee", "type": "u64" },
        { "name": "addKeyFee",   "type": "u64" },
        { "name": "treasury",    "type": "pubkey" }
      ]
    },
    {
      "name": "recordProof",
      "discriminator": [144, 172, 144, 35, 124, 170, 93, 80],
      "accounts": [
        { "name": "instructions" }
      ],
      "args": [
        { "name": "version",             "type": "u8" },
        { "name": "expiry",              "type": "i64" },
        { "name": "policy",              "type": "string" },
        { "name": "authenticatorData",   "type": "bytes" },
        { "name": "clientDataJson",      "type": "bytes" }
      ]
    },
    {
      "name": "registerPasskey",
      "discriminator": [16, 2, 121, 116, 194, 17, 247, 233],
      "accounts": [
        { "name": "registry",      "writable": true },
        { "name": "owner",         "writable": true, "signer": true },
        { "name": "systemProgram" },
        { "name": "config" },
        { "name": "treasury",      "writable": true }
      ],
      "args": [
        { "name": "keyKind",      "type": { "defined": { "name": "KeyKind" } } },
        { "name": "pubkeyBytes",  "type": "bytes" },
        { "name": "credentialId", "type": "bytes" }
      ]
    },
    {
      "name": "addPasskey",
      "discriminator": [173, 230, 84, 153, 54, 144, 214, 37],
      "accounts": [
        { "name": "registry",      "writable": true },
        { "name": "owner",         "writable": true, "signer": true },
        { "name": "systemProgram" },
        { "name": "config" },
        { "name": "treasury",      "writable": true },
        { "name": "instructions" }
      ],
      "args": [
        { "name": "keyKind",      "type": { "defined": { "name": "KeyKind" } } },
        { "name": "pubkeyBytes",  "type": "bytes" },
        { "name": "credentialId", "type": "bytes" }
      ]
    },
    {
      "name": "removePasskey",
      "discriminator": [121, 198, 177, 145, 248, 134, 170, 239],
      "accounts": [
        { "name": "registry",      "writable": true },
        { "name": "owner",         "signer": true },
        { "name": "instructions" }
      ],
      "args": [
        { "name": "credentialId", "type": "bytes" }
      ]
    },
    {
      "name": "updateConfig",
      "discriminator": [29, 158, 252, 191, 10, 83, 219, 99],
      "accounts": [
        { "name": "config",    "writable": true },
        { "name": "authority", "signer": true }
      ],
      "args": [
        { "name": "registerFee", "type": "u64" },
        { "name": "addKeyFee",   "type": "u64" },
        { "name": "treasury",    "type": "pubkey" }
      ]
    }
  ],
  "accounts": [
    { "name": "TranaConfig",      "discriminator": [158, 219, 168, 100, 121, 7, 12, 34] },
    { "name": "PasskeyRegistry",  "discriminator": [201, 107, 52, 207, 15, 250, 77, 253] }
  ],
  "events": [
    { "name": "ProofVerified", "discriminator": [181, 54, 148, 211, 237, 73, 131, 232] }
  ],
  "errors": [
    { "code": 6000, "name": "MissingProof",          "msg": "Missing secp256r1 or record_proof instruction before the protected instruction" },
    { "code": 6001, "name": "ProofExpired",           "msg": "Proof has expired" },
    { "code": 6002, "name": "PayloadMismatch",        "msg": "Intent hash does not match — transaction parameters were tampered" },
    { "code": 6003, "name": "WrongSigner",            "msg": "Proof was signed by a key not in the registry" },
    { "code": 6004, "name": "InvalidProof",           "msg": "Invalid proof data" },
    { "code": 6005, "name": "NonceOverflow",          "msg": "Nonce overflow" },
    { "code": 6006, "name": "PolicyMismatch",         "msg": "Proof policy does not match the expected trana standard policy" },
    { "code": 6007, "name": "Unauthorized",           "msg": "Caller is not the config authority" },
    { "code": 6008, "name": "InvalidTreasury",        "msg": "Treasury account does not match config.treasury" },
    { "code": 6009, "name": "MaxKeysReached",         "msg": "Registry already has the maximum number of passkeys (10)" },
    { "code": 6010, "name": "LastKeyCannotBeRemoved", "msg": "Cannot remove the last registered passkey" },
    { "code": 6011, "name": "CredentialNotFound",     "msg": "No passkey with that credential ID found in the registry" }
  ],
  "types": [
    {
      "name": "KeyKind",
      "type": {
        "kind": "enum",
        "variants": [
          { "name": "Secp256r1Passkey" },
          { "name": "Ed25519" }
        ]
      }
    },
    {
      "name": "PasskeyEntry",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "keyKind",      "type": { "defined": { "name": "KeyKind" } } },
          { "name": "pubkeyBytes",  "type": "bytes" },
          { "name": "credentialId", "type": "bytes" }
        ]
      }
    },
    {
      "name": "Policy",
      "type": {
        "kind": "enum",
        "variants": [
          { "name": "Require" },
          { "name": "NotBefore", "fields": [{ "name": "slot", "type": "u64" }] },
          { "name": "NotAfter",  "fields": [{ "name": "slot", "type": "u64" }] },
          { "name": "Limit",     "fields": [{ "name": "paramOffset", "type": "u8" }, { "name": "limit", "type": "u64" }] }
        ]
      }
    },
    {
      "name": "ProofVerified",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "owner",  "type": "pubkey" },
          { "name": "policy", "type": "string" },
          { "name": "target", "type": "pubkey" },
          { "name": "nonce",  "type": "u64" },
          { "name": "expiry", "type": "i64" }
        ]
      }
    },
    {
      "name": "TranaConfig",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority",   "type": "pubkey" },
          { "name": "treasury",    "type": "pubkey" },
          { "name": "registerFee", "type": "u64" },
          { "name": "addKeyFee",   "type": "u64" }
        ]
      }
    },
    {
      "name": "PasskeyRegistry",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "owner", "type": "pubkey" },
          { "name": "nonce", "type": "u64" },
          {
            "name": "keys",
            "type": { "vec": { "defined": { "name": "PasskeyEntry" } } }
          }
        ]
      }
    }
  ]
}

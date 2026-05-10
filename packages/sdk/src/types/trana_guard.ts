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
      "docs": [
        "Enforce authorization according to the given policy.",
        "",
        "For conditional policies (NotBefore, NotAfter, Limit) the condition is",
        "evaluated here and passkey is required only when the condition fires.",
        "For Policy::Require the passkey is always required unconditionally."
      ],
      "discriminator": [
        145,
        247,
        86,
        94,
        97,
        48,
        101,
        169
      ],
      "accounts": [
        {
          "name": "registry",
          "docs": [
            "Registry PDA — nonce incremented on every successful verification."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  50,
                  102,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "docs": [
            "The wallet whose registered passkey must authorize this action."
          ],
          "signer": true
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "policy",
          "type": {
            "defined": {
              "name": "policy"
            }
          }
        }
      ]
    },
    {
      "name": "initConfig",
      "docs": [
        "One-time initialization of the global fee config PDA.",
        "Called once by the Trana team after deployment."
      ],
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "registerFee",
          "type": "u64"
        },
        {
          "name": "recoveryFee",
          "type": "u64"
        },
        {
          "name": "treasury",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "recordProof",
      "docs": [
        "Pure data-carrier instruction. Carries WebAuthn proof data for",
        "enforce() to read from the Instructions sysvar.",
        "Must be placed at ix[N-1] immediately before the protected instruction."
      ],
      "discriminator": [
        144,
        172,
        144,
        35,
        124,
        170,
        93,
        80
      ],
      "accounts": [
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "version",
          "type": "u8"
        },
        {
          "name": "expiry",
          "type": "i64"
        },
        {
          "name": "policy",
          "type": "string"
        },
        {
          "name": "authenticatorData",
          "type": "bytes"
        },
        {
          "name": "clientDataJson",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "recoverTwoFa",
      "docs": [
        "Replace the registered passkey. Requires a proof from the CURRENT key.",
        "",
        "The old passkey signs an intent whose params_hash covers the new",
        "pubkey_bytes and credential_id, so the replacement is approved by the",
        "existing device before it takes effect.",
        "",
        "Transaction shape (same as enforce):",
        "ix[N-2]: secp256r1 precompile  (signed by OLD key)",
        "ix[N-1]: trana_guard::record_proof",
        "ix[N]:   trana_guard::recover_two_fa  ← this instruction"
      ],
      "discriminator": [
        13,
        48,
        14,
        124,
        85,
        71,
        147,
        52
      ],
      "accounts": [
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  50,
                  102,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "keyKind",
          "type": {
            "defined": {
              "name": "keyKind"
            }
          }
        },
        {
          "name": "pubkeyBytes",
          "type": "bytes"
        },
        {
          "name": "credentialId",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "registerTwoFa",
      "docs": [
        "Register a P-256 passkey for the first time.",
        "Only works when no key is registered yet (registry.pubkey_bytes is empty).",
        "For replacing an existing key use recover_two_fa, which requires the",
        "current passkey to prove you still hold it."
      ],
      "discriminator": [
        208,
        119,
        132,
        246,
        251,
        236,
        119,
        54
      ],
      "accounts": [
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  50,
                  102,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "config",
          "docs": [
            "Global fee config — determines which fee to charge."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "keyKind",
          "type": {
            "defined": {
              "name": "keyKind"
            }
          }
        },
        {
          "name": "pubkeyBytes",
          "type": "bytes"
        },
        {
          "name": "credentialId",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "updateConfig",
      "docs": [
        "Update registration/recovery fees or treasury address.",
        "Requires the config authority to sign — full audit trail on-chain."
      ],
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "registerFee",
          "type": "u64"
        },
        {
          "name": "recoveryFee",
          "type": "u64"
        },
        {
          "name": "treasury",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "tranaConfig",
      "discriminator": [
        158,
        219,
        168,
        100,
        121,
        7,
        12,
        34
      ]
    },
    {
      "name": "twoFactorRegistry",
      "discriminator": [
        132,
        127,
        42,
        232,
        223,
        227,
        161,
        91
      ]
    }
  ],
  "events": [
    {
      "name": "proofVerified",
      "discriminator": [
        181,
        54,
        148,
        211,
        237,
        73,
        131,
        232
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "missingProof",
      "msg": "Missing secp256r1 or record_proof instruction before the protected instruction"
    },
    {
      "code": 6001,
      "name": "proofExpired",
      "msg": "Proof has expired"
    },
    {
      "code": 6002,
      "name": "payloadMismatch",
      "msg": "Intent hash does not match — transaction parameters were tampered"
    },
    {
      "code": 6003,
      "name": "wrongSigner",
      "msg": "Proof was signed by a key not in the registry"
    },
    {
      "code": 6004,
      "name": "invalidProof",
      "msg": "Invalid proof data"
    },
    {
      "code": 6005,
      "name": "nonceOverflow",
      "msg": "Nonce overflow"
    },
    {
      "code": 6006,
      "name": "policyMismatch",
      "msg": "Proof policy does not match the expected trana standard policy"
    },
    {
      "code": 6007,
      "name": "unauthorized",
      "msg": "Caller is not the config authority"
    },
    {
      "code": 6008,
      "name": "invalidTreasury",
      "msg": "Treasury account does not match config.treasury"
    }
  ],
  "types": [
    {
      "name": "keyKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "secp256r1Passkey"
          },
          {
            "name": "ed25519"
          }
        ]
      }
    },
    {
      "name": "policy",
      "docs": [
        "Standard authorization policies. Pass one of these to `trana::cpi::enforce()`.",
        "",
        "Condition evaluation and passkey checks both happen inside this program —",
        "audited once, trusted everywhere."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "require"
          },
          {
            "name": "notBefore",
            "fields": [
              {
                "name": "slot",
                "type": "u64"
              }
            ]
          },
          {
            "name": "notAfter",
            "fields": [
              {
                "name": "slot",
                "type": "u64"
              }
            ]
          },
          {
            "name": "limit",
            "fields": [
              {
                "name": "paramOffset",
                "type": "u8"
              },
              {
                "name": "limit",
                "type": "u64"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "proofVerified",
      "docs": [
        "Emitted on every successful proof verification.",
        "Policy + target program are visible in on-chain transaction logs.",
        "This is the zero-trust audit trail."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "The wallet that authorized the action."
            ],
            "type": "pubkey"
          },
          {
            "name": "policy",
            "docs": [
              "Application-defined policy that triggered enforcement (e.g. \"transfer.large\")."
            ],
            "type": "string"
          },
          {
            "name": "target",
            "docs": [
              "The program whose instruction was protected."
            ],
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "docs": [
              "The nonce that was consumed (now invalid — cannot be replayed)."
            ],
            "type": "u64"
          },
          {
            "name": "expiry",
            "docs": [
              "Unix timestamp when this proof expires."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tranaConfig",
      "docs": [
        "Global fee configuration.",
        "Seeds: `[b\"config\"]`",
        "",
        "Stores registration fees and the treasury destination.",
        "Publicly readable — any auditor can verify exact fees without reading source.",
        "Changes require a signed transaction from authority, full history on-chain."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Who can call update_config."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Where registration fees are sent."
            ],
            "type": "pubkey"
          },
          {
            "name": "registerFee",
            "docs": [
              "Lamports charged for a first-time passkey registration."
            ],
            "type": "u64"
          },
          {
            "name": "recoveryFee",
            "docs": [
              "Lamports charged for a key recovery (re-registration)."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "twoFactorRegistry",
      "docs": [
        "Per-user onchain 2FA registry.",
        "Seeds: `[b\"2fa\", owner]`"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "keyKind",
            "type": {
              "defined": {
                "name": "keyKind"
              }
            }
          },
          {
            "name": "pubkeyBytes",
            "type": "bytes"
          },
          {
            "name": "credentialId",
            "type": "bytes"
          },
          {
            "name": "nonce",
            "type": "u64"
          }
        ]
      }
    }
  ]
};

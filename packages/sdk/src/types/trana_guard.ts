/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/trana_guard.json`.
 */
export type TranaGuard = {
  "address": "TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG",
  "metadata": {
    "name": "tranaGuard",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Trana Guard - Onchain passkey authorization primitive for Solana",
    "repository": "https://github.com/beharefe/trana"
  },
  "instructions": [
    {
      "name": "addPasskey",
      "docs": [
        "Add an additional passkey to an existing registry.",
        "",
        "Requires a proof signed by any currently registered passkey.",
        "Charges `add_key_fee` to prevent spam.",
        "Up to MAX_KEYS (10) passkeys per wallet.",
        "",
        "Transaction shape (same as enforce):",
        "ix[N-2]: secp256r1 precompile  (signed by any existing key)",
        "ix[N-1]: trana_guard::record_proof",
        "ix[N]:   trana_guard::add_passkey  ← this instruction"
      ],
      "discriminator": [
        173,
        230,
        84,
        153,
        54,
        144,
        214,
        37
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
                  112,
                  97,
                  115,
                  115,
                  107,
                  101,
                  121
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
      "name": "enforce",
      "docs": [
        "Enforce authorization according to the given policy.",
        "",
        "Any registered passkey in the wallet's PasskeyRegistry can provide",
        "the proof. For conditional policies, the condition is evaluated here —",
        "passkey is required only when the condition fires."
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
            "PDA derivation and deserialization are validated manually inside enforce()",
            "only when the active policy actually requires a passkey proof."
          ],
          "writable": true
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
          "name": "addKeyFee",
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
      "name": "recoverRegistry",
      "docs": [
        "Emergency recovery: clear all passkeys and register a fresh one.",
        "",
        "Requires only the owner wallet signature — no passkey proof needed.",
        "Use when all registered passkeys are lost/inaccessible.",
        "Resets the nonce to 0."
      ],
      "discriminator": [
        136,
        166,
        31,
        45,
        33,
        116,
        115,
        12
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
                  112,
                  97,
                  115,
                  115,
                  107,
                  101,
                  121
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
      "name": "registerPasskey",
      "docs": [
        "Register the first passkey for a wallet.",
        "Only succeeds when the registry is empty — subsequent passkeys require",
        "proof from an existing key via `add_passkey`."
      ],
      "discriminator": [
        16,
        2,
        121,
        116,
        194,
        17,
        247,
        233
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
                  112,
                  97,
                  115,
                  115,
                  107,
                  101,
                  121
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
      "name": "removePasskey",
      "docs": [
        "Remove a passkey by its credential ID.",
        "",
        "Requires a proof from any currently registered passkey.",
        "Cannot remove the last key — at least one must remain.",
        "Free (no fee).",
        "",
        "Transaction shape:",
        "ix[N-2]: secp256r1 precompile  (signed by any existing key)",
        "ix[N-1]: trana_guard::record_proof",
        "ix[N]:   trana_guard::remove_passkey  ← this instruction"
      ],
      "discriminator": [
        121,
        198,
        177,
        145,
        248,
        134,
        170,
        239
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
                  112,
                  97,
                  115,
                  115,
                  107,
                  101,
                  121
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
          "signer": true
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "credentialId",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "updateConfig",
      "docs": [
        "Update registration/add-key fees or treasury address.",
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
          "name": "addKeyFee",
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
      "name": "passkeyRegistry",
      "discriminator": [
        201,
        107,
        52,
        207,
        15,
        250,
        77,
        253
      ]
    },
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
    },
    {
      "code": 6009,
      "name": "maxKeysReached",
      "msg": "Registry already has the maximum number of passkeys (10)"
    },
    {
      "code": 6010,
      "name": "lastKeyCannotBeRemoved",
      "msg": "Cannot remove the last registered passkey"
    },
    {
      "code": 6011,
      "name": "credentialNotFound",
      "msg": "No passkey with that credential ID found in the registry"
    },
    {
      "code": 6012,
      "name": "registryRequired",
      "msg": "Registry account is required for this policy but was not provided"
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
      "name": "passkeyEntry",
      "docs": [
        "A single registered passkey credential."
      ],
      "type": {
        "kind": "struct",
        "fields": [
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
      }
    },
    {
      "name": "passkeyRegistry",
      "docs": [
        "Per-user passkey registry.",
        "Seeds: `[b\"passkey\", owner]`",
        "",
        "Holds all registered passkeys for a wallet. Any entry can authorize",
        "any `enforce()` call — sign with whichever device is available.",
        "Add or remove entries at any time using `add_passkey` / `remove_passkey`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "docs": [
              "Incremented after every successful `enforce()`, `add_passkey`, or",
              "`remove_passkey` call to prevent proof replay."
            ],
            "type": "u64"
          },
          {
            "name": "keys",
            "type": {
              "vec": {
                "defined": {
                  "name": "passkeyEntry"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "policy",
      "docs": [
        "Standard authorization policies. Pass one of these to `trana_guard::cpi::enforce()`.",
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
              "Lamports charged for first-time passkey registration."
            ],
            "type": "u64"
          },
          {
            "name": "addKeyFee",
            "docs": [
              "Lamports charged for adding an additional passkey (`add_passkey`)."
            ],
            "type": "u64"
          }
        ]
      }
    }
  ]
};

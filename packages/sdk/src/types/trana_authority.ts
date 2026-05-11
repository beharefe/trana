/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/trana_authority.json`.
 */
export type TranaAuthority = {
  "address": "TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN",
  "metadata": {
    "name": "tranaAuthority",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Trana Authority - PDA-based authority management with passkey second factor",
    "repository": "https://github.com/beharefe/trana"
  },
  "instructions": [
    {
      "name": "executeUpgrade",
      "docs": [
        "Upgrade a BPF program. Requires passkey proof.",
        "",
        "The PDA (AuthorityRecord) must be the program's current upgrade_authority."
      ],
      "discriminator": [
        205,
        219,
        100,
        218,
        66,
        39,
        215,
        24
      ],
      "accounts": [
        {
          "name": "authorityRecord",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  110,
                  97,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "program"
              }
            ]
          }
        },
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "program",
          "writable": true
        },
        {
          "name": "programData",
          "writable": true
        },
        {
          "name": "buffer",
          "writable": true
        },
        {
          "name": "spill",
          "writable": true
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        },
        {
          "name": "clock",
          "address": "SysvarC1ock11111111111111111111111111111111"
        },
        {
          "name": "bpfLoader",
          "address": "BPFLoaderUpgradeab1e11111111111111111111111"
        },
        {
          "name": "tranaGuardProgram",
          "address": "TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG"
        },
        {
          "name": "tranaRegistry",
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
            ],
            "program": {
              "kind": "account",
              "path": "tranaGuardProgram"
            }
          }
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "reclaimAuthority",
      "docs": [
        "Return the upgrade authority from the PDA to a new pubkey. Requires passkey proof.",
        "Closes the AuthorityRecord PDA and returns rent to the owner."
      ],
      "discriminator": [
        156,
        147,
        67,
        113,
        251,
        229,
        162,
        166
      ],
      "accounts": [
        {
          "name": "authorityRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  110,
                  97,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "target"
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
          "name": "target",
          "writable": true
        },
        {
          "name": "programData",
          "writable": true
        },
        {
          "name": "newAuthorityInfo"
        },
        {
          "name": "bpfLoader",
          "address": "BPFLoaderUpgradeab1e11111111111111111111111"
        },
        {
          "name": "tranaGuardProgram",
          "address": "TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG"
        },
        {
          "name": "tranaRegistry",
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
            ],
            "program": {
              "kind": "account",
              "path": "tranaGuardProgram"
            }
          }
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "newAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "register",
      "docs": [
        "Create an AuthorityRecord PDA for an (owner, target) pair.",
        "No passkey required — only the owner's wallet signature.",
        "After this, transfer the program's upgrade authority to the PDA address:",
        "solana program set-upgrade-authority <PROG> --new-upgrade-authority <PDA>"
      ],
      "discriminator": [
        211,
        124,
        67,
        15,
        211,
        194,
        178,
        240
      ],
      "accounts": [
        {
          "name": "authorityRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  110,
                  97,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "target"
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
          "name": "target"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "authorityRecord",
      "discriminator": [
        177,
        116,
        28,
        129,
        149,
        56,
        73,
        128
      ]
    },
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
    }
  ],
  "events": [
    {
      "name": "authorityReclaimed",
      "discriminator": [
        216,
        107,
        174,
        145,
        179,
        21,
        100,
        39
      ]
    },
    {
      "name": "upgradeExecuted",
      "discriminator": [
        20,
        196,
        184,
        29,
        29,
        16,
        114,
        94
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "targetMismatch",
      "msg": "Target account does not match the registered record"
    }
  ],
  "types": [
    {
      "name": "authorityReclaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "target",
            "type": "pubkey"
          },
          {
            "name": "newAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "authorityRecord",
      "docs": [
        "PDA record that IS the on-chain upgrade authority for a program.",
        "",
        "Seeds: [b\"trana-authority\", owner.key(), target.key()]",
        "",
        "After `register()`, transfer the program's upgrade authority to this PDA:",
        "solana program set-upgrade-authority <PROG> --new-upgrade-authority <PDA>"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "Wallet that owns this record and whose passkey must sign."
            ],
            "type": "pubkey"
          },
          {
            "name": "target",
            "docs": [
              "The program ID being protected."
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump — stored so execute_upgrade can sign without re-deriving."
            ],
            "type": "u8"
          }
        ]
      }
    },
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
      "name": "upgradeExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "program",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};

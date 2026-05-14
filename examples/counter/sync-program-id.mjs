#!/usr/bin/env node
// Reads the generated program keypair and writes VITE_COUNTER_PROGRAM_ID to app/.env.local
// Run this after `anchor build && anchor keys sync && anchor build`

import { execSync }    from "node:child_process"
import { writeFileSync } from "node:fs"

const id = execSync("solana address -k target/deploy/counter-keypair.json").toString().trim()
writeFileSync("app/.env.local", `VITE_COUNTER_PROGRAM_ID=${id}\n`)
console.log("synced counter program ID:", id)

#!/usr/bin/env node
// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Sync Anchor build artifacts into the SDK package.
//
// Runs automatically as part of `npm run build` in packages/sdk.
// Run manually after `anchor build`:
//   node scripts/sync-idl.js
//
// Copies:
//   target/idl/trana_guard.json     → packages/sdk/src/idl/trana_guard.json
//   target/idl/trana_authority.json → packages/sdk/src/idl/trana_authority.json
//   target/types/trana_guard.ts     → packages/sdk/src/types/trana_guard.ts
//   target/types/trana_authority.ts → packages/sdk/src/types/trana_authority.ts

import { copyFileSync, existsSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const copies = [
  ["target/idl/trana_guard.json",     "packages/sdk/src/idl/trana_guard.json"],
  ["target/idl/trana_authority.json", "packages/sdk/src/idl/trana_authority.json"],
  ["target/types/trana_guard.ts",     "packages/sdk/src/types/trana_guard.ts"],
  ["target/types/trana_authority.ts", "packages/sdk/src/types/trana_authority.ts"],
]

let synced = 0
for (const [src, dest] of copies) {
  const srcPath  = join(root, src)
  const destPath = join(root, dest)
  if (!existsSync(srcPath)) {
    console.warn(`  skip: ${src} (run 'anchor build' first)`)
    continue
  }
  mkdirSync(dirname(destPath), { recursive: true })
  copyFileSync(srcPath, destPath)
  console.log(`  ${src} → ${dest}`)
  synced++
}

console.log(synced === copies.length ? "sync-idl: done" : `sync-idl: ${synced}/${copies.length} files synced (run 'anchor build' for missing files)`)

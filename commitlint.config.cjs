// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0
/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ["@commitlint/config-conventional"],

  rules: {
    // Enforce scope — every commit must use one of these aliases.
    // Drives semantic-release version bumping: feat(sdk): → minor, fix(sdk): → patch, etc.
    "scope-enum": [
      2,           // error
      "always",
      [
        // ── On-chain programs ─────────────────────────────
        "trana-guard",      // programs/trana_guard
        "trana-authority",  // programs/trana_authority
        "trana-test-vault", // programs/trana_test_vault (internal test program)

        // ── SDK ───────────────────────────────────────────
        "sdk",              // packages/sdk  (@tranaprotocol/sdk)

        // ── Apps ──────────────────────────────────────────
        "landing",          // apps/landing

        // ── Cross-cutting ─────────────────────────────────
        "tests",            // tests/ (Anchor integration tests)
        "ci",               // .github/workflows, release config
        "scripts",          // scripts/ (sync-idl, deploy helpers)
        "deps",             // dependency upgrades (any package)
        "repo",             // root-level: tsconfig, package.json, workspace config
      ],
    ],

    // Scope is required — scopeless commits are rejected.
    "scope-empty": [2, "never"],

    // Type list (conventional defaults + a few extras).
    "type-enum": [
      2,
      "always",
      [
        "feat",    // new feature
        "fix",     // bug fix
        "docs",    // documentation only
        "style",   // formatting, no logic change
        "refactor",// no feature/fix
        "perf",    // performance improvement
        "test",    // adding/updating tests
        "build",   // build system changes
        "ci",      // CI configuration
        "chore",   // maintenance (version bumps, lockfile, etc.)
        "revert",  // revert a previous commit
      ],
    ],

    // Keep subject concise and imperative.
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
    "header-max-length": [2, "always", 100],
  },
}

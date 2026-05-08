# Trana Authority Test Plan

## What this program must prove

The core job of `trana_authority` is not merely to store an `AuthorityRecord`; it is to turn a PDA into the real downstream signer for SPL Token or loader-v3 actions. On Solana, PDAs are deterministic from seeds and program ID, do not have private keys, and can only “sign” when the owning program invokes another program with `invoke_signed`. Anchor then validates `seeds`, `bump`, `constraint`, `address`, `close`, and signer requirements before your instruction body runs. It also treats `Account<'info, T>` and `Program<'info, T>` as checked account types, while `UncheckedAccount<'info>` explicitly performs no validation at all. That means the right test suite for this program has three layers: Anchor account-validation tests, downstream CPI validation tests, and a thin guard-integration layer. citeturn2view3turn2view4turn5view1turn5view2turn5view0turn11view0

## Code-specific issues these tests should catch

The most important code-specific regression to test immediately is seed collision across authority kinds. Because a PDA is determined only by its seeds and program ID, your current seed layout of `[AUTHORITY_SEED, owner, target]` means `TokenMint` and `TokenFreeze` for the same `(owner, mint)` collide onto the same `AuthorityRecord` address. In practice, that means one mint cannot simultaneously have separate `TokenMint` and `TokenFreeze` records under the current design; a second registration will fail at the PDA level, and the stored `authority_kind` makes the execute paths mutually exclusive. Whether that is an intentional V1 limitation or a bug, you want a test that reveals it now. The second important behavior to lock down is that `register` only creates local state; it does not transfer the real token or upgrade authority. So every happy-path execution test should have a sister test proving that the action still fails until the actual downstream authority has been moved to the PDA. citeturn2view3turn4view1turn6view0

```text
register_same_owner_same_mint_token_mint_then_token_freeze_collides
register_same_owner_same_mint_token_freeze_then_token_mint_collides
execute_mint_without_real_mint_authority_transfer_fails
execute_freeze_without_real_freeze_authority_transfer_fails
execute_upgrade_without_real_upgrade_authority_transfer_fails
```

## Registration and account-validation tests

Because `register` uses Anchor’s `init`, the first call should create the PDA and the second identical call should fail during account creation. Because `ReclaimAuthority` uses `close = owner`, a successful reclaim should send the account’s lamports back to `owner` and reset the closed account, while a failed reclaim must leave the record intact. The rest of the account-validation surface is in your constraints: the `authority_record` seeds and equality checks, the `bpf_loader` address check, the `instructions` sysvar address check, and the `trana_registry` PDA derivation. The most valuable tests in this category are the ones that prove bad accounts are rejected before instruction logic runs. citeturn5view3turn5view1turn5view0turn11view0

```text
register_success
register_stores_owner_target_kind_bump
register_duplicate_same_owner_target_fails
register_same_target_different_owner_succeeds
register_requires_owner_signature
register_does_not_require_guard_proof

execute_with_wrong_authority_record_pda_fails
execute_with_wrong_authority_record_bump_fails
execute_with_wrong_owner_for_record_fails
execute_with_wrong_target_for_record_fails
execute_with_wrong_trana_registry_pda_fails
execute_with_wrong_instructions_sysvar_fails
execute_upgrade_with_wrong_bpf_loader_account_fails

reclaim_success_closes_record_and_refunds_owner
reclaim_failure_keeps_record_open
reclaim_after_close_fails
```

A code-specific negative matrix is also worth adding because several inputs are `UncheckedAccount`. Anchor documents that `UncheckedAccount` performs no validation, so your suite should deliberately supply malformed `target`, `program_data`, `buffer`, and `new_authority_info` accounts and assert that the downstream token program or loader-v3 rejects them cleanly. That is not redundant testing; it is exactly the safety net your current account model needs. citeturn11view0turn2view4

```text
reclaim_token_kind_with_non_mint_target_fails
reclaim_program_upgrade_with_non_program_target_fails
reclaim_program_upgrade_with_wrong_program_data_fails
reclaim_program_upgrade_new_authority_arg_and_account_mismatch_fails
```

## Token authority execution tests

The token-side matrix should follow the Token Program’s own rules. Solana’s token documentation is explicit: only the mint authority can mint; the destination token account must already exist and belong to the same mint; only the freeze authority can freeze or thaw; and `SetAuthority` changes one authority role at a time and requires the current authority to sign. Those rules imply that your most convincing token tests are not just “mint succeeds” but “direct mint from the leaked old key fails,” “wrong destination mint fails,” and “reclaim hands power back to the new authority and disables the PDA path.” citeturn4view0turn2view6turn2view7turn4view1

```text
execute_mint_success_after_transferring_mint_authority_to_pda
execute_mint_kind_mismatch_fails
execute_mint_missing_proof_fails
execute_mint_wrong_destination_mint_fails
execute_mint_wrong_mint_for_record_fails
execute_mint_emits_mint_executed_event
execute_mint_changes_supply_and_destination_balance

direct_mint_with_old_admin_key_fails_after_transfer
direct_mint_with_new_authority_succeeds_after_reclaim
pda_mint_fails_after_reclaim

execute_freeze_success_after_transferring_freeze_authority_to_pda
execute_freeze_kind_mismatch_fails
execute_freeze_missing_proof_fails
execute_freeze_wrong_token_account_mint_fails
execute_freeze_emits_freeze_executed_event
direct_freeze_with_old_admin_key_fails_after_transfer

execute_thaw_success_on_previously_frozen_account
execute_thaw_kind_mismatch_fails
execute_thaw_missing_proof_fails
execute_thaw_wrong_token_account_mint_fails
execute_thaw_emits_freeze_executed_event_with_frozen_false
direct_thaw_with_old_admin_key_fails_after_transfer

reclaim_mint_authority_success_sets_new_mint_authority
reclaim_freeze_authority_success_sets_new_freeze_authority
reclaim_token_kind_missing_proof_fails
reclaim_token_kind_invalid_proof_fails
reclaim_token_kind_keeps_authority_record_on_failure
```

If you want one “hero” token test, make it this chain: register the record, transfer mint authority to the PDA, prove that direct minting from the old key fails, execute mint through `trana_authority` with a valid proof, reclaim to a new authority, and then prove that the PDA can no longer mint while the new authority can. That single test demonstrates registration, real downstream authority handoff, proof gating, PDA signing, reclaim, and post-reclaim safety in one flow. citeturn4view0turn4view1turn2view3turn2view4

## Upgrade and reclaim tests

The upgrade branch deserves its own dedicated suite because loader-v3 does far more validation than SPL mint/freeze flows. Solana documents that an upgrade verifies the Program account, Buffer state and authority, and ProgramData upgrade authority; then it copies the new bytes into ProgramData, funds rent-exemption if needed, drains the buffer into the spill account, and makes the new version effective in the next slot. Solana also exposes `set_upgrade_authority` as the handoff primitive for program authority. In other words, this branch is not just “another CPI”; it is a real loader-v3 state transition, so it needs at least one end-to-end test with an actual upgradeable program fixture. citeturn6view0turn2view1

```text
execute_upgrade_success_after_transferring_upgrade_authority_to_pda
execute_upgrade_kind_mismatch_fails
execute_upgrade_missing_proof_fails
execute_upgrade_wrong_program_data_for_program_fails
execute_upgrade_invalid_buffer_account_fails
execute_upgrade_wrong_buffer_authority_fails
execute_upgrade_wrong_spill_account_fails
execute_upgrade_emits_upgrade_executed_event

direct_upgrade_with_old_key_fails_after_transfer
execute_upgrade_drains_buffer_to_spill
execute_upgrade_updates_programdata_state
execute_upgrade_cannot_reuse_drained_buffer

reclaim_program_upgrade_success_sets_new_upgrade_authority
reclaim_program_upgrade_missing_proof_fails
reclaim_program_upgrade_invalid_proof_fails
reclaim_program_upgrade_new_authority_arg_and_account_mismatch_fails
reclaim_program_upgrade_keeps_record_open_on_failure
reclaim_program_upgrade_then_old_pda_cannot_upgrade
reclaim_program_upgrade_then_new_authority_can_upgrade_directly
```

For reclaim specifically, treat it as security-critical, not administrative cleanup. The token side relies on `SetAuthority`, which changes a single authority role and requires the current authority; the program side relies on loader-v3 authority handoff; and Anchor’s `close = owner` only happens on successful completion. So you want tests that prove the full post-conditions: the downstream authority changed, the record closed, the owner got the rent back, and the old PDA path no longer works. Just as importantly, you want the inverse test: if reclaim fails at the downstream CPI, nothing should be closed and no authority should move. citeturn4view1turn2view1turn5view0

## Guard integration and test harness choice

Because `trana_authority` delegates proof verification to `trana_guard::cpi::enforce`, you do not need to copy the entire guard cryptographic matrix into this suite. What you need here is a thin integration slice: one valid proof success path per execute family, plus a handful of high-value bubble-up failures such as missing proof, expired or replayed proof, wrong owner or registry, and wrong instruction ordering in the instructions sysvar. That is enough to prove the integration contract without turning the authority suite into a second guard suite. On the tooling side, Anchor’s testing docs recommend LiteSVM and Mollusk for fast local testing; LiteSVM is faster than `solana-program-test` and `solana-test-validator` but less like a real RPC node, so real-validator-like environments still matter when validator behavior is the thing under test. For loader-v3 specifically, `ProgramTest` can load upgradeable programs into genesis, which makes it a strong fit for the upgrade branch, and Mollusk can be used to add compute-budget regression checks if you want to watch the cost of the guard-plus-authority path over time. citeturn10view0turn10view1turn10view2turn9view0

```text
execute_mint_with_valid_guard_proof_succeeds
execute_freeze_with_valid_guard_proof_succeeds
execute_upgrade_with_valid_guard_proof_succeeds

execute_any_missing_record_proof_ix_fails
execute_any_wrong_instruction_order_fails
execute_any_wrong_owner_registry_pair_fails
execute_any_expired_proof_fails
execute_any_replayed_proof_fails
execute_any_proof_bound_to_different_target_fails
execute_any_proof_bound_to_different_amount_or_accounts_fails

mint_route_compute_budget_regression
upgrade_route_compute_budget_regression
```

If you are prioritizing for the hackathon, the smallest convincing authority suite is this:

```text
register_success
register_same_owner_same_mint_token_mint_then_token_freeze_collides
execute_mint_success_after_transferring_mint_authority_to_pda
direct_mint_with_old_admin_key_fails_after_transfer
execute_mint_missing_proof_fails
execute_freeze_success_after_transferring_freeze_authority_to_pda
reclaim_mint_authority_success_sets_new_mint_authority
pda_mint_fails_after_reclaim
execute_upgrade_success_after_transferring_upgrade_authority_to_pda
direct_upgrade_with_old_key_fails_after_transfer
reclaim_program_upgrade_success_sets_new_upgrade_authority
reclaim_failure_keeps_record_open
```

If those pass, you have already proven the primitive: an ordinary Solana authority can be virtualized behind a PDA, guarded by a second factor, and safely returned to a new authority when needed.# Trana Authority Test Plan

## What this program must prove

The core job of `trana_authority` is not merely to store an `AuthorityRecord`; it is to turn a PDA into the real downstream signer for SPL Token or loader-v3 actions. On Solana, PDAs are deterministic from seeds and program ID, do not have private keys, and can only “sign” when the owning program invokes another program with `invoke_signed`. Anchor then validates `seeds`, `bump`, `constraint`, `address`, `close`, and signer requirements before your instruction body runs. It also treats `Account<'info, T>` and `Program<'info, T>` as checked account types, while `UncheckedAccount<'info>` explicitly performs no validation at all. That means the right test suite for this program has three layers: Anchor account-validation tests, downstream CPI validation tests, and a thin guard-integration layer. citeturn2view3turn2view4turn5view1turn5view2turn5view0turn11view0

## Code-specific issues these tests should catch

The most important code-specific regression to test immediately is seed collision across authority kinds. Because a PDA is determined only by its seeds and program ID, your current seed layout of `[AUTHORITY_SEED, owner, target]` means `TokenMint` and `TokenFreeze` for the same `(owner, mint)` collide onto the same `AuthorityRecord` address. In practice, that means one mint cannot simultaneously have separate `TokenMint` and `TokenFreeze` records under the current design; a second registration will fail at the PDA level, and the stored `authority_kind` makes the execute paths mutually exclusive. Whether that is an intentional V1 limitation or a bug, you want a test that reveals it now. The second important behavior to lock down is that `register` only creates local state; it does not transfer the real token or upgrade authority. So every happy-path execution test should have a sister test proving that the action still fails until the actual downstream authority has been moved to the PDA. citeturn2view3turn4view1turn6view0

```text
register_same_owner_same_mint_token_mint_then_token_freeze_collides
register_same_owner_same_mint_token_freeze_then_token_mint_collides
execute_mint_without_real_mint_authority_transfer_fails
execute_freeze_without_real_freeze_authority_transfer_fails
execute_upgrade_without_real_upgrade_authority_transfer_fails
```

## Registration and account-validation tests

Because `register` uses Anchor’s `init`, the first call should create the PDA and the second identical call should fail during account creation. Because `ReclaimAuthority` uses `close = owner`, a successful reclaim should send the account’s lamports back to `owner` and reset the closed account, while a failed reclaim must leave the record intact. The rest of the account-validation surface is in your constraints: the `authority_record` seeds and equality checks, the `bpf_loader` address check, the `instructions` sysvar address check, and the `trana_registry` PDA derivation. The most valuable tests in this category are the ones that prove bad accounts are rejected before instruction logic runs. citeturn5view3turn5view1turn5view0turn11view0

```text
register_success
register_stores_owner_target_kind_bump
register_duplicate_same_owner_target_fails
register_same_target_different_owner_succeeds
register_requires_owner_signature
register_does_not_require_guard_proof

execute_with_wrong_authority_record_pda_fails
execute_with_wrong_authority_record_bump_fails
execute_with_wrong_owner_for_record_fails
execute_with_wrong_target_for_record_fails
execute_with_wrong_trana_registry_pda_fails
execute_with_wrong_instructions_sysvar_fails
execute_upgrade_with_wrong_bpf_loader_account_fails

reclaim_success_closes_record_and_refunds_owner
reclaim_failure_keeps_record_open
reclaim_after_close_fails
```

A code-specific negative matrix is also worth adding because several inputs are `UncheckedAccount`. Anchor documents that `UncheckedAccount` performs no validation, so your suite should deliberately supply malformed `target`, `program_data`, `buffer`, and `new_authority_info` accounts and assert that the downstream token program or loader-v3 rejects them cleanly. That is not redundant testing; it is exactly the safety net your current account model needs. citeturn11view0turn2view4

```text
reclaim_token_kind_with_non_mint_target_fails
reclaim_program_upgrade_with_non_program_target_fails
reclaim_program_upgrade_with_wrong_program_data_fails
reclaim_program_upgrade_new_authority_arg_and_account_mismatch_fails
```

## Token authority execution tests

The token-side matrix should follow the Token Program’s own rules. Solana’s token documentation is explicit: only the mint authority can mint; the destination token account must already exist and belong to the same mint; only the freeze authority can freeze or thaw; and `SetAuthority` changes one authority role at a time and requires the current authority to sign. Those rules imply that your most convincing token tests are not just “mint succeeds” but “direct mint from the leaked old key fails,” “wrong destination mint fails,” and “reclaim hands power back to the new authority and disables the PDA path.” citeturn4view0turn2view6turn2view7turn4view1

```text
execute_mint_success_after_transferring_mint_authority_to_pda
execute_mint_kind_mismatch_fails
execute_mint_missing_proof_fails
execute_mint_wrong_destination_mint_fails
execute_mint_wrong_mint_for_record_fails
execute_mint_emits_mint_executed_event
execute_mint_changes_supply_and_destination_balance

direct_mint_with_old_admin_key_fails_after_transfer
direct_mint_with_new_authority_succeeds_after_reclaim
pda_mint_fails_after_reclaim

execute_freeze_success_after_transferring_freeze_authority_to_pda
execute_freeze_kind_mismatch_fails
execute_freeze_missing_proof_fails
execute_freeze_wrong_token_account_mint_fails
execute_freeze_emits_freeze_executed_event
direct_freeze_with_old_admin_key_fails_after_transfer

execute_thaw_success_on_previously_frozen_account
execute_thaw_kind_mismatch_fails
execute_thaw_missing_proof_fails
execute_thaw_wrong_token_account_mint_fails
execute_thaw_emits_freeze_executed_event_with_frozen_false
direct_thaw_with_old_admin_key_fails_after_transfer

reclaim_mint_authority_success_sets_new_mint_authority
reclaim_freeze_authority_success_sets_new_freeze_authority
reclaim_token_kind_missing_proof_fails
reclaim_token_kind_invalid_proof_fails
reclaim_token_kind_keeps_authority_record_on_failure
```

If you want one “hero” token test, make it this chain: register the record, transfer mint authority to the PDA, prove that direct minting from the old key fails, execute mint through `trana_authority` with a valid proof, reclaim to a new authority, and then prove that the PDA can no longer mint while the new authority can. That single test demonstrates registration, real downstream authority handoff, proof gating, PDA signing, reclaim, and post-reclaim safety in one flow. citeturn4view0turn4view1turn2view3turn2view4

## Upgrade and reclaim tests

The upgrade branch deserves its own dedicated suite because loader-v3 does far more validation than SPL mint/freeze flows. Solana documents that an upgrade verifies the Program account, Buffer state and authority, and ProgramData upgrade authority; then it copies the new bytes into ProgramData, funds rent-exemption if needed, drains the buffer into the spill account, and makes the new version effective in the next slot. Solana also exposes `set_upgrade_authority` as the handoff primitive for program authority. In other words, this branch is not just “another CPI”; it is a real loader-v3 state transition, so it needs at least one end-to-end test with an actual upgradeable program fixture. citeturn6view0turn2view1

```text
execute_upgrade_success_after_transferring_upgrade_authority_to_pda
execute_upgrade_kind_mismatch_fails
execute_upgrade_missing_proof_fails
execute_upgrade_wrong_program_data_for_program_fails
execute_upgrade_invalid_buffer_account_fails
execute_upgrade_wrong_buffer_authority_fails
execute_upgrade_wrong_spill_account_fails
execute_upgrade_emits_upgrade_executed_event

direct_upgrade_with_old_key_fails_after_transfer
execute_upgrade_drains_buffer_to_spill
execute_upgrade_updates_programdata_state
execute_upgrade_cannot_reuse_drained_buffer

reclaim_program_upgrade_success_sets_new_upgrade_authority
reclaim_program_upgrade_missing_proof_fails
reclaim_program_upgrade_invalid_proof_fails
reclaim_program_upgrade_new_authority_arg_and_account_mismatch_fails
reclaim_program_upgrade_keeps_record_open_on_failure
reclaim_program_upgrade_then_old_pda_cannot_upgrade
reclaim_program_upgrade_then_new_authority_can_upgrade_directly
```

For reclaim specifically, treat it as security-critical, not administrative cleanup. The token side relies on `SetAuthority`, which changes a single authority role and requires the current authority; the program side relies on loader-v3 authority handoff; and Anchor’s `close = owner` only happens on successful completion. So you want tests that prove the full post-conditions: the downstream authority changed, the record closed, the owner got the rent back, and the old PDA path no longer works. Just as importantly, you want the inverse test: if reclaim fails at the downstream CPI, nothing should be closed and no authority should move. citeturn4view1turn2view1turn5view0

## Guard integration and test harness choice

Because `trana_authority` delegates proof verification to `trana_guard::cpi::enforce`, you do not need to copy the entire guard cryptographic matrix into this suite. What you need here is a thin integration slice: one valid proof success path per execute family, plus a handful of high-value bubble-up failures such as missing proof, expired or replayed proof, wrong owner or registry, and wrong instruction ordering in the instructions sysvar. That is enough to prove the integration contract without turning the authority suite into a second guard suite. On the tooling side, Anchor’s testing docs recommend LiteSVM and Mollusk for fast local testing; LiteSVM is faster than `solana-program-test` and `solana-test-validator` but less like a real RPC node, so real-validator-like environments still matter when validator behavior is the thing under test. For loader-v3 specifically, `ProgramTest` can load upgradeable programs into genesis, which makes it a strong fit for the upgrade branch, and Mollusk can be used to add compute-budget regression checks if you want to watch the cost of the guard-plus-authority path over time. citeturn10view0turn10view1turn10view2turn9view0

```text
execute_mint_with_valid_guard_proof_succeeds
execute_freeze_with_valid_guard_proof_succeeds
execute_upgrade_with_valid_guard_proof_succeeds

execute_any_missing_record_proof_ix_fails
execute_any_wrong_instruction_order_fails
execute_any_wrong_owner_registry_pair_fails
execute_any_expired_proof_fails
execute_any_replayed_proof_fails
execute_any_proof_bound_to_different_target_fails
execute_any_proof_bound_to_different_amount_or_accounts_fails

mint_route_compute_budget_regression
upgrade_route_compute_budget_regression
```

If you are prioritizing for the hackathon, the smallest convincing authority suite is this:

```text
register_success
register_same_owner_same_mint_token_mint_then_token_freeze_collides
execute_mint_success_after_transferring_mint_authority_to_pda
direct_mint_with_old_admin_key_fails_after_transfer
execute_mint_missing_proof_fails
execute_freeze_success_after_transferring_freeze_authority_to_pda
reclaim_mint_authority_success_sets_new_mint_authority
pda_mint_fails_after_reclaim
execute_upgrade_success_after_transferring_upgrade_authority_to_pda
direct_upgrade_with_old_key_fails_after_transfer
reclaim_program_upgrade_success_sets_new_upgrade_authority
reclaim_failure_keeps_record_open
```

If those pass, you have already proven the primitive: an ordinary Solana authority can be virtualized behind a PDA, guarded by a second factor, and safely returned to a new authority when needed.
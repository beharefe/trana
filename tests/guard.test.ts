import * as anchor from "@coral-xyz/anchor"

describe("trana", () => {
  anchor.setProvider(anchor.AnchorProvider.env())

  it("Is initialized!", async () => {
    // Add your test here.
    const program = anchor.workspace.Trana
    console.log("Program id:", program.programId.toString())
  })

  describe("registry", () => {
    it.skip("initialize_registry", async () => {})
    it.skip("register_passkey", async () => {})
    it.skip("update_passkey", async () => {})
    it.skip("disable_registry", async () => {})
    it.skip("enable_registry", async () => {})
  })

  describe("enforce", () => {
    it.skip("enforce_with_valid_proof", async () => {})
    it.skip("enforce_missing_proof", async () => {})
    it.skip("enforce_wrong_signer", async () => {})
    it.skip("enforce_expired_proof", async () => {})
    it.skip("enforce_replayed_nonce", async () => {})
    it.skip("enforce_wrong_nonce", async () => {})
    it.skip("enforce_wrong_program_id", async () => {})
    it.skip("enforce_wrong_policy_id", async () => {})
    it.skip("enforce_wrong_instruction_discriminator", async () => {})
    it.skip("enforce_wrong_accounts_hash", async () => {})
    it.skip("enforce_wrong_params_hash", async () => {})
    it.skip("enforce_wrong_cluster", async () => {})
    it.skip("enforce_tampered_payload", async () => {})
    it.skip("enforce_tampered_client_data_json", async () => {})
    it.skip("enforce_tampered_authenticator_data", async () => {})
  })

  describe("secp256r1 instruction", () => {
    it.skip("secp256r1_instruction_missing", async () => {})
    it.skip("secp256r1_instruction_wrong_index", async () => {})
    it.skip("secp256r1_instruction_invalid_signature", async () => {})
    it.skip("secp256r1_instruction_invalid_pubkey", async () => {})
    it.skip("secp256r1_instruction_wrong_message", async () => {})
  })

  describe("record_proof", () => {
    it.skip("record_proof_missing", async () => {})
    it.skip("record_proof_wrong_order", async () => {})
    it.skip("record_proof_wrong_payload_hash", async () => {})
    it.skip("record_proof_wrong_registry", async () => {})
    it.skip("record_proof_wrong_owner", async () => {})
  })

  describe("nonce and replay", () => {
    it.skip("nonce_increment_after_success", async () => {})
    it.skip("nonce_not_incremented_on_failure", async () => {})
    it.skip("replay_attack_same_tx", async () => {})
    it.skip("replay_attack_modified_tx", async () => {})
  })

  describe("proof expiry", () => {
    it.skip("proof_expiry_boundary_valid", async () => {})
    it.skip("proof_expiry_boundary_invalid", async () => {})
    it.skip("future_expiry_valid", async () => {})
    it.skip("stale_expiry_invalid", async () => {})
  })

  describe("payload hash", () => {
    it.skip("payload_hash_matches_instruction", async () => {})
    it.skip("payload_hash_mismatch_on_amount_change", async () => {})
    it.skip("payload_hash_mismatch_on_account_change", async () => {})
    it.skip("payload_hash_mismatch_on_program_change", async () => {})
    it.skip("payload_hash_mismatch_on_policy_change", async () => {})
  })

  describe("multi-instruction", () => {
    it.skip("enforce_with_multiple_instructions", async () => {})
    it.skip("enforce_with_nested_cpi", async () => {})
    it.skip("enforce_with_compute_budget_ix", async () => {})
    it.skip("enforce_with_priority_fee_ix", async () => {})
  })

  describe("instruction introspection", () => {
    it.skip("instruction_introspection_reads_correct_ix", async () => {})
    it.skip("instruction_introspection_fails_out_of_bounds", async () => {})
    it.skip("instruction_introspection_fails_wrong_program", async () => {})
  })

  describe("registry PDA", () => {
    it.skip("registry_pda_derivation_valid", async () => {})
    it.skip("registry_pda_derivation_invalid", async () => {})
    it.skip("registry_owner_mismatch", async () => {})
  })

  describe("registry state", () => {
    it.skip("disabled_registry_rejected", async () => {})
    it.skip("uninitialized_registry_rejected", async () => {})
  })

  describe("isolation", () => {
    it.skip("multiple_registries_isolated", async () => {})
    it.skip("multiple_users_isolated", async () => {})
    it.skip("concurrent_nonce_usage", async () => {})
  })

  describe("input validation", () => {
    it.skip("large_client_data_json", async () => {})
    it.skip("malformed_client_data_json", async () => {})
    it.skip("malformed_authenticator_data", async () => {})
    it.skip("oversized_payload_rejected", async () => {})
  })

  describe("events", () => {
    it.skip("proof_verified_event_emitted", async () => {})
    it.skip("proof_failure_event_emitted", async () => {})
    it.skip("replay_attempt_event_emitted", async () => {})
  })

  describe("devnet attacks", () => {
    it.skip("devnet_attack_without_proof", async () => {})
    it.skip("devnet_attack_with_valid_proof", async () => {})
    it.skip("devnet_public_key_compromise_blocked", async () => {})
    it.skip("devnet_modified_tx_after_approval_blocked", async () => {})
  })

  describe("atomicity", () => {
    it.skip("enforce_atomicity_success", async () => {})
    it.skip("enforce_atomicity_failure", async () => {})
    it.skip("partial_execution_impossible", async () => {})
  })

  describe("compute budget", () => {
    it.skip("compute_budget_under_limit", async () => {})
    it.skip("compute_budget_exceeded_gracefully", async () => {})
  })

  describe("domain separation", () => {
    it.skip("proof_domain_separation_valid", async () => {})
    it.skip("proof_domain_separation_invalid", async () => {})
  })

  describe("cross-replay", () => {
    it.skip("cross_program_replay_invalid", async () => {})
    it.skip("cross_cluster_replay_invalid", async () => {})
    it.skip("cross_policy_replay_invalid", async () => {})
  })

  describe("webauthn signatures", () => {
    it.skip("valid_webauthn_p256_signature", async () => {})
    it.skip("invalid_webauthn_p256_signature", async () => {})
    it.skip("malformed_der_signature", async () => {})
    it.skip("compact_signature_conversion_valid", async () => {})
    it.skip("compact_signature_conversion_invalid", async () => {})
  })

  describe("passkey rotation", () => {
    it.skip("passkey_rotation_success", async () => {})
    it.skip("old_passkey_invalid_after_rotation", async () => {})
    it.skip("new_passkey_valid_after_rotation", async () => {})
  })

  describe("registry recovery", () => {
    it.skip("registry_recovery_success", async () => {})
    it.skip("registry_recovery_invalid_proof", async () => {})
    it.skip("registry_recovery_wrong_owner", async () => {})
  })

  describe("attacks", () => {
    it.skip("attack_raw_transaction_without_sdk", async () => {})
    it.skip("attack_direct_rpc_submission", async () => {})
    it.skip("attack_manual_instruction_forgery", async () => {})
    it.skip("attack_modified_ix_order", async () => {})
    it.skip("attack_fake_record_proof_ix", async () => {})
  })

  describe("edge cases", () => {
    it.skip("enforce_with_zero_nonce", async () => {})
    it.skip("enforce_with_max_nonce", async () => {})
    it.skip("enforce_with_empty_policy", async () => {})
    it.skip("enforce_with_long_policy", async () => {})
    it.skip("enforce_with_unicode_policy", async () => {})
  })
})

Always
  params:  none
  model:   self-verifying
  fires:   unconditionally, every call
  guard:   verifies proof is valid for this payload, nothing else

Limit
  params:  offset: u8, limit: u64, operator: Gte | Lte
  model:   self-verifying
  fires:   when u64 at ix_data[offset] satisfies operator against limit
  guard:   reads raw bytes from Instructions sysvar at offset, compares directly

Velocity
  params:  limit: u64
  model:   program-attested
  fires:   when cumulative + amount > limit
  guard:   trusts cumulative from program, enforces sum against limit
  note:    window reset logic is entirely the program's responsibility

RapidDrain
  params:  deposit_window_slots: u64, drain_pct: u8
  model:   program-attested
  fires:   when program attests last_deposit within window && amount >= pct * last_deposit
  guard:   trusts program's last_deposit_amount and last_deposit_slot

RecipientNovelty
  params:  none (approved set lives in program's own state)
  model:   program-attested
  fires:   when program attests recipient has never received from this program before
  guard:   trusts program's novelty flag, verifies proof binds to recipient pubkey

CallerNotApproved
  params:  none (approved set lives in program's own state)
  model:   program-attested
  fires:   when program attests signer is not in its known approved set
  guard:   trusts program's approved flag, verifies proof binds to caller pubkey

AuthorityChange
ConfigMutation
EmergencyToggle
  params:  none
  model:   Always with semantic label
  fires:   unconditionally
  guard:   identical to Always — proof validity only
  note:    separate variants exist solely for policy string in ProofVerified event

NotBefore
  params:  slot: u64
  model:   self-verifying (conditional passkey gate)
  fires:   when current_slot < slot — passkey required until the slot is reached
  guard:   reads Clock sysvar directly, program cannot influence
  after:   once the target slot is reached, calls proceed freely (no proof)
  use:     new feature requiring manual approval during its rollout window

NotAfter
  params:  slot: u64
  model:   self-verifying (conditional passkey gate)
  fires:   when current_slot > slot — passkey required after the slot passes
  guard:   reads Clock sysvar directly, program cannot influence
  before:  until the slot passes, calls proceed freely (no proof)
  use:     emergency freeze that auto-activates at a specific slot without
           needing an explicit pause instruction

Custom
  params:  policy_string: String, context: Vec<u8>
  model:   program-attested
  fires:   condition fully owned by the program, encoded in proof
  guard:   verifies proof is valid for this payload and policy string, nothing else
  note:    Concentration is the canonical example — program passes
           amount * 100 / total as context, policy string "trana.concentration"

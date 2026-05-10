// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

use anchor_lang::prelude::*;

#[error_code]
pub enum AuthorityError {
    #[msg("Target account does not match the registered record")]
    TargetMismatch,
}

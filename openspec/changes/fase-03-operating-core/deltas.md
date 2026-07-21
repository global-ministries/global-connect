# Implementation deltas — Fase 3 Operating Core

These deltas were discovered during staging validation against `supabase_global_staging` after all 24 slices landed in `main`. They are deliberate design decisions, not bugs.

## Delta 1 — Public tokens atomicity

**Spec:** `INSERT ... ON CONFLICT (token_hash) DO NOTHING RETURNING`.

**Implementation:** `SELECT ... FOR UPDATE SKIP LOCKED` followed by `UPDATE SET consumed_at = now()`. Caller is responsible for INSERT uniqueness; the claim is atomic.

**Rationale:** Row-level lock on the token row during consume prevents double-claim without requiring a unique constraint on `token_hash` at INSERT time. This decouples uniqueness enforcement from claim semantics.

## Delta 2 — Notification outbox state machine

**Spec:** enum includes `terminal` as the final success status.

**Implementation:** enum is `{pending, processing, dispatched, failed}`. `dispatched` is the terminal-success state.

**Additionally:** `claim_operating_core_notification_outbox_batch` does NOT only transition pending→processing. It also re-claims `processing` rows whose `locked_at < now() - p_lock_timeout`, treating them as stuck and re-processing.

**Rationale:** The lock-and-stuck-reclaim pattern prevents orphaned processing rows when a worker crashes mid-claim. `dispatched` is the terminal success state; `failed` is the terminal failure state.

-- ══════════════════════════════════════════════════════════════════════════════
-- Operating Core Public Tokens Schema
-- Fase 3 — Additive migration. Does NOT modify existing Fase 1/Fase 2/Fase 3 tables.
-- This migration is a future-apply bundle — NOT applied to any database yet.
-- Rollback: simply do not apply this migration.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Table: operating_core_public_tokens ─────────────────────────────────────
-- Stores SHA-256 hashes of raw public tokens. The raw token is NEVER stored.
-- Single-use atomic claim via operating_core_claim_public_token RPC.
-- Hash is irreversible; raw token is delivered via registration link.

CREATE TABLE operating_core_public_tokens (
  token_hash       text        NOT NULL PRIMARY KEY,
  resource_type    text        NOT NULL,                          -- 'registration_link' | 'manual_registration' | etc.
  resource_id      uuid        NOT NULL,                          -- event_id, form_id, etc.
  persona_id       uuid,                                           -- optional pre-assigned persona
  expires_at       timestamptz NOT NULL,
  consumed_at      timestamptz,                                   -- null = not yet claimed
  consumed_by_persona_id uuid,                                    -- who claimed it
  captured_by_persona_id  uuid,                                   -- who created the token
  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb
                    CHECK (
                      NOT (metadata ? 'cedula')  AND
                      NOT (metadata ? 'telefono') AND
                      NOT (metadata ? 'email')   AND
                      NOT (metadata ? 'nombre')  AND
                      NOT (metadata ? 'apellido')
                    ),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE INDEX idx_oc_public_tokens_expires_at   ON operating_core_public_tokens(expires_at);
CREATE INDEX idx_oc_public_tokens_resource     ON operating_core_public_tokens(resource_type, resource_id);
CREATE INDEX idx_oc_public_tokens_persona      ON operating_core_public_tokens(persona_id);
CREATE INDEX idx_oc_public_tokens_consumed_at  ON operating_core_public_tokens(consumed_at);

RESET lock_timeout;
RESET statement_timeout;

-- ── RLS: deny-by-default ──────────────────────────────────────────────────────

ALTER TABLE operating_core_public_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE operating_core_public_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE operating_core_public_tokens TO service_role;

-- ── Atomic single-use claim RPC ────────────────────────────────────────────────
-- Uses SELECT FOR UPDATE SKIP LOCKED to guarantee exactly one consumer wins
-- under concurrent calls. Returns NULL if token is already consumed or expired.
-- Callers treat NULL as 404 (not-found / replay).

CREATE OR REPLACE FUNCTION public.operating_core_claim_public_token(
  p_token_hash           text,
  p_consuming_persona_id  uuid DEFAULT NULL
) RETURNS operating_core_public_tokens
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token operating_core_public_tokens;
BEGIN
  -- Lock the row (SKIP LOCKED = skip if already locked by another tx)
  SELECT * INTO v_token
  FROM operating_core_public_tokens
  WHERE token_hash = p_token_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;  -- token not found, already consumed, or expired → 404 from caller
  END IF;

  -- Mark as consumed atomically
  UPDATE operating_core_public_tokens
  SET consumed_at = now(),
      consumed_by_persona_id = COALESCE(p_consuming_persona_id, consumed_by_persona_id)
  WHERE token_hash = p_token_hash;

  -- Return the updated row
  SELECT * INTO v_token FROM operating_core_public_tokens WHERE token_hash = p_token_hash;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.operating_core_claim_public_token(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operating_core_claim_public_token(text, uuid)
  TO service_role;

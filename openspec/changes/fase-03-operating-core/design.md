# Design: Fase 3 — Operating Core

> Additive over Fase 2; one ledger, many capture shells; no `uno_a_uno`/`one_on_one_logged`; Fase 1/2 modules byte-identical.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## Technical Approach

New `lib/platform/operating-core/**` mirrors Fase 2 `dream-team`: contracts → state-machine → errors → route-access → repos → fakes → Supabase adapter → API → tests. Visitor-resolution adapter reuses `persona.ts` + `usuarios.cedula` (no parallel identity contract). Service ≠ Experience ≠ Event ≠ EventInstance; lazy `{freq,interval,count,until,byDay,start_time}` materialization; future instances only. Capabilities gate writes via `auth_has_operating_core_capability` mirror; route helpers `requireOperatingCoreSession` + `hasOperatingCoreCapability` + flag reader `isOperatingCoreEnabled`. Dashboard slice is additive via `lib/platform/operating-core/dashboards/loader.ts` — does NOT redesign `obtenerDatosDashboard.ts`. Structured log per critical action (no Sentry). jsonb CHECK rejects `metadata ? 'cedula'` / `metadata ? 'telefono'` / `metadata ? 'email'` (PII discipline). Service-config is **single-campus per Service row** — Multi-tenant/multi-campus is OUT OF FASE 3 SCOPE (tracked-issues note).

## Architecture Decisions

| # | Choice | Rationale |
|---|---|---|
| D1 | `operating-core/**` sibling of `dream-team` | One namespace |
| D2 | Additive migrations ≤400 or `size:exception` | Per-slice |
| D3 | Event = single table + `kind` (`service\|group_meeting\|workshop\|activity\|custom`; `camp` rejected) | Mirrors `dream-team/types.ts` |
| D4 | Partial unique + 6-state; atomic `promote_waitlist`; waitlist→200; 409=non-waitlistable\|invalid\|irreconcilable | DB-authoritative |
| D5 | `capacity_operativa <= capacity_base`; above-base rejected; scoped `operating_core.capacity.manage` (directors default) | Manual |
| D6 | Adapter: persona+candidates+cedula; 4-state match; visitor_capture non-PII; ambiguous→operator; no_match→minimal | Reuse `persona.ts` |
| D7 | Generalize Support drain; Vercel Cron host; bounded retry; `operating_core.drain.rate_per_second` env knob | Reuse infra |
| D8 | `auth_has_operating_core_capability` mirrors helper; RLS uses; `requireOperatingCoreSession` + `hasOperatingCoreCapability` route helpers + `isOperatingCoreEnabled` flag reader | Phase 2 |
| D9 | Single-use public tokens: `operating_core_public_tokens` with `INSERT ... ON CONFLICT (token_hash) DO NOTHING RETURNING` | Atomic |

## DB-side hardening

- **Atomic public tokens** — `operating_core_public_tokens (token_hash PK, expires_at, consumed_at, ...)`; redeem via `INSERT ... ON CONFLICT (token_hash) DO NOTHING RETURNING` → single-use atomicity; replay→404.
- **Generalized outbox claim RPC** — `claim_operating_core_notification_outbox_batch(batch_size int, lock_timeout_ms int)` via Vercel Cron at `operating_core.drain.rate_per_second`.
- **uno_a_uno defense in depth** — `REVOKE ALL ON public.uno_a_uno_reuniones FROM PUBLIC, anon, authenticated; GRANT ALL TO service_role` AND `REVOKE ALL ON public.uno_a_uno_participantes FROM PUBLIC, anon, authenticated; GRANT ALL TO service_role` (service_role only).
- **Recurrence horizon** — materializer exposes `horizonDays` when request exceeds cap.
- **Drain observability** — Structured log per claim/release; no Sentry.
- **Dashboard non-redesign** — additive loader at `lib/platform/operating-core/dashboards/loader.ts`; `obtenerDatosDashboard.ts` untouched.

## Data Flow

Capture UX → ResolveVisitor (cedula→usuarios.id; candidates→operator; no_match→minimal+autoMerge=false) → recordVisitorCapture (non-PII; jsonb CHECK rejects if `metadata ? 'cedula'|'telefono'|'email'`) → Registration RPC: auto+open→confirmada, auto+overflow→waitlist+200, manual→pendiente, 409 on non-waitlistable/invalid/irreconcilable → emitParticipationEvent (11 kinds; `one_on_one_logged` rejected) → outbox enqueue (`claim_operating_core_notification_outbox_batch`) drained by Vercel Cron. GDV bridge emits `attendance`/`attendance_update` (read-only). Capacity override (≤ base) → promote_waitlist. Recurrent instances honor `horizonDays`.

## File Changes

- **Create:** `lib/platform/operating-core/**` (contracts, sibling flags/kinds/state-machine/route-access/errors + repos/fakes/adapters + `dashboards/loader.ts`); `lib/platform/adapters/operating-core-grupos-vida.ts` + `app/api/operating-core/**` (deny-by-default, 400/401/403/404/409, no 500); `emails/operating-core/*.v1.tsx` + partitioned `supabase/migrations/<ts>_operating_core_*.sql` + tests.
- **Modify (additive):** `lib/platform/experiences.ts`, `lib/supabase/database.types.ts`. Only `buscar_usuarios_para_grupo` signature is byte-protected.

## Interfaces / Contracts

```ts
export const OPERATING_CORE_PARTICIPATION_KINDS = [
  'attendance','visitor_capture','registration','cancellation','check_in','check_out',
  'attendance_update','service_assignment','requirement_update','transition','document_received',
] as const
export const REGISTRATION_STATES = ['pendiente','confirmada','asistida','no_asistio','cancelada','rechazada'] as const
// Errors: 400 invalid, 401 no session, 403 capability/flag, 404 not-found/flag-off/token-replay/identity-disclosure,
// 409 capacity conflict, invalid transition, irreconcilable idempotency. Business outcomes never surface as 500.
```

## Testing Strategy

- **Unit:** `operating-core/**`; visitor 4-state; capacity validator; 6-state; kinds guard — Jest+ts-jest, fakes, RED→GREEN.
- **Integration:** Repos vs local Supabase; RLS deny-by-default; partial unique collapses concurrent duplicates; single-use tokens; drain — `pnpm test` + local supabase.
- **Route:** Every `app/api/operating-core/**`: auth→401, capability→403, flag off→404, capacity→409, business never→500; token expiry/replay/rate-limit — per-route table.
- **Contract:** `buscar_usuarios_para_grupo` byte-identical by parameter NAMES (alphabetical sort trap); ledger non-PII; `one_on_one_logged` rejected; no `uno_a_uno` use — snapshot diff; grep over fixtures.

## Threat Matrix (N/A rows inherited in tasks.md)

- **N/A:** Doc-like paths, git repo selection, commit/push/PR state — unchanged tooling.
- **NEW · Migration DDL:** CI grep rejects `DROP TABLE operating_core_participation_eventos` AND `DELETE FROM operating_core_participation_eventos`; `ALTER COLUMN` on Fase 2 tables also fails.
- **NEW · Token replay:** Single-use atomicity via `operating_core_public_tokens` + `INSERT ... ON CONFLICT (token_hash) DO NOTHING RETURNING`; replay returns 404.
- **NEW · Capacity override above base:** Rejected at domain layer; never persisted.
- **NEW · Multi-tenant/multi-campus:** Multi-tenant/multi-campus is OUT OF FASE 3 SCOPE — tracked-issues note; single-campus per Service row.

## Migration/Rollout

Additive migrations, ≤400 lines or `size:exception` (S03+S10 only). CI grep **fails CI** on `DROP TABLE operating_core_participation_eventos` AND `DELETE FROM operating_core_participation_eventos`. Apply after Issue #103 closure; regenerate types; verify `buscar_usuarios_para_grupo` byte-identical. Flag default OFF; flip after ≥7 green days in staging. Kill switch; no destructive rollback. Participation retention: Legal (no defaults).

## Open Questions

Issue #103 ownership (Security); coverage floors (Engineering); mobile-nav baseline root cause (Frontend); sent-email retention (Legal/Product); KPI targets (Product/Ops).
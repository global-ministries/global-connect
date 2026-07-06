## Exploration: Task 5.1 — uno_a_uno Preflight Module

### Current State

**Drift confirmed across 5 dimensions:**

| Dimension | Status | Evidence |
|-----------|--------|----------|
| DB types (TypeScript) | ✅ Present | `database.types.ts` L3025-3171: `uno_a_uno_reuniones` (id, fecha, fecha_registro, grupo_id, hora, lider_usuario_id, notas_privadas) + `uno_a_uno_participantes` (id, miembro_usuario_id, reunion_id). FKs to `usuarios`, `grupos`, and views. |
| DB tables (live) | ✅ Present | As stated in task brief: tables exist with RLS and 0 rows. (Not verified via DB — read-only constraints.) |
| DB migration (local) | ❌ Missing | `grep -r uno_a_uno supabase/migrations/` → **0 results**. No migration file in the 100+ files references either table. |
| Routes/actions | ❌ Missing | `glob **/uno_a_uno*` → **0 files**. No pages, actions, or API routes. |
| Capability in catalog | ❌ Missing | `uno_a_uno.global.read` is NOT in `PLATFORM_CAPABILITIES` in `experiences.ts`. It appears only in test fixtures and `navigation.ts` as a nav item reference — but `resolvePlatformCapability()` would return `unknown_capability` for it at runtime. |

**Additional dead-code signals:**
- Navigation item `uno_a_uno_global` in `navigation.ts` L66-71 has no `availableHref`, so `toNavigationItem()` returns `undefined` — permanently invisible even if the capability were declared.
- `the_living_room` experience exists in `PLATFORM_EXPERIENCE_CATALOG` with `scopeTypes: ['experience']`, but it has no functional backend.
- Test fixtures in 5 test files include `uno_a_uno.global.read` capability, but those tests don't assert uno_a_uno-specific behavior — it's just noise in the capability array.

### Affected Areas

- `lib/supabase/database.types.ts` L3025-3171 — source of truth for column shapes; reference for preflight schema verification
- `lib/platform/experiences.ts` — `uno_a_uno.global.read` absent from `PLATFORM_CAPABILITIES`; when declared, must map to `the_living_room` experience
- `lib/platform/navigation.ts` L25, 66-71, 86 — dead nav item; no `availableHref`, permanently invisible
- `supabase/migrations/` — **no** migration for `uno_a_uno_reuniones` or `uno_a_uno_participantes`
- `lib/platform/routeGuard.ts` — pattern to follow: pure function, discriminated union return, test-first failure
- `__tests__/lib/platform/` — test directory with 7 existing platform test files; `routeGuard.test.ts` is the closest pattern

### Approaches

1. **Static registry with discriminated union (recommended)**
   - Pure TS module; no DB calls, no imports from `@/lib/supabase/*`. Exports `runUnoAUnoPreflight()` returning `{ ok: true, decision, evidence }` or `{ ok: false, reason, missing }`. A `registerUnoAUnoDecision()` function allows future commits to register formal decisions with required evidence. Default: denied with `reason: 'no_formal_decision'`.
   - Pros: Matches spec exactly (scenario "Preflight uno_a_uno falla" L65-69). Zero runtime dependencies. Testable as pure function. Pattern mirror of `routeGuard.ts` (pure, no external calls). Single source of truth for decision state.
   - Cons: Requires consumer to explicitly call the guard. Decision state is in-memory (module-level), not persisted across restarts — but that's fine because the decision is registered at build/deploy time in a future commit.
   - Effort: Low

2. **Schema-aware preflight that reads `database.types.ts` at build time**
   - Import `Database` type and validate column shapes, check migration directory via `fs`/`glob` at build time. More comprehensive but adds complexity.
   - Pros: Could assert column names match expected schema. Could check migration file existence programmatically.
   - Cons: Violates "pure, no DB calls" constraint (needs filesystem). Adds build-time dependency. Over-engineered for Fase 1 — the preflight is a guard, not a schema validator. The true validation happens at reconciliation time.
   - Effort: Medium

### Recommendation

**Approach 1** — static registry with discriminated union. The preflight's job is to block use until a formal decision is registered. It does NOT need to connect to a DB or read the filesystem. The evidence for decision registration is reviewed by humans, not automated by this guard.

Module shape:

```typescript
// lib/platform/preflight.ts

export type UnoAUnoDecision = 'baseline' | 'archive' | 'reintroduce'
export type UnoAUnoPreflightMissing =
  | 'baseline_migration'
  | 'schema_types_match'
  | 'live_tables_expected'
  | 'rls_verification'
  | 'rollback_strategy'

export type UnoAUnoPreflightResult =
  | { ok: true; decision: UnoAUnoDecision; evidence: Record<string, string> }
  | { ok: false; reason: 'no_formal_decision'; missing: UnoAUnoPreflightMissing[] }

// Module-level registry (mutable only via registerUnoAUnoDecision)
let registeredDecision: UnoAUnoPreflightResult | null = null

export function registerUnoAUnoDecision(decision: UnoAUnoPreflightResult): void {
  registeredDecision = decision
}

export function runUnoAUnoPreflight(): UnoAUnoPreflightResult {
  if (registeredDecision && registeredDecision.ok) return registeredDecision

  return {
    ok: false,
    reason: 'no_formal_decision',
    missing: [
      'baseline_migration',
      'schema_types_match',
      'live_tables_expected',
      'rls_verification',
      'rollback_strategy',
    ],
  }
}
```

**Test** (pre-implementation failure test):

```typescript
// __tests__/lib/platform/preflight.test.ts
describe('runUnoAUnoPreflight', () => {
  it('denies by default because no formal decision has been registered', () => {
    const result = runUnoAUnoPreflight()
    expect(result).toEqual({
      ok: false,
      reason: 'no_formal_decision',
      missing: expect.arrayContaining([
        'baseline_migration',
        'schema_types_match',
        'live_tables_expected',
        'rls_verification',
        'rollback_strategy',
      ]),
    })
  })

  it('allows when a formal decision has been registered with evidence', () => {
    registerUnoAUnoDecision({
      ok: true,
      decision: 'baseline',
      evidence: {
        migration_version: '20260629_001',
        rls_verified: 'true',
        rollback_script: 'supabase/migrations/...rollback.sql',
      },
    })
    expect(runUnoAUnoPreflight()).toEqual({
      ok: true,
      decision: 'baseline',
      evidence: expect.objectContaining({
        migration_version: '20260629_001',
      }),
    })
  })
})
```

### Risks

- **Module-level state across test runs**: `registerUnoAUnoDecision` mutates shared state. Tests must call `beforeEach` to reset, or use `jest.isolateModules()`. Solve by exporting a `resetUnoAUnoPreflight()` helper for test isolation — keep it non-public (underscore-prefixed or test-only).
- **Decision state is ephemeral**: After a server restart, the decision is lost. This is acceptable because the decision is registered in a future commit alongside the actual reconciliation work. The preflight is a build-time guard, not a runtime persistent gate.
- **`uno_a_uno.global.read` missing from capabilities catalog**: This is a separate PR concern — the preflight does not fix it. Document it in the exploration as awareness for the reconciliation PR.

### Ready for Proposal

**Yes.** This exploration is complete and the module design is minimal enough to proceed directly to proposal + spec. The orchestrator should tell the user:

> The drift is confirmed across 5 dimensions (types present, tables live, but NO migration, NO routes/actions, and `uno_a_uno.global.read` isn't even in the capability catalog — it's dead code). The preflight module is ~40 lines of pure TypeScript following the `routeGuard.ts` pattern: discriminated union, no DB calls, default denial. The test proves failure pre-implementation. No integration needed in this slice — purely a contract for future code. Change budget: ~60 lines (module + test). I'm ready for `sdd-propose`."

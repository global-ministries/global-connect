## Exploration: Fase 5 task 5.2 — `lib/platform/participation.ts` (longitudinal ledger contract)

### Current State

**`lib/platform/`** has 8 modules following a pure-typed, discriminated-union pattern:

- `routeGuard.ts` (63 lines) — pure `checkPlatformRouteAccess(input) → { allowed: true } | { allowed: false, reason }`.
- `preflight.ts` (68 lines) — pure `runPlatformUnoAUnoPreflight() → { ok: true, decision, evidence } | { ok: false, reason, missing }` + module-level registry.
- `family.ts` (117 lines) — taxonomy constants + helpers + labels (`PLATFORM_*` const arrays, `Platform*` types, pure helpers).
- `persona.ts` (243 lines) — async function but with **injected repository interface** (no DB import), pure resolution + audit.
- `experiences.ts` (240 lines) — `PLATFORM_EXPERIENCE_CATALOG`, `PLATFORM_CAPABILITIES`, `resolvePlatformCapability(input) → { ok: true, ... } | { ok: false, reason }`.
- `session/types.ts` — `PlatformSession { personaId, subjectAuthId, globalRoles, contexts, capabilities }`. **No ledger/history field.**
- `navigation.ts` — adapter pattern, calls `resolvePlatformCapability()` per item.
- `adapters/grupos-vida.ts`, `adapters/family.ts` — concrete adapters using the injected repository pattern.

**No `participation.ts` exists.** Search for `PlatformParticipation|PLATFORM_PARTICIPATION|ParticipationEvent|participation.ts` returns 0 matches in `lib/`. Only test fixtures and navigation use the related capability key `talleres_crecimiento.participation.read` for the menu item `talleres_participation` (`lib/platform/navigation.ts` L21, L82).

**Existing event-shaped code** (`lib/support/outbox.ts` L64, L78) is unrelated — support outbox, not participation.

**The design contract** (`openspec/changes/fase-01-platform-foundation/design.md` L60-69):

```ts
type ParticipationEvent = {
  personaId: string
  source: string
  eventType: string
  occurredAt: string
  scope?: { type: string; id: string }
  actorPersonaId?: string
  sensitivity: 'public' | 'internal' | 'sensitive'
  retentionPolicy: string
}
```

This is the canonical shape; the module must convert `eventType: string` to a literal union and `retentionPolicy: string` to a structured object while keeping the public field names aligned with the design.

**Spec requirements** (`specs/platform-participation-history/spec.md`):
- R1: Single generic ledger contract, no isolated per-module ledgers.
- R2: Event semantics — Person, source (experience/domain), eventType, occurredAt, scope/reference, optional actor.
- R3: Sensitivity classification, retention per type, read boundaries by Person/scope/source, backend/RLS reinforcement, no revealing sensitive existence on denial.
- R4: `uno_a_uno` drift preservation (out of scope for this slice — task 5.1 already addressed it).

### Affected Areas

- `lib/platform/participation.ts` — **new file**, the only deliverable for 5.2.
- `__tests__/lib/platform/participation.test.ts` — **new file**, mandatory companion (mirrors `family.test.ts` and `preflight.test.ts`).
- `lib/platform/experiences.ts` — read-only reference for `PLATFORM_CAPABILITIES`, `PLATFORM_EXPERIENCE_CATALOG`, `PLATFORM_SCOPE_TYPES`. **No changes** in this slice (see Open Questions).
- `lib/platform/session/types.ts` — read-only reference for `PlatformSession`. No shape change in this slice (the contract is for future adapters; consumers don't exist yet).
- `lib/platform/preflight.ts` — sibling pattern to follow (pure, discriminated-union, module-level registry, `_reset` test helper).

### Approaches

1. **Pure contract module with literal unions + lookup maps + read guard** (recommended)
   - Define `PLATFORM_PARTICIPATION_EVENT_TYPES` as `as const` tuple (7 entries per orchestrator brief), type alias, sensitivity levels tuple, retention type, `PLATFORM_PARTICIPATION_SENSITIVITY` and `PLATFORM_PARTICIPATION_RETENTION` `Record<>` maps, the `PlatformParticipationEvent` contract, and a pure `canReadPlatformParticipationEvent(input)` guard returning `{ allowed: true, reason } | { allowed: false, reason }`.
   - **Pros:** Mirrors `family.ts` (taxonomy + helpers) for the constants and `routeGuard.ts`/`preflight.ts` for the guard. Zero DB coupling, zero `@/lib/supabase/*` imports. Fully testable as pure functions. Reusable by future adapters (Phase 6 grants audit) without changing this module. Enforces the design contract literal-union over `string` for `eventType` and structured object over `string` for `retentionPolicy`.
   - **Cons:** Does not yet answer *which* capabilities authorize `family_consent`/`contact_authorization` reads (no such capability exists today). The guard will need to reason about `system_audit` reasons against capabilities that don't exist yet — handle as `sensitive_no_capability` for now, defer real `system_audit` capability to Phase 6.
   - **Effort:** Low.

2. **Pure module + add new capabilities in `PLATFORM_CAPABILITIES`**
   - Same as (1) plus add `family.consent.read`, `family.contact_authorization.read`, etc.
   - **Pros:** Closes the gap for sensitive reads today.
   - **Cons:** Couples task 5.2 with catalog changes outside its scope. R-series review (4R) has previously pushed back on adding capabilities without an adapter that exercises them. Spec says "Operating Core concretará eventos y captura después" — capability additions belong with Operating Core work, not this contract slice.
   - **Effort:** Medium. Higher risk of `400-line budget` overrun and a 4R scope creep finding.

3. **Full ledger query adapter + contract**
   - Implement `resolveParticipationHistory(session, repository)` returning `{ ok, events, audit }` like the family/grupos-vida adapters.
   - **Pros:** Complete ledger flow.
   - **Cons:** Exceeds 5.2 scope; requires a DB/repository interface design that doesn't exist. Future task should do this. Violates "pure module, no DB" interpretation in the brief.
   - **Effort:** Medium-High. Wrong slice.

### Recommendation

**Approach 1** — pure contract module. Mirrors the precedent set by `preflight.ts` (task 5.1) and `family.ts` (task 4.1): discriminated unions, no DB, testable as a unit, consumed by future work without further changes here.

#### Proposed minimum API

```typescript
// lib/platform/participation.ts

// ── Event type taxonomy ─────────────────────────────────────────────
export const PLATFORM_PARTICIPATION_EVENT_TYPES = [
  'attendance',
  'service',
  'taller_participation',
  'group_join',
  'group_leave',
  'family_consent',
  'contact_authorization',
] as const
export type PlatformParticipationEventType = (typeof PLATFORM_PARTICIPATION_EVENT_TYPES)[number]

// ── Sensitivity classification ─────────────────────────────────────
export const PLATFORM_PARTICIPATION_SENSITIVITY_LEVELS = ['public', 'internal', 'sensitive'] as const
export type PlatformParticipationEventSensitivity = (typeof PLATFORM_PARTICIPATION_SENSITIVITY_LEVELS)[number]

// ── Retention policy (structured object, NOT a string) ────────────
export type PlatformParticipationRetention = {
  /** Minimum days the event MUST be retained for legal/audit needs. */
  minDays: number
  /** Maximum days the event MAY be retained before anonymization/purge. */
  maxDays: number
  /** True when the type cannot be retained without an explicit, granular consent. */
  requiresExplicitConsentToRetain: boolean
}

// ── Event contract (mirrors design.md L60-69 with stricter types) ──
export type PlatformParticipationEvent = {
  personaId: string
  source: string
  eventType: PlatformParticipationEventType
  occurredAt: string // ISO 8601; validation deferred to consumer
  scope?: { type: string; id: string }
  actorPersonaId?: string
  sensitivity: PlatformParticipationEventSensitivity
  retentionPolicy: PlatformParticipationRetention
}

// ── Per-type lookup maps (single source of truth) ──────────────────
export const PLATFORM_PARTICIPATION_SENSITIVITY: Record<PlatformParticipationEventType, PlatformParticipationEventSensitivity> = {
  attendance: 'internal',
  service: 'internal',
  taller_participation: 'internal',
  group_join: 'internal',
  group_leave: 'internal',
  family_consent: 'sensitive',
  contact_authorization: 'sensitive',
}

export const PLATFORM_PARTICIPATION_RETENTION: Record<PlatformParticipationEventType, PlatformParticipationRetention> = {
  attendance: { minDays: 365, maxDays: 730, requiresExplicitConsentToRetain: false },
  service: { minDays: 365, maxDays: 730, requiresExplicitConsentToRetain: false },
  taller_participation: { minDays: 365, maxDays: 1095, requiresExplicitConsentToRetain: false },
  group_join: { minDays: 180, maxDays: 730, requiresExplicitConsentToRetain: false },
  group_leave: { minDays: 180, maxDays: 730, requiresExplicitConsentToRetain: false },
  family_consent: { minDays: 365, maxDays: 1825, requiresExplicitConsentToRetain: true },
  contact_authorization: { minDays: 90, maxDays: 730, requiresExplicitConsentToRetain: true },
}

// ── Read guard ─────────────────────────────────────────────────────
export type PlatformParticipationReadAllowedReason = 'self' | 'scoped_capability' | 'system_audit'
export type PlatformParticipationReadDeniedReason =
  | 'insufficient_scope'
  | 'sensitive_no_capability'
  | 'no_actor'
  | 'no_event'

export type PlatformParticipationReadResult =
  | { allowed: true; reason: PlatformParticipationReadAllowedReason }
  | { allowed: false; reason: PlatformParticipationReadDeniedReason }

export type PlatformParticipationReadInput = {
  actorPersonaId: string | null | undefined
  event: PlatformParticipationEvent | null | undefined
  /** Optional; used to grant `scoped_capability` and `system_audit` paths. */
  capabilities?: readonly { key: string; experience: string; scopeType: string; scopeId?: string; source: string }[]
}

export function canReadPlatformParticipationEvent(input: PlatformParticipationReadInput): PlatformParticipationReadResult {
  // 1. No event → denied: 'no_event'
  // 2. No actor → denied: 'no_actor'
  // 3. actor.personaId === event.personaId → allowed: 'self'
  // 4. event.sensitivity === 'sensitive' and actor lacks a capability scoped to event.source+scope → denied: 'sensitive_no_capability'
  // 5. actor has a capability whose scope matches event.scope → allowed: 'scoped_capability'
  // 6. otherwise → denied: 'insufficient_scope'
}
```

**Notes on the guard:**
- The spec says denial MUST NOT reveal the existence of sensitive data. The guard returns a discriminated union without echoing the event content on denial, satisfying that requirement.
- `system_audit` is reserved for a future system-audit capability (Phase 6 territory) — current module does not need to know about it beyond accepting the reason name. For Fase 5 we can simplify: the guard never returns `system_audit` in this slice because no capability maps to it yet, but the union member stays for forward-compat (defer-as-discriminator, not as runtime branch).
- Public/internal events fall under `insufficient_scope` if no capability matches — the actor needs a scoped capability even for `public` events because the read API surface itself is gated, mirroring the route-guard pattern.

#### Minimum test (mirrors `family.test.ts` + `preflight.test.ts`)

```typescript
// __tests__/lib/platform/participation.test.ts

describe('lib/platform/participation', () => {
  describe('PLATFORM_PARTICIPATION_EVENT_TYPES', () => {
    it('exposes the 7 event types in the exact order from the brief')
    it('has a Spanish description per type') // optional; defer to 4R-style decision
  })

  describe('PLATFORM_PARTICIPATION_SENSITIVITY_LEVELS', () => {
    it('exposes the 3 sensitivity levels in public/internal/sensitive order')
  })

  describe('PLATFORM_PARTICIPATION_SENSITIVITY map', () => {
    it('classifies family_consent and contact_authorization as sensitive')
    it('classifies the remaining 5 types as internal')
    it('covers every PlatformParticipationEventType key exactly once')
  })

  describe('PLATFORM_PARTICIPATION_RETENTION map', () => {
    it('covers every PlatformParticipationEventType key exactly once')
    it('has minDays > 0 and maxDays >= minDays for every entry')
    it('marks sensitive types with requiresExplicitConsentToRetain=true')
    it('marks internal types with requiresExplicitConsentToRetain=false')
  })

  describe('canReadPlatformParticipationEvent', () => {
    it('denies with no_event when event is null or undefined')
    it('denies with no_actor when actorPersonaId is blank or missing')
    it('allows with self when actor.personaId === event.personaId')
    it('denies with insufficient_scope when no capability matches a public/internal event')
    it('allows with scoped_capability when capability scope matches event.source+scope')
    it('denies with sensitive_no_capability when sensitivity is sensitive and no capability matches')
    it('denies without revealing sensitive existence — denial reason is one of the typed reasons, not free-form')
    it('treats event with optional scope as scoped to its source only')
    it('treats capability with scopeType=experience as matching any scopeId')
  })
})
```

Test estimate: 12-15 cases, ~150-200 lines.

### Recommendation: Capabilities & Experience changes?

**No.** This slice is contract-only. Justification:

- **Capabilities (`PLATFORM_CAPABILITIES`):** The only existing capability that touches participation events today is `talleres_crecimiento.participation.read`. The guard accepts generic capability shape (`{ key, experience, scopeType, scopeId?, source }`) — not a `PlatformCapabilityKey` literal — so it works with current and future capabilities without catalog changes. Adding new capabilities like `family.consent.read` would couple 5.2 with Operating Core scope and risk 4R creep findings.
- **Experience (`PLATFORM_EXPERIENCE_CATALOG`):** The 7 event types map onto existing experiences (`attendance`/`group_join`/`group_leave` → `grupos_vida`, `service` → `dps`, `taller_participation` → `talleres_crecimiento`, `family_consent`/`contact_authorization` → `family`). The event's `source: string` is intentionally generic so the module doesn't need to import the experience catalog. No catalog change needed.

### Risks

- **Discriminated `eventType` vs `string` in design.md** — The design says `eventType: string` but the brief asks for a literal union. This is a deliberate tightening: the design is descriptive of intent, the module is the executable contract. Document the rationale in the module's JSDoc.
- **Retention values are proposals, not legal review** — `minDays`/`maxDays` per event type are guesses based on common practice (365-1825 days). Phase 6/Operating Core must validate against actual legal/audit requirements before any DB schema uses these values. Mark the map values as `// TODO(legal-review)` in JSDoc.
- **No `system_audit` capability yet** — The guard's `system_audit` allowed reason exists in the union but no current code path returns it. If a future test expects `system_audit`, it will fail today. Mitigation: do not add tests that assert `system_audit` in this slice; defer to Phase 6 when the audit capability is defined.
- **Sensitive-data leak via denial message** — The discriminated union avoids this. The test must assert that the guard never echoes event content (`personaId`, `actorPersonaId`, `source`, `scope`) on denial paths.
- **Scope matching edge cases** — `scopeType: 'experience'` should match any `scopeId` (or no `scopeId`) because experience-scoped capabilities are global to that experience. The test must cover this.

### Non-Goals (Task 5.2)

- ❌ No DB/RLS/RPC/migration changes.
- ❌ No `PLATFORM_CAPABILITIES` additions.
- ❌ No `PLATFORM_EXPERIENCE_CATALOG` additions.
- ❌ No `PlatformSession` shape change.
- ❌ No `getUserWithRoles` / `useCurrentUser` / navigation / dashboard integration.
- ❌ No adapter that actually reads/writes events.
- ❌ No replacement or extension of `lib/support/outbox.ts`.
- ❌ No `uno_a_uno` changes (already addressed in 5.1).
- ❌ No UI changes.
- ❌ No tests asserting `system_audit` reason returns (deferred to Phase 6).

### Expected Changed-Line Budget

| File | Lines |
|------|-------|
| `lib/platform/participation.ts` (new) | 130–180 |
| `__tests__/lib/platform/participation.test.ts` (new) | 150–200 |
| **Total** | **280–380** |

Comfortably within the 400-line PR budget. No edits to existing files.

### Skill Resolution

- `sdd-explore` — executing this exploration.
- `typescript` — strict mode, `as const`, `satisfies`, type guards, discriminated unions. `PlatformParticipationEventType` is a literal union; `PLATFORM_PARTICIPATION_SENSITIVITY` is a `Record<PlatformParticipationEventType, ...>` with full coverage enforced at compile time.
- `security-nextjs` — relevant for ensuring no `NEXT_PUBLIC_*` exposure of the participation contract (this is server-only data). Module lives in `lib/platform/` which is server-only by convention. No env vars touched.
- `work-unit-commits` — this is a single self-contained work unit (`feat(platform): participation ledger contract`) that future PRs (Operating Core, audit) build on. Single PR is appropriate.
- `nextjs-app-router-fundamentals` — not applicable (no routes/pages).
- `supabase-postgres-best-practices` — not applicable (no DB).

### Open Questions for User

1. **Retention defaults are guesses.** Should the module ship with concrete `minDays`/`maxDays` per event type, or should the values be `0 / Number.POSITIVE_INFINITY / false` placeholders that Operating Core fills in later? Recommendation: ship concrete values with a JSDoc note that they are pending legal review (proposal values above are common-practice placeholders, not authoritative).

2. **`system_audit` allowed reason in this slice.** Option A: keep `system_audit` in the union but never return it (forward-compat, no test coverage today). Option B: drop `system_audit` from the union until a system-audit capability exists. Recommendation: **Option A** — keeps the union stable for Phase 6 work and avoids a breaking rename.

3. **Should the guard accept `PlatformCapabilityKey` literal or generic capability shape?** The brief shows generic shape. The literal would force adding capabilities now (couples 5.2 with catalog changes). Recommendation: **generic shape** — works with current `talleres_crecimiento.participation.read` and any future capabilities without changes here.

4. **Spanish labels for event types?** `family.ts` ships with `PLATFORM_FAMILY_RELATION_LABELS`. Should `participation.ts` ship `PLATFORM_PARTICIPATION_EVENT_LABELS`? Recommendation: **defer to a future slice** — labels are UI concerns; the platform contract is intentionally neutral.

### Ready for Proposal

**Yes.** The scope is bounded, the pattern is precedent (mirrors `preflight.ts` 5.1 and `family.ts` 4.1), and the contract is the foundation Operating Core and Phase 6 audit will build on. Orchestrator should tell the user:

> Fase 5 task 5.2 is a pure contract module — `lib/platform/participation.ts` + tests, no DB. Mirrors the `preflight.ts`/`routeGuard.ts` pattern exactly: literal-union event types, sensitivity levels, structured retention objects, lookup maps, and a pure read guard returning a discriminated union. ~280-380 changed lines, comfortably under the 400-line PR budget. No edits to existing files, no `PLATFORM_CAPABILITIES` or `PLATFORM_EXPERIENCE_CATALOG` changes (deferred to Operating Core/Phase 6). Three open questions for the user before `sdd-propose`: retention defaults, `system_audit` reason treatment, and capability shape. Ready to proceed.

### Suggested Issue Title/Body (Spanish project style)

**Title:** `feat(platform): contrato genérico de participación e historial en lib/platform/participation.ts`

**Body (AC):**

```markdown
## Contexto
Fase 1 — Platform Foundation, Fase 5 task 5.2.
Spec: `openspec/changes/fase-01-platform-foundation/specs/platform-participation-history/spec.md`
Design: `design.md` L60-69 (contrato `ParticipationEvent`).

## Alcance
- Crear `lib/platform/participation.ts` con contrato puro:
  - `PLATFORM_PARTICIPATION_EVENT_TYPES` (7 tipos literales)
  - `PlatformParticipationEventType`
  - `PLATFORM_PARTICIPATION_SENSITIVITY_LEVELS` (3 niveles)
  - `PlatformParticipationEventSensitivity`
  - `PlatformParticipationRetention` (objeto `{ minDays, maxDays, requiresExplicitConsentToRetain }`)
  - `PlatformParticipationEvent` (contrato)
  - `PLATFORM_PARTICIPATION_SENSITIVITY` (mapa `Record<...>`)
  - `PLATFORM_PARTICIPATION_RETENTION` (mapa `Record<...>`)
  - `canReadPlatformParticipationEvent(input) → { allowed: true, reason } | { allowed: false, reason }`
- Crear `__tests__/lib/platform/participation.test.ts` con cobertura de tipos, mapas y guard.

## Acceptance Criteria
- [ ] `lib/platform/participation.ts` con exports `Platform*` y constantes `PLATFORM_*` siguiendo la convención de `family.ts`/`preflight.ts`.
- [ ] `__tests__/lib/platform/participation.test.ts` con ≥ 90% cobertura y casos de denegación sin revelación.
- [ ] TypeScript strict mode compila sin errores; sin `any`, sin `@ts-ignore`.
- [ ] Tests pasan con `pnpm test`.
- [ ] Sin imports de `@/lib/supabase/*`, sin DB, sin filesystem.
- [ ] Sin cambios en archivos existentes fuera del scope.
- [ ] Sin adiciones a `PLATFORM_CAPABILITIES` ni `PLATFORM_EXPERIENCE_CATALOG` (defer a Operating Core / Fase 6).
- [ ] No se aplica `sdd-apply` ni migraciones; no se ejecuta `pnpm gen:types`.

## Fuera de alcance
- Adapter que lea/escriba eventos reales.
- Capabilities nuevas en `PLATFORM_CAPABILITIES`.
- Experiences nuevas en `PLATFORM_EXPERIENCE_CATALOG`.
- Cambios en `PlatformSession`.
- Cambios en navegación, dashboard, hooks, o RPCs.
- Migración funcional o `uno_a_uno` (ya cubierto en 5.1).

## Riesgo
Bajo. Módulo puro, sin acoplamiento runtime. Validación legal de `minDays`/`maxDays` queda pendiente para Operating Core / Fase 6.

## Changed-line budget
~280-380 líneas total (módulo + tests). Bien dentro del budget de 400.
```
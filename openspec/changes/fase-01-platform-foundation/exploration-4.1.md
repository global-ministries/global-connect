## Exploration: Task 4.1 — Family Taxonomy Module (`lib/platform/family.ts`)

### Current State

**Database schema** — three entities already exist:

| Table/Enum | Columns | Notes |
|---|---|---|
| `familias` | `id` (PK), `nombre: string|null`, `direccion_id` (FK→direcciones) | Thin grouping entity. Many usuarios can point to one familia via `usuarios.familia_id`. |
| `relaciones_usuarios` | `id` (PK), `usuario1_id` (FK→usuarios), `usuario2_id` (FK→usuarios), `tipo_relacion` (enum_tipo_relacion), `es_principal: boolean|null` | Bidirectional pair. Both FK columns reference `usuarios`. |
| `enum_tipo_relacion` | `'conyuge' | 'padre' | 'hijo' | 'tutor' | 'hermano' | 'otro_familiar'` | 6 values. No `autorizado` or `contacto` in DB. |
| `usuarios.familia_id` | FK → `familias` | Many-to-one grouping. |

**Existing RPCs**: `agregar_relacion_familiar_segura`, `eliminar_relacion_familiar_segura`, `eliminar_relacion_familiar`, `buscar_usuarios_para_relacion_familiar`, `obtener_conyugue`. All exist with RLS scoping; none are exposed through the platform layer yet.

**`lib/platform/` architecture** — 8 files exist. No `family.ts`:
- `session/types.ts` — `PlatformSession` has `personaId`, `subjectAuthId`, `globalRoles`, `contexts`, `capabilities`. **No `family` field.**
- `session/build.ts` — builds session from auth + persona lookup only.
- `experiences.ts` — catalog, capability resolution, `normalizePlatformScopeId`.
- `navigation.ts` — resolver with adapter pattern (`PlatformNavigationAdapter`).
- `routeGuard.ts` — `checkPlatformRouteAccess` permission marker.
- `flags.ts` — `NEXT_PUBLIC_*` feature flags.
- `persona.ts` — dedupe/lookup with masking.
- `adapters/grupos-vida.ts` — **the pattern to follow** (see below).

**Existing UI config** — `lib/config/relaciones-familiares.ts` exists as a UI-level module: Spanish labels, CSS colors, `invertirRelacion`, `esRelacionReciproca`. This is NOT a platform module — it serves UI rendering. Task 4.1 creates the platform-level taxonomy that *can be used by* UI modules later, but does NOT replace this file.

**`getUserWithRoles.ts`** — returns `{ user, roles, platformSession }`. Does NOT load family relationships. `platformSession` has no family data.

**`useCurrentUser.ts`** — client-safe. Same — `platformSession` is bare (no family context).

**Existing UI usage of family** — 3 pages query `relaciones_usuarios` directly (casas-anfitrionas, asistencia, segmentos). `users/[id]/page.tsx` and `users/[id]/edit/page.tsx` use `familia_id` and `relaciones-familiares` config. All raw queries — no platform abstraction.

**Tests** — `__tests__/lib/platform/grupos-vida-adapter.test.ts` exists (195 lines, comprehensive). No `family.test.ts` exists.

### Affected Areas

- `lib/platform/family.ts` — **new file** (core deliverable)
- `__tests__/lib/platform/family.test.ts` — **new file** (mandatory companion)
- `lib/platform/session/types.ts` — candidate for an additive `family?:` field if 4.1 decides to prep the session shape (**recommend: defer to adapter phase**)
- `lib/config/relaciones-familiares.ts` — **read-only reference**; do NOT modify
- `lib/supabase/database.types.ts` — **read-only source of truth** for the enum

### Adapter Pattern from `grupos-vida.ts`

Key characteristics for 4.1 to adopt:
1. **Read-only repository interface** — injected, not imported. Module defines contract but doesn't implement DB access.
2. **Pure async function** with `{ ok: true, ... } | { ok: false, reason }` union return type.
3. **Fails closed** — every malformed/null/empty input returns `{ ok: false, reason: '...' }`.
4. **Uses `normalizePlatformScopeId`** from `experiences.ts` for ID sanitization.
5. **Pure helper functions** — `canReadGruposVidaGroup`, `filterGruposVidaRecordsByScope` are standalone, testable, zero-dependency.
6. **Explicit denied reasons** — typed union (`GruposVidaAdapterDeniedReason`), not free-form strings.
7. **Audit trail** — every result carries an audit object with decision, reason, counts.

**What 4.1 should adopt vs. defer:**
- **Adopt**: typed taxonomy, validation/normalization helpers, typed reason unions, pure functions.
- **Defer**: repository interface, async resolution, audit trail — those come with the family adapter (future task).

### Approaches

1. **Taxonomy-only pure module** — Define `FAMILY_RELATION_TYPES` as const, type guards, normalization helpers, and semantic helpers (reciprocal, invert). Future types (`autorizado`, `contacto`) as separate const with tag. No PlatformSession changes.
   - Pros: smallest surface, zero dependencies, fully testable, aligns with spec non-goals.
   - Cons: doesn't integrate with session yet (that's intentional).
   - Effort: Low

2. **Taxonomy + PlatformSession prep** — Same as (1) but also add `family?: FamilyRelationContext[]` to PlatformSession types and export a placeholder shape.
   - Pros: prepares session for future adapter integration.
   - Cons: couples session to a shape before the adapter exists; violates YAGNI for this phase; adds surface without tests proving it loads correctly.
   - Effort: Low

3. **Full adapter + taxonomy** — Build the adapter now (load from DB via repository interface), in addition to the taxonomy.
   - Pros: complete family context flow.
   - Cons: exceeds 4.1 scope per tasks.md; requires DB/repository design; likely too large for a single PR.
   - Effort: Medium

### Recommendation

**Approach 1 — Taxonomy-only pure module.** It's the smallest unit that satisfies task 4.1's mandate ("Crear `lib/platform/family.ts` con taxonomía existente... y futuros `autorizado/contacto` explícitos") without overlapping with future adapter/DB work.

### Risks

- Duplicating labels with `lib/config/relaciones-familiares.ts` — acceptable because platform concerns ≠ UI concerns. Future consolidation is possible.
- `tutor` inverse (`tutelado`) does not exist in DB enum — module must return `null` for inversion, not fabricate a type.
- Future types `autorizado`/`contacto` could be misinterpreted as permission grants — module must include JSDoc clarifying they are context-only.

### Proposed Module API

```typescript
// ─── Taxonomy (current) ───
export const FAMILY_RELATION_TYPES = [
  'conyuge', 'padre', 'hijo', 'tutor', 'hermano', 'otro_familiar',
] as const;
export type FamilyRelationType = (typeof FAMILY_RELATION_TYPES)[number];

// ─── Taxonomy (future — forward-compat) ───
export const FUTURE_FAMILY_RELATION_TYPES = ['autorizado', 'contacto'] as const;
export type FutureFamilyRelationType = (typeof FUTURE_FAMILY_RELATION_TYPES)[number];

export type AnyFamilyRelationType = FamilyRelationType | FutureFamilyRelationType;

// ─── Labels (Spanish, platform-level) ───
export const FAMILY_RELATION_LABELS: Record<FamilyRelationType | FutureFamilyRelationType, string>;

// ─── Type guards ───
export function isFamilyRelationType(value: string): value is FamilyRelationType;
export function isFutureFamilyRelationType(value: string): value is FutureFamilyRelationType;
export function isAnyFamilyRelationType(value: string): value is AnyFamilyRelationType;

// ─── Normalization ───
export function normalizeFamilyRelationType(value: string | null | undefined): FamilyRelationType | undefined;

// ─── Relationship semantics ───
export function isReciprocalFamilyRelation(type: FamilyRelationType): boolean;
// "conyuge", "hermano", "otro_familiar" → true
export function invertFamilyRelation(type: FamilyRelationType): FamilyRelationType | null;
// "padre" → "hijo", "hijo" → "padre", "conyuge" → "conyuge", "tutor" → null
```

### Non-Goals (Task 4.1)

- ❌ No UI changes.
- ❌ No new routes.
- ❌ No DB/RLS/RPC/migration changes.
- ❌ No exposing family data client-side.
- ❌ No loading from DB (no adapter, no repository).
- ❌ No PlatformSession shape changes.
- ❌ No `getUserWithRoles` or `useCurrentUser` changes.
- ❌ No navigation or dashboard integration.
- ❌ No permission/authorization logic.
- ❌ No replacement of `lib/config/relaciones-familiares.ts`.

### 4.1 vs 4.2 Split Recommendation

**Merge into one PR.** 4.1 (module) without 4.2 (tests) is incomplete. 4.2 without 4.1 has nothing to test. Combined ~500–750 changed lines — within a reviewable PR. Fase 4 has only these 2 tasks, suggesting they form one logical unit.

### Suggested Tests

- Taxonomy: exactly 6 current + 2 future types; labels cover all; labels are non-empty Spanish strings.
- `isFamilyRelationType`: true for each valid type, false for null/empty/future/arbitrary; TypeScript narrowing.
- `isAnyFamilyRelationType`: true for current + future, false for unknown.
- `isReciprocalFamilyRelation`: 'conyuge'/'hermano'/'otro_familiar' → true; 'padre'/'hijo'/'tutor' → false.
- `invertFamilyRelation`: 'padre'→'hijo', 'hijo'→'padre', 'conyuge'→'conyuge', 'tutor'→null.
- `normalizeFamilyRelationType`: case-insensitive, trimmed, returns undefined for future/unknown/null.
- Denial scenarios (4.2): tutor without operational permission, minor without auth, family context insufficient for experience access.

### Suggested Issue (Spanish)

**Title:** `feat(platform): crear módulo de taxonomía familiar en lib/platform/family.ts`

**Acceptance Criteria:**
- [ ] `lib/platform/family.ts` creado con taxonomy exports tipados
- [ ] `__tests__/lib/platform/family.test.ts` con cobertura ≥ 90%
- [ ] TypeScript strict mode compila sin errores
- [ ] Tests pasan con `pnpm test`
- [ ] Sin cambios en archivos existentes fuera del scope
- [ ] Sin imports de Supabase, DB, o módulos de UI
- [ ] `autorizado` y `contacto` modelados como forward-compat separados

### Expected Changed-Line Budget

| File | Lines |
|------|-------|
| `lib/platform/family.ts` (new) | 120–160 |
| `__tests__/lib/platform/family.test.ts` (new) | 180–250 |
| **Total** | **300–410** |

### Open Questions for User

1. **¿`autorizado` y `contacto` en union único o namespace separado?** Recomiendo `AnyFamilyRelationType` único pero con type guard `isFamilyRelationType` que excluye futuros — así el type system protege que no se usen como si ya existieran.

2. **¿`invertFamilyRelation('tutor')` → `null` o `'tutelado'`?** DB no tiene `tutelado`. UI config sí lo incluye. Recomiendo `null` (consistente con DB), documentando `tutelado` como posible adición futura.

3. **¿Duplicar etiquetas con `lib/config/relaciones-familiares.ts`?** Sí — el módulo de plataforma debe ser autosuficiente. Concerns distintos. Futuro refactor puede consolidar.

### Ready for Proposal

Yes — exploration has sufficient evidence. Orchestrator should proceed to `sdd-propose` for task 4.1.

### Skill Resolution

- `sdd-explore` — executing
- `typescript` — strict mode, `as const`, `satisfies`, type guards, no `any`
- `nextjs-app-router-fundamentals` — not applicable (no routes/pages)
- `security-nextjs` — relevant for ensuring no NEXT_PUBLIC_ exposure in future adapter
- `supabase-postgres-best-practices` — indirectly relevant (RLS exists for family tables; 4.1 does not touch DB)

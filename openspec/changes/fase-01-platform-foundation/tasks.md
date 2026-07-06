# Tareas: Fase 1 — Platform Foundation

> Plan de implementación por PRs después del planning mergeado. PR1a registra progreso de implementación; los gates de estrategia siguen aplicando antes de ampliar futuros slices.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,200–1,800 |
| Suggested split | PR 1a → PR 1b → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 → PR 7 |
| Delivery strategy | stacked-to-main para PR1a; ask-on-risk para slices futuros |

Decision needed before apply: No para PR1a aprobado; sí antes de cambiar estrategia o ampliar futuros slices
Chained PRs recommended: Yes
Chain strategy: stacked-to-main para PR1a; confirmar por slice futuro
400-line budget risk: High

**Gate obligatorio para futuros slices:** mantener PRs encadenados y no ampliar alcance sin confirmar estrategia. Un PR único para toda la fase queda bloqueado salvo aprobación explícita `size:exception` del mantenedor.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1a | Auth/sesión | PR 1a | `auth.uid()`/server session y rechazo de `personaId` cliente |
| 1b | Persona/dedupe | PR 1b | anti-enumeración, masking y boundaries base; issue #203 |
| 2 | Capabilities/scopes fail-closed | PR 2 | Allowlist, scopes inválidos, tests de denegación |
| 3 | Adapter GDV read-only | PR 3 | Delegar RPC/RLS actuales; tests de compatibilidad |
| 4 | Menú/dashboard contextual | PR 4 | Feature flag, kill switch, fallback legado y tests UI/server |
| 5 | Familia/menores | PR 5 | Permisos base deny-by-default; tests de tutor/menor/sensibles |
| 6 | Ledger + `uno_a_uno` preflight | PR 6 | Sensibilidad, retención, RLS y bloqueo 1:1 verificable |
| 7 | Grants audit + rollout | PR 7 | Auditoría, métricas, alertas y gates productivos |

## Fase 1: Auth, Persona y scopes

- [x] 1.1 Crear `lib/platform/session/types.ts` y builder desde `auth.uid()`/server session; rechazar `personaId` cliente como identidad; tests.
- [x] 1.2 Crear `lib/platform/persona.ts` para búsqueda/dedupe con minimización, masking, auditoría, boundaries base de actor/flujo/scope requerido y tests anti-enumeración.
- [x] 1.3 Crear `lib/platform/experiences.ts` y scopes allowlisted; scopes ausentes/malformados/desconocidos/duplicados/conflictivos fallan cerrado con tests.

## Fase 2: Adapter GDV read-only

- [x] 2.1 Crear `lib/platform/adapters/grupos-vida.ts` para mapear contexto GDV sin reemplazar RPC/RLS ni flujos existentes.
- [x] 2.2 Agregar `__tests__/lib/platform/grupos-vida-adapter.test.ts`: director autorizado, adapter fallido, tutor sin permiso y ausencia de permisos cruzados.

## Fase 3: Menú y dashboard

- [x] 3.1 Actualizar `lib/getUserWithRoles.ts`, `lib/auth/requireAuth.ts` y `hooks/useCurrentUser.ts` con `platformSession` read-only y fallback legado.
  - PR #211 / issue #210: `lib/getUserWithRoles.ts` y `lib/auth/requireAuth.ts` exponen `platformSession` read-only con fallback legado.
  - Issue #212: `hooks/useCurrentUser.ts` expone `platformSession` client-safe de solo lectura (`personaId`, `subjectAuthId`, roles legados y arrays vacíos de contextos/capabilities), conserva roles/capabilities legacy, falla cerrado a `null` si no hay Persona vinculada y no cambia navegación/dashboard visible.
- [x] 3.2 Actualizar `lib/platform/navigation.ts`, `sidebar-moderna.tsx`, `header-movil.tsx`, `menu-inferior-movil.tsx` y dashboard con flag/kill switch.
  - Issue #214: primer slice interno crea `lib/platform/navigation.ts` con resolver/modelo puro, flag/kill switch, fallback legado deny-by-default y tests; sin wiring visible de sidebar/header/mobile/dashboard.
  - Issue #216: slice sidebar-only cablea `sidebar-moderna.tsx` al resolver contextual detrás de flag/kill switch, conserva fallback legado y agrega tests de scope permitido/denegaciones globales; header/mobile/dashboard seguían pendientes en ese slice.
  - Issue #218: slice header mobile cablea `header-movil.tsx` al resolver contextual detrás de flag/kill switch; conserva fallback legado y prueba scope permitido, kill switch y supresión de rutas no disponibles/accesos globales. `menu-inferior-movil.tsx` y dashboard seguían pendientes en ese momento.
  - Issue #220: slice menú inferior móvil cablea `menu-inferior-movil.tsx` al helper contextual compartido detrás de flag/kill switch para presentación de navegación UI; conserva fallback legado solo con flag off, kill switch o carga finalizada sin sesión de plataforma, y no presenta enlaces legacy/globales mientras `useCurrentUser` carga, una sesión de plataforma resuelve, cambia de sesión o queda sin ítems visibles. No implementa ni afirma autorización de rutas directas; task 3.3 sigue pendiente.
  - Issue #222: slice dashboard cablea `platformSession` desde `obtenerDatosDashboard()` y agrega una sección pequeña de “Contextos visibles” detrás de flag/kill switch; solo presenta `/grupos-vida` para scope GDV elegible, conserva el dashboard legacy como contenido principal y no implementa autorización de rutas directas.
  - Issue #224 (hotfix): corrige navegación colgada por `loading` atascado en transiciones client-side en `menu-inferior-movil.tsx`, `sidebar-moderna.tsx`, `header-movil.tsx` y `hooks/useCurrentUser.ts`.
- [x] 3.3 Verificar rutas directas denegadas, fallback legado si adapters fallan, y no mostrar DPS admin, NextGen, taller admin ni 1:1 global.
  - Issue #226: crear `lib/platform/routeGuard.ts` (`checkPlatformRouteAccess`), `lib/platform/flags.ts` (`getPlatformNavigationFlags`) y aplicar guard a `app/(auth)/configuracion/page.tsx`, `app/(auth)/configuracion/directores-generales/page.tsx` y `app/(auth)/configuracion/soporte/page.tsx`. El helper es un marcador de permiso para Fase 1; cada página decide el redirect con `if (!routeGuard.allowed) redirect('/dashboard')`.

## Fase 4: Familia y menores

- [x] 4.1 Crear `lib/platform/family.ts` con taxonomía existente (`conyuge`, `padre`, `hijo`, `tutor`, `hermano`, `otro_familiar`) y futuros `autorizado/contacto` explícitos.
  - Issue #228: `lib/platform/family.ts` + `__tests__/lib/platform/family.test.ts` en rama `feat/228-family-taxonomy`.
  - Revisión 4R (fixes no bloqueantes): renombrar exports con prefijo `Platform*`, agregar guard `isPlatformFutureFamilyRelationType`, test de involution y normalización de solo espacios en blanco.
- [x] 4.2 Probar tutor denegado, menor sin auth, permiso familiar insuficiente y no exposición de datos sensibles por backend/RLS.
  - Issue #230: `lib/platform/adapters/family.ts` (renamed from `familia.ts`) + `lib/platform/family/canAccessMinorData.ts` + tests + capabilities `family.minor.read`/`family.minor.consent` en `lib/platform/experiences.ts`. Aplicados fixes 4R: exports `Family*`, eliminado `esPrincipal`/`explicit_authorized`, extraído `normalizePlatformPersonaId`, sin `no_family_relations`/`not_a_minor`.

## Fase 5: Ledger longitudinal y `uno_a_uno` preflight

- [x] 5.1 Crear `lib/platform/preflight.ts` para bloquear `uno_a_uno` sin baseline/archive/reintroducción formal; test de falla pre-implementación.
  - Issue #232: `lib/platform/preflight.ts` + `__tests__/lib/platform/preflight.test.ts`. Preflight puro discriminated-union, sin DB ni imports de `@/lib/supabase/*`; registro mutable solo vía `registerPlatformUnoAUnoDecision`; denegación por defecto con `reason: 'no_formal_decision'` y `PLATFORM_UNO_A_UNO_REQUIRED_STEPS`. R2 aplicado: nombres con prefijo `Platform*`, evidencia discriminada por decisión (`PlatformUnoAUnoBaselineEvidence`, `PlatformUnoAUnoArchiveEvidence`, `PlatformUnoAUnoReintroduceEvidence`) y `PlatformUnoAUnoRegisteredDecision` estrechado a `ok: true`.
- [x] 5.2 Crear `lib/platform/participation.ts` con clasificación de sensibilidad, retención, actor/fuente y boundaries de lectura.
  - Issue #234: `lib/platform/participation.ts` + `__tests__/lib/platform/participation.test.ts` en rama `feat/234-participation-contract`. Contrato puro con tuplas literales `as const` para los 7 tipos de evento y los 3 niveles de sensibilidad, `PLATFORM_PARTICIPATION_SENSITIVITY` y `PLATFORM_PARTICIPATION_RETENTION` con cobertura exhaustiva (`Record<PlatformParticipationEventType, ...>`), `PlatformParticipationEvent`/`PlatformParticipationEventScope`, capability genérica `{ key, experience, scopeType, scopeId?, source }`, y `canReadPlatformParticipationEvent` con precedencia `no_event` → `no_actor` → `self` → `scoped_capability` → (`sensitive_no_capability` o `insufficient_scope`). `system_audit` queda en la unión como forward-compat de Fase 6 (no se devuelve aún). Sin DB/RLS/RPC, sin imports `@/lib/supabase/*`.
- [x] 5.3 Probar lectura autorizada, denegación fuera de scope, evento sin permisos y no revelación de existencia de datos sensibles.
  - Issue #236: Cierre formal con trazabilidad de los escenarios del spec `platform-participation-history` + creación de la interface `PlatformParticipationReadRepository` (read-only) y del fake `ParticipationInMemoryAdapter`, para que futuros adapters reales puedan enchufarse sin tocar el guard. El repositorio solo devuelve eventos; la autorización sigue centralizada en `canReadPlatformParticipationEvent` (separación de responsabilidades). Cada escenario queda trazado a los tests que lo cubren:
    - Escenario "Evento transversal" → `__tests__/lib/platform/participation-integration.test.ts`: "returns Taller participation events by actor personaId" + "returns Taller participation events by scope"; tipo literal cubierto por `participation.test.ts`: "exposes the 7 event types in the canonical order from the brief".
    - Escenario "Lectura longitudinal autorizada" → `participation-integration.test.ts`: "allows Taller event self-read with explicit actor match" + "allows scoped read of another persona Taller event with a matching capability"; refuerzo unitario en `participation.test.ts`: "allows with scoped_capability when capability matches experience+scopeType+scopeId".
    - Escenario "Lectura fuera de boundary" → `participation-integration.test.ts`: "denies cross-persona read without revealing event existence"; refuerzo unitario en `participation.test.ts`: "denies with insufficient_scope when no capability matches the event scope".
    - Escenario "No revelación de existencia de datos sensibles" → `participation-integration.test.ts`: "denies sensitive event read with no leakage of event payload"; refuerzo unitario en `participation.test.ts`: "returns the discriminated denial without echoing event content" + "denies with sensitive_no_capability when no capability matches the event scope".
  - Adapter stub: `lib/platform/adapters/participation-adapter.ts` con `ParticipationInMemoryAdapter` (implementa `PlatformParticipationReadRepository`), filtrado puro sobre `this.events`, sin DB/env/RLS. La interface `PlatformParticipationReadRepository` se agrega de forma aditiva en `lib/platform/participation.ts`.

## Fase 6: Grants y observabilidad

- [x] 6.1 Crear `lib/platform/grants.ts` con auditoría actor/fuente/before-after/deny, logs de denegación, métricas y alertas.
  - Issue #238: `lib/platform/grants.ts` + `__tests__/lib/platform/grants.test.ts`. Contrato puro con taxonomía `grant|revoke|deny|audit`, logger con `getEvents()` para test assertions, métricas acumuladas por `${experience}|${source}|${decision}` y alerta pura sobre denegaciones cuando `count > maxDenials`.

## Fase 7: Rollout y gates por PR

- [ ] 7.1 Exigir por PR: tests del slice, build verde, umbral de error/denegación productiva, rollout staged y ruta fix-forward/rollback al legado.

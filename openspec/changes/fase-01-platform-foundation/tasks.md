# Tareas: Fase 1 — Platform Foundation

> Plan de implementación futura. No aplicar en el PR documental/SDD.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,200–1,800 |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 → PR 7 |
| Delivery strategy | ask-on-risk |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

**Gate obligatorio antes de implementar:** no ejecutar `sdd-apply` ni abrir un PR de implementación hasta elegir `stacked-to-main` o `feature-branch-chain`. Un PR único para esta fase queda bloqueado salvo aprobación explícita `size:exception` del mantenedor.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Auth/sesión + Persona/dedupe | PR 1 | `auth.uid()`/server session, anti-enumeración y tests del slice |
| 2 | Capabilities/scopes fail-closed | PR 2 | Allowlist, scopes inválidos, tests de denegación |
| 3 | Adapter GDV read-only | PR 3 | Delegar RPC/RLS actuales; tests de compatibilidad |
| 4 | Menú/dashboard contextual | PR 4 | Feature flag, kill switch, fallback legado y tests UI/server |
| 5 | Familia/menores | PR 5 | Permisos base deny-by-default; tests de tutor/menor/sensibles |
| 6 | Ledger + `uno_a_uno` preflight | PR 6 | Sensibilidad, retención, RLS y bloqueo 1:1 verificable |
| 7 | Grants audit + rollout | PR 7 | Auditoría, métricas, alertas y gates productivos |

## Fase 1: Auth, Persona y scopes

- [ ] 1.1 Crear `lib/platform/session/types.ts` y builder desde `auth.uid()`/server session; rechazar `personaId` cliente como identidad; tests.
- [ ] 1.2 Crear `lib/platform/persona.ts` para búsqueda/dedupe con minimización, masking, auditoría, boundaries y tests anti-enumeración.
- [ ] 1.3 Crear `lib/platform/experiences.ts` y scopes allowlisted; scopes ausentes/malformados/desconocidos/duplicados/conflictivos fallan cerrado con tests.

## Fase 2: Adapter GDV read-only

- [ ] 2.1 Crear `lib/platform/adapters/grupos-vida.ts` para mapear contexto GDV sin reemplazar RPC/RLS ni flujos existentes.
- [ ] 2.2 Agregar `__tests__/lib/platform/grupos-vida-adapter.test.ts`: director autorizado, adapter fallido, tutor sin permiso y ausencia de permisos cruzados.

## Fase 3: Menú y dashboard

- [ ] 3.1 Actualizar `lib/getUserWithRoles.ts`, `lib/auth/requireAuth.ts` y `hooks/useCurrentUser.ts` con `platformSession` read-only y fallback legado.
- [ ] 3.2 Actualizar `lib/platform/navigation.ts`, `sidebar-moderna.tsx`, `header-movil.tsx`, `menu-inferior-movil.tsx` y dashboard con flag/kill switch.
- [ ] 3.3 Verificar rutas directas denegadas, fallback legado si adapters fallan, y no mostrar DPS admin, NextGen, taller admin ni 1:1 global.

## Fase 4: Familia y menores

- [ ] 4.1 Crear `lib/platform/family.ts` con taxonomía existente (`conyuge`, `padre`, `hijo`, `tutor`, `hermano`, `otro_familiar`) y futuros `autorizado/contacto` explícitos.
- [ ] 4.2 Probar tutor denegado, menor sin auth, permiso familiar insuficiente y no exposición de datos sensibles por backend/RLS.

## Fase 5: Ledger longitudinal y `uno_a_uno` preflight

- [ ] 5.1 Crear `lib/platform/preflight.ts` para bloquear `uno_a_uno` sin baseline/archive/reintroducción formal; test de falla pre-implementación.
- [ ] 5.2 Crear `lib/platform/participation.ts` con clasificación de sensibilidad, retención, actor/fuente y boundaries de lectura.
- [ ] 5.3 Probar lectura autorizada, denegación fuera de scope, evento sin permisos y no revelación de existencia de datos sensibles.

## Fase 6: Grants y observabilidad

- [ ] 6.1 Crear `lib/platform/grants.ts` con auditoría actor/fuente/before-after/deny, logs de denegación, métricas y alertas.

## Fase 7: Rollout y gates por PR

- [ ] 7.1 Exigir por PR: tests del slice, build verde, umbral de error/denegación productiva, rollout staged y ruta fix-forward/rollback al legado.

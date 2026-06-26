# Diseño: Fase 1 — Platform Foundation

## Enfoque técnico

La fase define una foundation aditiva, sin cambios de comportamiento. `usuarios.id` se usa como representación operacional inicial de Persona, mientras `auth_id` sigue siendo vínculo opcional con Supabase Auth. Las nuevas capas futuras se diseñan como contratos: catálogo de experiencias, responsabilidades/capabilities con scope, helper de sesión contextual, contexto familiar y ledger longitudinal. Grupos de Vida conserva sus tablas, RPCs, RLS, acciones y dashboards; Platform Foundation solo lo expondrá por adapters de lectura.

## Decisiones de arquitectura

| Decisión | Alternativa | Resolución y rationale |
|---|---|---|
| Persona sobre `usuarios` | Crear `personas` ahora | Usar `usuarios` primero evita identidad paralela; cualquier tabla nueva requiere evidencia de límite real. |
| Auth como vínculo opcional | Persona = cuenta auth | `auth_id` nullable ya permite menores, visitantes y participantes sin login; auth solo autentica sesiones. |
| Sesión desde sujeto backend | Aceptar `personaId` del cliente | La identidad autenticada se resuelve desde `auth.uid()`/server session; un `personaId` cliente solo puede ser filtro autorizado, nunca identidad. |
| Experiencias como catálogo | Roles globales por área | El catálogo organiza scope; evita explosión de roles y separa experiencia, servicio, participación y familia. |
| Capabilities scoped | Reutilizar `support_user_capabilities` | Soporte inspira allowlist/auditoría, pero una tabla global debe soportar experiencia/equipo/grupo/etapa/salón. |
| Adapter GDV | Reescribir GDV | GDV es producción-crítico; los adapters mapean contexto y delegan permisos a RPC/RLS actuales. |
| `uno_a_uno` bloqueado | Usar tablas existentes | Hay drift entre tipos/live DB y migraciones locales; Fase 1 solo documenta el bloqueo. |

## Flujo de datos

```text
Supabase Auth (`auth.uid()`/server session) ── auth_id ──> Persona (`usuarios.id`)
                               │
                               ├─ roles globales mínimos
                               ├─ adapters GDV ──> RPC/RLS GDV existentes
                               ├─ responsabilidades/capabilities scoped
                               ├─ relaciones familiares
                               └─ ledger longitudinal

Contrato de sesión backend ──> menú contextual ──> dashboard por contextos visibles
```

El helper futuro debe resolver un contrato de solo lectura para sesión/menu/dashboard desde el sujeto autenticado del backend. La UI puede ocultar entradas por contexto, pero el servidor y las RPC/RLS siguen siendo autoridad para acceso directo. Si la sesión de plataforma o un adapter falla, menú y dashboard deben conservar fallback legado y denegar capacidades nuevas.

## Cambios de archivos previstos

| Archivo / área | Acción futura | Descripción |
|---|---|---|
| `lib/getUserWithRoles.ts` | Modificar | Evolucionar a helper de sesión con Persona, roles mínimos, responsabilidades y capabilities. |
| `lib/auth/requireAuth.ts` | Modificar | Mantener auth, pero exponer Persona/capability checks server-side. |
| `hooks/useCurrentUser.ts` | Modificar | Consumir contrato contextual; no limitarse a roles y soporte. |
| `lib/dashboard/obtenerDatosDashboard.ts`, `app/(auth)/dashboard/page.tsx` | Modificar | Pasar de `rolPrincipal` único a dashboard por contextos visibles. |
| `components/ui/sidebar-moderna.tsx`, `header-movil.tsx`, `menu-inferior-movil.tsx` | Modificar | Centralizar navegación por capabilities/contextos; evitar duplicación desktop/móvil. |
| `lib/actions/group*.ts`, `lib/actions/asistencia-avanzada.actions.ts` | Mantener/adaptar | No cambiar GDV; futuros adapters leen contexto y delegan permisos actuales. |
| `lib/supabase/database.types.ts`, `supabase/migrations/**` | Aditivo futuro | Tablas/contracts para experiencias, scopes, grants auditables, dedupe y ledger. |
| `lib/platform/*` y tests relacionados | Crear futuro | Contratos fail-closed, dedupe privado, auditoría/observabilidad y preflight `uno_a_uno`. |

## Interfaces / contratos

```ts
type PlatformSession = {
  personaId: string
  subjectAuthId: string
  authId?: string
  globalRoles: string[]
  contexts: Array<{ experience: string; scopeType: string; scopeId?: string; label: string }>
  capabilities: Array<{ key: string; experience: string; scopeType: string; scopeId?: string; source: string }>
}

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

type GrantAuditEvent = {
  actorPersonaId: string
  source: string
  before?: unknown
  after?: unknown
  decision: 'grant' | 'revoke' | 'deny'
}
```

`personaId` no se acepta como identidad autenticada desde cliente. Relaciones familiares (`familias`, `relaciones_usuarios`, `enum_tipo_relacion`) dan contexto y permisos base explícitos, no operación NextGen. Menores pueden existir como Persona sin auth, pero no reciben sesión/menu/dashboard directos salvo vínculo con cuenta auth o acceso por actor autorizado con scope explícito.

## Caso de validación

Una Persona única puede ser director de etapa GDV por `segmento_lideres`/`director_etapa_grupos`, bajista en DPS Música por responsabilidad scoped futura, cónyuge, padre/tutor de un niño Waumbaland y un hijo InsideOut, y participante de “De hombre a hombre” por ledger. Debe ver contexto GDV autorizado, DPS propio, familia e historial de taller. No debe administrar DPS, operar NextGen, administrar talleres, acceder a 1:1 global ni recibir permisos por matrimonio, paternidad o participación.

## Estrategia de pruebas

| Capa | Qué probar | Enfoque |
|---|---|---|
| Slice auth/sesión | `auth.uid()` como sujeto, rechazo de `personaId` cliente, scopes inválidos fail-closed | Unit/integration antes de exponer sesión. |
| Slice GDV | Adapter read-only, delegación a RPC/RLS existentes, tutor/relación sin permisos GDV | Integration/smoke por PR. |
| Slice menú/dashboard | Fallback legado, kill switch, denegación server-side de acciones ocultas | Unit + E2E mínimo por PR. |
| Slice familia/ledger/grants | Menor sin auth, no exposición sensible, RLS/retención, auditoría y métricas de denegación | Unit/integration por slice. |

## Migración / rollout

No hay migración funcional en esta fase. La implementación futura debe usar feature flag/kill switch para sesión, menú y dashboard; fallback legado si falla PlatformSession/adapters; rollout staged; gates de build/test; y gate productivo por tasa de errores/denegaciones inesperadas. El camino de recuperación debe definir fix-forward o rollback al contrato legado sin pérdida de acceso actual.

Grants/capabilities deben registrar actor, fuente, before/after, denegaciones, métricas y alertas con checks de visibilidad productiva. `uno_a_uno` queda bloqueado hasta una estrategia formal: baseline migration, archivo del drift o reintroducción explícita, con verificación RLS y criterios de rollback antes de usarlo.

## Preguntas abiertas

- [ ] Definir nombres finales de tablas de plataforma en la fase de tareas/implementación.
- [ ] Reconciliar `openspec/config.yaml` ausente antes de depender de reglas locales de OpenSpec.
- [ ] Definir umbrales finales de rollout y error-rate gate antes de `sdd-apply`.

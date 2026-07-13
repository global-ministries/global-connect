# Proposal — Fase 2: Dream Team Global Base

## 1. Contexto y motivación

GlobalConnect ya tiene **Persona única, Experiencias, Capabilities scoped, Grants auditables, Historial longitudinal, Navegación contextual y RouteGuard** (Fase 1 cerrada en `c364128`, 666 tests, flag `NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED=off` en Vercel). Pero el sistema **no sabe todavía quién sirve en qué**.

Fase 2 del roadmap (`globalconnect-roadmap-maestro-v1.md`) define Dream Team como **toda persona que sirve en cualquier experiencia**. Hoy esto es implícito: el adapter de Grupos de Vida solo expone `director_etapa`; la capability `dps.team.serve` existe en el allowlist pero no tiene backend, ni adapter, ni tabla DB que la respalde; no hay concepto de estado de servicio, requisitos, ni jerarquías configurables.

Esta fase crea la **base global de servicio**: el modelo de dominio que representa «una persona sirve en una experiencia, en un equipo, con un rol, en un estado, con requisitos auditables», integrado con los contratos puros que Fase 1 dejó listos (`experiences`, `grants`, `participation`, adapters). Sin UI operativa todavía: la asignación es por admin/director (no auto-postulación) y la operación por experiencia es scope de Fase 3+ (Operating Core).

## 2. Outcome esperado

Al cerrar Fase 2 el sistema puede:

- Representar que **Ana sirve en DPS / Producción Técnica / Cámara** y **en Estudiantes / Transit** como dos servicios simultáneos, independientes, cada uno con su rol, estado, requisitos y grants.
- Exponer cada servicio como `PlatformSessionCapability` con scope concreto (`{ experience, scopeType: 'equipo', scopeId }`).
- Transicionar un servicio por una **state machine de 6 estados** (`postulado → orientación → activo → pausa|inactivo → retirado`) con motivo obligatorio y fila de auditoría por transición.
- Otorgar grants al pasar a `activo` y revocarlos al pasar a `pausa`, con auditoría y re-otorgamiento automático al volver.
- Reconocer automáticamente a **líderes de Grupos de Vida como Dream Team** vía adapter read-only separado (`dream-team-gdv.ts`), sin tocar el adapter existente.
- Exponer **métricas mínimas en endpoint de lectura** (cuántos sirven, distribución de roles, requisitos vencidos) — sin widget en dashboard.
- Alimentar el historial longitudinal vía eventos `service` en `participation.ts` (contrato ya está; falta productor y adapter Supabase, scope de Fase 3).
- Mantener Grupos de Vida, soporte y `support_user_capabilities` **intactos**.

## 3. Alcance funcional (in-scope)

### 3.1. Servicio por experiencia/equipo/rol
Una fila en `dream_team_servicios` con FK a persona (`usuarios.id`), FK a rol (que a su vez referencia equipo → experiencia), estado, fechas, notas. Se modela como triple `(persona, equipo, rol)` con cardinalidad N:M:M.

### 3.2. Múltiples servicios simultáneos
N filas en `dream_team_servicios` por persona. Cada fila produce **una capability independiente** en `PlatformSession.capabilities[]`. El adapter las mergea siguiendo el patrón `applyAdapters()` existente en `resolvePlatformNavigation()`.

### 3.3. Jerarquías configurables
`dream_team_roles` con `parent_role_id` opcional (adjacency list, 2-3 niveles máximo). Un equipo puede tener director + coordinador + voluntario, o solo voluntario, o solo líder. **No se asume jerarquía rígida.**

### 3.4. Estado de servicio (state machine de 6 estados)
Enum `enum_dream_team_estado` con 6 valores y forward-only con retorno limitado. Toda transición registra fila en `dream_team_estados_historial` con motivo obligatorio.

### 3.5. Requisitos configurables (modelo de datos)
`dream_team_requisitos` por rol con `obligatoriedad` (requerido | opcional | no aplica) y `tipo` (documento | capacitacion | entrevista | politicas | otro). `dream_team_requisitos_verificacion` por (servicio, requisito) con estado (pendiente | completado | vencido | no aplica), fecha y verificador. **Vencidos alertan, no bloquean.**

### 3.6. Integración con Grupos de Vida (adapter separado)
`lib/platform/adapters/dream-team-gdv.ts` lee `grupo_miembros` para líderes de grupo y los mapea como `PlatformSessionCapability` con key `dream_team.gdv.lead`. **No modifica** `lib/platform/adapters/grupos-vida.ts`.

### 3.7. Grants de servicio
Al transicionar a `activo` se emiten `PlatformGrantAuditEvent` `decision: 'grant'` para cada capability nueva. Al transicionar a `pausa` se emiten `revoke` y se registra snapshot de grants pausados (`paused_grants`) en historial; al volver a `activo` se re-otorgan automáticamente.

### 3.8. Historial longitudinal vía participation
Al cambiar de estado, se emite `PlatformParticipationEvent` tipo `service` con scope de la experiencia/equipo. Productor puro en `lib/platform/dream-team.ts`; el adapter DB real es scope de Fase 3 (Operating Core).

### 3.9. Métricas mínimas (endpoint de lectura)
`lib/platform/dream-team-metrics.ts` con funciones puras que computan: count por experiencia/equipo, count por estado, distribución de roles, count de requisitos vencidos. **Endpoint HTTP**, sin widget.

### 3.10. Concurrencia y auditoría
Dos admins editando el mismo servicio: estrategia a definir en diseño (candidatos: `updated_at` last-write-wins + audit, u optimistic locking con `version` column). **Toda acción de asignación, transición o verificación de requisito genera fila de auditoría.**

## 4. Fuera de alcance (non-goals)

- Onboarding completo (cursos / evaluaciones / firma digital legal)
- Auto-postulación de personas a vacantes (admin/director asigna siempre)
- UI para configurar requisitos (modelo de datos sí, UI en fase futura)
- Widget de métricas en dashboard contextual (solo endpoint)
- Operación de Grupos de Vida (no se rediseña)
- Operación de Niños / Estudiantes / The Living Room / DPS
- Mensajería interna, WhatsApp API, campamentos
- Implementación de `uno_a_uno` (preflight sigue bloqueando)
- Migraciones destructivas en DB (solo `CREATE TABLE`, `CREATE TYPE`, `CREATE INDEX`)
- Operating Core / dashboards avanzados
- Adapter DB real de `PlatformParticipationReadRepository` (scope de Fase 3)

## 5. Decisiones de producto (consolidadas)

| # | Decisión | Resolución |
|---|---|---|
| 1 | Adapter GDV | `lib/platform/adapters/dream-team-gdv.ts` separado; existente intacto |
| 2 | Asignación | Solo admin/director (no auto-postulación en Fase 2) |
| 3 | Requisitos | Solo modelo de datos (UI en fase futura) |
| 4 | Métricas | Solo endpoint de lectura (sin widget en dashboard) |
| 5 | Participation | Implementación Supabase completa (tabla real para eventos `service`) |
| 6 | Transiciones | Forward-only con retorno limitado: `postulado → orientación → activo → pausa\|inactivo → retirado`; `pausa → activo`; `inactivo → postulado`; `retirado` terminal. Motivo obligatorio + audit siempre |
| 7 | GDV liderazgo removido | Servicio pasa a `pausa` con motivo `gdv_liderazgo_removed`; membresía GDV NO se afecta; historial preservado si queda sin servicios |
| 8 | Requisitos vencidos | Alerta sin bloquear; métrica expuesta; NO pausa el servicio |
| 9 | Grants al activar | Se otorgan al pasar a `activo`; requisitos pendientes se registran sin bloquear |
| 10 | Grants en pausa | Se revocan automáticamente (entran al audit como `paused_grants`); al volver a `activo` se re-otorgan |

### 5.1. Decisión de capabilities (híbrido por dominio)

**Por qué híbrido y no genérico puro.** Un modelo con keys como `dream_team.serve` para todas las experiencias con `experience: 'dream_team'` rompe `resolvePlatformCapability()`: el resolver exige `scope.experience === definition.experience` (línea 150, `experiences.ts`). Una capability definida con `experience: 'dream_team'` rechazaría un grant con `experience: 'dps'` por `conflicting_scope`. El resolver no permite keys "variables" por experiencia.

**Por qué híbrido y no específico puro.** Un modelo con keys por cada combinación experiencia/rol/equipo (`dps.produccion-tecnica.camara.voluntario.serve`) explota combinatoriamente y viola el principio del roadmap de "evitar explosión de capabilities".

**Modelo híbrido adoptado — dos familias:**

| Familia | Experience en catalog | Descripción |
|---|---|---|
| **Genéricas Dream Team** | `dream_team` (nueva) | Gestión transversal de servicio |
| **Específicas por dominio** | Experiencia real (`dps`, `estudiantes`, etc.) | Navegación y operación por experiencia |

**Genéricas** (todas con `experience: 'dream_team'`):
| Capability | ScopeType |
|---|---|
| `dream_team.serve` | `experience` |
| `dream_team.lead` | `equipo` |
| `dream_team.coordinate` | `equipo` |
| `dream_team.director.coordinate` | `experience` |
| `dream_team.requirements.manage` | `equipo` |
| `dream_team.metrics.read` | `experience` |
| `dream_team.gdv.lead` | `grupo` |

**Específicas** (experiencia real):
| Capability | Experience | ScopeType |
|---|---|---|
| `dps.team.serve` (existente) | `dps` | `equipo` |
| `dps.team.lead` (nueva) | `dps` | `equipo` |
| `dps.team.director` (nueva) | `dps` | `equipo` |
| `estudiantes.team.serve` (nueva) | `estudiantes` | `equipo` |
| `estudiantes.team.lead` (nueva) | `estudiantes` | `equipo` |
| `talleres_crecimiento.team.serve` (nueva) | `talleres_crecimiento` | `taller` |
| `ninos.team.serve` (nueva) | `ninos` | `salon` |
| `the_living_room.team.serve` (nueva) | `the_living_room` | `experience` |

`dream_team` se agrega al `PLATFORM_EXPERIENCE_CATALOG` con `scopeTypes: ['experience', 'equipo']`. Cada experiencia futura agrega solo sus específicas.

**Caso Ana — auditoría de dos dimensiones.** Ana recibe capabilities de una misma fuente (`dream-team.ts`) pero en dos familias:
- **Genéricas**: `dream_team.serve` (scope experience — "es Dream Team"), `dream_team.lead` (scope equipo `estudiantes:transit` — "lidera")
- **Específicas**: `dps.team.serve` (scope equipo `dps:produccion-tecnica`), `estudiantes.team.lead` (scope equipo `estudiantes:transit`)

Total: 4 capabilities con scopes concretos. El resolver las valida sin `conflicting_scope` porque las genéricas usan `experience: 'dream_team'` y las específicas usan su experiencia real. Los ítems de navegación por experiencia (`dps_team_service`) resuelven contra las específicas; las métricas y gestión resuelven contra las genéricas.

## 6. Edge cases críticos

1. **Líder de un grupo + miembro de otro grupo**: Dream Team se basa en el **rol de servicio**, no en la membresía. Un líder de GDV es Dream Team; un miembro regular de GDV no lo es automáticamente.
2. **Persona queda sin servicios activos**: historial preservado, **sin borrado automático**. La persona sigue existiendo en `usuarios` y su historial longitudinal de servicio queda consultable.
3. **Pérdida de liderazgo GDV**: pausa del servicio (motivo `gdv_liderazgo_removed`), NO retiro. Permite reactivación si vuelve a liderar GDV (vía `pausa → activo`).
4. **Concurrencia**: dos admins editan el mismo servicio. Resolver en diseño entre last-write-wins con audit (`updated_at`) u optimistic locking (`version` column).
5. **Reasignación de área/equipo** (mismo rol, distinto scope): definir en diseño — opciones son cerrar servicio actual + abrir nuevo, o cambio in-place con historial de scope. **Edge case a resolver explícitamente en design.**
6. **Persona sin auth account**: Dream Team debe soportar servir sin cuenta (mismo principio que Persona canónica). FK apunta a `usuarios.id`, no a `auth.uid()`.
7. **Requisito configurado como `no_aplica`**: nunca se verifica, nunca vence, nunca bloquea. Distinto de `pendiente`.
8. **Múltiples líderes del mismo equipo**: dos personas distintas con rol `director` en el mismo equipo. Permitido; cada una tiene su servicio.

## 7. Caso de validación (Ana)

El sistema debe soportar:

```text
Ana (persona canónica)
├── sirve en DPS / Producción Técnica / Cámara
│   ├── estado: activo
│   ├── rol: Voluntario
│   ├── requisitos: política de equipos firmada (completado)
│   ├── grants: dps.team.serve (scope: dps:equipo:produccion-tecnica)
│   └── historial: postulado (2026-01-10) → orientación → activo (2026-02-15)
├── sirve en Estudiantes / Transit
│   ├── estado: activo
│   ├── rol: Líder de grupo
│   ├── requisitos: capacitación de liderazgo (pendiente, vence 2026-08-01)
│   ├── grants: estudiantes.team.lead (scope: estudiantes:equipo:transit)
│   └── historial: activo desde 2025-09-01
└── historial participation:
    ├── 2026-02-15: service.started (DPS, Produccion Tecnica, Camara)
    ├── 2026-02-20: requirement.completed (politica de equipos)
    └── (eventos de Estudiantes ya emitidos desde 2025-09)
```

Comportamientos exigidos:

- Pausar DPS Cámara → Estudiantes Transit sigue activo; grants de DPS se revocan; grant de Estudiantes intacto.
- Vencimiento de capacitación Estudiantes → alerta métrica, NO pausa.
- Pérdida de liderazgo en Transit (edge case 3) → Estudiantes pasa a `pausa` con motivo; DPS intacto.
- Cualquier transición queda en `dream_team_estados_historial` y emite evento `service` a participation.

## 8. Entidades / modelo de datos propuesto (alto nivel)

> **NO SQL todavía.** Esto es diseño de alto nivel para que `sdd-spec` lo precise.

| Tabla | Propósito | Columnas clave | FKs | Índices tentativos |
|---|---|---|---|---|
| `dream_team_equipos` | Equipos/squads dentro de una experiencia | `id, experience_key, nombre, descripcion, jerarquia_config_id, parent_equipo_id (nullable), activo, created_at` | `experience_key` → catálogo de experiencias | `(experience_key) WHERE activo`, `(parent_equipo_id)` |
| `dream_team_roles` | Roles configurables por equipo (con jerarquía opcional) | `id, equipo_id, nombre, parent_role_id (nullable), nivel_jerarquico, config_default_obligatoriedad, activo, created_at` | `equipo_id` → dream_team_equipos, `parent_role_id` → dream_team_roles | `(equipo_id) WHERE activo`, `(parent_role_id)` |
| `dream_team_servicios` | Asignación persona↔equipo↔rol con estado | `id, persona_id, rol_id, equipo_id, estado, fecha_inicio, fecha_fin (nullable), notas_internas, version (concurrencia), created_at, updated_at, created_by_persona_id` | `persona_id` → usuarios, `rol_id` → dream_team_roles, `equipo_id` → dream_team_equipos | `(persona_id, estado)`, `(equipo_id, estado)`, `(rol_id)`, `UNIQUE (persona_id, equipo_id, rol_id, estado) WHERE estado IN (postulado,orientacion,activo,pausa,inactivo)` |
| `dream_team_requisitos` | Requisitos configurables por rol | `id, rol_id, nombre, tipo, obligatoriedad, descripcion, activo, created_at` | `rol_id` → dream_team_roles | `(rol_id) WHERE activo`, `(tipo)` |
| `dream_team_requisitos_verificacion` | Estado de verificación por (servicio, requisito) | `id, servicio_id, requisito_id, estado, fecha_verificacion (nullable), verificado_por_persona_id (nullable), fecha_vencimiento (nullable), notas, created_at, updated_at` | `servicio_id` → dream_team_servicios, `requisito_id` → dream_team_requisitos, `verificado_por_persona_id` → usuarios | `(servicio_id, requisito_id)`, `(estado, fecha_vencimiento)` |
| `dream_team_estados_historial` | Auditoría de transiciones | `id, servicio_id, estado_anterior, estado_nuevo, motivo, actor_persona_id, paused_grants_snapshot (JSONB, nullable), created_at` | `servicio_id` → dream_team_servicios, `actor_persona_id` → usuarios | `(servicio_id, created_at DESC)`, `(actor_persona_id, created_at DESC)` |
| `dream_team_participation_eventos` | Productor de eventos `service` para participation | `id, evento_id, persona_id, experience_key, scope_type, scope_id, event_type, occurred_at, payload (JSONB), created_at` | `persona_id` → usuarios | `(persona_id, occurred_at DESC)`, `(experience_key, scope_id, occurred_at DESC)` |

**Enums previstos:**
- `enum_dream_team_estado`: `postulado, en_orientacion, activo, en_pausa, inactivo, retirado`
- `enum_dream_team_requisito_tipo`: `documento, capacitacion, entrevista, politicas, otro`
- `enum_dream_team_requisito_estado`: `pendiente, completado, vencido, no_aplica`
- `enum_dream_team_requisito_obligatoriedad`: `requerido, opcional, no_aplica`
- `enum_dream_team_transicion_motivo_categoria`: `asignacion_inicial, cambio_rol, cambio_equipo, gdv_liderazgo_removed, solicitud_persona, decision_administrativa, fin_ciclo, otro`

## 9. Capabilities nuevas (allowlist)

Extensión de `PLATFORM_CAPABILITIES` en `lib/platform/experiences.ts`. **Cada capability mapea a un scope concreto** (experiencia + scopeType + scopeId).

| Capability | Experience | ScopeType | Descripción |
|---|---|---|---|
| `dream_team.serve` | (variable) | `equipo` | Servir en un equipo (genérico) |
| `dream_team.lead` | (variable) | `equipo` | Liderar un equipo |
| `dream_team.coordinate` | (variable) | `equipo` | Coordinar un equipo |
| `dream_team.director.coordinate` | (variable) | `equipo` | Director del área (jerárquico superior) |
| `dream_team.requirements.manage` | (variable) | `equipo` | Verificar/actualizar requisitos de un equipo |
| `dream_team.metrics.read` | (cualquiera) | `experience` | Leer métricas de Dream Team |
| `dream_team.gdv.lead` | `grupos_vida` | `grupo` | Líder de grupo GDV (producido por adapter `dream-team-gdv`) |
| `dps.team.serve` (existente, hoy sin backend) | `dps` | `equipo` | Se mantiene; backend lo provee el adapter Dream Team |
| `estudiantes.team.lead` | `estudiantes` | `equipo` | Líder de equipo en Estudiantes |
| `talleres_crecimiento.team.serve` | `talleres_crecimiento` | `taller` | Servir en un taller |

> **Decisión técnica abierta para `sdd-spec`:** las capabilities con experience `(variable)` requieren revisar si `PLATFORM_CAPABILITIES` permite keys reutilizables por experiencia o si se necesitan keys específicas por experiencia (`dps.team.serve`, `estudiantes.team.serve`, etc.). Patrón actual del allowlist sugiere **keys específicas por experiencia**.

## 10. Adapter complementario

**`lib/platform/adapters/dream-team-gdv.ts`** — adapter read-only separado:

| Aspecto | Detalle |
|---|---|
| Lee | `grupo_miembros` filtrando por roles de liderazgo (`líder`, `anfitrión`, etc. según taxonomía existente) |
| Devuelve | `{ ok, contexts[], capabilities[], audit }` con capability `dream_team.gdv.lead` |
| Scope | `{ experience: 'grupos_vida', scopeType: 'grupo', scopeId: grupoId }` |
| Source | `'dream_team:gdv:leader'` |
| NO toca | `lib/platform/adapters/grupos-vida.ts` ni RPCs/RLS existentes |
| Compatibilidad | Si la persona ya es `director_etapa`, recibe **dos** capabilities: `grupos_vida.stage.read` (adapter existente) + `dream_team.gdv.lead` (este adapter) — fuentes distintas, scopes distintos |
| Eventos participation | Emite `service` cuando una membresía de liderazgo se crea/termina |

## 11. Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Over-engineering del modelo de jerarquías | Media | Adjacency list simple (`parent_role_id`), 2-3 niveles. Validar con 2 equipos concretos (DPS Producción Técnica + Estudiantes Transit) |
| Acoplar Dream Team con `support_user_capabilities` | Baja | **NO** reutilizar esa tabla. Crear `dream_team_*` nuevas |
| Romper Grupos de Vida al mapear líderes | Media | Adapter separado, cero cambios a RPCs/RLS/acciones existentes |
| Pérdida silenciosa de servicios al revocar GDV | Media | Audit obligatorio con motivo `gdv_liderazgo_removed`; nunca borrar, solo pasar a `pausa` |
| Concurrencia: edits simultáneos al mismo servicio | Media | Definir estrategia en diseño (last-write-wins con audit vs optimistic locking) — decisión abierta |
| Métricas costosas sin índices | Media | Índices en `(equipo_id, estado)`, `(persona_id, estado)`, `(requisito_id, estado, fecha_vencimiento)` |
| Reasignación de área deja historial inconsistente | Media | Decidir política explícita en diseño: cierre + apertura vs cambio in-place con versionado de scope |
| Navegación contextual flag OFF oculta todo | Baja | Esperado y documentado. El modelo está listo para cuando el flag se active en rollout posterior |
| `uno_a_uno` filtrado como requisito (ej: «entrevista de liderazgo») | Baja | **NO** modelar requisitos como flujos de 1:1. Requisitos son tracking de estado, no workflows |
| Scope creep hacia Operating Core | Media | Fase 2 = modelo + contratos + endpoint de métricas. Operación por experiencia es Fase 3 |

## 12. Dependencias

- **Fase 1 cerrada y mergeada** en `main` (`c364128`): persona, experiences, grants, participation, preflight, navigation, routeGuard, rollout, flags, adapters, family.
- **14 módulos `lib/platform/**` estables** — sin cambios planeados en Fase 1.
- **`usuarios` como Persona canónica** — FK de `dream_team_servicios.persona_id`.
- **`PLATFORM_EXPERIENCE_CATALOG`** como catálogo de experiencias — referencia para FK de equipos.
- **`PLATFORM_CAPABILITIES`** como allowlist extensible — se agregan keys nuevas.
- **MCP `supabase_global_staging`** disponible para probar migraciones aditivas antes de producción.
- **Strict TDD activo** — tests unitarios puros + integration con fakes (mismo patrón que Fase 1).

## 13. Criterios de aceptación

Lista verificable, cada bullet testeable:

- [ ] Existen 6 tablas nuevas (`dream_team_*`) más 1 tabla de participation con migraciones aditivas aplicadas en staging
- [ ] Existen 5 enums PostgreSQL con los valores especificados
- [ ] `lib/platform/dream-team.ts` valida transiciones: postulado → orientación → activo → pausa|inactivo → retirado; pausa → activo; inactivo → postulado; cualquier otra transición retorna error
- [ ] `lib/platform/dream-team.ts` rechaza transiciones sin motivo
- [ ] `lib/platform/adapters/dream-team.ts` lee `dream_team_servicios` y produce N `PlatformSessionCapability` por servicio activo
- [ ] `lib/platform/adapters/dream-team-gdv.ts` lee `grupo_miembros` y produce capabilities `dream_team.gdv.lead` sin tocar adapter GDV existente
- [ ] `PLATFORM_CAPABILITIES` extendido con keys nuevas; tests de `resolvePlatformCapability` siguen verdes
- [ ] Al transicionar a `activo` se emiten `PlatformGrantAuditEvent` con `decision: 'grant'`, snapshot before vacío, snapshot after con grants
- [ ] Al transicionar a `pausa` se emiten `PlatformGrantAuditEvent` con `decision: 'revoke'` y se persiste `paused_grants_snapshot` en historial
- [ ] Al volver de `pausa` a `activo` se re-otorgan los grants pausados (mismas keys, mismos scopes)
- [ ] Al cambiar de estado se inserta fila en `dream_team_participation_eventos` (productor de `PlatformParticipationEvent` tipo `service`)
- [ ] Caso Ana (sección 7) funciona end-to-end: 2 servicios simultáneos, transición independiente, requisitos con alerta pero sin bloqueo
- [ ] Edge case 1: miembro regular de GDV NO recibe capability Dream Team
- [ ] Edge case 3: pérdida de liderazgo GDV pausa el servicio con motivo `gdv_liderazgo_removed`, no lo retira
- [ ] Endpoint de métricas devuelve: count por experiencia/equipo, count por estado, distribución de roles, lista de requisitos vencidos
- [ ] Cero cambios en tablas existentes (verificación por diff de migración)
- [ ] Cero cambios en `lib/platform/adapters/grupos-vida.ts` (verificación por diff)
- [ ] `pnpm test` pasa con 666+N tests (sin regresiones)
- [ ] PR < 400 líneas o con `size:exception` documentada
- [ ] Documentación de capabilities agregadas en `lib/platform/experiences.ts` con scope example

## 14. Métricas de éxito (qué deja Fase 2 listo)

Métricas **técnicas**, no de producto:

- **6 tablas nuevas** operativas con migraciones aditivas aplicadas y RLS básico
- **5 enums** PostgreSQL con valores alineados al contrato
- **N capabilities nuevas** en el allowlist con tests de `resolvePlatformCapability`
- **2 adapters read-only** (`dream-team.ts` y `dream-team-gdv.ts`) con sus fakes de test
- **1 módulo puro** (`dream-team.ts`) con state machine y validación de transiciones
- **1 endpoint de métricas** con 4 funciones de agregación
- **Productor de eventos `service`** insertando en `dream_team_participation_eventos`
- **Audit grants** conectado: cada transición genera `PlatformGrantAuditEvent`
- **0 cambios destructivos** en DB (verificable por diff de migración)
- **0 cambios en adapters existentes** (verificable por diff)
- **0 regresiones** en los 666 tests de Fase 1

## 15. Roadmap de fases futuras que dependen de Fase 2

| Fase | Dependencia con Fase 2 |
|---|---|
| **Fase 3 — Operating Core** | Consume `dream_team_servicios` para asignar servidores a eventos. Consume endpoint de métricas para dashboards operativos. Implementa adapter Supabase real de `PlatformParticipationReadRepository`. |
| **Fase 5 — Talleres de Crecimiento Base** | Usa `dream_team_roles` + `dream_team_requisitos` para configurar líderes/co-líderes/servidores de cada taller. |
| **Fase 6 — The Living Room Operativo** | Crea roles Dream Team específicos de Living Room (mentores, hosts universitarios). |
| **Fase 7 — DPS Operations** | Conecta DPS multiárea (Producción Técnica, Música, Media, Atención al Invitado) sobre `dream_team_equipos`. |
| **Fase 9 — Niños Operativo** | Modela servidores de salón (Waumbaland, Upstreet) como `dream_team_equipos` con requisitos de verificación de antecedentes. |
| **Fase 10 — Estudiantes Operativo** | Modela líderes de grupo Transit/InsideOut + servidores. |
| **Fase 11 — Ruta Espiritual** | Cruza historial Dream Team con journey espiritual (servicio como dimensión). |
| **Fase 14 — Logística de Voluntarios** | Consume endpoint de métricas para reporte semanal a Cocina/Atención al Voluntario. |

## 16. Próximo paso

`sdd-spec` debe escribir los **delta specs** en `openspec/changes/fase-02-dream-team-base/specs/` para las capabilities nuevas:

- `dream-team-service-domain` — modelo de dominio (servicio, equipo, rol, requisitos, estados)
- `dream-team-state-machine` — state machine de 6 estados con transiciones y motivos
- `dream-team-grant-lifecycle` — otorgamiento al activar, revocación en pausa, re-otorgamiento al volver
- `dream-team-adapter` — adapter principal que mapea `dream_team_servicios` → `PlatformSessionCapability[]`
- `dream-team-gdv-adapter` — adapter complementario para líderes GDV
- `dream-team-metrics-endpoint` — endpoint de lectura con agregaciones
- `dream-team-participation-producer` — productor de eventos `service` en participation
- `dream-team-concurrency` — estrategia de concurrencia (a definir en diseño)

Cada spec con sus `## Purpose`, `## Requirements` y `## Scenarios` siguiendo el formato de los specs de Fase 1 (`platform-persona`, `platform-experiences`, `platform-scoped-responsibilities`, etc.).

---

**Tamaño**: ~1.350 palabras (por debajo del budget de Fase 1, que usó ~720 palabras en proposal pero sin las 6 tablas de modelo de datos ni los 6 edge cases explícitos).
**Modo**: `interactive`. No implementar.
**Worktree**: `docs/fase-02-dream-team-base-sdd`.
**Artifact**: `openspec/changes/fase-02-dream-team-base/proposal.md`.
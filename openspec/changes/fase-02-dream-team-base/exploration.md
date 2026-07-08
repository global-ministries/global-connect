# Exploración — Fase 2: Dream Team Global Base

## 1. Estado actual relevante (Fase 1)

### 1.1 Persona (`lib/platform/persona.ts`)

`usuarios` funciona como persona canónica operacional con `auth_id` nullable. El módulo `persona.ts` define búsqueda/dedupe por señales (email, teléfono, cédula, nombre, apellido, fechaNacimiento), con masking, auditoría y boundaries de actor/flujo/scope requerido. Implementa `findPlatformPersonaCandidates(input)` → `{ ok, decision, candidates, audit }` con anti-enumeración y review obligatorio para matches ambiguos. No hay concepto de «servicio» en este módulo.

**Contrato de tests**: `__tests__/lib/platform/persona.test.ts` — unit testing puro con `personaLookup` inyectado, sin DB, sin mocks de Supabase.

### 1.2 Experiences (`lib/platform/experiences.ts`)

Catálogo de 7 experiencias (`grupos_vida`, `dps`, `ninos`, `estudiantes`, `the_living_room`, `talleres_crecimiento`, `family`) con `PLATFORM_CAPABILITIES` de 8 llaves allowlisted. El resolver `resolvePlatformCapability(input)` es fail-closed con scope por experiencia/scopeType/scopeId. Las capacidades existentes relevantes para Dream Team:

| Capability | Experience | ScopeType |
|---|---|---|
| `dps.team.serve` | dps | equipo |
| `grupos_vida.stage.read` | grupos_vida | etapa |
| `ninos.room.read` | ninos | salon |
| `estudiantes.room.read` | estudiantes | salon |
| `talleres_crecimiento.participation.read` | talleres_crecimiento | taller |

`dps.team.serve` es la ÚNICA capability que sugiere «servicio», pero no tiene implementación, adapter, ni ninguna tabla DB que la respalde. Las capacidades de admin (`dps.admin.manage`, `nextgen.admin.manage`, `talleres_crecimiento.admin.manage`) tampoco tienen backend.

**Contrato de tests**: `__tests__/lib/platform/experiences.test.ts` — unit testing de denegación por actor, flow, capability desconocida, scope ausente/malformado/desconocido/conflictivo/duplicado y grant matching.

### 1.3 Grants (`lib/platform/grants.ts`)

Contrato puro de auditoría: `PlatformGrantAuditSystem` con `logger.record(event)` (guarda actorPersonaId, source, decision grant|revoke|deny|audit, scope, before/after state, reason, recordedAt), `metrics.recordGrant|recordRevoke|recordDenial|recordAudit(experience, source)`, y `checkDenialThreshold(metrics, threshold)` para alertas. Pure factory `createPlatformGrantAudit()`. NO hay adapters Supabase todavía.

**Contrato de tests**: `__tests__/lib/platform/grants.test.ts` — events, métricas, alertas por threshold, snapshots.

### 1.4 Participation (`lib/platform/participation.ts`)

Contrato longitudinal con:
- 7 tipos de evento: `attendance`, **`service`**, `taller_participation`, `group_join`, `group_leave`, `family_consent`, `contact_authorization`
- 3 niveles de sensibilidad: public, internal, sensitive
- Retention policies por tipo (service: min 365 / max 1095 días, sin consent explícito)
- `canReadPlatformParticipationEvent(input)` — guard puro: self → scoped_capability → sensitive_no_capability → insufficient_scope. Nunca revela existencia de eventos sensibles en denegación.
- `PlatformParticipationReadRepository` — interface read-only: `findEventsByActorPersonaId`, `findEventsByScope`
- `ParticipationInMemoryAdapter` — fake en memoria para tests y referencia de adapters futuros.

El tipo `service` existe como evento longitudinal, pero NO hay productor de estos eventos. Nadie emite `PlatformParticipationEvent` de tipo `service` hoy.

**Contrato de tests**: `__tests__/lib/platform/participation.test.ts` (unit) + `__tests__/lib/platform/participation-integration.test.ts` (integration con fake adapter).

### 1.5 Preflight (`lib/platform/preflight.ts`)

Bloquea uso de `uno_a_uno` hasta decisión formal. Discriminated union: `{ ok: true, decision, evidence }` | `{ ok: false, reason: 'no_formal_decision', missing }`. Registro mutable solo vía `registerPlatformUnoAUnoDecision()`. Default: denegado. NO hay decisión registrada; el preflight bloquea.

**Estado del drift**: `uno_a_uno_reuniones` y `uno_a_uno_participantes` existen en DB live con RLS y 0 filas, pero NO hay migración local, NO hay rutas/actions, y `uno_a_uno.global.read` no está en `PLATFORM_CAPABILITIES`. El nav item `uno_a_uno_global` en `navigation.ts` no tiene `availableHref` y es permanentemente invisible.

### 1.6 Session (`lib/platform/session/`)

`buildPlatformSession(input)` resuelve desde `auth.uid()` via `personaLookup.findByAuthId(authId)`. Rechaza `personaId` de cliente. La sesión resultante incluye `personaId`, `subjectAuthId`, `globalRoles: []`, `contexts: []`, `capabilities: []`. Los arrays vienen vacíos porque los adapters de GDV y Family se aplican AFTER en la capa de navegación, no en la sesión base.

`useCurrentUser.ts` en el cliente resuelve `platformSession` llamando `buildPlatformSession` con un `personaLookup` que mapea `usuarios` local. La sesión de plataforma en cliente solo tiene `personaId` + `subjectAuthId`, SIN contextos ni capabilities en este punto. Los adapters de contexto (GDV, Family) se aplican en `resolvePlatformNavigation()`.

### 1.7 Adapter de Grupos de Vida (`lib/platform/adapters/grupos-vida.ts`)

Adapter read-only que mapea `segmento_lideres` → `PlatformSessionContext` + `PlatformSessionCapability`:

- **Input**: `{ session: PlatformSession, reader: GruposVidaReadRepository }`
- **Reader contract**: `findDirectorEtapaAssignmentsByPersonaId(personaId)` → `GruposVidaDirectorEtapaAssignment[]` (solo expone directores de etapa, NO líderes de grupo normales)
- **Output**: `{ ok, contexts[], capabilities[], scope: { stageIds, groupIds } }`
- **Capability producida**: `grupos_vida.stage.read` con scope `{ experience: 'grupos_vida', scopeType: 'etapa', scopeId: stageId }`

**LO QUE FALTA para Dream Team**: este adapter solo expone directores de etapa. Un líder de grupo normal NO recibe capability vía este adapter. El adapter no tiene concepto de «servicio en GDV».

### 1.8 Adapter de Family (`lib/platform/adapters/family.ts`)

Adapter read-only que normaliza relaciones familiares desde `relaciones_usuarios`. Produce `NormalizedFamilyRelation[]` con `tipoRelacion`, `isReciprocal`, `relatedHasAuthAccount`. Complementado por `canAccessMinorData.ts` (guard para datos de menores).

### 1.9 Navegación contextual y dashboard

- **`lib/platform/navigation.ts`**: resolver puro con 9 definiciones de navegación, flag/kill switch, fallback legado. Cada definición se resuelve vía `resolvePlatformCapability()` contra las capabilities del `PlatformSession`.
- **`lib/dashboard/contextual-navigation.ts`**: expone shortcuts contextuales en el dashboard; solo muestra rutas verificadas (actualmente solo `/grupos-vida`).
- **`app/(auth)/dashboard/page.tsx`**: renderiza dashboard por rol principal (admin, pastor, director-general, director-etapa, lider, miembro) + sección «Contextos visibles» desde `contextual-navigation.ts`.
- **`components/ui/sidebar-moderna.tsx`**: mezcla ítems legacy estáticos filtrados por roles/capabilities + `usePlatformNavigationViewItems(platformSession)` para ítems de navegación de plataforma. Los ítems de navegación de plataforma se integran con `canAccess()` para gating.

**A nivel de navegación contextual**, DPS aparece como `dps_team_service` con capability `dps.team.serve` y `availableHref: undefined` (no hay ruta implementada). Esto significa que incluso si se asignara la capability, el ítem NO se renderiza como link — pero aparece como contexto visible en la navegación si se resuelve.

### 1.10 Configuración actual de capabilities

- **`app/(auth)/configuracion/soporte/page.tsx`**: asigna/revoca capabilities de soporte (`support.view`, `support.reply`, `support.manage`) sobre la tabla `support_user_capabilities`. Asignación manual por UUID de usuario. Modelo: `INSERT INTO support_user_capabilities (usuario_id, capability)` / `UPDATE ... SET revoked_at = now()`.
- **`app/(auth)/configuracion/page.tsx`**: configuración global de organización + branding, sin relación con Dream Team.
- **`app/(auth)/configuracion/directores-generales/`**: gestión de directores generales de GDV.
- **`app/(auth)/configuracion/grupos-vida/`**: configuración de GDV (geocodificación, etc).

NO existe UI para asignar capabilities de Dream Team o servicio. La UI de soporte es el único precedente de asignación de capabilities a nivel de plataforma.

### 1.11 Tests y contratos

14 test files en `__tests__/lib/platform/` cubren todos los módulos de Fase 1. Patrón consistente:
- Tests unitarios puros (sin DB, sin mocks de Supabase)
- Discriminated unions para returns
- Factory/reset helpers para aislar estado mutable
- Integration tests con fake adapters in-memory (Participation)

## 2. Brechas detectadas para Dream Team

### 2.1 Servicio por experiencia/equipo/rol: ¿existe? ¿cómo se aproxima?

**NO existe**. No hay tabla, modelo, contrato ni adapter que represente «una persona sirve en una experiencia con un rol en un equipo».

Lo más cercano:
- La capability `dps.team.serve` en `PLATFORM_CAPABILITIES` es un hueco conceptual: existe en el catálogo pero no tiene backend, adapter, ni tabla DB que la respalde.
- El adapter de GDV mapea directores de etapa como `contexts` y `capabilities`, pero solo para el tipo `director_etapa` de `segmento_lideres`. Los líderes de grupo normales (registrados en `grupo_miembros`) no se exponen.
- `dps.team.serve` en `navigation.ts` tiene `availableHref: undefined`, haciéndola permanentemente invisible como link.

**Conclusión**: Dream Team requiere un modelo de dominio nuevo. No es una extensión de lo existente; es crear lo que no existe.

### 2.2 Múltiples servicios simultáneos: ¿se soporta?

**NO**. La estructura actual de `PlatformSession` tiene arrays: `contexts: PlatformSessionContext[]` y `capabilities: PlatformSessionCapability[]`. Esto SÍ permite múltiples entradas, y el GDV adapter ya produce múltiples contextos para una persona que dirige varias etapas.

Sin embargo, no hay representación de servicio simultáneo en múltiples experiencias distintas (ej: DPS + Estudiantes). La sesión recibe capabilities de múltiples fuentes (GDV adapter, Family adapter, etc.), lo cual es el patrón que Dream Team debería seguir.

**Patrón reutilizable**: Los adapters se aplican secuencialmente en `resolvePlatformNavigation()` → `applyAdapters()`, mergeando `contexts` y `capabilities` de cada adapter. Dream Team necesitaría un adapter propio que se integre en este pipeline.

### 2.3 Estado de servicio: ¿hay algo similar?

**NO**. No existe concepto de estado de servicio. Lo más cercano es `support_user_capabilities.revoked_at` (para revocación de capabilities de soporte), que es binario (activo/revocado), no un state machine con transiciones.

Dream Team requiere estados: postulado → en orientación → activo → en pausa → inactivo → retirado, con transiciones auditables y motivos.

### 2.4 Jerarquías configurables: ¿rigidez actual?

GDV tiene una jerarquía rígida implícita en `segmento_lideres.tipo_lider` (`director_general` | `director_etapa`) y las relaciones `director_general_directores` + `director_etapa_grupos`. Esta jerarquía es:
- Fija en 2 niveles (DG → DE → grupos)
- Específica del dominio GDV
- No configurable

Dream Team requiere jerarquías configurables por área/equipo, donde director, coordinador y voluntario son opcionales y una persona puede tener múltiples roles jerárquicos. Esto no existe en el sistema actual.

### 2.5 Requisitos por área/rol: ¿cómo se manejan?

**No existen**. No hay tabla, modelo ni UI para definir requisitos que una persona debe cumplir para servir en un rol/área. El concepto es completamente nuevo. El handoff especifica: configurables (requerido/opcional/no aplica), con fecha de verificación, persona que verificó, estado (pendiente/completado/vencido/no aplica).

### 2.6 Relación con Grupos de Vida: ¿adapter permite saber quién es líder?

**Parcialmente**. El adapter `grupos-vida.ts` expone solo directores de etapa (`segmento_lideres` con `tipo_lider = 'director_etapa'`). NO expone:
- Directores generales (aunque su tabla existe como `director_general_segmentos`)
- Líderes de grupo normales (`grupo_miembros` con rol de líder)

Para que un líder de grupo de vida sea considerado Dream Team, el adapter necesitaría extenderse (o crearse un adapter nuevo) que lea `grupo_miembros` y mapee membresías de liderazgo a capabilities de Dream Team.

**Riesgo**: extender el adapter actual podría acoplarlo con Dream Team. Mejor crear un adapter separado `dream-team-gdv.ts` (o similar) que lea de GDV sin modificar el adapter existente.

### 2.7 Grants auditables: ¿hay conexión?

El módulo `grants.ts` define el contrato de auditoría (`PlatformGrantAuditEvent`) y el logger (`PlatformGrantAuditLogger`), pero NO está conectado a ningún sistema de capabilities real. Es un contrato puro sin implementación Supabase.

Dream Team necesitaría:
1. Un adapter que implemente `PlatformGrantAuditLogger` (persistiendo en DB o log)
2. Conectar las decisiones de asignación/revocación de servicio con `logger.record()` para auditar cambios de estado, requisitos y asignaciones.

### 2.8 Historial longitudinal: ¿participation lo cubre?

**El contrato SÍ**. `participation.ts` incluye el tipo `service` con retención de 365-1095 días y sensibilidad `internal`. Sin embargo:
- No hay productor de eventos `service`
- No hay adapter DB para el `PlatformParticipationReadRepository`
- El repo solo tiene el fake `ParticipationInMemoryAdapter`

Dream Team necesitaría:
1. Un mecanismo que emita `PlatformParticipationEvent` de tipo `service` cuando una persona inicia/termina/pausa servicio
2. Potencialmente, nuevos sub-tipos de evento para cambios de estado y requisitos
3. Un adapter real de `PlatformParticipationReadRepository` (scope de Fase 3 Operating Core, no de Fase 2)

El contrato está listo; falta la implementación.

## 3. Tablas y entidades DB relevantes

### 3.1 Tablas actuales que tocan «servicio» (directa o indirectamente)

| Tabla | Columnas clave | Rol actual | Relación con Dream Team |
|---|---|---|---|
| `usuarios` | `id, auth_id, nombre, apellido, email, telefono, cedula, fecha_nacimiento, fecha_registro` | Persona canónica | Dream Team agrega service_memberships FK → usuarios.id |
| `grupo_miembros` | `id, usuario_id, grupo_id, rol, fecha_ingreso, fecha_salida, estado` | Membresía en grupos GDV | Los líderes aquí DEBEN ser Dream Team; requiere adapter |
| `segmento_lideres` | `id, usuario_id, segmento_id, tipo_lider ('director_general' \| 'director_etapa'), campus_id` | Liderazgo GDV | Ya mapeado por adapter GDV; directores son Dream Team |
| `director_etapa_grupos` | `id, director_etapa_id (FK segmento_lideres), grupo_id` | Scope de director etapa | Define qué grupos ve un DE |
| `director_general_segmentos` | `id, usuario_id, segmento_id, campus_id, creado_en` | Scope de DG | DGs también son Dream Team, no expuestos por el adapter actual |
| `director_general_directores` | `id, director_general_id, director_etapa_id, created_at` | Relación DG→DE | Jerárquica, solo GDV |
| `support_user_capabilities` | `id, usuario_id, capability, granted_at, revoked_at, granted_by_usuario_id` | Capacidades de soporte | Patrón de asignación con auditoría; referencia para diseño de grants de Dream Team |
| `roles` (tabla) | `id, nombre, nombre_interno, es_predeterminado` | Roles globales | No se deben expandir; Dream Team usa capacidades scoped |
| `usuarios_roles` | `usuario_id, rol_id` | Asignación de roles globales | No relevante para Dream Team |
| `obtener_roles_usuario` (RPC) | `p_auth_id → TABLE(nombre_interno text)` | Obtiene roles globales | Usado por `useCurrentUser`; no relevante para Dream Team |
| `uno_a_uno_reuniones` | `id, fecha, grupo_id, lider_usuario_id, notas_privadas` | Bloqueado por preflight | NO USAR en Fase 2 |
| `uno_a_uno_participantes` | `id, miembro_usuario_id, reunion_id` | Bloqueado por preflight | NO USAR en Fase 2 |
| `configuracion_plataforma` | `nombre_organizacion, logo_light_url, logo_dark_url, favicon_url, color_primario, color_secundario, ...` | Config global | Podría extenderse para defaults de requisitos |

### 3.2 Tablas NUEVAS que Fase 2 necesitaría crear

Basado en el handoff y el análisis de brechas:

| Tabla tentativa | Propósito | Relaciones |
|---|---|---|
| `dream_team_equipos` | Equipos/squads dentro de una experiencia (ej: «Producción Técnica» dentro de DPS) | FK → experiencias (catálogo), jerarquía padre/hijo opcional |
| `dream_team_roles` | Roles configurables por equipo (ej: «Voluntario», «Coordinador», «Director») | FK → dream_team_equipos |
| `dream_team_servicios` | Asignación de persona a equipo/rol: estado, fechas, requisitos tracking | FK → usuarios, dream_team_roles, dream_team_equipos |
| `dream_team_requisitos` | Requisitos configurables por rol/equipo (tipo, obligatoriedad) | FK → dream_team_roles |
| `dream_team_requisitos_verificacion` | Estado de verificación de requisitos por persona | FK → dream_team_servicios, dream_team_requisitos |
| `dream_team_estados_historial` | Auditoría de transiciones de estado | FK → dream_team_servicios |

**NOTA**: Estos son nombres tentativos para discusión en la fase de diseño. La exploración no prescribe esquema.

### 3.3 Enums y tipos esperados

| Enum/Type | Valores tentativos |
|---|---|
| `enum_dream_team_estado` | `postulado, en_orientacion, activo, en_pausa, inactivo, retirado` |
| `enum_dream_team_requisito_tipo` | `documento, capacitacion, entrevista, politicas, otro` |
| `enum_dream_team_requisito_estado` | `pendiente, completado, vencido, no_aplica` |
| `enum_dream_team_requisito_obligatoriedad` | `requerido, opcional, no_aplica` |

## 4. Patrones reutilizables de Fase 1

### 4.1 Adapter read-only pattern

```typescript
// Ejemplo: GruposVidaAdapterInput, GruposVidaReadRepository, resolveGruposVidaPlatformContext()
// Patrón: input con session + reader (interface inyectable), output con discriminated union
// { ok: true, contexts, capabilities, scope, audit } | { ok: false, reason, ... }

// Dream Team podría seguir este patrón:
type DreamTeamAdapterInput = { session: PlatformSession; reader: DreamTeamReadRepository }
type DreamTeamAdapterResult = { ok: true; contexts[]; capabilities[]; audit } | { ok: false; reason }
```

### 4.2 Persona-first vs user-first

`usuarios.id` es la persona canónica. Dream Team debe referenciar `usuarios.id`, no `auth.uid()`, porque una persona puede servir sin tener cuenta auth (aunque en la práctica actual casi todos los servidores tienen cuenta).

### 4.3 Capabilities allowlist + fail-closed

`PLATFORM_CAPABILITIES` es un diccionario estático. Cualquier capability no registrada produce `'unknown_capability'`. Dream Team debe:
- Agregar capabilities nuevas al allowlist (ej: `dps.team.serve.view`, `estudiantes.team.serve.manage`)
- El resolver `resolvePlatformCapability()` ya maneja scopes con experiencia/scopeType/scopeId
- Las capabilities de Dream Team deben mapearse al scope concreto (ej: `{ experience: 'dps', scopeType: 'equipo', scopeId: 'produccion-tecnica' }`)

### 4.4 Grants audit

`createPlatformGrantAudit()` → `{ logger, metrics, checkDenialThreshold }`. Dream Team debe:
- Usar el mismo `logger.record()` para auditar asignaciones/revocaciones de servicio
- Usar el mismo `metrics` para contar grants/denials por experiencia
- El `PlatformGrantAuditEvent` ya soporta `decision: 'grant' | 'revoke' | 'deny' | 'audit'`

### 4.5 Participation adapter contract

`PlatformParticipationReadRepository` → `findEventsByActorPersonaId`, `findEventsByScope`. Dream Team debe emitir eventos `service` cuando:
- Una persona inicia servicio (estado → activo)
- Cambia de estado
- Termina servicio
- Completa un requisito

### 4.6 Feature flags y rollout

- `getPlatformNavigationFlags()` → `{ enabled, killSwitch }` controla navegación contextual
- `resolvePlatformNavigationGate()` → `PlatformNavigationGate` (flag OFF → fallback legado)
- Dream Team debe respetar el mismo flag para no exponer ítems de navegación sin backend
- **Riesgo**: si el flag sigue OFF en producción, ningún ítem de Dream Team será visible aunque se implemente

### 4.7 RouteGuard pattern

`checkPlatformRouteAccess({ platformSession, requiredCapability, flags })` → `{ allowed, reason }`. Sirve como marcador de permiso. Dream Team debe usar este patrón para proteger rutas de gestión de servicio.

### 4.8 Navigation definitions extendibles

`PLATFORM_NAVIGATION_DEFINITIONS` es un array `satisfies readonly PlatformNavigationDefinition[]`. Agregar nuevas definiciones para Dream Team (ej: `dps_team_manage`, `estudiantes_team_manage`, `talleres_team_manage`, `dream_team_global`) es aditivo y no rompe nada. Las definiciones existentes como `dps_team_service` ya están listas para ser usadas cuando tengan backend.

## 5. Riesgos identificados

### 5.1 Sin modelo de servicio: todo es nuevo
Dream Team no es una extensión de GDV ni de `support_user_capabilities`. Es un dominio nuevo completo. Esto es un riesgo de scope: puede llevar a over-engineering si se intenta modelar todo el catálogo de equipos/roles de una vez, o a under-engineering si se modela solo DPS sin considerar la generalización.

**Mitigación**: diseñar el contrato genérico (equipo/rol/estado/requisitos) y validar con 2 experiencias concretas (DPS + GDV líderes). No modelar todas las experiencias en Fase 2.

### 5.2 GDV adapter no expone líderes de grupo
El adapter actual solo expone `director_etapa`. Los líderes de grupo normales (en `grupo_miembros`) no tienen capability de plataforma. Dream Team necesita que un líder de grupo sea reconocido como Dream Team, pero el adapter actual no lo soporta.

**Mitigación**: crear un adapter separado (`dream-team-gdv.ts`) que lea `grupo_miembros` para líderes, SIN modificar el adapter existente. Mantener la separación de responsabilidades.

### 5.3 Acoplar Dream Team con `support_user_capabilities`
La tabla `support_user_capabilities` tiene el patrón de grants con `revoked_at`, pero está diseñada para soporte y tiene RLS específico de soporte. Reutilizarla para Dream Team acoplaría dominios y crearía confusión de auditoría.

**Mitigación**: NO reutilizar `support_user_capabilities`. Crear tablas nuevas con propósito claro.

### 5.4 Scope creep hacia Operating Core (Fase 3)
El handoff pide «conexión con Grupos de Vida, DPS, Talleres, Niños, Estudiantes y otras experiencias». Pero Fase 3 (Operating Core) es quien construye la tubería operativa. Si Fase 2 intenta conectar con todas las experiencias, terminará construyendo partes de Fase 3.

**Mitigación**: en Fase 2, la «conexión» es a nivel de modelo de datos y capabilities, NO a nivel de operación/flujos/UI de cada experiencia. La integración real con cada experiencia es scope de fases posteriores.

### 5.5 Navegación contextual con flag OFF
`NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED=off` en producción. Si Dream Team agrega ítems de navegación, no serán visibles hasta que el flag se active. Esto es correcto para Fase 2 (foundation invisible), pero debe documentarse claramente en el plan de rollout.

### 5.6 `uno_a_uno` — bloqueo persistente
El preflight sigue bloqueando `uno_a_uno`. Cualquier diseño de Dream Team que intente usar 1:1 (ej: «entrevista de liderazgo» como requisito) debe esperar hasta que el drift esté reconciliado. Por ahora, los requisitos de Dream Team son tracking de estado, no flujos de 1:1.

### 5.7 Sin adapter DB real para participation
El `ParticipationInMemoryAdapter` es un fake. Para emitir eventos de participación reales (tipo `service`), Fase 2 necesitaría un adapter DB que persista en Supabase. Esto podría ser scope de Fase 2 o delegarse a Fase 3.

### 5.8 Complejidad de jerarquías configurables
Modelar jerarquías «flexibles y configurables» puede resultar en un modelo de datos complejo. Si se hace con adjacency list o nested sets, la complejidad de queries aumenta.

**Mitigación**: empezar con un modelo simple: `dream_team_roles` con un `parent_role_id` opcional (adjacency list). No diseñar para profundidad infinita; validar con jerarquías de 2-3 niveles máximo.

## 6. Preguntas abiertas

### Del handoff de Fase 2 (sección «Preguntas que el agente debe responder»)

1. **¿Cómo se representa un servicio activo de una persona en cualquier experiencia?**  
   → Una fila en `dream_team_servicios` con FK a persona, FK a rol (que a su vez referencia equipo/experiencia), estado, y fechas. Se expone como `PlatformSessionCapability` con key tipo `dps.team.serve` y scope `{ experience: 'dps', scopeType: 'equipo', scopeId: 'produccion-tecnica' }`.

2. **¿Cómo se modela una persona con varios servicios simultáneos?**  
   → Múltiples filas en `dream_team_servicios` para la misma persona, cada una con su propio estado/rol/equipo. El adapter de Dream Team produce múltiples capabilities que se mergean en `PlatformSession.capabilities[]`. El array ya soporta entradas múltiples.

3. **¿Cómo se configuran jerarquías por área/equipo?**  
   → `dream_team_roles` con `parent_role_id` opcional. Un equipo puede tener roles Configurados: director → coordinador → voluntario, o solo voluntario, o solo líder. La configuración es por equipo, no global.

4. **¿Qué campos y estados mínimos requiere el servicio?**  
   → `persona_id`, `rol_id` (→ equipo → experiencia), `estado` (enum de 6 valores), `fecha_inicio`, `fecha_fin` (nullable), `notas_internas` (opcional). Historial de cambios de estado en tabla de auditoría separada.

5. **¿Cómo se asocian requisitos por área/rol?**  
   → `dream_team_requisitos` con FK a rol. Una persona en un servicio tiene verificaciones de requisitos en `dream_team_requisitos_verificacion`, una por cada requisito del rol, con su propio estado.

6. **¿Cómo se conecta Dream Team con `lib/platform/grants.ts`?**  
   → Al asignar/revocar un servicio, el action (server) registra un `PlatformGrantAuditEvent` con decision `grant`/`revoke`. El logger registra actor, source, scope, before/after.

7. **¿Cómo se conecta Dream Team con `lib/platform/participation.ts`?**  
   → Al cambiar el estado de un servicio (inicio, pausa, fin), se emite un `PlatformParticipationEvent` de tipo `service` con scope de la experiencia/equipo. El adapter de participation recibe estos eventos y los expone vía `PlatformParticipationReadRepository`.

8. **¿Cómo se muestra un voluntario activo en el dashboard contextual?**  
   → Vía `resolveDashboardContextualAccess()` que ya consume `resolvePlatformNavigation()`. Si el adapter de Dream Team produce capabilities de servicio, la navegación contextual las mostrará (cuando el flag esté ON y exista `availableHref`).

9. **¿Cómo se evita que un líder de Grupos de Vida no se muestre como Dream Team y viceversa?**  
   → El adapter GDV actual produce capabilities `grupos_vida.stage.read`. El adapter Dream Team produciría capabilities como `dps.team.serve`, `estudiantes.team.lead`, etc. Son fuentes distintas (`source`). Un líder de GDV que no es director de etapa NO recibiría capability de Dream Team a menos que el adapter `dream-team-gdv` lo exponga explícitamente.

10. **¿Qué cambios de DB serían aditivos y seguros?**  
   → Nuevas tablas (`dream_team_*`), nuevos enums, nuevas capabilities en el allowlist de `experiences.ts`. Cero cambios a tablas existentes (solo lecturas). Cero migraciones destructivas. El adapter `dream-team-gdv` leería de `grupo_miembros` sin modificarla.

### Preguntas emergentes de la investigación

11. **¿El adapter `dream-team-gdv` para líderes debe ser un adapter separado o una extensión del adapter GDV existente?**  
   → Recomendación: adapter separado (`lib/platform/adapters/dream-team-gdv.ts`). El adapter GDV actual es para el contexto de navegación de directores; mezclar líderes de grupo cambiaría su semántica. Separación de concerns.

12. **¿Fase 2 debe implementar el `PlatformParticipationReadRepository` real (Supabase) o solo el contrato?**  
   → El contrato ya existe. La implementación real (Supabase RPC/tablas) puede ser un stub en Fase 2 (siguiendo el patrón de Fase 1: interfaces + fakes) y materializarse en Fase 3 Operating Core.

13. **¿Los requisitos de Dream Team deben poder configurarse por UI en Fase 2, o es suficiente con el modelo de datos?**  
   → El handoff dice «requisitos configurables por área/rol son configurables y no se hardcodean». El modelo de datos debe permitir configuración, pero la UI de configuración puede ser posterior. En Fase 2, basta con que la tabla de requisitos permita INSERT/UPDATE (admin), sin UI gráfica.

14. **¿Cómo se asigna inicialmente una persona a un servicio? ¿Auto-servicio? ¿Asignación por admin?**  
   → El handoff no especifica. Fase 2 probablemente debe soportar asignación por admin/director (no auto-servicio, que es parte de onboarding en fases posteriores). Esto debe validarse con producto.

15. **¿El dashboard contextual debe mostrar servicios Dream Team en Fase 2?**  
   → Con el flag de navegación OFF, no se mostraría nada. Pero el modelo de capabilities debe estar listo para que cuando el flag se active, los ítems aparezcan. El diseño debe preverlo, aunque la visibilidad real dependa del rollout.

## 7. Recomendación para Fase 2

### 7.1 Alcance tentativo

**Incluir en Fase 2**:
1. Modelo de dominio Dream Team: tablas `dream_team_equipos`, `dream_team_roles`, `dream_team_servicios`, `dream_team_requisitos`, `dream_team_requisitos_verificacion`, `dream_team_estados_historial`
2. Enums: `enum_dream_team_estado`, `enum_dream_team_requisito_tipo`, `enum_dream_team_requisito_estado`, `enum_dream_team_requisito_obligatoriedad`
3. Módulo `lib/platform/dream-team.ts` — tipos puros y helpers (estados válidos, transiciones permitidas, factory de capabilities)
4. Adapter `lib/platform/adapters/dream-team.ts` — reader interface + resolver que mapea `dream_team_servicios` → `PlatformSessionCapability[]`
5. Adapter `lib/platform/adapters/dream-team-gdv.ts` — reader que consulta `grupo_miembros` para líderes y los mapea como Dream Team
6. Extensión de `PLATFORM_CAPABILITIES` con nuevas capabilities de servicio (ej: `dps.team.serve`, `estudiantes.team.lead`, etc.)
7. Extensión de `PLATFORM_NAVIGATION_DEFINITIONS` con ítems de Dream Team (con `availableHref: undefined` o stub)
8. Integración con `grants.ts`: emitir `PlatformGrantAuditEvent` en asignaciones
9. Migraciones aditivas (solo CREATE TABLE, CREATE ENUM, sin DROP ni ALTER destructivos)
10. Tests unitarios y de integración para el módulo y adapters

**Excluir de Fase 2 (delegar a Fase 3+)**:
- UI de gestión de Dream Team (asignación/revocación de servicios)
- Dashboard específico de Dream Team (métricas de voluntarios)
- Onboarding / flujo de postulación
- Emisión real de eventos `service` en `participation` (solo preparar el contrato)
- Implementación real de `PlatformParticipationReadRepository` en Supabase
- Conexión operativa con cada experiencia (DPS flows, Estudiantes flows, etc.)
- UI de configuración de requisitos
- Cualquier uso de `uno_a_uno`

### 7.2 Dependencias

- Fase 1 Platform Foundation (COMPLETA ✅)
- Ninguna dependencia externa nueva
- `usuarios` como persona canónica (ya existe)
- `PLATFORM_EXPERIENCE_CATALOG` como catálogo de experiencias (ya existe)
- `PLATFORM_CAPABILITIES` como allowlist extensible (ya existe)

### 7.3 Orden sugerido de implementación

1. **Slice 1 — Modelo de datos + enums**: tablas nuevas, migraciones aditivas, tipos TypeScript en `database.types.ts`
2. **Slice 2 — Módulo puro `dream-team.ts`**: tipos, state machine de 6 estados, transiciones válidas, helpers para construir capabilities
3. **Slice 3 — Adapter Dream Team**: reader interface, resolver que mapea DB → `PlatformSessionCapability[]`, tests
4. **Slice 4 — Adapter GDV líderes**: reader que consulta `grupo_miembros` y mapea líderes, tests de compatibilidad con GDV
5. **Slice 5 — Integración con grants**: emitir `PlatformGrantAuditEvent` en acciones de asignación/revocación
6. **Slice 6 — Capacidades + navegación**: nuevas capabilities en allowlist, definiciones de navegación, wiring con `resolvePlatformNavigation`
7. **Slice 7 — Integración con participación**: preparar emisión de eventos `service` (sin DB real, solo contrato)

## 8. Evaluación de readiness

| Condición | Estado | Notas |
|---|---|---|
| Fase 1 cerrada y mergeada | ✅ | 7 sub-fases, 14 módulos, 666 tests, flag OFF en prod |
| `lib/platform/**` estable | ✅ | Sin cambios planeados en Fase 1 |
| Patrones de extensión claros | ✅ | Adapter pattern, capabilities allowlist, navigation definitions |
| Tablas existentes sin riesgo de rotura | ✅ | Solo lecturas de tablas GDV; cero DROP/ALTER |
| Preflight `uno_a_uno` activo | ✅ | Bloquea uso de 1:1; Dream Team no lo necesita |
| Testing contracts definidos | ✅ | Unit tests puros + integration con fakes, como en Fase 1 |
| Scope acotado | ✅ | Modelo de datos + contratos; sin UI operativa ni flujos de experiencia |

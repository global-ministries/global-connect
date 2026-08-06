# Exploration — Fase 5: Talleres de Crecimiento Operativos

**Change:** `fase-05-talleres-crecimiento`
**Status:** planning only — no implementation, no merges, no workflow edits, no Supabase operations
**Strategy:** additive sibling modules sobre F1/F2/F3/F4, byte-identity preservada en módulos protegidos, 400-line authored review budget, `force-chained stacked-to-main`
**Mode:** openspec

---

## 1. Contexto y objetivo

### 1.1 Qué resuelve Fase 5

Fase 5 — Talleres de Crecimiento Operativos materializa la **estación 3 de la ruta espiritual** (talleres de crecimiento / grupos de corto plazo, alineados con `docs/REUNION_PASTOR_ROADMAP.html:1488-1495` y `docs/roadmap/globalconnect-roadmap-maestro-v1.md:141-156`) sobre el cimiento ya construido de Fases 1-4. Su propósito pastoral es doble:

1. **Operar los talleres como eventos formativos reales** — catálogo, cohortes, inscripción, asistencia, completación — reusando la tubería operativa común que Fase 3 ya construyó para `kind='workshop'`.
2. **Conectar al taller con el resto del ecosistema**: líderes/co-líderes/servidores referencian a Dream Team (Fase 2), la persona asistente recibe seguimiento pastoral vía tríada (Fase 4) si su nuevo paso dispara mentor cascade, y el historial del taller alimenta la vista pública del roadmap del usuario (Fase 4).

El alcance pastoral, alineado con el roadmap maestro (`docs/roadmap/globalconnect-roadmap-maestro-v1.md:145-156`):

- catálogo de talleres (no enumerable hardcoded);
- fechas y cohortes (un taller recurrente o un taller puntual con N sesiones);
- inscripción (reusa contrato público de Fase 3 con `kind='workshop'`);
- asistencia por instancia/sesión;
- completación (¿umbral mínimo? ¿asistencia a todas las sesiones? ¿evaluación? — gap);
- líderes, co-líderes y servidores (modelados como `DreamTeamServicio` con `experiencia='talleres_crecimiento'`, **NO** duplicados);
- conexión con Dream Team para quienes sirven (reusa `lib/platform/dream-team/**`);
- historial de participación para quienes asisten (reusa `operating_core_participation_eventos` con kinds aditivos `taller_*`).

**Regla pastoral cerrada** (`docs/roadmap/globalconnect-roadmap-maestro-v1.md:156`): "asistir a un taller no convierte a una persona en Dream Team; servir en el taller sí." F5 modela asistente y servidor como relaciones distintas (la primera es participación, la segunda es servicio de F2).

### 1.2 Qué NO resuelve Fase 5 (out of scope, alineado con el pastor y el roadmap)

- Contenido pedagógico de los talleres (no se modela currículum, materiales, evaluaciones pedagógicas, certificaciones académicas — son contenido de cada taller, no plataforma).
- Integración con WhatsApp para recordatorios o marketing (deuda explícita de Fase 3 y F4, fuera de MVP).
- Marketplace abierto de talleres con pago (el roadmap maestro menciona "costo" como gap a evaluar, pero F5 inicia con talleres **gratuitos** del catálogo de la iglesia).
- Inscripción self-service del asistido (deuda de Fase 3 — Fase 12 la cubre).
- Multi-tenant / multi-campus (deuda cerrada desde F1, P15 de F4).
- Portal de staff para auto-gestión de cohortes (F5 es staff-driven, no self-service).
- Analytics avanzados (tendencias, cohortes, churn, etc.) — sigue deuda de Fase 3.
- Rediseño de Grupos de Vida (deuda cerrada desde F1).
- Consolidación de la ruta espiritual completa (Fase 11).
- Activación del flag `NEXT_PUBLIC_TALLERES_*` en producción sin 7+ días de validación en staging (precedente F3/F4).

### 1.3 Decisiones cerradas que aplican (heredadas de F1/F2/F3/F4, no se reabren)

- **Persona única**: todo asistente, líder, co-líder y servidor referencia `Persona` (Fase 1) por `persona_id`. **No se duplica identidad.**
- **Taller como `Event` con `kind='workshop'`**: Fase 3 ya construyó `operating_core_events` con `kind ∈ {service, group_meeting, workshop, activity, custom}` (`lib/platform/operating-core/types.ts:18-24`). F5 NO crea una entidad nueva "Taller" paralela; F5 extiende el `Event` con metadatos aditivos (cohorte, líder, co-líder, servidor) en una tabla hermana `talleres_crecimiento_metadata` (o columnas aditivas via migration).
- **Inscripción reusa `OperatingCoreRegistration`**: el `Registration` de Fase 3 con state machine 6-estados (`lib/platform/operating-core/state.ts:6-13`) y `evaluateRegistrationOutcome` con waitlist (`lib/platform/operating-core/registrations/registration-state.ts:55-95`) cubre el caso del taller. F5 lo **consume**, no lo duplica.
- **Asistencia reusa `OperatingCoreParticipationEvent` con kind=`attendance`**: el ledger unificado de Fase 3 (`lib/platform/operating-core/kinds.ts:7-19`) ya tiene el kind. F5 NO añade un kind nuevo para asistencia; F5 usa `attendance` y `attendance_update` que ya existen.
- **Servidores reusan `DreamTeamServicio` con `experiencia='talleres_crecimiento'`**: el `dream_team` ya tiene ese valor en su enum (`lib/platform/dream-team/types.ts:17`). F5 NO crea un modelo de "servidor de taller" paralelo.
- **Líder de taller reusa `DreamTeamServicio` + rol `líder`**: ya existe `dream_team_equipos` con `parentEquipoId` (`lib/platform/dream-team/types.ts:18`). Un taller tiene `equipoId` que lo conecta al equipo de líderes; el `co_líder` es un segundo `DreamTeamServicio` en el mismo `equipoId` con `rolId` distinto.
- **Cascada del mentor ya referencia talleres** (decisión cerrada de F4): `lib/platform/pastoral/mentor-cascade.ts:81-90` ya consulta `tallerAdapter.resolverLiderDeTaller()` como **Nivel 2** de la cascada. F5 **provee** el adapter que F4 consume. Esta es la razón estratégica principal por la que F5 viene **después** de F4 — el cascade ya está construido y necesita el módulo de talleres para resolverse correctamente.
- **`lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags}.ts` byte-identical post-F5** (Fase 1 protected).
- **`lib/platform/dream-team/**` byte-identical post-F5** (Fase 2 protected).
- **`lib/platform/adapters/grupos-vida.ts` byte-identical post-F5** (Fase 1+2 protected).
- **`lib/platform/operating-core/{kinds,state,capture-states,participation-read-guard,capture-ux-types,types}.ts` byte-identical post-F5** (Fase 3 protected).
- **`lib/platform/pastoral/{types,state,participation-kinds,mentor-cascade,flags,capabilities,index,errors}.ts` byte-identical post-F5** (Fase 4 protected — F5 **añade** módulos hermanos en `lib/platform/talleres/**` o `lib/platform/pastoral/talleres/**`, pero NO edita los archivos protegidos).
- **`buscar_usuarios_para_grupo` firma intacta** (precedente F1, F3, F4 — ver `fase-04-seguimiento-pastoral/exploration.md:42`).
- **`uno_a_uno=archive` sigue bloqueado**: `lib/platform/preflight.ts` permanece bloqueado. F5 NO invoca `registerPlatformUnoAUnoDecision`. El taller NO usa el modelo `uno_a_uno_*` legacy.
- **Multi-tenant OUT of MVP**: F5 no introduce multi-iglesia ni multi-campus.
- **RLS con helper Postgres** tipo `auth_has_operating_core_capability` o `auth_has_pastoral_capability` (precedente F2 + F4). F5 introduce `auth_has_talleres_capability(p_capability_key text)`.
- **Version + 409 en transiciones de estado** (precedente F2 `lib/platform/dream-team/state-machine.ts`, F4 `lib/platform/pastoral/state.ts`).
- **Append-only audit log** (precedente F3 `attendance_update`, F4 `one_on_one_logged` con prefijo `pastoral_`).
- **Feature flags con kill switch call-time**: F5 añade `NEXT_PUBLIC_TALLERES_*` siblings a `lib/platform/pastoral/flags.ts` (o crea `lib/platform/talleres/flags.ts` como módulo hermano — ver D11).
- **Strict TDD**: tests primero, RED verificado, GREEN implementado, REFACTOR con cobertura.
- **Migraciones DDL aditivas**: cero columnas renombradas/eliminadas, cero `DROP`, cero `ALTER` sobre tablas preexistentes. Solo `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ADD COLUMN` (sobre tablas nuevas), `CREATE OR REPLACE FUNCTION` (con firma byte-idéntica).
- **Capacities scoped** (no roles globales duplicados): cada capability nueva se agrega al catálogo `PLATFORM_CAPABILITIES` (`lib/platform/experiences.ts`) con `experience: 'talleres_crecimiento'` y `scopeType: 'taller'`.
- **Sistema sugiere, líder valida** (decisión pastoral cerrada): un asistente NO se "inscribe solo" con efectos pastorales; un líder de taller es quien confirma la inscripción y registra asistencia.

---

## 2. Estado del arte (qué ya existe y se puede reusar sin reinventar)

### 2.1 Fase 1 — Platform Foundation (construido y mergeado)

| Módulo | Reuso para F5 |
|---|---|
| `lib/platform/persona.ts` | `Persona` canónica por `persona_id`. Asistentes, líderes y servidores referencian `Persona`. **Sin nuevos cambios.** |
| `lib/platform/experiences.ts` | Catálogo con `experience: 'talleres_crecimiento'` y `scopeType: 'taller'` YA DECLARADOS (`experiences.ts:11`). F5 **extiende aditivamente** `PLATFORM_CAPABILITIES` con keys nuevas (no edita las existentes). **Gap detectado**: `navigation.ts:93` referencia `talleres_crecimiento.admin.manage` que NO está en `PLATFORM_CAPABILITIES` (línea 26 solo tiene `participation.read` y línea 42 `team.serve`). Este gap lo cierra F5. |
| `lib/platform/grants.ts` | `PlatformGrantAuditEvent`. Cada asignación de líder/co-líder/servidor emite `grant`/`revoke`/`deny`/`audit`. |
| `lib/platform/participation.ts` | Contrato longitudinal base. F5 NO edita este módulo; nuevos kinds viven en `lib/platform/talleres/participation-kinds.ts` (sibling). |
| `lib/platform/routeGuard.ts` / `navigation.ts` | Patrón de auth + capability + flag gating. F5 sigue el mismo patrón con `talleres_crecimiento.*` capabilities. **Ya existen nav items**: `talleres_participation` (línea 90) y `talleres_admin` (línea 93). F5 los hace resolubles. |
| `lib/platform/family.ts` | Taxonomía de relaciones — no tocada. |
| `lib/platform/preflight.ts` | Sigue bloqueando `uno_a_uno`. F5 NO invoca `registerPlatformUnoAUnoDecision`. |
| `lib/platform/flags.ts` | Sigue siendo el módulo de flags base. F5 crea `lib/platform/talleres/flags.ts` como módulo hermano (sigue precedente F3/F4). |
| `lib/platform/adapters/grupos-vida.ts` | Bridge read-only a Grupos de Vida — no tocado. |
| `lib/auth/requireAuth.ts` | Patrón de auth server-side. F5 reusa para `app/api/talleres/**`. |

### 2.2 Fase 2 — Dream Team Global Base (construido y mergeado)

| Módulo | Reuso para F5 |
|---|---|
| `lib/platform/dream-team/types.ts` | `DREAM_TEAM_ESTADOS` (6 estados), `DREAM_TEAM_MOTIVOS` (10 motivos), `DreamTeamServicio`. **YA incluye** `experiencia: 'talleres_crecimiento'` en el enum (`types.ts:17`). F5 consume sin modificar. |
| `lib/platform/dream-team/state-machine.ts` | `TRANSICIONES_VALIDAS` matrix + `transition()` puro. F5 reusa para transiciones de servidor (activar, pausar, retirar). |
| `lib/platform/dream-team/errors.ts` | `DreamTeamErrorCode` discriminated union. F5 no invoca nuevos errores de dream-team. |
| `lib/platform/dream-team/repository.ts` + `-fake.ts` + `-supabase.ts` | Triple repositorio. F5 lo consume para `findServiciosByEquipo(experiencia='talleres_crecimiento')`. |
| `lib/platform/dream-team/grants.ts` | `buildGrantsForServicio`. F5 emite grants cuando un líder/co-líder/servidor se asigna a un taller (line 94-95 ya tiene el caso `'talleres_crecimiento'` que retorna `talleres_crecimiento.team.serve` — F5 extiende con más capacidades). |
| `lib/platform/dream-team/servicios.ts` | `transitionWithGrants` orchestrator. F5 lo consume para transiciones de servicio. |
| `lib/platform/dream-team/route-access.ts` | `hasDreamTeamReadCapability`/`hasDreamTeamWriteCapability`. F5 no las duplica. |
| `DreamTeamEquipo` con `parentEquipoId` | Modelo jerárquico de equipos. F5 modela el "equipo de líderes de taller" como `DreamTeamEquipo` con `experiencia='talleres_crecimiento'` y los líderes/co-líderes como `DreamTeamServicio` apuntando al mismo equipo con distintos `rolId`. **Sin modelo paralelo.** |

### 2.3 Fase 3 — Operating Core (construido, mergeado, **precedente más cercano**)

| Módulo / spec | Reuso para F5 |
|---|---|
| `lib/platform/operating-core/types.ts` | `OperatingCoreEvent` con `kind: 'workshop'` ya soportado (`types.ts:18-24`). F5 modela el taller como `Event` con `kind='workshop'`. **No crea entidad nueva.** |
| `lib/platform/operating-core/state.ts` | State machine 6-estados para `Registration`. F5 lo reusa directamente (`state.ts:6-13`). |
| `lib/platform/operating-core/registrations/registration-state.ts` | `evaluateRegistrationOutcome` con waitlist, `canDenyManualRegistration`, `validateWaitlistPromotion`. F5 los reusa. |
| `lib/platform/operating-core/registrations/registration-repository.ts` + `-fake.ts` + `-supabase.ts` | Triple repositorio de registrations. F5 lo consume por `eventInstanceId` para cada sesión del taller. |
| `lib/platform/operating-core/capture-ux/capture-ux-types.ts` | `CAPTURE_UX_SHAPES` con shape `registration` ya declarado para talleres/eventos (`capture-ux-types.ts:42-46`). F5 lo reusa con un nuevo `eventKind: 'workshop'`. |
| `lib/platform/operating-core/participation-ledger-repository.ts` + `-supabase.ts` | Ledger unificado. F5 escribe con `kind ∈ {attendance, attendance_update, registration, cancellation}` (estos 4 ya están en `OPERATING_CORE_PARTICIPATION_KINDS`). NO añade kinds nuevos al archivo `kinds.ts` protegido. |
| `lib/platform/operating-core/kinds.ts` | **F5 NO edita este archivo**. 11 kinds canónicos siguen siendo la verdad; los nuevos kinds de "completación" y "cohorte" van en módulo hermano (ver D14). |
| `lib/platform/operating-core/participation-read-guard.ts` | `canReadOperatingCoreParticipationEvent` con strict-equality scope rule. F5 reusa para los 4 kinds que ya soporta. |
| `lib/platform/operating-core/notification-outbox/` | Outbox compartido con bounded retry. F5 **reusa** este outbox (precedente F3/F4). Los kinds nuevos de notificación (e.g. `taller.completion.confirmed.v1`) usan `template_key: 'talleres.*'`. |
| `lib/platform/operating-core/dashboards/loader.ts` | Loader capability-based. F5 añade una **sección de talleres** aditiva por capability. |
| `lib/platform/operating-core/flags.ts` | Sibling flag reader (F3 ya tiene su propio). F5 crea `lib/platform/talleres/flags.ts` como módulo hermano, NO edita `lib/platform/flags.ts` ni `operating-core/flags.ts`. |
| `lib/platform/operating-core/route-access.ts` | Patrón auth + capability + flag. F5 replica para `app/api/talleres/**`. |
| `lib/platform/operating-core/visitor-resolution.ts` | Visitor resolution con `match_method`. F5 lo consume para asistentes nuevos sin `Persona` previa (mismo patrón que `attendance_update` para visitantes). |
| `lib/platform/operating-core/recurrent/recurrence-rule.ts` | `OperatingCoreRecurrenceRule` con `freq: 'weekly'`, `byDay`, `count`, `until`. F5 lo consume para talleres recurrentes (cohorte semanal). |
| `supabase/migrations/20260716120000_operating_core_events.sql` | Schema de `operating_core_events` con `kind=workshop`. F5 lo consume. |

### 2.4 Fase 4 — Seguimiento Pastoral (construido, mergeado, **precedente inmediato**)

| Módulo / spec | Reuso para F5 |
|---|---|
| `lib/platform/pastoral/types.ts` | `OneOnOneEstado` (6 estados), `TriadaEstado` (4 estados), `TriadaDissolutionReason` (5 motivos). F5 los reusa como patrones para los estados del taller. |
| `lib/platform/pastoral/state.ts` + `triad-state.ts` | State machine de 1:1 y tríada. F5 los reusa como patrón para el lifecycle del taller. |
| `lib/platform/pastoral/mentor-cascade.ts` + `mentor-cascade/types.ts` | **F5 PROVEE el adapter de Nivel 2** (`resolverLiderDeTaller`) que F4 ya consume (línea 81-90). El adapter actual (`lib/platform/pastoral/adapters/grupo-corto-plazo-mentor-adapter.ts`) es un stub que busca `dream_team_servicios` con `experiencia='talleres_crecimiento'`. F5 lo formaliza y lo prueba. |
| `lib/platform/pastoral/capabilities.ts` | `resolvePastoralCapability`. F5 NO edita este módulo; F5 crea `lib/platform/talleres/capabilities.ts` con la misma forma pero `experience: 'talleres_crecimiento'`. |
| `lib/platform/pastoral/flags.ts` | Sibling flag reader de F4. F5 crea `lib/platform/talleres/flags.ts` paralelo, NO edita el pastoral. |
| `lib/platform/pastoral/participation-kinds.ts` | `PASTORAL_PARTICIPATION_KINDS` (14 kinds con prefijo `pastoral_`). F5 NO añade nada aquí; F5 crea `lib/platform/talleres/participation-kinds.ts` con su propio set de kinds con prefijo `taller_` o `talleres_`. |
| `lib/platform/pastoral/hierarchical-visibility.ts` | `getVisiblePastoralOneOnOneIds` + `getPersonasUnderMe` con RPC `get_personas_under_me`. F5 lo reusa para resolver quién es líder de taller (el RPC ya está implementado en migration M25: `20260727010000_pastoral_hierarchical_visibility.sql`). |
| `lib/platform/pastoral/errors.ts` | `PastoralErrorCode` discriminated union. F5 NO los reusa; F5 define `TalleresErrorCode` análogo. |
| `lib/platform/pastoral/participation-ledger-pastoral-writer.ts` | Patrón de writer al ledger compartido. F5 lo replica como `lib/platform/talleres/participation-ledger-talleres-writer.ts` para los kinds nuevos que F5 introduce (ver D14). |
| `lib/platform/pastoral/notifications/template-keys.ts` | Catálogo de templates con prefijo `pastoral.`. F5 crea catálogo paralelo con prefijo `talleres.` (e.g. `talleres.inscription.confirmed.v1`). |
| `lib/platform/pastoral/adapters/grupo-corto-plazo-mentor-adapter.ts` | Adapter stub que ya busca `dream_team_servicios` con `experiencia='talleres_crecimiento'`. F5 lo completa con la lógica real: "resolver el líder activo del taller en el que está inscripta la persona". |
| `lib/platform/pastoral/notifications/notification-scheduler.ts` | Patrón de scheduled notification. F5 replica para recordatorios de sesión de taller. |
| `openspec/specs/platform/pastoral/spec.md` | Precedente del consolidado spec. F5 produce `openspec/specs/platform/talleres-crecimiento/spec.md` con la misma estructura. |

### 2.5 Reunión pastoral (alineamiento pastoral explícito)

`docs/REUNION_PASTOR_ROADMAP.html` define las decisiones pastorales que aplican a F5:

- **Taller = grupo de corto plazo** (`docs/REUNION_PASTOR_ROADMAP.html:1488-1495`): los talleres son la estación 3 de la ruta espiritual, antes del Grupo de Vida.
- **Cascada del mentor Nivel 2** (`docs/REUNION_PASTOR_ROADMAP.html:1934-1937`): si la persona NO está en GDV pero SÍ en un taller activo, el líder del taller es su mentor oficial. Esta decisión pastoral ya está implementada en F4 (`lib/platform/pastoral/mentor-cascade.ts:81-90`); F5 debe **proveer el adapter** que el cascade consume.
- **GDV pesa más**: si la persona está en GDV, ese es el mentor oficial aunque también asista a un taller o sirva.
- **Mentores no oficiales excluidos**: los líderes de taller cuentan como mentor oficial solo si tienen rol formal (`DreamTeamServicio` activo). Si un "líder" no es `DreamTeamServicio`, no entra al cascade.
- **Tríada por nuevo paso**: cuando la persona se inscribe a un taller, se dispara tríada por nuevo paso (Fase 4 ya cubre este flujo con `contexto='nuevo_paso'`). F5 solo necesita **emitir el evento** que F4 escucha (gap en la integración).
- **Regla pastoral del taller**: "asistir a un taller no convierte a una persona en Dream Team; servir en el taller sí." (`docs/roadmap/globalconnect-roadmap-maestro-v1.md:156`). Esto se traduce en: la tabla `dream_team_servicios` NO se llena automáticamente al asistir; solo se llena al asignar servidor explícitamente.
- **Co-líder y servidor**: el roadmap maestro no especifica si un taller puede tener múltiples líderes. Asumimos tentativamente que sí (un líder principal + N co-líderes + N servidores), pero **es un gap a confirmar** (G2).
- **Líder asignado por quién**: el roadmap no especifica quién asigna al líder. Asumimos tentativamente que un director de la experiencia `talleres_crecimiento` (otro `DreamTeamServicio` con `rol='director'`) lo asigna; **es un gap a confirmar** (G3).
- **"Todo lo que empieza debe terminar"**: cada taller debe tener un estado terminal. F5 cierra el lifecycle (borrador → abierto → en_curso → cerrado) con estados terminales explícitos.
- **El sistema sugiere, el líder valida**: un asistente no se inscribe con efectos pastorales automáticos; el líder confirma la inscripción y marca asistencia.

---

## 3. Gaps y preguntas abiertas (necesitan respuesta antes de la propuesta)

> Las preguntas se numeran **G1..GN** (Gaps). Se agrupan por dominio al final. No se reabren las decisiones cerradas de F1/F2/F3/F4 ni las decisiones pastorales explícitas listadas en §2.5.

### 3.1 Modelo de datos del taller

- **G1.** ¿Un taller es **un único evento** (cohorte = 1 sesión) o **una serie de eventos recurrentes** (cohorte = N sesiones en distintos días)? El roadmap dice "fechas/cohortes" (plural). Asumimos tentativamente: un `OperatingCoreEvent` con `kind='workshop'` + `OperatingCoreRecurrenceRule` (F3) que genera N `OperatingCoreEventInstance`. **Confirmar.**
- **G2.** ¿Un taller puede tener **múltiples líderes** (un líder principal + N co-líderes) o solo uno? El roadmap no especifica. Asumimos tentativamente: 1 líder + N co-líderes + N servidores, todos como `DreamTeamServicio` en el mismo `DreamTeamEquipo`. **Confirmar.**
- **G3.** ¿Quién asigna al líder/co-líder/servidor de un taller? Opciones: (a) un director de la experiencia `talleres_crecimiento` (otro `DreamTeamServicio`), (b) el admin/pastor, (c) auto-asignación por scope. Asumimos (a). **Confirmar.**
- **G4.** ¿El taller tiene **cupo (capacity)**? El state machine de `Registration` de F3 ya cubre waitlist. Asumimos: sí, con capacidad configurable por instancia (override de Fase 3). **Confirmar.**
- **G5.** ¿El taller tiene **costo**? El roadmap dice "F5 inicial probablemente gratis, pero considerar Fase futura". Asumimos tentativamente: gratis en MVP; el modelo soporta `costo_monto` + `custo_moneda` aditivo pero opcional (null = gratis). **Confirmar.**
- **G6.** ¿El taller tiene **prerrequisitos** (e.g. "taller X debe estar completado antes de inscribirse a Y")? El roadmap no menciona. Asumimos tentativamente: no en MVP; el siguiente paso se sugiere desde F4 (vista pública de roadmap). **Confirmar.**
- **G7.** ¿El taller tiene **materiales** (PDF, links, videos) y se modelan con `OperatingCoreResource` (F3) o como entidad separada? Asumimos tentativamente: reuso de `OperatingCoreResource` con `ownerScope = taller_id`. **Confirmar.**

### 3.2 Inscripción y asistencia

- **G8.** ¿La inscripción es **por persona individual** o también **por grupo familiar** (varios miembros de una familia al mismo taller)? El roadmap no menciona. Asumimos tentativamente: por persona individual, con `companion_ids` opcional (F3 ya soporta `companion_ids: jsonb` en Registration). **Confirmar.**
- **G9.** ¿La validación de "completación" del taller requiere **asistencia mínima** (e.g. 80% de las sesiones) o **asistencia perfecta** (todas las sesiones) o **ningún requisito** (es un flag del líder)? Asumimos tentativamente: asistencia mínima configurable por taller (e.g. `min_attendance_pct NUMERIC DEFAULT 80`). **Confirmar.**
- **G10.** ¿Quién **confirma** la inscripción? (a) confirmación automática (default `automatic`, F3 ya lo cubre); (b) confirmación manual del líder. Asumimos tentativamente: configurable por taller (`confirmation_mode`), default `manual` para talleres donde el líder quiere filtrar. **Confirmar.**
- **G11.** ¿La **asistencia** se registra por **sesión** (cada `EventInstance` del taller) o **agregada** (una sola marca por taller)? Asumimos tentativamente: por sesión (`OperatingCoreParticipationEvent` con `kind='attendance'` por instancia), con completación calculada como agregado. **Confirmar.**
- **G12.** ¿Un asistente **puede repetir** el mismo taller (dos cohortes del mismo taller)? Asumimos tentativamente: sí, cada cohorte es independiente; el historial longitudinal registra cada participación. **Confirmar.**

### 3.3 Líderes, co-líderes y servidores

- **G13.** ¿La asignación de un líder a un taller requiere **aceptación** del líder (e.g. "Carlos es propuesto como líder del taller X, ¿acepta?") o es **automática** al asignar? Asumimos tentativamente: el líder acepta explícitamente vía UI (similar a `en_orientacion → activo` de F2 Dream Team). **Confirmar.**
- **G14.** ¿Un líder puede estar asignado a **varios talleres simultáneamente**? Asumimos tentativamente: sí, son `DreamTeamServicio` distintos en el mismo `DreamTeamEquipo` o en equipos distintos. **Confirmar.**
- **G15.** ¿Un servidor (no líder) puede dar **contenido** del taller (e.g. facilitador de una sesión) o solo tareas logísticas? El roadmap no distingue. Asumimos tentativamente: el modelo es agnóstico — el `rol` del `DreamTeamServicio` define la responsabilidad. **Confirmar.**
- **G16.** ¿Servir en un taller **alimenta automáticamente** al `DreamTeamServicio` con `experiencia='talleres_crecimiento'` para entrar en el mentor cascade Nivel 3 (F4)? Asumimos tentativamente: sí, el servidor activo del taller entra al cascade Nivel 3 automáticamente. **Confirmar.**

### 3.4 Conexión con Dream Team y Fase 4

- **G17.** ¿La conexión con Dream Team es **unidireccional** (servidor del taller → Dream Team) o **bidireccional** (Dream Team activo en `talleres_crecimiento` → puede ser asignado como servidor del taller)? Asumimos tentativamente: bidireccional — el servidor del taller ES un `DreamTeamServicio` activo; el catálogo de posibles líderes/servidores del taller viene de los `DreamTeamServicio` con `experiencia='talleres_crecimiento'`. **Confirmar.**
- **G18.** ¿Cuándo se crea la **tríada por nuevo paso** (F4) al inscribirse a un taller? (a) inmediatamente al confirmar la inscripción; (b) al iniciar la primera sesión; (c) al completar el taller. Asumimos tentativamente: (b) al iniciar la primera sesión, para no crear tríadas de personas que se inscriben pero no asisten. **Confirmar.**
- **G19.** ¿La **vista pública del roadmap** del usuario (F4) muestra "taller completado" como un **hito pastoral** (i.e. genera `pastoral_*_step_validated`) o solo como un evento informativo (`taller_completed` con `sensitivity='internal'`)? Asumimos tentativamente: el evento es informativo (`talleres.completion.recorded` con `sensitivity='internal'`); el roadmap pastoral lo renderiza pero NO requiere validación pastoral adicional. **Confirmar.**
- **G20.** ¿El historial del taller **alimenta** al historial pastoral del usuario (vista F4) o son dimensiones separadas? Asumimos tentativamente: dimensiones separadas con agregación cruzada en la vista pública del roadmap (el roadmap muestra "taller X completado" como un paso del journey). **Confirmar.**

### 3.5 Lifecycle y notificaciones

- **G21.** ¿Cuál es el **set cerrado de estados del taller**? Candidatos tentativos: `borrador → abierto → en_curso → cerrado`, con `cancelado` como estado terminal alternativo. ¿`cerrado` es post-taller o incluye `completo` (e.g. líder marca "completo")? Asumimos tentativamente: `cerrado` implica "el taller terminó, todas las sesiones se dieron"; `completo` es un sub-estado de la persona (`Registro.taller.estado ∈ {inscripto, asistiendo, completado, abandono, no_completado}`). **Confirmar.**
- **G22.** ¿Las **notificaciones** de F5 (e.g. "tu inscripción fue confirmada", "recordatorio de sesión mañana") son parte del **outbox compartido de F3** (con `template_key: 'talleres.*'`) o un **outbox hermano**? Asumimos tentativamente: reuso del outbox compartido (precedente F4 con `pastoral.*`). **Confirmar.**
- **G23.** ¿Quién recibe **qué notificación**? Candidatos: (a) asistente recibe `inscription_confirmed`, `session_reminder`, `taller_completed`; (b) líder recibe `new_inscription`, `attendance_pending`, `taller_closed`; (c) co-líder recibe las mismas que líder. Asumimos tentativamente: líder y co-líder reciben ambos tipos (todos los operativos); asistente recibe confirmados y recordatorios pero NO recibe notificaciones internas del taller. **Confirmar.**
- **G24.** ¿Hay **recordatorios automáticos** (e.g. T-24h antes de cada sesión) o son **manuales** del líder? Asumimos tentativamente: T-24h configurable por taller (precedente F3 reminder para registrations). **Confirmar.**

### 3.6 UX, captura y reportes

- **G25.** ¿La **inscripción a un taller** se hace desde el celular del líder (`capture_ux` con shape `registration`, F3 ya provee) o desde un **portal del asistente** (self-service, fuera de MVP)? Asumimos tentativamente: solo desde celular del líder en MVP (Fase 12 cubre self-service). **Confirmar.**
- **G26.** ¿La **asistencia** se toma con check-in (`capture_ux` con shape `attendance`, F3) o con lista del líder al final de la sesión? Asumimos tentativamente: lista del líder al final (más simple, no requiere kiosko). **Confirmar.**
- **G27.** ¿El **catálogo público de talleres** (qué talleres hay disponibles) lo ve cualquier persona autenticada o solo staff? Asumimos tentativamente: autenticados con grant `talleres_crecimiento.participation.read` (que YA existe en `experiences.ts:26`). **Confirmar.**
- **G28.** ¿Hay un **dashboard del líder del taller** (métricas: inscriptos, asistencia, completación) o las métricas viven solo en el dashboard operativo general? Asumimos tentativamente: dashboard específico del líder del taller como **sección aditiva** del dashboard operativo (precedente F4 dashboards). **Confirmar.**

### 3.7 Plataforma y operaciones

- **G29.** ¿F5 introduce **nuevos participation kinds** en `operating_core_participation_eventos` (e.g. `taller_cohort_started`, `taller_session_attended`, `taller_completion_recorded`) o **reusa los 11 kinds canónicos** de F3? Asumimos tentativamente: reusa `attendance`, `attendance_update`, `registration`, `cancellation` para los flujos básicos; introduce **3-5 nuevos kinds con prefijo `taller_`** en migration aditiva (precedente F4 con `pastoral_`). **Confirmar.**
- **G30.** ¿F5 introduce un **nuevo `scopeType`** en `PLATFORM_SCOPE_TYPES`? El actual tiene `'taller'` ya (`experiences.ts:1`). Asumimos tentativamente: NO. Reusa `'taller'`. **Confirmar.**
- **G31.** ¿El **adapter de mentor cascade** Nivel 2 (`resolverLiderDeTaller`, que F4 ya consume) se **extiende** en F5 con lógica nueva (e.g. "si el taller terminó, no es mentor activo") o se mantiene **idéntico** y F5 solo agrega el otro lado (registrar al líder en el taller)? Asumimos tentativamente: F5 NO edita el adapter; F5 registra correctamente al líder en el taller para que el adapter siga funcionando. **Confirmar.**
- **G32.** ¿F5 introduce **flags `NEXT_PUBLIC_TALLERES_*`** como módulo hermano (precedente F3/F4) o reusa los flags existentes? Asumimos tentativamente: nuevo módulo `lib/platform/talleres/flags.ts` con `enabled`, `stage`, `killSwitch`, `minAppVersion`. **Confirmar.**

---

## 4. Supuestos preliminares (alineados por las reuniones pastorales o por las decisiones cerradas)

> Estos supuestos **ya están claros** según `docs/REUNION_PASTOR_ROADMAP.html`, el roadmap maestro, y las decisiones cerradas de F1/F2/F3/F4. Se listan aquí para que la propuesta los confirme, no para reabrirlos.

- **S1.** F5 modela el taller como `OperatingCoreEvent` con `kind='workshop'` (F3 ya construido). **No crea entidad nueva "Taller".** El catálogo, fechas/cohortes, inscripción y asistencia viven sobre las tablas `operating_core_events`, `operating_core_event_instances`, `operating_core_registrations`, `operating_core_participation_eventos`.
- **S2.** F5 introduce una **tabla aditiva `talleres_crecimiento_metadata`** que extiende `operating_core_events` con campos específicos del taller: `dirigido_por_persona_id` (líder principal), `confirmation_mode` (override del default), `min_attendance_pct` (umbral de completación), `costo_monto`, `costo_moneda`, `prerrequisitos jsonb`, `materiales jsonb` (referencias a `OperatingCoreResource`). Esto es una **extensión aditiva**, no una edición de `operating_core_events`.
- **S3.** F5 introduce una **tabla aditiva `talleres_crecimiento_cohortes`** que mapea un `OperatingCoreEvent` (taller) a sus `DreamTeamEquipo` (equipo de líderes) y a sus `OperatingCoreEventInstance` (sesiones). Esta tabla es el **puente** entre Operating Core (evento/sesiones) y Dream Team (equipo de líderes).
- **S4.** Los **líderes, co-líderes y servidores** de un taller son `DreamTeamServicio` con `experiencia='talleres_crecimiento'` apuntando al `DreamTeamEquipo` del taller. F5 NO crea un modelo paralelo. La asignación se hace vía grants de `talleres_crecimiento.team.lead` y `talleres_crecimiento.team.serve` (ver S10).
- **S5.** La **inscripción** se modela como `OperatingCoreRegistration` con `eventInstanceId` apuntando a cada `OperatingCoreEventInstance` (sesión) del taller. F5 NO crea un modelo paralelo. La completación se calcula como agregado sobre las inscripciones de las N sesiones.
- **S6.** La **asistencia** se modela como `OperatingCoreParticipationEvent` con `kind='attendance'` por sesión. F5 NO crea un modelo paralelo. La agregación por persona/taller se calcula como `count(attendance) / count(sessions) >= min_attendance_pct`.
- **S7.** **Asistir a un taller no convierte a una persona en Dream Team** (decisión pastoral cerrada). Solo servir en el taller (tener `DreamTeamServicio` activo) sí lo convierte. Esta regla se traduce en: la inscripción NO crea fila en `dream_team_servicios`; la asignación de servidor sí.
- **S8.** F5 **provee** el adapter `resolverLiderDeTaller(personaId)` que F4 ya consume en el mentor cascade Nivel 2. El adapter se implementa en `lib/platform/pastoral/adapters/grupo-corto-plazo-supabase-adapter.ts` (que ya existe como stub) y se completa con: "buscar el `OperatingCoreEvent` con `kind='workshop'` donde la persona está inscripta, retornar el `dirigido_por_persona_id` de `talleres_crecimiento_metadata`". Si la persona está en múltiples talleres activos, retornar el del taller más reciente.
- **S9.** F5 introduce **3-5 nuevos participation kinds** con prefijo `taller_` (e.g. `taller_cohort_started`, `taller_session_attended`, `taller_completion_recorded`, `taller_completion_failed`) en una migration aditiva que extiende el CHECK constraint de `operating_core_participation_eventos.kind`. Todos con `sensitivity='internal'`. Estos NO entran en `OPERATING_CORE_PARTICIPATION_KINDS` (archivo protegido) — viven en `lib/platform/talleres/participation-kinds.ts` como sibling.
- **S10.** F5 introduce **8-10 nuevas capabilities** en `PLATFORM_CAPABILITIES` con `experience: 'talleres_crecimiento'` y `scopeType: 'taller'`:
  - `talleres_crecimiento.workshop.create` (admin/director),
  - `talleres_crecimiento.workshop.read` (cualquier persona con grant en el taller),
  - `talleres_crecimiento.workshop.update` (director/líder),
  - `talleres_crecimiento.cohort.manage` (director/líder),
  - `talleres_crecimiento.inscription.create` (líder/co-líder),
  - `talleres_crecimiento.inscription.read` (líder/co-líder + asistente para sus propias inscripciones),
  - `talleres_crecimiento.inscription.cancel` (líder/co-líder + asistente para las propias),
  - `talleres_crecimiento.attendance.record` (líder/co-líder),
  - `talleres_crecimiento.attendance.read` (líder/co-líder),
  - `talleres_crecimiento.completion.validate` (líder),
  - `talleres_crecimiento.leader.assign` (director),
  - `talleres_crecimiento.metrics.read` (director/pastor/admin),
  - `talleres_crecimiento.admin.manage` (admin — cierra el gap detectado en `navigation.ts:93`).
- **S11.** F5 introduce **`auth_has_talleres_capability(p_capability_key text)`** como helper Postgres, paralelo a `auth_has_pastoral_capability` (precedente F4 M1).
- **S12.** F5 introduce **flags `NEXT_PUBLIC_TALLERES_*`** como módulo hermano `lib/platform/talleres/flags.ts`. NO edita `lib/platform/flags.ts`, `lib/platform/operating-core/flags.ts`, ni `lib/platform/pastoral/flags.ts`. Mismo patrón que F3 y F4.
- **S13.** F5 introduce un **outbox mapper** `lib/platform/talleres/notifications/outbox-mapper.ts` que mapea eventos de taller a `template_key: 'talleres.*'` (e.g. `talleres.inscription.confirmed.v1`, `talleres.session.reminder.v1`, `talleres.completion.recorded.v1`). Reusa el outbox compartido de F3.
- **S14.** F5 introduce **state machines propias** para `talleres_crecimiento_metadata.estado` (`borrador → abierto → en_curso → cerrado` con `cancelado` terminal) y para `registrations.completion_status` (`inscripto → asistiendo → completado → abandono | no_completado`). Estos NO son parte de `lib/platform/operating-core/state.ts` (protegido) — viven en `lib/platform/talleres/state.ts` como sibling.
- **S15.** El **director de la experiencia `talleres_crecimiento`** es un `DreamTeamServicio` con `rol='director'` en el equipo principal de la experiencia. Este director recibe grants `talleres_crecimiento.workshop.create`, `talleres_crecimiento.leader.assign`, `talleres_crecimiento.metrics.read`. NO hay rol global "director de talleres" — todo es scoped.
- **S16.** El **líder de taller** (`DreamTeamServicio` con `rol='lider'`) recibe grants `talleres_crecimiento.cohort.manage`, `talleres_crecimiento.inscription.*`, `talleres_crecimiento.attendance.*`, `talleres_crecimiento.completion.validate`. Estos grants se otorgan automáticamente al activarse el `DreamTeamServicio`.
- **S17.** El **co-líder** (`DreamTeamServicio` con `rol='co_lider'`) recibe los mismos grants que el líder excepto `completion.validate` (que es exclusivo del líder principal). Esto codifica la decisión pastoral "el sistema sugiere, el líder valida".
- **S18.** El **servidor** (`DreamTeamServicio` con `rol='servidor'`) recibe grants `talleres_crecimiento.attendance.read` (ve la lista de inscriptos) y `talleres_crecimiento.team.serve` (que ya existe en `experiences.ts:42`). NO recibe grants de inscripción ni de validación.
- **S19.** F5 **extiende** la plataforma sobre F1+F2+F3+F4, **sin migraciones destructivas** y **sin tocar los módulos protegidos**. Decisiones cerradas heredadas.
- **S20.** F5 introduce una **API surface** en `app/api/talleres/**` con capability-gated routes: `/api/talleres/workshops` (CRUD), `/api/talleres/cohorts/[id]/inscriptions` (inscribir), `/api/talleres/cohorts/[id]/attendance` (registrar asistencia), `/api/talleres/cohorts/[id]/complete` (cerrar y validar completación).
- **S21.** F5 introduce **UI routes** en `app/(pastoral)/talleres/**` (precedente F4: `app/(pastoral)/lider/talleres/page.tsx`) y `app/(pastoral)/admin/talleres/**` (gestión).
- **S22.** F5 introduce **dashboards** en `lib/platform/talleres/dashboards/loader.ts` que cargan datos de `OperatingCoreEvent` con `kind='workshop'` filtrados por capability. NO reemplaza el dashboard operativo de F3.
- **S23.** F5 **NO introduce multi-tenant ni multi-campus**. Es single-tenant como el resto del MVP.
- **S24.** F5 **NO introduce** el flag de `uno_a_uno` decision. Sigue bloqueado. F5 NO escribe en `uno_a_uno_reuniones` ni `uno_a_uno_participantes`.

---

## 5. Decisiones arquitectónicas tentativas (D1..DN)

> Las marcadas con **(cerrada)** ya están decididas por F1/F2/F3/F4 o por la reunión pastoral y no se reabren. Las marcadas con **(abierta)** requieren debate en la propuesta o respuesta pastoral antes del design.

### 5.1 Decisiones cerradas (heredadas)

- **D1 (cerrada).** F5 modela el taller como `OperatingCoreEvent` con `kind='workshop'`. NO crea entidad nueva. La extensión específica del taller vive en `talleres_crecimiento_metadata` (migration aditiva) con FK a `operating_core_events.id`.
- **D2 (cerrada).** F5 modela las cohortes/equipo de líderes como `DreamTeamEquipo` con `experiencia='talleres_crecimiento'`. Los líderes/co-líderes/servidores son `DreamTeamServicio` apuntando a ese equipo. Reusa `lib/platform/dream-team/**` byte-identical.
- **D3 (cerrada).** F5 modela la inscripción como `OperatingCoreRegistration` con `eventInstanceId` apuntando a la(s) `OperatingCoreEventInstance` del taller. Reusa state machine 6-estados de F3 (`lib/platform/operating-core/state.ts`).
- **D4 (cerrada).** F5 modela la asistencia como `OperatingCoreParticipationEvent` con `kind ∈ {attendance, attendance_update, registration, cancellation}` (estos 4 ya están en `OPERATING_CORE_PARTICIPATION_KINDS`). Para eventos específicos de F5 (cohorte iniciada, completación) introduce nuevos kinds con prefijo `taller_` en migration aditiva (precedente F4 con `pastoral_`).
- **D5 (cerrada).** F5 provee el **adapter `resolverLiderDeTaller(personaId)`** que F4 consume en el mentor cascade Nivel 2. La implementación completa el stub existente en `lib/platform/pastoral/adapters/grupo-corto-plazo-supabase-adapter.ts`. NO edita el archivo `lib/platform/pastoral/mentor-cascade.ts` (protegido).
- **D6 (cerrada).** F5 introduce **`auth_has_talleres_capability(p_capability_key text)`** como helper Postgres, paralelo a `auth_has_pastoral_capability` (F4 M1). RLS de tablas nuevas usa este helper.
- **D7 (cerrada).** F5 introduce **flags `NEXT_PUBLIC_TALLERES_*`** como módulo hermano `lib/platform/talleres/flags.ts`. NO edita `lib/platform/flags.ts`, `lib/platform/operating-core/flags.ts`, ni `lib/platform/pastoral/flags.ts` (todos protegidos).
- **D8 (cerrada).** F5 reusa el **outbox compartido de F3** con `template_key: 'talleres.*'`. NO crea un outbox hermano.
- **D9 (cerrada).** F5 introduce **`experience: 'talleres_crecimiento'`** y **`scopeType: 'taller'`** ya declarados en `PLATFORM_EXPERIENCES_CATALOG` (`experiences.ts:11`). **No requiere extensión del catálogo**. F5 añade capabilities nuevas en `PLATFORM_CAPABILITIES` (extension aditiva del archivo).
- **D10 (cerrada).** F5 introduce **módulos hermanos** en `lib/platform/talleres/**` con la misma estructura que `lib/platform/pastoral/**`:
  ```
  lib/platform/talleres/
  ├── flags.ts                    # Sibling de pastoral/flags.ts
  ├── route-access.ts            # Sibling
  ├── capabilities.ts            # resolveTalleresCapability()
  ├── participation-kinds.ts      # Kinds con prefijo taller_
  ├── state.ts                    # State machines del taller
  ├── errors.ts                   # TalleresErrorCode
  ├── types.ts                    # Public types
  ├── index.ts                    # Barrel público
  ├── cohort/                     # Cohorte-specific
  ├── inscription/                # Inscripción-specific
  ├── attendance/                 # Asistencia-specific
  ├── completion/                 # Completación-specific
  ├── dashboards/loader.ts        # Dashboards del taller
  ├── notifications/              # Outbox mapper + template keys
  ├── adapters/                   # Connectors a Operating Core y Dream Team
  ├── participation-ledger-talleres-writer.ts
  └── build-talleres-event.ts
  ```
- **D11 (cerrada).** F5 sigue el patrón de **optimistic concurrency** con columna `version` en `talleres_crecimiento_metadata` y `talleres_crecimiento_cohortes`. 409 en conflicto (precedente F2 Dream Team, F4 Pastoral).
- **D12 (cerrada).** F5 sigue el patrón de **append-only audit log** vía nuevas filas `operating_core_participation_eventos` con `kind='taller_*'` para correcciones. La fila original nunca se muta.
- **D13 (cerrada).** F5 NO introduce multi-tenant ni multi-campus. Single-tenant como el resto del MVP.
- **D14 (cerrada).** F5 NO escribe en `uno_a_uno_reuniones` ni `uno_a_uno_participantes` (tablas existentes). F5 crea sus propias tablas en `talleres_crecimiento_*`.

### 5.2 Decisiones tentativas (a confirmar en propuesta o con el pastor)

- **D15 (tentativa).** **State machine del taller** (a confirmar en G21):
  ```
  borrador → abierto → en_curso → cerrado (terminal)
                          → cancelado (terminal)
                          → cerrado_con_completitud (terminal, requiere asistencia mínima cumplida)
  abierto → cancelado
  en_curso → cancelado
  ```
  Estados terminales: `cerrado`, `cerrado_con_completitud`, `cancelado`. Transiciones inválidas: cualquiera no listada. Auto-transición prohibida.
- **D16 (tentativa).** **State machine de completación del asistente** (por persona, por cohorte):
  ```
  inscripto → asistiendo → completado
                          → abandono (terminal)
                          → no_completado (terminal, no cumplió min_attendance_pct)
  inscripto → cancelado (terminal, no asistió)
  asistiendo → abandono
  ```
- **D17 (tentativa).** **Nuevos participation kinds** (a confirmar en G29):
  ```
  taller_cohort_started       # primera sesión del taller ocurrió
  taller_session_attended     # asistencia registrada a una sesión específica (alternativa a kind='attendance' cuando se quiere distinguir explícitamente del genérico)
  taller_session_missed       # sesión no asistida (alternativa a kind='attendance_update' con metadata missed=true)
  taller_completion_recorded  # completación validada por el líder
  taller_completion_failed    # no_completado por no cumplir min_attendance_pct
  ```
  Total tentativo: **5 nuevos kinds** con `sensitivity='internal'`, prefijo `taller_`. Migration aditiva extiende el CHECK constraint de `operating_core_participation_eventos.kind`.
- **D18 (tentativa).** **Visibilidad del taller** (a confirmar en §3.7):
  - **Catálogo público** (`talleres_crecimiento.participation.read` ya existe): cualquier persona autenticada con grant ve el catálogo de talleres activos (`estado='abierto'` o `'en_curso'`).
  - **Detalle del taller**: líder/co-líder con grant `talleres_crecimiento.workshop.read` scoped al taller; director de la experiencia ve todos.
  - **Inscritos**: líder/co-líder/servidor con grants `talleres_crecimiento.inscription.read` y `attendance.read`.
  - **Asistencia propia**: el asistente ve solo su propia inscripción y su propia asistencia (roadmap agregado, no detalle).
  - **Métricas**: director/pastor/admin con `talleres_crecimiento.metrics.read`.
- **D19 (tentativa).** **Notificaciones del taller** (a confirmar en G22-G24):
  ```
  talleres.inscription.confirmed.v1     # email al asistente + líder
  talleres.inscription.waitlisted.v1    # email al asistente
  talleres.inscription.cancelled.v1     # email al asistente + líder
  talleres.session.reminder.v1          # email T-24h al asistente
  talleres.session.reminder.leader.v1   # email T-24h al líder
  talleres.completion.recorded.v1       # email al asistente (hito pastoral, F4 lo lee)
  talleres.completion.failed.v1         # email al asistente + líder
  talleres.cohort_started.v1            # email al asistente
  ```
  Total tentativo: **8 templates** con prefijo `talleres.*.email.v1` (WhatsApp deferred a Fase futura, deuda de F3/F4).
- **D20 (tentativa).** **Tríada por nuevo paso** (a confirmar en G18): F5 emite el evento `taller_cohort_started` cuando la persona inicia la primera sesión del taller. F4 escucha este evento (vía un trigger en `operating_core_participation_eventos` o vía un scheduled job) y crea la tríada con `contexto='nuevo_paso'`. Si la persona ya tiene tríada activa por otro nuevo paso, no se crea duplicada (la existente absorbe el taller).
- **D21 (tentativa).** **Métricas base de F5** (a confirmar):
  - `talleres_inscriptos_por_taller` (count de registrations activas por taller),
  - `talleres_asistencia_promedio_por_taller` (ratio `attendance / sessions`),
  - `talleres_completados_por_periodo` (count de `taller_completion_recorded` por mes),
  - `talleres_no_completados_por_periodo` (count de `taller_completion_failed` por mes),
  - `talleres_capacidad_promedio` (`confirmed / capacity` por taller activo),
  - `talleres_lideres_activos_por_periodo` (count de `DreamTeamServicio` activos con `experiencia='talleres_crecimiento'`).
- **D22 (tentativa).** **Lifecycle de cohorte terminado** (a confirmar): un taller en `cerrado` o `cerrado_con_completitud` **NO se reabre**. Si se requiere un nuevo ciclo, se crea una nueva cohorte (`talleres_crecimiento_cohortes` con nuevo `id`) apuntando al mismo `OperatingCoreEvent` (taller) o creando uno nuevo si el contenido cambió.
- **D23 (tentativa).** **Migración del adapter `resolverLiderDeTaller`** (a confirmar): el stub actual en `lib/platform/pastoral/adapters/grupo-corto-plazo-supabase-adapter.ts` se completa con la lógica real: "para cada `OperatingCoreRegistration` activa de la persona en un `OperatingCoreEvent` con `kind='workshop'` y `estado IN ('abierto', 'en_curso')`, retornar el `dirigido_por_persona_id` del taller más reciente (mayor `start_date`)". Si hay empate, retornar el del taller con menor `id` (estabilidad).
- **D24 (tentativa).** **RLS de las tablas nuevas** (a confirmar): sigue el patrón F2/F4 — helper `auth_has_talleres_capability(p_capability_key text)` con policies `_select`, `_insert`, `_update`, `_delete`. Tablas tentativas: `talleres_crecimiento_metadata`, `talleres_crecimiento_cohortes`. Todas con RLS activada y helper de capabilities.
- **D25 (tentativa).** **Costo del taller** (a confirmar en G5): el modelo soporta `costo_monto NUMERIC(10,2)` y `costo_moneda TEXT` (e.g. `'USD'`, `'MXN'`). Si `costo_monto IS NULL`, el taller es gratuito. NO se integra con pagos en MVP (deuda Fase futura); el campo es informativo.
- **D26 (tentativa).** **Prerrequisitos del taller** (a confirmar en G6): `prerrequisitos JSONB DEFAULT NULL` con shape `{ kind: 'taller_completado', taller_id: uuid }` o `{ kind: 'asistencia_minima', evento_id: uuid, sesiones: int }`. La validación al inscribir es **advertencia**, no bloqueo en MVP (alineado con "sin workflows pesados" del principio pastoral). El líder puede pasar por encima del prerrequisito.

---

## 6. Modelo tentativo de datos (alto nivel)

### 6.1 Tablas nuevas (aditivas, todas con RLS + helper)

```text
talleres_crecimiento_metadata (
  id uuid PRIMARY KEY,
  operating_core_event_id uuid NOT NULL UNIQUE REFERENCES operating_core_events(id) ON DELETE CASCADE,
  dirigido_por_persona_id uuid NOT NULL REFERENCES usuarios(id),
  confirmation_mode text NOT NULL DEFAULT 'manual' CHECK (confirmation_mode IN ('automatic', 'manual')),
  min_attendance_pct numeric(5,2) NOT NULL DEFAULT 80.00 CHECK (min_attendance_pct BETWEEN 0 AND 100),
  costo_monto numeric(10,2),
  costo_moneda text,
  prerrequisitos jsonb NOT NULL DEFAULT '[]'::jsonb,
  materiales jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado text NOT NULL CHECK (estado IN (
    'borrador', 'abierto', 'en_curso', 'cerrado',
    'cerrado_con_completitud', 'cancelado'
  )),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)

talleres_crecimiento_cohortes (
  id uuid PRIMARY KEY,
  taller_id uuid NOT NULL REFERENCES talleres_crecimiento_metadata(id) ON DELETE CASCADE,
  dream_team_equipo_id uuid NOT NULL REFERENCES dream_team_equipos(id),
  -- los líderes/co-líderes/servidores se resuelven desde dream_team_servicios filtrados por dream_team_equipo_id
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  version int NOT NULL DEFAULT 1
)

-- Vista materializada opcional para acelerar el adapter de F4:
CREATE VIEW v_taller_lider AS
SELECT
  tcm.id AS taller_id,
  tcm.opering_core_event_id,
  tcm.dirigido_por_persona_id AS lider_principal_persona_id,
  ocr.person_id AS asistente_persona_id
FROM talleres_crecimiento_metadata tcm
JOIN operating_core_registrations ocr
  ON ocr.event_id = tcm.operating_core_event_id
WHERE ocr.state IN ('confirmada', 'asistida');
```

### 6.2 Nuevos participation kinds (additive, vía migration)

```text
-- Proposed set (D17, tentative):
taller_cohort_started          -- primera sesión del taller ocurrió
taller_session_attended        -- asistencia explícita por sesión (alternativa a kind='attendance')
taller_session_missed          -- sesión no asistida (alternativa a kind='attendance_update' con missed=true)
taller_completion_recorded     -- completación validada por el líder
taller_completion_failed       -- no_completado por no cumplir min_attendance_pct
```

Todos con `sensitivity = 'internal'`. Migration aditiva extiende el CHECK constraint de `operating_core_participation_eventos.kind`. Los kinds viven en `lib/platform/talleres/participation-kinds.ts` (sibling de `lib/platform/pastoral/participation-kinds.ts`). El archivo `lib/platform/operating-core/kinds.ts` permanece **byte-identical**.

### 6.3 Nuevas capabilities (en `PLATFORM_CAPABILITIES`)

Ver S10. Total tentativo: **13 nuevas capabilities** con `experience: 'talleres_crecimiento'` y `scopeType: 'taller'` o `'experience'`.

### 6.4 Nuevo helper Postgres

```sql
-- M1 F5
CREATE FUNCTION auth_has_talleres_capability(p_capability_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM dream_team_capability_grants g
    WHERE g.persona_id = auth.uid_to_persona_id()
      AND g.capability_key = p_capability_key
      AND g.experience = 'talleres_crecimiento'
      AND g.revoked_at IS NULL
  )
$$;
```

---

## 7. Invariantes (principios no negociables)

| # | Invariante | Verificación |
|---|---|---|
| **I-1** | `lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags}.ts` byte-identical post-F5. | `git diff main...HEAD -- lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags}.ts` vacío. |
| **I-2** | `lib/platform/dream-team/**` byte-identical post-F5. | `git diff main...HEAD -- lib/platform/dream-team/**` vacío. |
| **I-3** | `lib/platform/adapters/grupos-vida.ts` byte-identical post-F5. | `git diff main...HEAD -- lib/platform/adapters/grupos-vida.ts` vacío. |
| **I-4** | `lib/platform/operating-core/{kinds,state,capture-states,participation-read-guard,capture-ux-types,types,registrations/registration-state,registrations/registration-repository}.ts` byte-identical post-F5. | `git diff main...HEAD -- <paths>` vacío. |
| **I-5** | `lib/platform/pastoral/{types,state,participation-kinds,mentor-cascade,flags,capabilities,index,errors,adapters/grupo-corto-plazo-mentor-adapter,adapters/grupo-corto-plazo-supabase-adapter}.ts` **NO se modifican en su contrato público**. F5 solo completa los adapters de `grupo-corto-plazo` con la lógica real sin cambiar la interfaz. | `rg 'export ' lib/platform/pastoral/adapters/` no cambia en firmas. |
| **I-6** | `buscar_usuarios_para_grupo` firma intacta: `(p_auth_id uuid, p_grupo_id uuid, p_query text, p_limit integer DEFAULT 10)` → `TABLE(id uuid, nombre text, apellido text, email text, telefono text, ya_es_miembro boolean)`. | `rg 'buscar_usuarios_para_grupo' supabase/migrations/` no muestra `CREATE OR REPLACE FUNCTION` posterior a `20250906111510`. |
| **I-7** | No hay migraciones destructivas sobre tablas preexistentes. Solo `CREATE TABLE`, `CREATE INDEX`, `CREATE OR REPLACE FUNCTION` (con firma byte-idéntica), `ALTER TABLE ADD COLUMN` (sobre tablas nuevas), `ALTER TABLE ADD CONSTRAINT` (sobre tablas nuevas). | `rg -l 'DROP|ALTER TABLE .* DROP|ALTER COLUMN' supabase/migrations/` revisado en cada PR. |
| **I-8** | `lib/platform/preflight.ts` sigue bloqueando `uno_a_uno`. F5 NO invoca `registerPlatformUnoAUnoDecision`. | `rg 'registerPlatformUnoAUnoDecision' lib/platform/talleres/` retorna vacío. |
| **I-9** | F5 NO escribe en `uno_a_uno_reuniones` ni `uno_a_uno_participantes` (tablas existentes). F5 crea sus propias tablas en `talleres_crecimiento_*`. | `rg 'uno_a_uno_' lib/platform/talleres/` retorna vacío. |
| **I-10** | Toda capability de F5 se modela con `experience: 'talleres_crecimiento'` + `scopeType: 'taller' | 'experience'`. **Sin roles globales nuevos.** | Code review + `grep 'talleres_crecimiento\.' lib/platform/experiences.ts`. |
| **I-11** | Los nuevos participation kinds de F5 son `internal` (no `sensitive`). | `rg 'PLATFORM_OPERATING_CORE_PARTICIPATION_SENSITIVITY' lib/platform/talleres/` muestra solo `internal`. |
| **I-12** | Toda escritura de taller genera un `participation_event` con `actor_persona_id` de un líder con rol formal (`DreamTeamServicio` activo). La persona **nunca** se auto-inscribe con efectos pastorales (la auto-inscripción es deferred a Fase 12). | Tests cubren que `createInscription` con `actor_persona_id === asistida_persona_id` retorna `403 forbidden_self_inscription`. |
| **I-13** | Un taller y una cohorte no pueden quedarse en estado intermedio sin transición válida. | Tests cubren que `cancelar taller` sin motivo retorna `400 missing_motivo`. Análogo a F2 `MISSING_MOTIVO`. |
| **I-14** | Versión + 409 en toda escritura de `talleres_crecimiento_metadata` y `talleres_crecimiento_cohortes` (precedente F2/F4). | Tests cubren stale write → 409. |
| **I-15** | Append-only audit log: correcciones de asistencia se hacen emitiendo nueva fila `kind='attendance_update'` con `corrects_event_id`. La fila original nunca se muta. | Tests cubren `correctAttendance`-style: nueva fila + original intacta. |
| **I-16** | Asistir a un taller NO crea fila en `dream_team_servicios`. Solo servir en el taller (asignación explícita de `DreamTeamServicio`) sí. | Tests cubren que `createInscription` no inserta fila en `dream_team_servicios`. |
| **I-17** | F5 introduce flags `NEXT_PUBLIC_TALLERES_*` siblings a `lib/platform/pastoral/flags.ts`. NO edita `lib/platform/flags.ts`, `lib/platform/operating-core/flags.ts`, ni `lib/platform/pastoral/flags.ts`. | `git diff main...HEAD -- lib/platform/flags.ts lib/platform/operating-core/flags.ts lib/platform/pastoral/flags.ts` vacío. |
| **I-18** | F5 usa el outbox compartido de Fase 3 con `template_key: 'talleres.*'`. NO crea un outbox hermano. | `rg 'createNotificationOutbox' lib/platform/talleres/` retorna vacío. |
| **I-19** | El RLS de las tablas nuevas sigue el patrón F2/F4: helper `auth_has_talleres_capability(p_capability_key text)`. | Migración incluye el helper; tests RLS. |
| **I-20** | F5 NO introduce multi-tenant ni multi-campus. | Tests y migraciones no tienen `church_id`, `campus_id`, `tenant_id`. |
| **I-21** | El adapter `resolverLiderDeTaller` (consumido por F4) NO se modifica en su interfaz pública. F5 solo completa la lógica interna del adapter (`lib/platform/pastoral/adapters/grupo-corto-plazo-supabase-adapter.ts`). | `git diff main...HEAD -- lib/platform/pastoral/adapters/grupo-corto-plazo-supabase-adapter.ts` solo cambia el cuerpo, no la firma exportada. |
| **I-22** | El catálogo `PLATFORM_EXPERIENCES_CATALOG` no se modifica en sus entries existentes. Solo se añaden capabilities nuevas en `PLATFORM_CAPABILITIES`. | `rg "PLATFORM_EXPERIENCES_CATALOG" lib/platform/experiences.ts` muestra las 10 entries pre-existentes. |
| **I-23** | El nav item `talleres_admin` (existente en `lib/platform/navigation.ts:93`) ahora referencia `talleres_crecimiento.admin.manage` que F5 declara en `PLATFORM_CAPABILITIES`. F5 cierra el gap pre-existente. | `grep 'talleres_crecimiento.admin.manage' lib/platform/experiences.ts` retorna una línea. |

---

## 8. Próximas preguntas para el pastor (agrupadas por dominio)

### 8.1 Modelo del taller (5 preguntas)

- **P1.** ¿Un taller es **un único evento** (1 sesión) o **una serie recurrente** (N sesiones en distintos días)? El roadmap dice "fechas/cohortes" (plural), lo que sugiere serie. ¿Cuál es la duración típica? (¿4 semanas? ¿8? ¿Personalizado?)
- **P2.** ¿Un taller puede tener **múltiples líderes** (1 líder principal + N co-líderes) o solo uno? Si sí, ¿el co-líder tiene las mismas facultades operativas que el líder (inscribir, marcar asistencia) o solo tareas logísticas?
- **P3.** ¿Quién asigna al líder/co-líder/servidor de un taller? (a) un director de la experiencia `talleres_crecimiento`; (b) el admin/pastor; (c) auto-asignación. ¿El líder tiene que **aceptar** explícitamente o es asignación automática?
- **P4.** ¿Hay **prerrequisitos** para inscribirse a un taller? (e.g. "taller X debe estar completado antes de Y"). Si sí, ¿el incumplimiento bloquea la inscripción o es solo advertencia?
- **P5.** ¿Los talleres pueden tener **costo** (matrícula, materiales)? Si sí, ¿se modela en la plataforma o se cobra fuera?

### 8.2 Inscripción y completación (4 preguntas)

- **P6.** ¿La inscripción es **por persona individual** o también **por grupo familiar** (padre + hijo adolescente juntos)?
- **P7.** ¿La **completación** del taller requiere **asistencia mínima** (e.g. 80% de las sesiones) o **asistencia perfecta** o **ningún requisito** (es decisión del líder)? ¿El umbral es configurable por taller o fijo?
- **P8.** ¿La confirmación de inscripción es **automática** (en orden de llegada hasta capacidad) o **manual** del líder (revisar antes de confirmar)? ¿Es configurable por taller?
- **P9.** ¿Quién recibe **qué notificaciones**? Detalle: asistente (¿inscripción confirmada, recordatorio, completación?), líder (¿nueva inscripción, asistencia pendiente, taller cerrado?), co-líder (¿mismo que líder?).

### 8.3 Conexión con Dream Team y pastoral (4 preguntas)

- **P10.** ¿Servir en un taller **alimenta** automáticamente al `DreamTeamServicio` con `experiencia='talleres_crecimiento'` para entrar al mentor cascade Nivel 3 de F4, o requiere aceptación?
- **P11.** ¿La **tríada por nuevo paso** de F4 se crea al **iniciar** la primera sesión del taller (no al inscribirse) o al **completar**? ¿O requiere una confirmación explícita del líder?
- **P12.** ¿El "taller completado" se renderiza en la **vista pública del roadmap** del usuario (F4) como un **hito pastoral** (e.g. "Próximo Paso completado") o como evento informativo?
- **P13.** ¿Un asistente que **abandona** un taller (no completa) genera alguna acción pastoral (e.g. "el líder le ofrece un 1:1") o queda solo en el historial?

### 8.4 Lifecycle y notificaciones (3 preguntas)

- **P14.** ¿Cuál es el **set cerrado de estados del taller**? Confirmar `borrador → abierto → en_curso → cerrado | cancelado`. ¿`cerrado_con_completitud` es distinto de `cerrado` (sin completitud)? ¿O es un sub-flag?
- **P15.** ¿Hay **recordatorios automáticos** de sesión (e.g. T-24h) o son manuales del líder? Si son automáticos, ¿a todos los inscriptos o solo a los confirmados?
- **P16.** ¿El taller cerrado se puede **reabrir** (e.g. por error del líder) o es **terminal** (requiere crear una nueva cohorte)?

### 8.5 Métricas y éxito de F5 (3 preguntas)

- **P17.** ¿Cuál es el **objetivo pastoral** de F5 que queremos medir? Ejemplos: (a) "% de asistentes que completan el taller", (b) "% de asistentes que pasan a servir tras el taller", (c) "tasa de retención por taller".
- **P18.** ¿Las métricas de F5 son **privadas del líder/pastor** o se comparten en algún dashboard público? Esto afecta qué vistas se renderizan.
- **P19.** ¿La **vista del catálogo público** de talleres la ve cualquier persona autenticada o solo staff? ¿Los talleres en `borrador` son visibles para alguien?

### 8.6 Lifecycle y casos extremos (3 preguntas)

- **P20.** Si una persona está en **dos talleres activos** simultáneamente, ¿el mentor cascade Nivel 2 de F4 retorna el líder del taller más reciente (decisión tentativa D23) o hay otra regla (e.g. el del taller más corto)?
- **P21.** Cuando una persona **deja de asistir** al taller (no completa), ¿su historial de taller **permanece** en el roadmap público o se purga?
- **P22.** ¿Un taller puede tener **tareas asincrónicas** (e.g. "leer X capítulo antes de la sesión 3") que cuentan como asistencia? ¿O la asistencia es solo a sesiones síncronas?

---

## 9. Riesgos detectados

| # | Riesgo | Severidad | Mitigación propuesta |
|---|---|---|---|
| **R1** | **Confusión entre `kind='attendance'` de F3 y los nuevos `kind='taller_session_attended' | 'taller_session_missed'`**. Si un director operacional marca asistencia de un evento de Fase 3 y un líder marca asistencia de un taller, ambos emiten eventos similares pero el primero va al dashboard operativo y el segundo al dashboard de taller. | Media | Los kinds de F5 empiezan con `taller_` (prefijo explícito) en `lib/platform/talleres/participation-kinds.ts`. Las queries del dashboard de taller filtran `kind LIKE 'taller_%' OR (kind='attendance' AND event_kind='workshop')`. Tests cubren que no se mezclan dashboards. |
| **R2** | **El adapter `resolverLiderDeTaller` retorna el líder equivocado si la persona está en múltiples talleres**. | Media | D23 propone: retornar el del taller más reciente (mayor `start_date`); en empate, el de menor `id` (estabilidad). Tests parametrizados con `describe.each` cubren los casos: 0 talleres, 1 taller, 2+ talleres, taller terminado + taller activo. |
| **R3** | **El modelo de `dream_team_servicios` para servidores del taller introduce coupling raro**: un servidor que solo sirve un taller queda registrado como "servidor activo" globalmente, lo que puede afectar métricas pastorales (Nivel 3 cascade). | Media | El servidor tiene `fechaInicio` y `fechaFin` (F2 ya lo soporta). Cuando termina el taller, el servidor puede pasar a `inactivo` (no `retirado`), preservando historial pero sin entrar al cascade Nivel 3. |
| **R4** | **Cobertura de tests insuficiente para la lógica de completación** (asistencia mínima por sesión, ventana de tiempo, etc.). | Media | Tests parametrizados con `describe.each` cubren: 0% asistencia (no_completado), 50% (no_completado con min=80), 80% exacto (completado), 100% (completado), abandonos. Property-based tests con `fast-check` para combinaciones de estados. |
| **R5** | **El trigger "todo lo que empieza debe terminar" no aplica a talleres**: un taller puede quedarse en `en_curso` indefinidamente si el líder no lo cierra. | Media | Scheduled job (precedente F4 W11) que detecta talleres en `en_curso` con `end_date < now() - 30 días` y notifica al líder. Si no responde en 7 días, **NO** se cierra automáticamente (decisión tentativa) — se escala al director de la experiencia. |
| **R6** | **El catálogo de talleres crece sin governance**: cualquier director puede crear talleres ad-hoc sin revisión pastoral, contaminando el catálogo público. | Baja-Media | El catálogo público filtra por `estado IN ('abierto', 'en_curso')`; talleres en `borrador` solo son visibles para el director y líder. Los talleres en `cancelado` se ocultan del catálogo público pero permanecen en el historial. |
| **R7** | **Las capabilities nuevas de F5 (`talleres_crecimiento.admin.manage` y 12 más) no se asignan a nadie** y nadie puede crear talleres. | Alta | Script de seeding (sibling a Fase 2 / F4 M8) que otorga las capabilities por default a: (a) todos los `DreamTeamServicio` activos con `experiencia='talleres_crecimiento'`, (b) todos los coordinadores de área activos, (c) un grant `talleres_crecimiento.metrics.read` a `usuarios` con `roles` específicos (pastor, admin). |
| **R8** | **Drift entre la decisión pastoral "asistir ≠ servir" y la implementación**: si el sistema sugiere automáticamente "ahora que terminaste el taller, ¿quieres servir?", ¿es pastoralmente correcto? | Alta | El modelo NO genera auto-promoción. La promoción asistente → servidor requiere acción explícita del líder o del director (similar a `admin_asignacion` de F2 con motivo). El roadmap público sugiere el siguiente paso pero el sistema **nunca** lo ejecuta automáticamente. |
| **R9** | **El módulo `talleres` se vuelve un cajón de sastre** con kinds disparatados si no se cierra el alcance. | Alta | Límite explícito: F5 cubre catálogo + cohorte + inscripción + asistencia + completación + conexión Dream Team + historial pastoral. **NO** cubre: marketplace abierto, evaluaciones pedagógicas, certificaciones académicas, currículum detallado de cada taller, integración con WhatsApp para recordatorios, portal self-service, analytics avanzados. |
| **R10** | **Multi-iglesia / multi-campus out of MVP pero el modelo debe permitirlo después**. Si el modelo ata el taller a un `operating_core_event_id` sin espacio para `church_id` futuro, la migración a multi-tenant después es costosa. | Baja-Media | `OperatingCoreEvent` ya existe en F3 con espacio para multi-campus futuro. F5 no requiere cambios; cuando multi-tenant llegue, las tablas nuevas reciben `tenant_id` vía migration aditiva. |
| **R11** | **El costo del taller se modela pero no se cobra**. Esto puede crear confusión ("¿pago o no pago?"). | Baja | Documentar explícitamente que `costo_monto` es **informativo** en MVP. La integración con pagos está fuera de F5. La UI muestra "Gratis" o "$X USD" sin opción de pago. |
| **R12** | **El nav item `talleres_admin` (existente en `lib/platform/navigation.ts:93`) referencia `talleres_crecimiento.admin.manage` que NO está en `PLATFORM_CAPABILITIES`**. | Alta | F5 cierra este gap declarando `talleres_crecimiento.admin.manage` en `PLATFORM_CAPABILITIES` con `experience: 'talleres_crecimiento'` y `scopeType: 'taller'`. Sin esto, el nav item retorna 404 (gap pre-existente detectado en esta exploration). |
| **R13** | **El helper `auth_has_talleres_capability` no se testea con casos de capabilities con scope específico** (e.g. `talleres_crecimiento.cohort.manage` requiere `scope_id` igual al `taller_id`). | Media | Tests RLS exhaustivos: capability global (e.g. `metrics.read`) vs scoped (e.g. `cohort.manage`). El helper verifica `scope_id = auth.uid_to_persona_taller_scope()`. |
| **R14** | **Las notificaciones automáticas de F5 (8 templates nuevos) pueden generar spam si se configuran mal** (e.g. recordatorio T-24h para un taller de 1 sola sesión que ya pasó). | Media | Los recordatorios se calculan desde la `OperatingCoreRecurrenceRule` del taller: si el taller tiene solo 1 sesión, el recordatorio se envía T-24h antes de ESA sesión. Si tiene N sesiones, recordatorio antes de CADA sesión. Tests cubren edge cases. |

---

## 10. Próximo paso recomendado

**Listo para `sdd-propose`**, con las siguientes condiciones:

1. Las 22 preguntas abiertas (§3 G1-G32 y §8 P1-P22) se elevan al pastor en la próxima reunión. Las P1-P5 (modelo del taller) y P10-P13 (conexión con pastoral) son las más críticas; sin ellas el SDD no puede cerrar el modelo de taller ni la integración con F4.
2. Las decisiones tentativas D15-D26 (§5.2) se confirman en la propuesta con la firma del pastor.
3. El gap pre-existente R12 (`talleres_crecimiento.admin.manage` no declarada en `PLATFORM_CAPABILITIES`) se cierra como parte del scope de F5.
4. El equipo de plataforma valida la factibilidad de los 5 nuevos kinds `taller_*` en `operating_core_participation_eventos` (precedente F4 M4 con `pastoral_*`).
5. El equipo de repo aprueba la estrategia de chained PRs (estimación tentativa: **10-14 PRs** con `size:exception` documentada si exceden 400 líneas; ver §11).

---

## 11. Estimación tentativa de slices (referencia, no definitivo)

Esta es una **estimación de workstreams** para visualizar la carga. El detalle final pertenece a `tasks.md`.

| Workstream | PRs estimados | Líneas tentativas | Notas |
|---|---|---|---|
| W0 Prerrequisitos (hygiene, baseline verde) | 1 | ~50-100 | Necesario antes de feature slices. |
| W1 Talleres namespace + participation kinds (sibling) | 1 | ~250-350 | `lib/platform/talleres/participation-kinds.ts` + tests. NO edita `operating-core/kinds.ts` protegido. |
| W2 Tablas nuevas (metadata + cohortes) — migration aditiva | 1 | ~400-500 (size:exception probable) | `talleres_crecimiento_metadata` + `talleres_crecimiento_cohortes` + índices + helper `auth_has_talleres_capability`. |
| W3 Capabilities nuevas + closure de gap `admin.manage` | 1 | ~150-250 | Extension aditiva de `PLATFORM_CAPABILITIES`. Cierra gap R12. |
| W4 Resolver líder de taller (completar adapter F4) | 1 | ~250-400 | Completa `lib/platform/pastoral/adapters/grupo-corto-plazo-supabase-adapter.ts` con lógica real. NO edita la interfaz. |
| W5 State machines del taller y de completación | 1-2 | ~400-700 | `lib/platform/talleres/state.ts` con state machines de taller y completación (D15, D16). |
| W6 Repositorios (metadata + cohortes) — fake + supabase | 2 | ~600-900 | Patrón F2/F4. Sub-divide por agregado. |
| W7 Inscripción + completación (reusa F3 + lógica nueva) | 2 | ~600-900 | Reusa `evaluateRegistrationOutcome` de F3 + lógica de completación nueva. |
| W8 Notificaciones (8 templates + outbox mapper) | 1-2 | ~400-700 | Templates `talleres.*.email.v1` en español. Reusa outbox F3. |
| W9 API surface (`/api/talleres/**`) | 2-3 | ~600-900 | Capability-gated; 409 reservado. |
| W10 UI — dashboard del líder + catálogo público + admin | 2-3 | ~700-1100 | `app/(pastoral)/talleres/**` + `app/(pastoral)/admin/talleres/**`. |
| W11 Tríada integration (emitir evento que F4 escucha) | 1 | ~200-350 | Trigger o scheduled job que conecta `taller_cohort_started` con creación de tríada F4. |
| W12 Dashboards + métricas | 1-2 | ~500-800 | `lib/platform/talleres/dashboards/loader.ts` con 6 métricas (D21). |
| W13 Flags + retrocompatibilidad | 1 | ~100-200 | `NEXT_PUBLIC_TALLERES_*` siblings a F3/F4. |
| W14 e2e + docs handoff | 1 | ~200-400 | e2e Ana pastoral test extendido + handoff F5. |

**Total estimado:** 14-19 PRs. Riesgo medio de `size:exception` en W2, W6, W10. Estrategia recomendada: `force-chained stacked-to-main` como F3 y F4.

---

## 12. Referencias (rutas exactas leídas)

### Roadmap + handoffs (read in full o sampled)

- `docs/roadmap/globalconnect-roadmap-maestro-v1.md` (379 lines) — definición estratégica de las 15 fases; F5 en líneas 141-156.
- `docs/roadmap/handoffs/fase-04-seguimiento-pastoral.md` (320 lines) — referencia de FORMATO y patrón para el handoff de F5.
- `docs/roadmap/handoffs/fase-03-operating-core.md` (624 lines, sampled) — precedente de Operating Core, especialmente `kind='workshop'`.
- `docs/roadmap/handoffs/fase-02-dream-team-base.md` (270 lines, sampled) — referencia de FORMATO secundaria.
- `docs/roadmap/handoffs/fase-01-platform-foundation.md` (246 lines, sampled) — principios F1.
- `docs/REUNION_PASTOR_ROADMAP.html` (2171 lines) — decisiones pastorales: cascada del mentor Nivel 2 (línea 1934-1937), tríada por nuevo paso, "asistir ≠ servir".

### Fase 4 — OpenSpec planning artifacts (read in full)

- `openspec/changes/fase-04-seguimiento-pastoral/exploration.md` (557 lines) — referencia de ESTRUCTURA para este exploration.
- `openspec/specs/platform/pastoral/spec.md` (245 lines) — precedente del consolidado spec.
- `openspec/changes/fase-04-seguimiento-pastoral/specs/operating-core-pastoral-bridge/spec.md` (69 lines) — patrón del bridge.

### Fase 1 — Platform foundation (read sampled)

- `lib/platform/persona.ts` (sampled) — `Persona` canónica por `persona_id`.
- `lib/platform/experiences.ts` (290 lines, read in full) — **`talleres_crecimiento` YA existe** como experience (línea 11); capabilities `participation.read` y `team.serve` ya declaradas (líneas 26, 42); **`talleres_crecimiento.admin.manage` NO declarada** pero referenciada en `navigation.ts:93` (gap R12).
- `lib/platform/grants.ts` (sampled) — `PlatformGrantAuditEvent`.
- `lib/platform/participation.ts` (sampled) — contrato longitudinal base.
- `lib/platform/preflight.ts` (sampled) — sigue bloqueando `uno_a_uno`.
- `lib/platform/navigation.ts` (256 lines, read in full) — nav items `talleres_participation` y `talleres_admin` ya existen; `talleres_admin` referencia capability no declarada (gap R12).

### Fase 2 — Dream Team (read sampled)

- `lib/platform/dream-team/types.ts` (121 lines, read in full) — **enum `experiencia` YA incluye `'talleres_crecimiento'`** (línea 17).
- `lib/platform/dream-team/grants.ts` (sampled) — caso `'talleres_crecimiento'` YA retorna `talleres_crecimiento.team.serve` (línea 94-95).
- `lib/platform/dream-team/state-machine.ts` (sampled) — `TRANSICIONES_VALIDAS` matrix.
- `lib/platform/dream-team/errors.ts` (sampled) — `DreamTeamErrorCode`.

### Fase 3 — Operating Core (read sampled)

- `lib/platform/operating-core/types.ts` (303 lines, read in full) — **`OperatingCoreEvent.kind='workshop'` YA soportado** (línea 22).
- `lib/platform/operating-core/kinds.ts` (22 lines, read in full) — 11 kinds canónicos; `taller_*` NO está.
- `lib/platform/operating-core/state.ts` (36 lines, read in full) — state machine 6-estados para Registration.
- `lib/platform/operating-core/registrations/registration-state.ts` (158 lines, read in full) — `evaluateRegistrationOutcome` con waitlist.
- `lib/platform/operating-core/registrations/registration-repository.ts` (98 lines, read in full) — interfaz de RegistrationsRepository.
- `lib/platform/operating-core/capture-ux/capture-ux-types.ts` (87 lines, read in full) — `CAPTURE_UX_SHAPES` con `registration` para talleres.
- `lib/platform/operating-core/notification-outbox/outbox-types.ts` (101 lines, read in full) — outbox compartido.
- `supabase/migrations/20260716120000_operating_core_events.sql` — schema de `operating_core_events` con `kind=workshop` (línea 12).

### Fase 4 — Pastoral (read sampled)

- `lib/platform/pastoral/types.ts` (147 lines, read in full) — `OneOnOneEstado`, `TriadaEstado`, `TriadaDissolutionReason`.
- `lib/platform/pastoral/state.ts` (sampled) — state machine de 1:1.
- `lib/platform/pastoral/triad-state.ts` (sampled) — state machine de tríada.
- `lib/platform/pastoral/participation-kinds.ts` (29 lines, read in full) — 14 kinds con prefijo `pastoral_`.
- `lib/platform/pastoral/capabilities.ts` (150 lines, read in full) — `resolvePastoralCapability`.
- `lib/platform/pastoral/flags.ts` (88 lines, read in full) — patrón de flag reader con kill switch.
- `lib/platform/pastoral/mentor-cascade.ts` (114 lines, read in full) — **adapter `resolverLiderDeTaller` YA consumido como Nivel 2** (línea 81-90).
- `lib/platform/pastoral/mentor-cascade/types.ts` (47 lines, read in full) — tipos del cascade.
- `lib/platform/pastoral/hierarchical-visibility.ts` (48 lines, read in full) — `getPersonasUnderMe` con RPC `get_personas_under_me`.
- `lib/platform/pastoral/notifications/template-keys.ts` (113 lines, read in full) — 13 templates con prefijo `pastoral.`.
- `lib/platform/pastoral/index.ts` (75 lines, read in full) — barrel público.

### Auth + session (read sampled)

- `lib/auth/platformSessionReadOnly.ts` (167 lines, read in full) — `resolveReadOnlyPlatformSession` con capability lookup.
- `lib/platform/session/build.ts` (46 lines, read in full) — `buildPlatformSession` con capability loading.

### Supabase migrations (read sampled)

- `supabase/migrations/20260716120000_operating_core_events.sql` — `operating_core_events` con `kind='workshop'`.
- `supabase/migrations/20260720143111_operating_core_registrations.sql` — `operating_core_registrations` con FK a `operating_core_events`.
- `supabase/migrations/20260727010000_pastoral_hierarchical_visibility.sql` — RPC `get_personas_under_me` (ya implementado, F5 lo reusa).
- Total: 25 migrations revisadas en `supabase/migrations/` (2026-06-23 a 2026-07-27).

### OpenSpec directory listing

- `openspec/changes/` — `archive/`, `casas-anfitrionas-mapa/`, `fase-01-...`, `fase-02-...`, `fase-03-...`, `fase-04-...`, `issue-99/`. F5 crea `fase-05-talleres-crecimiento/`.
- `openspec/specs/platform/` — `dream-team/`, `pastoral/`. F5 produce `talleres-crecimiento/`.

---

**Verdict:** Listo para `sdd-propose` con 22 gaps/preguntas abiertas (G1-G32 + P1-P22) a elevar al pastor, 12 decisiones tentativas a confirmar (D15-D26), 1 gap pre-existente detectado (R12), y 14 invariantes definidas. Estimación: 14-19 PRs chained con size:exception probable en W2, W6, W10.
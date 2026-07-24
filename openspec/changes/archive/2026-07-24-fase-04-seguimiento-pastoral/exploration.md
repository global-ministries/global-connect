# Exploration — Fase 4: Seguimiento Pastoral (1:1 + Tríada)

**Change:** `fase-04-seguimiento-pastoral`
**Status:** planning only — no implementation, no merges, no workflow edits, no Supabase operations
**Strategy:** additive sibling modules, byte-identity preserved on Fase 1/Fase 2/Fase 3 protected modules, 400-line authored review budget
**Mode:** openspec

---

## 1. Contexto y objetivo

### 1.1 Qué resuelve Fase 4

Fase 4 — Seguimiento Pastoral materializa la **estación 4 de la ruta espiritual** ("Seguimiento 1:1 y triadas", `docs/REUNION_PASTOR_ROADMAP.html:1488-1495`) sobre el cimiento ya construido de Fases 1-3. Su propósito pastoral es que el acompañamiento pastoral **no dependa solo de la memoria del líder** y **nunca se convierta en un dato más**: la plataforma registra y sugiere, los mentores validan.

El alcance pastoral, alineado con el pastor (`docs/REUNION_PASTOR_ROADMAP.html:1207-1224`):

- 1:1 para Grupos de Vida y 1:1 para The Living Room.
- Soporte para 1:1 individual o de pareja.
- **Reportes generales, no detalles pastorales sensibles profundos.**
- Visibilidad para **líder creador, director inmediato y pastor/admin con permiso**.
- Tríada como relación de seguimiento/servicio.
- Regla operativa del pastor: **"mantenerlo simple, sin workflows pesados"** (`docs/roadmap/globalconnect-roadmap-maestro-v1.md:129`).

### 1.2 Qué NO resuelve Fase 4 (out of scope, alineado con el pastor)

- Mensajería interna 1:1 entre usuarios (Fase futura — vía WhatsApp manual o sistema separado).
- Detalles pastorales sensibles profundos (decisión pastoral: solo reportes generales).
- Mentores no oficiales elegidos por la persona sin rol formal (decisión pastoral: **NO entran al sistema**, `docs/REUNION_PASTOR_ROADMAP.html:1940`).
- Consolidación de métricas espirituales, KPI targets, churn, retención (diferido a Fase 11 — Ruta Espiritual Completa).
- Rediseño del dashboard del líder (aditivo: widgets nuevos, no se rompe lo existente).
- Migraciones destructivas (todas las migraciones son aditivas).
- Activación del flag `OPERATING_CORE_*` o `PASTORAL_*` en producción sin 7+ días de validación en staging.

### 1.3 Decisiones cerradas que aplican (heredadas de F1/F2/F3, no se reabren)

- **Persona única**: todo 1:1 y toda tríada referencia `Persona` (Fase 1) por `persona_id`. No se duplica identidad.
- **`lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags}.ts` byte-identical post-F4** (Fase 1 protected).
- **`lib/platform/dream-team/**` byte-identical post-F4** (Fase 2 protected).
- **`lib/platform/adapters/grupos-vida.ts` byte-identical post-F4** (Fase 1+2 protected).
- **`lib/platform/operating-core/{kinds,state,capture-states,participation-read-guard}.ts` byte-identical post-F4** (Fase 3 protected — la unión canónica de 11 kinds sigue excluyendo `one_on_one_logged`; F4 añade kinds nuevos en un módulo hermano, **nunca** edita los protegidos).
- **`buscar_usuarios_para_grupo` firma intacta** (`(p_auth_id uuid, p_grupo_id uuid, p_query text, p_limit integer DEFAULT 10)` → `TABLE(id uuid, nombre text, apellido text, email text, telefono text, ya_es_miembro boolean)`).
- **`uno_a_uno=archive` sigue bloqueado**: `lib/platform/preflight.ts` permanece bloqueado indefinidamente. F4 **NO** invoca `registerPlatformUnoAUnoDecision` desde ningún artefacto. Esta es una decisión de producto cerrada desde Fase 3.
- **Fase 3 precede a Fase 4 (CLOSED)**: F3 ya mergeada a main (24 slices S00–S23). F4 **extiende** el cimiento de F3, no lo reemplaza.
- **Multi-tenant OUT of MVP**: F4 no introduce multi-iglesia ni multi-campus.
- **`uno_a_uno=archive` preflight sigue activo**: cualquier intento futuro de tocar `uno_a_uno_reuniones` o `uno_a_uno_participantes` (tablas existentes en `lib/supabase/database.types.ts`) requiere reabrir la decisión cerrada con un issue aprobado fuera del alcance de F4.
- **RLS con helper Postgres** tipo `auth_has_operating_core_capability` (precedente de Fase 2: `auth_has_dream_team_capability`, `lib/supabase/database.types.ts:4587`).
- **Version + 409 en transiciones de estado** (precedente Fase 2 Dream Team: `lib/platform/dream-team/state-machine.ts`, `lib/platform/dream-team/repository-supabase.ts`).
- **Append-only audit log** para cambios manuales en 1:1 (precedente Fase 3: `kind='attendance_update'` para correcciones, `specs/operating-core-participation-ledger/spec.md`).
- **Feature flags con kill switch call-time**: F4 añade `NEXT_PUBLIC_PASTORAL_*` siblings a `lib/platform/operating-core/flags.ts` (NO edita el protegido).
- **Strict TDD**: tests primero, RED verificado, GREEN implementado, REFACTOR con cobertura. Jest 30 + RTL (precedente `jest.config.ts`, `openspec/config.yaml`).
- **Migraciones DDL aditivas**: cero columnas renombradas/eliminadas, cero `DROP`, cero `ALTER` sobre tablas preexistentes. Solo `CREATE` y `ALTER TABLE ADD COLUMN`.
- **Capacities scoped** (no roles globales duplicados): cada capability nueva se agrega al catálogo `PLATFORM_CAPABILITIES` (`lib/platform/experiences.ts`).
- **Vistas separadas**: panel oculto del mentor (hitos privados) + vista pública de roadmap del usuario. Misma fuente, distintos `scopeType`s o niveles de acceso (decisión pastoral: `docs/REUNION_PASTOR_ROADMAP.html:1949-1966`).
- **El sistema sugiere, el mentor valida** (`docs/REUNION_PASTOR_ROADMAP.html:1907`, `docs/REUNION_PASTOR_ROADMAP.html:1240`): ningún artefacto de F4 puede "promover" un paso espiritual sin `actorPersonaId` de un líder con rol formal.

---

## 2. Estado del arte (qué ya existe y se puede reusar sin reinventar)

### 2.1 Fase 1 — Platform Foundation (construido y mergeado)

| Módulo | Reuso para F4 |
|---|---|
| `lib/platform/persona.ts` | `Persona` canónica por `persona_id`; dedupe con `decision/candidates/reviewRequired`. **Sin nuevos cambios.** |
| `lib/platform/experiences.ts` | Catálogo de 8 experiences, 6 scope types, 22 capability keys. F4 **extiende aditivamente** `PLATFORM_EXPERIENCES_CATALOG` y `PLATFORM_CAPABILITIES` con capabilities nuevas (no está en la lista de protegidos). |
| `lib/platform/grants.ts` | `PlatformGrantAuditEvent`, métricas, denial threshold. Cada 1:1 y cada tríada **emiten** `grant`/`revoke`/`deny`/`audit` cuando aplica. |
| `lib/platform/participation.ts` | Contrato longitudinal con 7 kinds. F4 **no edita** este módulo; los kinds nuevos de 1:1 y tríada viven en `lib/platform/pastoral/participation-kinds.ts` (sibling). |
| `lib/platform/routeGuard.ts` / `navigation.ts` | Patrón de auth + capability + flag gating. F4 sigue el mismo patrón con `pastoral.*` capabilities. |
| `lib/platform/family.ts` | Taxonomía de relaciones (no tocada — referencia para entender que familia no se mezcla con acompañamiento pastoral). |
| `lib/platform/preflight.ts` | Sigue bloqueando `uno_a_uno`. F4 **no** invoca `registerPlatformUnoAUnoDecision`. |
| `lib/platform/flags.ts` | Sigue siendo el módulo de flags base. F4 añade sibling `lib/platform/pastoral/flags.ts` (no edita este). |
| `lib/platform/adapters/grupos-vida.ts` | Bridge read-only a Grupos de Vida. F4 lo **consume** para detectar quién está en qué GDV (necesario para el algoritmo de mentor-cascada). Byte-idéntico post-F4. |
| `lib/auth/requireAuth.ts` (incluye `requireRole`) | Patrón de auth server-side. F4 reusa para `app/api/pastoral/**`. |

### 2.2 Fase 2 — Dream Team Global Base (construido y mergeado)

| Módulo | Reuso para F4 |
|---|---|
| `lib/platform/dream-team/types.ts` | Patrón de state machine con 6 estados (`DREAM_TEAM_ESTADOS`) y motivos auditables (`DREAM_TEAM_MOTIVOS`). F4 modela 1:1 con un set análogo. |
| `lib/platform/dream-team/state-machine.ts` | `TRANSICIONES_VALIDAS` matrix + `transition()` puro. F4 replica el patrón para `one_on_one` y `triad`. |
| `lib/platform/dream-team/errors.ts` | `DreamTeamErrorCode` discriminated union + `TERMINAL_ESTADOS`. F4 define `PastoralErrorCode` análogo. |
| `lib/platform/dream-team/repository.ts` | Contrato read+write+history+participation. F4 implementa `OneOnOneRepository` y `TriadRepository` con la misma forma. |
| `lib/platform/dream-team/repository-fake.ts` | In-memory repo (218 líneas). F4 arranca con fake equivalente para TDD. |
| `lib/platform/dream-team/repository-supabase.ts` | Supabase repo (438 líneas) con `ConcurrencyConflictError` y `version`. F4 replica `optimistic_concurrency` + audit append-only. |
| `lib/platform/dream-team/grants.ts` | `buildGrantsForServicio`, `applyGrantsForTransition`. F4 emite grants al activar/pausar un 1:1. |
| `lib/platform/dream-team/servicios.ts` | `transitionWithGrants` orchestrator. F4 implementa `completeOneOnOneWithGrants` análogo. |
| `lib/platform/dream-team/metrics.ts` | 4 aggregate shapes. F4 sigue el patrón de métricas base (no avanzadas). |
| `lib/platform/dream-team/route-access.ts` | `hasDreamTeamReadCapability`/`hasDreamTeamWriteCapability`. F4 define `hasPastoralReadCapability`/`hasPastoralWriteCapability` con el mismo patrón. |

### 2.3 Fase 3 — Operating Core (construido, mergeado, **precedente más cercano**)

| Módulo / spec | Reuso para F4 |
|---|---|
| `lib/platform/operating-core/kinds.ts` | Unión canónica de **11 kinds**: `attendance`, `visitor_capture`, `registration`, `cancellation`, `check_in`, `check_out`, `attendance_update`, `service_assignment`, `requirement_update`, `transition`, `document_received`. **F4 NO edita este archivo.** Los nuevos kinds viven en `lib/platform/pastoral/participation-kinds.ts`. |
| `lib/platform/operating-core/capture-states.ts` | State machine de 7 estados para captura. F4 modela la **state machine del 1:1** siguiendo este patrón cerrado (con su propio set cerrado). |
| `lib/platform/operating-core/capture-ux/capture-ux-types.ts` | 6 estados UX + 3 shapes (`visitor_resolution`, `registration`, `attendance`). F4 define un nuevo shape `pastoral_one_on_one` reutilizando los estados UX. |
| `lib/platform/operating-core/participation-read-guard.ts` | `canReadOperatingCoreParticipationEvent` con strict-equality scope rule. F4 define `canReadPastoralParticipationEvent` con la misma regla +11 sensitive kinds nuevos. |
| `lib/platform/operating-core/participation-ledger-repository.ts` + `-supabase.ts` | Repository + Supabase adapter para el ledger unificado. F4 escribe en la **misma tabla** `operating_core_participation_eventos` con `kind ∈ {one_on_one_logged, triad_formed, triad_member_added, triad_member_removed, triad_step_validated, triad_step_suggested, one_on_one_note_logged, one_on_one_followup_set, one_on_one_followup_completed, triad_disbanded, one_on_one_cancelled}` (propuesta tentativa, ver §6). |
| `lib/platform/operating-core/state.ts` | `REGISTRATION_STATES`, `REGISTRATION_TRANSITIONS`, `canTransition`. F4 replica el patrón cerrado para `ONE_ON_ONE_STATES`. |
| `lib/platform/operating-core/registrations/registration-state.ts` | Pure functions: `evaluateRegistrationOutcome`, `canDenyManualRegistration`, `validateWaitlistPromotion`. F4 replica para `evaluateOneOnOneOutcome`. |
| `lib/platform/operating-core/registrations/registration-repository.ts` + `-supabase.ts` + `-fake.ts` | Triple (interface + Supabase + fake). F4 replica para `OneOnOneRepository`. |
| `lib/platform/operating-core/dashboards/loader.ts` | Loader capability-based (Director / Líder / Operador). F4 añade una **sección pastoral** aditiva por capability. |
| `lib/platform/operating-core/flags.ts` | Sibling flag reader (NO edita `lib/platform/flags.ts`). F4 sigue el mismo patrón con `lib/platform/pastoral/flags.ts`. |
| `lib/platform/operating-core/route-access.ts` | Pattern auth + capability + flag call-time. F4 replica para `app/api/pastoral/**`. |
| `lib/platform/operating-core/visitor-resolution.ts` | Visitor resolution con `match_method ∈ {exact_cedula, fallback_signals, operator_confirmed, created_minimal}`. F4 lo consume (un visitante nuevo en un 1:1 puede no existir — reusa el contrato sin modificar). |
| `lib/platform/operating-core/notification-outbox/` | Outbox compartido con bounded retry. F4 **reusa** este outbox (no crea otro). |
| `lib/platform/operating-core/notification-outbox/outbox-types.ts` | Ya documenta explícitamente que `one_on_one_logged` está excluido del outbox actual. F4 lo **incluye** en una migration aditiva. |
| `openspec/specs/platform/operating-core-participation-ledger/spec.md` | Precedente directo: closed kind union, append-only, hybrid payload, scoped read, retention deferred. F4 sigue exactamente este patrón. |
| `openspec/changes/fase-03-operating-core/specs/` (14 specs) | Grano de delta spec: 6-8 requirements por spec, Given/When/Then por scenario, RFC 2119 keywords. F4 sigue el mismo grano. |

### 2.4 Reunión pastoral (alineamiento pastoral explícito)

`docs/REUNION_PASTOR_ROADMAP.html` contiene las **10 preguntas con respuesta del pastor** (q01-q10) más las decisiones explícitas en el cuerpo principal. Resumen de lo que YA está decidido (no necesita repreguntar al pastor):

- **Q04 — Quién es mentor:** "Los 1 a 1 los hace siempre el líder inmediato: si la persona está en un grupo de vida, con su líder de grupo; si está en un área de servicio, con su coordinador o director (un músico, por ejemplo, con su director)." (`docs/REUNION_PASTOR_ROADMAP.html:2100`).
- **Cascada de mentor (3 niveles, GDV pesa más):** "Nivel 1. Si la persona está en un grupo de vida, su mentor es el líder de su grupo de vida. Nivel 2. Si no está en grupo de vida pero sí participa en un grupo de corto plazo (taller), su mentor es el líder de ese taller. Nivel 3. Si no está en grupo de vida ni en grupo de corto plazo pero sí sirve en un equipo, su mentor es el líder de su servicio." (`docs/REUNION_PASTOR_ROADMAP.html:1934-1937`).
- **GDV pesa más:** "El líder de grupo de vida tiene más peso que cualquier otro rol. Si la persona asiste a un grupo de vida, ese líder es el mentor oficial aunque también sirva en un área o esté en otro programa." (`docs/REUNION_PASTOR_ROADMAP.html:1939`).
- **Mentores no oficiales excluidos:** "Los mentores no oficiales (los que la persona elige sin tener un rol formal dentro de la iglesia) no entran al sistema para validar progreso. Pueden acompañar de manera informal, pero la certificación y los hitos los firma siempre un líder con rol." (`docs/REUNION_PASTOR_ROADMAP.html:1940`).
- **Tríada por nuevo paso:** Cuando la persona toma un nuevo paso (taller, bautismo, área de servicio), se conecta con el líder del nuevo paso + su mentor actual. La tríada visibiliza esa articulación.
- **Tríada por simultaneidad:** Si la persona asiste a GDV y también sirve, el coordinador del área conversa con el líder de GDV para alinear el acompañamiento. El mentor oficial sigue siendo el líder de GDV (porque pesa más).
- **Dos vistas, una sola verdad:** (a) Panel oculto del mentor — escribe notas privadas, marca hitos, registra observaciones; (b) Vista pública del usuario — ruta visual con progreso general y próximo paso sugerido. La persona **NO ve** las notas privadas del mentor.
- **Principio rector:** "el sistema sugiere, pero el mentor valida. Las decisiones de progreso nunca las toma la plataforma sola." (`docs/REUNION_PASTOR_ROADMAP.html:1907`).
- **Regla pastoral del 1:1:** solo reportes generales; nada de detalles pastorales sensibles profundos. Esto se traduce técnicamente en **participation kind `one_on_one_logged` con metadata bounded**, sin `cedula`, sin salud mental, sin confesiones, sin crisis matrimoniales.
- **"Todo lo que empieza debe terminar":** Cada 1:1 abierto debe cerrarse (no quedan 1:1 colgados sin `estado` terminal). Cada tríada abierta debe cerrar o disolverse con motivo (`triad_disbanded` con `motivo` auditable).

---

## 3. Gaps y preguntas abiertas (necesitan respuesta antes de la propuesta)

> Las preguntas se numeran **Q1..QN** y se agrupan por dominio al final (§8). No se reabren las decisiones cerradas de F1/F2/F3 ni las decisiones pastorales explícitas listadas en §2.4.

### 3.1 Modelo de datos

- **Q1.** ¿La pareja que toma 1:1 se modela como un solo `one_on_one` con `participantes: [persona_a, persona_b]` o como dos 1:1 paralelos con `one_on_one.mate_persona_id`? La decisión pastoral es "individual o de pareja" pero no especifica la granularidad técnica.
- **Q2.** ¿Una tríada tiene exactamente 3 personas (la asistida + 2 acompañantes) o admite 2-4 con cardinalidad variable? El documento pastoral dice "persona, líder, mentor" (3 fijos) pero también menciona que el coordinador del área puede "conversar" sin entrar formalmente a la tríada.
- **Q3.** ¿Cuál es la cardinalidad del lado "mentor" — un mentor activo por persona, o múltiples mentores activos simultáneos (uno por cada contexto pastoral)? El principio "GDV pesa más" sugiere unicidad, pero "tríada por simultaneidad" sugiere paralelismo.
- **Q4.** ¿Las tríadas tienen un `motivo` de cierre obligatorio (similar a `DreamTeamMotivo`)? Si sí, ¿cuál es el catálogo cerrado?
- **Q5.** ¿Los hitos pastorales (bautismo, taller completado, decisión de servir) se modelan como `participation_event` con `kind='transition'` (reusando Fase 3) o como `kind` propio de pastoral (e.g. `pastoral_step_validated`)? El principio "el sistema sugiere, el mentor valida" sugiere que la validación del mentor produce un evento distinto del de transición operacional.

### 3.2 Cascada del mentor y resolución del "mentor oficial"

- **Q6.** Cuando una persona está en GDV, asiste a un taller y sirve en un área simultáneamente, ¿el algoritmo de cascada elige siempre GDV (decisión pastoral ya cerrada) o necesita resolver empates? Si la persona está en **dos GDVs** a la vez, ¿cuál gana?
- **Q7.** ¿La cascada se evalúa on-demand (cada vez que se abre un 1:1) o se cachea en una columna denormalizada (`mentor_oficial_persona_id`) sobre `Persona`? El cache acelera pero introduce drift si GDV membership cambia.
- **Q8.** ¿La asignación del mentor es **automática** (el sistema resuelve GDV → taller → servicio) o **confirmada por el líder** (el líder inmediato valida: "sí, yo soy su mentor")? El principio "el sistema sugiere, el mentor valida" sugiere confirmación, pero no especifica el flujo técnico.
- **Q9.** ¿Una persona puede **rechazar** la asignación automática de su mentor (e.g. "yo no quiero que mi líder de GDV sea mi mentor oficial, prefiero a mi coordinador de taller")? El documento pastoral no menciona este caso.

### 3.3 Visibilidad y permisos

- **Q10.** ¿"Pastor/admin con permiso" del roadmap maestro (`docs/roadmap/globalconnect-roadmap-maestro-v1.md:126`) se traduce a una capability específica (`pastoral.read.all`) o es un conjunto de capabilities ya existentes (e.g. `dream_team.director.coordinate` + un grant pastoral)?
- **Q11.** ¿La persona puede **leer sus propios reportes de 1:1** (vista pública de roadmap) o solo ve el progreso agregado? El documento pastoral dice "ve una ruta visual con su progreso general, los hitos alcanzados y el próximo paso sugerido" — eso es agregado, no notas crudas.
- **Q12.** ¿Las notas privadas del mentor (`docs/REUNION_PASTOR_ROADMAP.html:1956`) son accesibles para **otro mentor** en la tríada, o solo para el mentor que las escribió? Si un coordinador de área entra a la tríada por simultaneidad, ¿ve las notas del líder de GDV?
- **Q13.** ¿La pareja que toma 1:1 puede ver el 1:1 del otro, o cada uno ve solo el suyo? El roadmap maestro menciona "1:1 individual o de pareja" pero no aclara la visibilidad cruzada.

### 3.4 Notificaciones y disparadores

- **Q14.** ¿El outbox de Fase 3 (`lib/platform/operating-core/notification-outbox/`) absorbe las notificaciones pastorales con templates versionados en español (e.g. `pastoral.one_on_one.scheduled.v1`, `pastoral.triad.formed.v1`), o se crea un outbox hermano? El precedente de Fase 3 (un único outbox compartido con `support_event_outbox`) sugiere reuso, no duplicación.
- **Q15.** ¿Hay disparadores automáticos al **abrir** un 1:1 (e.g. "se programó un 1:1 para el sábado 25 con Carlos") o solo al **cerrarlo**? El principio "todo lo que empieza debe terminar" sugiere notificación al abrir + recordatorio + notificación al cerrar, pero el documento pastoral no especifica.
- **Q16.** ¿El reminder de 1:1 es configurable por evento pastoral (como Fase 3: T-24h por defecto), fijo a T-24h, o no tiene reminder en MVP? El documento pastoral no menciona recordatorios.

### 3.5 Estados, terminales y transiciones

- **Q17.** ¿Cuál es el set cerrado de estados del 1:1? Candidatos tentativos: `programado`, `en_curso`, `completado`, `no_realizado`, `cancelado`, `reprogramado`. Faltan definiciones.
- **Q18.** ¿Cuál es el set cerrado de estados de la tríada? Candidatos tentativos: `activa`, `en_pausa`, `disuelta`, `completada`. Faltan definiciones y transiciones válidas.
- **Q19.** ¿La cancelación de un 1:1 requiere motivo obligatorio (análogo a `DreamTeamMotivo`)? Si sí, ¿cuál es el catálogo cerrado? (Fase 2 cerró este patrón con `MISSING_MOTIVO` → reject.)
- **Q20.** ¿Una tríada se puede **reformar** después de disolverse, o la disolución es terminal? Si se reforma, ¿se preserva el historial o se crea una nueva?

### 3.6 UX, captura y reportes

- **Q21.** ¿El 1:1 tiene captura rápida desde el celular del líder (Fase 3: captura UX ya provee `idle | in_progress | awaiting_resolution | confirmed | overridden | rejected`) o requiere UI dedicada? El principio "sin workflows pesados" sugiere captura rápida.
- **Q22.** ¿El "reporte general" del 1:1 es un campo `resumen` libre (texto bounded ~500 caracteres) o un set cerrado de opciones (e.g. `estado_emocional ∈ {estable, en_proceso, con_dificultad}`, `avance_paso ∈ {completado, en_progreso, sin_avance}`)? El primero es flexible; el segundo es más comparable.
- **Q23.** ¿El próximo paso sugerido por el sistema (vista pública del usuario) se calcula desde reglas declarativas (e.g. "si terminó Pr\u00f3ximo Paso + sirve + no bautizado → sugerir bautismo") o desde una columna `siguiente_paso_sugerido_id` denormalizada que el mentor puede sobreescribir? El documento pastoral sugiere reglas pero no especifica.

### 3.7 Plataforma y operaciones

- **Q24.** ¿F4 introduce un nuevo `experience` en `PLATFORM_EXPERIENCES_CATALOG` (e.g. `pastoral`) o reusa experiences existentes (`grupos_vida`, `the_living_room`)? El principio "roles globales pocos + capabilities scoped" sugiere nuevo `experience: 'pastoral'` con su propio `scopeType`.
- **Q25.** ¿F4 introduce un nuevo `scopeType` (e.g. `triada`, `one_on_one`) o reusa los 6 existentes (`experience`, `equipo`, `etapa`, `grupo`, `salon`, `taller`)? El mismo principio sugiere nuevo `scopeType: 'one_on_one' | 'triada'`.
- **Q26.** ¿Cómo se reporta el éxito de F4? Métricas tentativas: (a) 1:1 completados vs programados por líder por mes; (b) tríadas activas; (c) tiempo mediano entre programar 1:1 y completarlo. Faltan umbrales concretos.

---

## 4. Supuestos preliminares (alineados por las reuniones pastorales o por las decisiones cerradas)

> Estos supuestos **ya están claros** según `docs/REUNION_PASTOR_ROADMAP.html` y el roadmap maestro. Se listan aquí para que la propuesta los confirme, no para reabrirlos.

- **A1.** El 1:1 lo hace **siempre el líder inmediato** de la persona (decisión pastoral cerrada).
- **A2.** El mentor oficial se asigna por **cascada GDV → taller → servicio**, con GDV como ganador si hay conflicto (decisión pastoral cerrada).
- **A3.** Los **mentores no oficiales no entran al sistema** (decisión pastoral cerrada).
- **A4.** El 1:1 contiene solo **reportes generales**; nada de detalles pastorales sensibles profundos (decisión pastoral cerrada + roadmap maestro).
- **A5.** La tríada visibiliza al **líder actual + mentor oficial + un tercer actor pastoral** (coordinador de área cuando hay simultaneidad, líder del nuevo paso cuando hay nuevo paso) (decisión pastoral cerrada).
- **A6.** El **sistema sugiere; el mentor valida** (decisión pastoral cerrada).
- **A7.** **Dos vistas, una sola fuente:** panel oculto del mentor (notas privadas, hitos) + vista pública del usuario (roadmap agregado) (decisión pastoral cerrada).
- **A8.** **"Todo lo que empieza debe terminar":** 1:1 y tríadas no pueden quedarse en estado intermedio sin motivo (decisión pastoral cerrada).
- **A9.** F4 **extiende** la plataforma sobre el cimiento de F1+F2+F3, **sin migraciones destructivas** y **sin tocar los módulos protegidos** (decisiones cerradas heredadas).
- **A10.** F4 introduce nuevos `participation_event kinds` **vía migration aditiva**, no toca la unión canónica de 11 kinds (`lib/platform/operating-core/kinds.ts`).
- **A11.** F4 reusa el outbox compartido de Fase 3 (`lib/platform/operating-core/notification-outbox/`), no crea uno nuevo.
- **A12.** F4 reusa `lib/platform/adapters/grupos-vida.ts` para resolver quién está en qué GDV, **sin modificarlo**.
- **A13.** F4 reusa el contrato público `findPlatformPersonaCandidates` de Fase 1 (`lib/platform/persona.ts`) para resolver invitados nuevos que aparezcan en un 1:1.
- **A14.** F4 introduce un nuevo `experience: 'pastoral'` y nuevos `scopeType: 'one_on_one' | 'triada'` en `PLATFORM_EXPERIENCES_CATALOG` (extensión aditiva, no edición del archivo protegido).
- **A15.** La visibilidad del 1:1 sigue **tres círculos**: (1) el líder que lo creó, (2) el director inmediato, (3) pastor/admin con permiso (roadmap maestro línea 126).
- **A16.** La pareja que toma 1:1 se modela como **un solo `one_on_one` con dos `participantes`** (decisión tentativa alineada con la simplificación pastoral; pendiente confirmación en Q1).
- **A17.** El "reporte general" del 1:1 es un campo `resumen` libre bounded (sin opciones cerradas en MVP), alineado con "sin workflows pesados".
- **A18.** El 1:1 no tiene recordatorio automático configurable en MVP — el líder programa y ejecuta (alineado con "sin workflows pesados"). Notificación al abrir + al cerrar sí.
- **A19.** Los hitos validados por el mentor se modelan como nuevo `participation_event kind: 'one_on_one_step_validated'` con `metadata { step_id, suggestion_source, mentor_persona_id }` (no se confunde con `kind='transition'` operacional de Fase 3).
- **A20.** Las tríadas tienen un motivo de disolución obligatorio del catálogo cerrado `TRIAD_DISSOLUTION_REASONS = ['gdv_liderazgo_removed', 'servicio_retirado', 'cambio_de_temporada', 'pastoral_decision', 'otro']` (alineado con Fase 2 `DREAM_TEAM_MOTIVOS`).

---

## 5. Decisiones arquitectónicas tentativas (D1..DN)

> Las marcadas con **(cerrada)** ya están decididas por F1/F2/F3 o por la reunión pastoral y no se reabren. Las marcadas con **(abierta)** requieren debate en la propuesta o respuesta pastoral antes del design.

### 5.1 Decisiones cerradas (heredadas)

- **D1 (cerrada).** F4 introduce nuevos participation kinds **vía módulo hermano** `lib/platform/pastoral/participation-kinds.ts`. El archivo `lib/platform/operating-core/kinds.ts` permanece **byte-identical**. Los nuevos kinds se añaden a `OPERATING_CORE_PARTICIPATION_KINDS` solo si se aprueba una migración aditiva que extienda el check constraint de la DB — y aún así, el módulo TS queda en el hermano.
- **D2 (cerrada).** F4 reusa el ledger unificado `operating_core_participation_eventos` (creado en Fase 3, S03). No crea una tabla pastoral separada.
- **D3 (cerrada).** F4 reusa el outbox compartido de Fase 3. Las notificaciones pastorales se identifican por `template_key` con prefijo `pastoral.*` (e.g. `pastoral.one_on_one.opened.v1`).
- **D4 (cerrada).** F4 reusa `canReadPlatformParticipationEvent` para `attendance`-class kinds y define `canReadPastoralParticipationEvent` (sibling) para los kinds nuevos con sensitivity `internal` (no `sensitive`, alineado con la regla pastoral de "no detalles sensibles profundos").
- **D5 (cerrada).** F4 añade `experience: 'pastoral'` y `scopeType: 'one_on_one' | 'triada'` en `PLATFORM_EXPERIENCES_CATALOG` (extensión aditiva, no edición).
- **D6 (cerrada).** F4 introduce capability keys nuevas con scope pastoral:
  - `pastoral.one_on_one.create` (scope: `pastoral | grupo | one_on_one`),
  - `pastoral.one_on_one.read` (scope: `pastoral | grupo | one_on_one`),
  - `pastoral.one_on_one.write_notes` (scope: `one_on_one` — solo el mentor que creó el 1:1),
  - `pastoral.one_on_one.validate_step` (scope: `one_on_one` — solo el mentor oficial),
  - `pastoral.triada.create` (scope: `pastoral | grupo`),
  - `pastoral.triada.read` (scope: `pastoral | grupo | triada`),
  - `pastoral.triada.write_notes` (scope: `triada` — solo miembros activos),
  - `pastoral.triada.disband` (scope: `triada` — solo el mentor oficial),
  - `pastoral.read.all` (scope: `pastoral` — pastor/admin; equivalente al "director inmediato + pastor/admin con permiso" del roadmap maestro).
- **D7 (cerrada).** F4 NO usa `uno_a_uno` ni las tablas `uno_a_uno_reuniones` / `uno_a_uno_participantes`. El modelo de F4 es un **modelo pastoral nuevo** sobre `Persona`, paralelo a las decisiones cerradas.
- **D8 (cerrada).** F4 sigue el patrón de **optimistic concurrency** con columna `version` (precedente Fase 2 `dream_team_servicios.version`). 409 en conflicto de versión.
- **D9 (cerrada).** F4 sigue el patrón de **append-only audit log** vía nuevas filas `operating_core_participation_eventos` con `kind='attendance_update'`-equivalente pastoral. Las correcciones no mutan filas previas.
- **D10 (cerrada).** F4 introduce flags `NEXT_PUBLIC_PASTORAL_*` siblings a `lib/platform/operating-core/flags.ts`. NO edita `lib/platform/flags.ts` (protegido).
- **D11 (cerrada).** F4 NO introduce multi-tenant ni multi-campus. Es single-tenant como el resto del MVP.

### 5.2 Decisiones tentativas (a confirmar en propuesta o con el pastor)

- **D12 (tentativa).** **State machine del 1:1** (a confirmar en Q17):
  ```
  programado → en_curso → completado
                       → no_realizado
                       → cancelado
  programado → reprogramado (terminal alternativo)
  en_curso → reprogramado
  no_realizado, completado, cancelado → terminales (con motivo en cancelado)
  ```
- **D13 (tentativa).** **State machine de la tríada** (a confirmar en Q18):
  ```
  activa → en_pausa → activa (round-trip permitido)
        → disuelta (terminal, motivo obligatorio)
        → completada (terminal, sin motivo obligatorio, equivalente a "se cumplió el propósito pastoral")
  en_pausa → disuelta
  ```
- **D14 (tentativa).** **Nuevos participation kinds** (a confirmar en §6 y Q5):
  ```
  one_on_one_logged
  one_on_one_completed
  one_on_one_cancelled
  one_on_one_note_logged (metadato bounded, nunca raw confession)
  one_on_one_followup_set
  one_on_one_followup_completed
  triad_formed
  triad_member_added
  triad_member_removed
  triad_disbanded
  triad_step_validated (mentor valida un paso espiritual)
  triad_step_suggested (sistema sugiere un paso, queda pendiente de validación)
  one_on_one_step_validated (alias scoped a 1:1)
  ```
  Total tentativo: **13 nuevos kinds**, **todos con sensitivity `internal`** (no `sensitive`).
- **D15 (tentativa).** **Cascada del mentor** se evalúa **on-demand** con cache opcional denormalizado `Persona.mentor_oficial_persona_id` (alineado con el principio "el sistema sugiere, el mentor valida" — el mentor siempre puede confirmar o rechazar la sugerencia del sistema). (Pendiente Q6-Q9.)
- **D16 (tentativa).** **Visibilidad de la tríada** (a confirmar en Q12): las notas privadas del mentor **son visibles solo para el mentor que las escribió** y para el **pastor/admin con `pastoral.read.all`**. Los otros miembros de la tríada ven la **lista de hitos validados** pero no las notas crudas. Esto respeta la decisión pastoral de "no exponer lo sagrado como dato".
- **D17 (tentativa).** **Reporte general del 1:1** = campo `resumen: string` bounded a 500 caracteres (alineado con A17 y "sin workflows pesados").
- **D18 (tentativa).** **Vista pública del roadmap del usuario** se renderiza desde un nuevo `RoadmapViewContract` que agrega: (a) hitos validados por el mentor (`kind='one_on_one_step_validated'`), (b) próximo paso sugerido (`kind='triad_step_suggested'` sin validar). El usuario nunca ve notas privadas. (Alineado con la decisión pastoral del documento.)
- **D19 (tentativa).** **Métricas base de F4** (alineadas con Fase 2 `metrics.ts`, sin analytics avanzados):
  - `one_on_one_completados_por_mes` (count por `mentor_persona_id`),
  - `one_on_one_pendientes_por_lider` (count de `programado | en_curso` por líder),
  - `triadas_activas_por_experiencia` (count de `activa` por `experience`),
  - `tiempo_mediano_programado_a_completado` (en días, para detectar cuellos de botella pastorales).
- **D20 (tentativa).** **Trigger de "todo lo que empieza debe terminar"** se implementa como **scheduled job** que detecta 1:1 en `programado` con `occurred_at < now() - 30 días` y los marca `no_realizado` con `motivo='vencido_por_tiempo'`, **notificando al mentor**. Las tríadas en `activa` sin actividad pastoral (sin nuevos `one_on_one_completed`) en 180 días se sugieren para revisión pastoral al líder, **no se disuelven automáticamente**.
- **D21 (tentativa).** **RLS de las tablas nuevas** sigue el patrón Fase 2 (`auth_has_dream_team_capability` → nuevo `auth_has_pastoral_capability(p_capability_key text)`). Tablas tentativas: `pastoral_one_on_one`, `pastoral_one_on_one_participantes`, `pastoral_one_on_one_notas`, `pastoral_triada`, `pastoral_triada_miembros`, `pastoral_triada_eventos`. Todas con RLS activada y helper de capabilities.
- **D22 (tentativa).** **Captura rápida del 1:1** desde el celular del líder reusa `CAPTURE_UX_STATES` de Fase 3 (6 estados) con un nuevo `CAPTURE_UX_SHAPE: 'pastoral_one_on_one'`. No se requiere UI nueva — se compone sobre el contrato existente.

---

## 6. Modelo tentativo de datos (alto nivel)

### 6.1 Tablas nuevas (aditivas)

```text
pastoral_one_on_one (
  id uuid PRIMARY KEY,
  mentor_persona_id uuid NOT NULL,             -- el líder que hace el 1:1 (pastor decision)
  experience text NOT NULL,                     -- 'grupos_vida' | 'the_living_room'
  scope_type text NOT NULL,                    -- 'grupo' | 'one_on_one'
  scope_id uuid,                                -- grupo_id o NULL si 1:1 sin grupo
  occurred_at timestamptz NOT NULL,             -- fecha/hora programada
  estado text NOT NULL CHECK (estado IN (
    'programado', 'en_curso', 'completado',
    'no_realizado', 'cancelado', 'reprogramado'
  )),
  motivo_cancelacion text,                       -- obligatorio si estado = 'cancelado'
  resumen text,                                  -- bounded 500 chars, reporte general
  version int NOT NULL DEFAULT 1,                -- optimistic concurrency
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_persona_id uuid NOT NULL,
  UNIQUE (mentor_persona_id, occurred_at)       -- un 1:1 por mentor por timestamp
)

pastoral_one_on_one_participantes (
  one_on_one_id uuid NOT NULL REFERENCES pastoral_one_on_one,
  persona_id uuid NOT NULL REFERENCES usuarios,
  rol text NOT NULL CHECK (rol IN ('asistido', 'acompanante_principal')),
  PRIMARY KEY (one_on_one_id, persona_id)
)

pastoral_one_on_one_notas (
  id uuid PRIMARY KEY,
  one_on_one_id uuid NOT NULL REFERENCES pastoral_one_on_one,
  autor_persona_id uuid NOT NULL,               -- solo el mentor que creó el 1:1 + pastor/admin
  contenido text NOT NULL,                       -- bounded 2000 chars, NO sensitive content
  created_at timestamptz NOT NULL DEFAULT now()
)
-- Notas: NO se exponen a otros miembros de la tríada (D16).

pastoral_triada (
  id uuid PRIMARY KEY,
  asistida_persona_id uuid NOT NULL REFERENCES usuarios,  -- la persona acompañada
  mentor_oficial_persona_id uuid NOT NULL,                 -- resultado de la cascada
  estado text NOT NULL CHECK (estado IN (
    'activa', 'en_pausa', 'completada', 'disuelta'
  )),
  motivo_disolucion text,                                  -- obligatorio si estado = 'disuelta'
  contexto text CHECK (contexto IN (
    'nuevo_paso', 'simultaneidad', 'inicial', 'reformada'
  )),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  version int NOT NULL DEFAULT 1
)

pastoral_triada_miembros (
  triada_id uuid NOT NULL REFERENCES pastoral_triada,
  persona_id uuid NOT NULL REFERENCES usuarios,
  rol_en_triada text NOT NULL CHECK (rol_en_triada IN (
    'asistida', 'mentor_oficial', 'lider_paso', 'coordinador_area', 'acompanante'
  )),
  desde timestamptz NOT NULL DEFAULT now(),
  hasta timestamptz,                                        -- NULL mientras sigue activo
  PRIMARY KEY (triada_id, persona_id, rol_en_triada)
)

pastoral_triada_eventos (
  id uuid PRIMARY KEY,
  triada_id uuid NOT NULL REFERENCES pastoral_triada,
  tipo_evento text NOT NULL,        -- 'formada' | 'miembro_anadido' | 'miembro_removido' | 'disuelta' | 'paso_sugerido' | 'paso_validado' | 'pausada' | 'reactivada'
  actor_persona_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,  -- bounded; ver D14
  created_at timestamptz NOT NULL DEFAULT now()
)
```

### 6.2 Nuevos participation kinds (additive, vía migration)

```text
-- Proposed set (D14, tentative):
one_on_one_logged               -- se abrió un 1:1
one_on_one_completed            -- se cerró con resumen
one_on_one_cancelled            -- se canceló con motivo
one_on_one_note_logged          -- mentor agregó nota privada (NO se ve en vista pública)
one_on_one_followup_set         -- se asignó seguimiento
one_on_one_followup_completed   -- se cumplió el seguimiento
one_on_one_step_validated       -- mentor validó un paso espiritual durante 1:1
triad_formed                    -- tríada activa
triad_member_added              -- entró un nuevo actor (e.g. coordinador de área)
triad_member_removed
triad_disbanded                 -- tríada cerrada con motivo
triad_step_suggested            -- sistema sugirió un paso (pendiente de validación)
triad_step_validated            -- mentor validó un paso durante tríada
```

Todos con `sensitivity = 'internal'` (no `sensitive` — alineado con la decisión pastoral).

### 6.3 Nuevas capabilities

Ver D6.

---

## 7. Invariantes (principios no negociables)

| # | Invariante | Verificación |
|---|---|---|
| **I-1** | `lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags}.ts` byte-identical post-F4. | `git diff main...HEAD -- lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags}.ts` vacío. |
| **I-2** | `lib/platform/dream-team/**` byte-identical post-F4. | `git diff main...HEAD -- lib/platform/dream-team/**` vacío. |
| **I-3** | `lib/platform/adapters/grupos-vida.ts` byte-identical post-F4. | `git diff main...HEAD -- lib/platform/adapters/grupos-vida.ts` vacío. |
| **I-4** | `lib/platform/operating-core/{kinds,state,capture-states,participation-read-guard,capture-ux-types,types}.ts` byte-identical post-F4. | `git diff main...HEAD -- lib/platform/operating-core/kinds.ts lib/platform/operating-core/state.ts lib/platform/operating-core/capture-states.ts lib/platform/operating-core/participation-read-guard.ts lib/platform/operating-core/capture-ux/capture-ux-types.ts lib/platform/operating-core/types.ts` vacío. |
| **I-5** | `buscar_usuarios_para_grupo` firma intacta: `(p_auth_id uuid, p_grupo_id uuid, p_query text, p_limit integer DEFAULT 10)` → `TABLE(id uuid, nombre text, apellido text, email text, telefono text, ya_es_miembro boolean)`. | `rg 'buscar_usuarios_para_grupo' supabase/migrations/` no muestra `CREATE OR REPLACE FUNCTION` posterior a `20250906111510`. |
| **I-6** | No hay migraciones destructivas sobre tablas preexistentes. Solo `CREATE TABLE`, `CREATE INDEX`, `CREATE OR REPLACE FUNCTION` (con签名 byte-idéntica), `ALTER TABLE ADD COLUMN`, `ALTER TABLE ADD CONSTRAINT`. | `rg -l 'DROP|ALTER TABLE .* DROP|ALTER COLUMN' supabase/migrations/` revisado en cada PR. |
| **I-7** | `lib/platform/preflight.ts` sigue bloqueando `uno_a_uno`. F4 NO invoca `registerPlatformUnoAUnoDecision`. | `rg 'registerPlatformUnoAUnoDecision' lib/` retorna vacío (excepto tests). |
| **I-8** | F4 NO escribe en `uno_a_uno_reuniones` ni `uno_a_uno_participantes` (tablas existentes). F4 crea sus propias tablas pastorales. | `rg 'uno_a_uno_' lib/platform/pastoral/` retorna vacío. |
| **I-9** | Toda capability pastoral nueva se modela con `experience: 'pastoral'` + `scopeType: 'one_on_one' | 'triada'` o `experience` existente si reusa GDV/TLR. **Sin roles globales nuevos.** | Code review + `grep 'pastoral\.' lib/platform/experiences.ts`. |
| **I-10** | Los nuevos participation kinds son `internal` (no `sensitive`). | `rg 'PLATFORM_OPERATING_CORE_PARTICIPATION_SENSITIVITY' lib/platform/pastoral/` muestra solo `internal`. |
| **I-11** | Toda escritura pastoral genera un `participation_event` con `actor_persona_id` de un líder con rol formal. La persona **nunca** se autovalida pasos. | Tests cubren que `validateStep` con `actor_persona_id === asistida_persona_id` retorna `403 forbidden_self_validation`. |
| **I-12** | 1:1 y tríadas no pueden quedarse en estado intermedio sin `motivo` obligatorio. | Tests cubren que `cancelar one_on_one` sin motivo retorna `400 missing_motivo`. Análogo a Fase 2 `MISSING_MOTIVO`. |
| **I-13** | Versión + 409 en toda escritura de `pastoral_one_on_one` y `pastoral_triada` (precedente Fase 2 `ConcurrencyConflictError`). | Tests cubren stale write → 409. |
| **I-14** | Append-only audit log: correcciones de 1:1 se hacen emitiendo nueva fila `kind='one_on_one_logged'` con `corrects_event_id` referenciando la fila original. La fila original nunca se muta. | Tests cubren `correctAttendance`-style: nueva fila + original intacta. |
| **I-15** | Notas privadas del mentor (`pastoral_one_on_one_notas`) NO son legibles por otros miembros de la tríada. Solo el autor + `pastoral.read.all` (pastor/admin) las leen. | Tests cubren `canReadPastoralNote(actor=otherTriadMember, note) === denied`. |
| **I-16** | Reporte general del 1:1 (`resumen`) bounded a 500 caracteres. Sin PII sensible (cédula, salud mental, confesiones, crisis). | Validación en repository: `resumen.length > 500` → `400 too_long`; validador rechaza patrones sensibles (regex bounded, no GPT). |
| **I-17** | F4 introduce flags `NEXT_PUBLIC_PASTORAL_*` siblings a `lib/platform/operating-core/flags.ts`. NO edita `lib/platform/flags.ts` (protegido). | `git diff main...HEAD -- lib/platform/flags.ts` vacío. |
| **I-18** | F4 usa el outbox compartido de Fase 3 con `template_key: 'pastoral.*'`. NO crea un outbox pastoral paralelo. | `rg 'createNotificationOutbox' lib/platform/pastoral/` retorna vacío. |
| **I-19** | El RLS de las tablas pastorales sigue el patrón Fase 2: helper `auth_has_pastoral_capability(p_capability_key text)`. | Migración incluye el helper; tests RLS. |
| **I-20** | F4 NO introduce multi-tenant ni multi-campus. | Tests y migraciones no tienen `church_id`, `campus_id`, `tenant_id`. |

---

## 8. Próximas preguntas para el pastor (agrupadas por dominio)

### 8.1 Cascada y asignación del mentor oficial (4 preguntas)

- **P1.** Si una persona está en dos Grupos de Vida simultáneamente, ¿cuál de los dos líderes es el "mentor oficial"? ¿El más antiguo, el que la persona elija, o alguna otra regla?
- **P2.** ¿La asignación automática del mentor (cascada GDV → taller → servicio) requiere **confirmación explícita del líder** ("sí, yo soy su mentor") o es automática sin confirmación? Si requiere confirmación, ¿qué pasa si el líder no confirma en N días?
- **P3.** ¿Una persona puede **rechazar** la asignación automática de su mentor oficial? Si sí, ¿quién resuelve el conflicto (el pastor, el director de la experiencia, otro)?
- **P4.** Cuando una persona toma un nuevo paso (e.g. se inscribe a un taller, se bautiza, empieza a servir), ¿la tríada por nuevo paso se **crea automáticamente** o requiere que alguien (¿quién?) la cree explícitamente?

### 8.2 Visibilidad y permisos (3 preguntas)

- **P5.** ¿"Pastor/admin con permiso" del roadmap maestro se traduce a una **capability específica** (`pastoral.read.all`) o es un conjunto de capabilities ya existentes? ¿Quiénes la reciben por default?
- **P6.** ¿La persona puede **leer sus propios reportes de 1:1** completos (vista privada estilo "mi historial pastoral") o solo ve el roadmap agregado? El documento pastoral dice "progreso general, hitos alcanzados y próximo paso sugerido" — eso es agregado, pero queremos confirmar.
- **P7.** En la tríada por simultaneidad, cuando el coordinador del área entra a la conversación, ¿ve las **notas privadas** que el líder de GDV escribió? ¿O solo ve los hitos validados y el roadmap agregado?

### 8.3 Modelo de pareja (2 preguntas)

- **P8.** Cuando una pareja toma 1:1 juntos, ¿el reporte es **uno solo** (ambos en el mismo 1:1) o **dos reportes paralelos** (uno por cada persona)?
- **P9.** ¿La pareja puede **compartir hitos validados** (si ambos bautizados, ambos en el mismo paso) o cada uno tiene su propio avance independiente?

### 8.4 Notificaciones y disparadores (2 preguntas)

- **P10.** ¿Se notifica al **asistido** cuando se le programa un 1:1 (e.g. "Carlos te programó un 1:1 para el sábado 25"), o la notificación es solo para el mentor? Hoy la programación es asimétrica (solo el líder sabe).
- **P11.** ¿El sistema envía **recordatorio** del 1:1 (e.g. 24h antes), o eso queda a criterio del mentor? Si se envía, ¿al asistido también o solo al mentor?

### 8.5 Métricas y éxito de F4 (2 preguntas)

- **P12.** ¿Cuál es el **objetivo pastoral** de F4 que queremos medir? Ejemplos: (a) "cada persona acompañada al menos una vez por trimestre", (b) "cada tríada completa al menos un hito pastoral por semestre", (c) "ninguna persona en GDV sin 1:1 en más de 90 días".
- **P13.** ¿Las métricas de F4 son **privadas del líder/pastor** o se comparten en algún dashboard público (e.g. congregación)? Esto afecta qué vistas se renderizan.

### 8.6 Lifecycle y casos extremos (3 preguntas)

- **P14.** ¿Una persona que **deja de asistir a GDV** (y por tanto pierde al mentor oficial) pasa automáticamente a tener al líder del taller como mentor (Nivel 2 de la cascada), o el sistema pausa su acompañamiento pastoral hasta que un nuevo mentor sea asignado?
- **P15.** Cuando una persona **se muda de ciudad o de iglesia**, ¿su historial pastoral (1:1 + tríadas) la **acompaña** a la nueva iglesia o se queda en la iglesia de origen? Esto tiene implicaciones multi-tenant (fuera de MVP, pero ¿decidimos la semántica?).
- **P16.** ¿Qué pasa si una persona tiene una **crisis pastoral seria** (e.g. divorcio, pérdida de un ser querido, crisis de fe) detectada durante un 1:1? El documento dice "no detalles pastorales sensibles profundos" — ¿cómo se traduce eso en acción? ¿El mentor escala a pastor/admin manualmente, o el sistema detecta keywords y alerta?

---

## 9. Riesgos detectados

| # | Riesgo | Severidad | Mitigación propuesta |
|---|---|---|---|
| **R1** | **Sobrecargar la unión de 11 kinds con 13 nuevos kinds sin un buen modelo de namespace.** Si se añaden como 13 kinds flat a `OPERATING_CORE_PARTICIPATION_KINDS`, queries `WHERE kind = '...'` se vuelven costosas. | Media | Mantener los kinds **separados en módulo hermano** `lib/platform/pastoral/participation-kinds.ts`. El check constraint de la DB se extiende con una migration aditiva que añade los 13 nuevos como `kind_prefix = 'pastoral_'`. Esto permite índices parciales por prefijo. |
| **R2** | **Confusión entre `kind='transition'` (Fase 3, operacional) y `kind='one_on_one_step_validated'` (Fase 4, pastoral).** Si un director operacional marca una transición de servicio y un mentor marca un paso validado, ambos emiten eventos pero el primero va al dashboard operacional y el segundo al roadmap pastoral. Mezclarlos contamina métricas. | Media | **Prefijo explícito**: los kinds pastorales empiezan con `pastoral_` (e.g. `pastoral_one_on_one_step_validated`). F3 mantiene `transition` sin prefijo. La tabla `operating_core_participation_eventos` distingue por prefijo en queries. |
| **R3** | **El algoritmo de cascada del mentor puede asignar un líder incorrecto si la persona acaba de cambiar de GDV** (transición reciente). | Media | La asignación se evalúa **on-demand** en el momento de abrir el 1:1, no se cachea. Si la persona cambió de GDV hace menos de 7 días, el sistema marca la asignación como `pending_confirmation` y el nuevo líder debe confirmar. |
| **R4** | **Notas privadas del mentor filtradas accidentalmente** vía vista pública del roadmap del usuario. | Alta | Doble enforcement: (1) `canReadPastoralParticipationEvent` rechaza `kind='one_on_one_note_logged'` para `actor.personaId === asistida_persona_id`; (2) la query SQL del roadmap público filtra explícitamente `WHERE kind NOT IN ('one_on_one_note_logged', ...)`. Tests cubren ambos. |
| **R5** | **Multi-iglesia / multi-campus out of MVP pero el modelo debe permitirlo después.** Si el modelo pastoral ata el mentor a un `grupo_id` (Fase 1: GDV) sin espacio para `church_id` futuro, la migración a multi-tenant después es costosa. | Baja-Media | Todas las FK pastorales referencian `usuarios.id` (persona canónica) y opcionalmente `grupo_id` (sin `church_id` aún). Cuando multi-tenant llegue, las nuevas tablas pastorales reciben `tenant_id` vía migration aditiva (mismo patrón que multi-tenant haría en F2 si llegara). |
| **R6** | **El usuario quiere ver **detalles sensibles** que el principio pastoral prohíbe** (e.g. "¿qué dijo mi líder de mí en la nota?"). | Baja | La UI pública del roadmap **nunca expone** `pastoral_one_on_one_notas`. La API retorna `403 forbidden` con mensaje pastoral-amigable: "Esta información es privada entre tu líder y el equipo pastoral." |
| **R7** | **Cobertura de tests insuficiente para el algoritmo de cascada.** La cascada GDV → taller → servicio tiene N combinaciones que pueden no estar todas cubiertas. | Media | Tests parametrizados con `describe.each` cubren todas las combinaciones de presencia/ausencia en GDV, taller y servicio. Mínimo 8 escenarios explícitos + property-based tests con `fast-check`. |
| **R8** | **El trigger "todo lo que empieza debe terminar" genera falsos positivos** marcando 1:1 como `no_realizado` cuando el asistidopedió reprogramar pero nadie actualizó el sistema. | Media | El scheduled job que marca `no_realizado` notifica al mentor **antes** de aplicar el cambio (T-7d, T-1d). El mentor tiene una ventana de 7 días para reprogramar. Si no responde, se marca `no_realizado` con motivo `vencido_por_tiempo` y queda en el dashboard como "requiere atención pastoral". |
| **R9** | **La tríada por simultaneidad puede entrar en loop** si coordinador de área y líder de GDV se intercambian roles continuamente. | Baja | La tríada tiene un solo `mentor_oficial_persona_id` inmutable mientras esté `activa`. Los otros miembros rotan (`triad_member_added` / `triad_member_removed`) pero el mentor oficial no. |
| **R10** | **Capacities nuevas no se asignan a nadie** y nadie puede crear 1:1 o tríadas. | Alta | Script de seeding (sibling a Fase 2) que otorga las capabilities pastorales por default a: (a) todos los líderes de GDV activos (`dream_team.gdv.lead`), (b) todos los coordinadores de área activos, (c) un grant `pastoral.read.all` a `usuarios` con `roles` específicos (pastor). |
| **R11** | **Drift entre la decisión pastoral y la implementación** porque el equipo de plataforma interpreta "mentor oficial" distinto al pastor. | Alta | Toda decisión pastoral confirmada se traduce a un **escenario Given/When/Then en el spec** (precedente F3). El spec de pastoral-mentor-cascade valida exactamente la cascada GDV → taller → servicio. Tests fixtures con datos del caso Ana (precedente Fase 2 `end-to-end-ana.test.ts`). |
| **R12** | **El módulo `pastoral` se vuelve un cajón de sastre** con kinds disparatados (1:1, tríada, notas, followups, steps, ...) si no se cierra el alcance. | Alta | Límite explícito: F4 cubre 1:1 + Tríada + reportes + notas + hitos. **NO** cubre: agenda de cultos, counseling pastoral profundo, derivación a profesionales, integración WhatsApp, recordatorios avanzados, encuestas de salud espiritual, reportes estadísticos avanzados. |

---

## 10. Próximo paso recomendado

**Listo para `sdd-propose`**, con las siguientes condiciones:

1. Las 16 preguntas abiertas (§3 Q1-Q26 y §8 P1-P16) se elevan al pastor en la próxima reunión. Las P1-P4 (cascada) son las más críticas; sin ellas el SDD no puede cerrar el modelo del mentor oficial.
2. Las decisiones tentativas D12-D22 (§5.2) se confirman en la propuesta con la firma del pastor.
3. El supuesto A16 (pareja como un solo 1:1 con dos participantes) se valida explícitamente con P8-P9.
4. El equipo de plataforma valida la factibilidad de los nuevos 13 kinds en `operating_core_participation_eventos` con prefijo `pastoral_` (sin tocar el archivo `kinds.ts` protegido).
5. El equipo de repo aprueba la estrategia de chained PRs (estimación tentativa: **8-12 PRs** con `size:exception` documentada si exceden 400 líneas; ver §11).

---

## 11. Estimación tentativa de slices (referencia, no definitivo)

Esta es una **estimación de workstreams** para visualizar la carga. El detalle final pertenece a `tasks.md`.

| Workstream | PRs estimados | Líneas tentativas | Notas |
|---|---|---|---|
| W0 Prerrequisitos (hygiene, baseline verde, Issue #103) | 1-2 | ~50-100 | Necesario antes de feature slices. |
| W1 Pastoral namespace + participation kinds (sibling) | 1 | ~250-350 | `lib/platform/pastoral/participation-kinds.ts` + tests. NO edita `kinds.ts` protegido. |
| W2 One-on-one state machine + repository (fake + supabase) | 2-3 | ~800-1200 | Patrón Fase 2 Dream Team. Sub-divide por estado. |
| W3 Triad state machine + repository (fake + supabase) | 2-3 | ~800-1200 | Mismo patrón. Sub-divide por estado. |
| W4 Schema migration aditiva | 1 | ~400-500 (size:exception probable) | 6 tablas nuevas + índices + helper `auth_has_pastoral_capability`. |
| W5 Mentor cascade algorithm (resolver oficial) | 1 | ~300-450 | Reusa `lib/platform/adapters/grupos-vida.ts` (read-only). Tests exhaustivos. |
| W6 Capabilities, route-access, flags | 1 | ~200-300 | Sibling a `operating-core/route-access.ts`. |
| W7 Notificaciones pastorales (templates + outbox reuse) | 1-2 | ~500-800 | Templates `pastoral.*.v1` en español. Reusa outbox Fase 3. |
| W8 API surface (`/api/pastoral/**`) | 2-3 | ~600-900 | Capability-gated; 409 reservado. |
| W9 Pastoral dashboard widgets (loader + views) | 1-2 | ~500-800 | Sección aditiva sobre Fase 3 dashboards. |
| W10 Append-only audit log + correcciones | 1 | ~250-400 | Tests que cubren mutación rechazada. |
| W11 Scheduled job "todo lo que empieza debe terminar" | 1 | ~200-350 | T-7d + T-1d notifications + transición a `no_realizado`. |
| W12 Rollout flags + retrocompatibilidad | 1 | ~100-200 | `NEXT_PUBLIC_PASTORAL_*`. |

**Total estimado:** 14-19 PRs. Riesgo medio de `size:exception` en W2, W3, W4, W7. Estrategia recomendada: `force-chained stacked-to-main` como Fase 3.

---

## 12. Referencias (rutas exactas leídas)

### Roadmap + handoffs (read in full)

- `docs/roadmap/globalconnect-roadmap-maestro-v1.md` (369 lines) — definición estratégica de las 15 fases; F4 en líneas 116-129.
- `docs/roadmap/handoffs/fase-03-operating-core.md` (624 lines) — referencia de FORMATO para el handoff de F4 cuando se escriba.
- `docs/roadmap/handoffs/fase-02-dream-team-base.md` (270 lines) — referencia de FORMATO secundaria.
- `docs/REUNION_PASTOR_ROADMAP.html` (2171 lines) — documento pastoral con las 10 respuestas del pastor + decisiones explícitas del cuerpo principal.

### Fase 3 — OpenSpec planning artifacts (read in full o sampled)

- `openspec/changes/fase-03-operating-core/exploration.md` (574 lines) — referencia de ESTRUCTURA para este exploration.
- `openspec/changes/fase-03-operating-core/specs/operating-core-participation-ledger/spec.md` (77 lines) — precedente más cercano a la spec de F4.
- `openspec/changes/fase-03-operating-core/specs/operating-core-registrations/spec.md` (sampled) — grano del delta spec.
- `openspec/changes/fase-03-operating-core/specs/` (14 specs total) — grano de cada spec.

### Fase 2 — OpenSpec planning artifacts (read in full)

- `openspec/specs/platform/dream-team/spec.md` (294 lines) — precedente más cercano a la spec consolidada de F4 (state machine + triad-like + visibility rules).

### Fase 1 — Platform foundation (read sampled)

- `lib/platform/persona.ts` (243 lines, sampled) — `cedula` weight 4, `MIN_CEDULA_CHARS = 4`.
- `lib/platform/experiences.ts` (257 lines, sampled) — 8 experiences, 6 scope types, 22 capability keys.
- `lib/platform/grants.ts` (186 lines, read in full) — `PlatformGrantAuditEvent`, metrics, denial threshold.
- `lib/platform/participation.ts` (224 lines, read in full) — 7 event kinds, `PLATFORM_PARTICIPATION_SENSITIVITY`, `canReadPlatformParticipationEvent`.
- `lib/platform/preflight.ts` (68 lines, read in full) — sigue bloqueando `uno_a_uno`.
- `lib/platform/dream-team/types.ts` (121 lines, read in full) — 6 estados, 10 motivos, `DREAM_TEAM_PARTICIPATION_EVENT_TYPES`.
- `lib/platform/dream-team/state-machine.ts` (47 lines, read in full) — `TRANSICIONES_VALIDAS` + `transition()` puro.
- `lib/platform/dream-team/errors.ts` (35 lines, read in full) — `DreamTeamErrorCode` discriminated union.

### Fase 3 — Operating Core (read sampled)

- `lib/platform/operating-core/kinds.ts` (22 lines, read in full) — 11 kinds, `one_on_one_logged` EXCLUIDO.
- `lib/platform/operating-core/capture-states.ts` (51 lines, read in full) — `CAPTURE_STATES` (7 elements) + `CAPTURE_TRANSITIONS`.
- `lib/platform/operating-core/capture-ux/capture-ux-types.ts` (87 lines, read in full) — `CAPTURE_UX_STATES` (6 elements) + `CAPTURE_UX_SHAPES` (3 elements).
- `lib/platform/operating-core/registrations/registration-state.ts` (158 lines, read in full) — pure functions para outcome evaluation.
- `lib/platform/operating-core/participation-read-guard.ts` (144 lines, read in full) — `canReadOperatingCoreParticipationEvent` con strict-equality scope rule.
- `lib/platform/operating-core/` directory listing — 19 sub-archivos incluyendo `notification-outbox/`, `dashboards/`, `resources/`, `forms/`, `recurrent/`, `capacity/`, `public-tokens/`, `visitor-resolution.ts`, `state.ts`, `types.ts`, `index.ts`, `flags.ts`, `route-access.ts`, `errors.ts`.

### Engram context (read)

- 4 sesiones recientes (2026-07-21, 2026-07-16, 2026-06-12, 2026-06-13) — confirman que Fase 3 está construida (24 slices S00-S23 mergeados a main), Pastor respondió las 10 preguntas, líder de GDV pesa más, tríada por simultaneidad existe. Total: 1,361 sesiones, 5,586 observaciones.

---

**Verdict:** Listo para `sdd-propose` con 16 preguntas abiertas a elevar al pastor y 11 decisiones tentativas a confirmar en la propuesta interactiva.

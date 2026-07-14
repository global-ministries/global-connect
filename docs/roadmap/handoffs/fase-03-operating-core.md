# Handoff — Fase 3: Operating Core

Este handoff es una guía completa para que un agente/orquestador SDD investigue, proponga y diseñe la fase **Operating Core**. No es una especificación cerrada; cada decisión concreta debe salir de los artefactos SDD generados durante esta fase.

Operating Core es la **tubería operativa común** de GlobalConnect: cualquier evento, asistencia, inscripción, taller, capacidad, formulario, recurso o notificación pasa por aquí. Sin Operating Core, los siguientes fases (Niños, Estudiantes, The Living Room, DPS, Talleres, Ruta Espiritual) terminan duplicando lógica entre sí.

## Estado del programa

- Fase 1 — Platform Foundation: cerrada, mergeada en `c364128`, 666+ tests, foundation `lib/platform/**` completa.
- Fase 2 — Dream Team Global Base: cerrada, mergeada en `3cf786d`, 840+ tests, 8 tablas `dream_team_*` en `supabase_global_staging`, contrato + repositorio + API + grants + métricas + participation + e2e Ana.
- Hotfixes posteriores mergeados en `9ced829` (`#258` useCurrentUser timeout, `#260` DashboardLayout mount-at-root) y un archive commit que consolidó specs en `openspec/specs/platform/dream-team/`.
- main estable en `9ced829` (validación pre-Fase 3 confirmada: 0 bytes diff en módulos Fase 1 críticos, 840 tests passing, `tsc --noEmit` limpio).

Documentos a leer obligatoriamente antes de empezar:

- `docs/roadmap/globalconnect-roadmap-maestro-v1.md`
- `docs/roadmap/handoffs/fase-01-platform-foundation.md`
- `docs/roadmap/handoffs/fase-02-dream-team-base.md`
- este handoff
- `lib/platform/**` completo (Fase 1 + Fase 2)
- `openspec/changes/fase-01-platform-foundation/`
- `openspec/changes/fase-02-dream-team-base/`
- `openspec/specs/platform/dream-team/`

## Objetivo de la fase

Construir la **tubería operativa común** de GlobalConnect. Operating Core provee:

- servicios configurables (multi-iglesia, multi-campus);
- eventos, actividades, talleres, instancias;
- inscripciones asistidas o por link público, con búsqueda obligatoria de persona existente antes de crear;
- asistencia / participation ledger común, con experiencia de captura específica por dominio;
- capacidad base y capacidad operativa por instancia;
- formularios simples reutilizables;
- biblioteca simple de recursos por área/rol;
- notificaciones en sistema + email;
- dashboards operativos básicos (no avanzados).

El principio rector: **un solo motor, varias experiencias de captura**. Cada dominio consume Operating Core con su UX, su idioma y su modo de captura, pero los datos van al mismo ledger.

## Resultado esperado del agente

El agente debe producir artefactos SDD de planificación:

1. exploración técnica del estado actual;
2. propuesta de cambio (PRD con decisiones de producto);
3. especificación funcional (uno o varios specs);
4. diseño técnico;
5. plan de tareas por slices seguros (`force-chained stacked-to-main`).

No debe implementar hasta que esos artefactos sean revisados y aprobados. La fase cubre **planificación**, no codificación.

## Principios no negociables

1. **Persona única**: toda asistencia, inscripción y evento referencia `Persona` (Fase 1), nunca duplica identidad. Antes de crear una persona nueva, se busca por al menos nombre + teléfono/email.
2. **Contexto da permisos, no permisos infinitos**: registrar asistencia a un taller no da acceso a administrarlo. Ser líder de grupo no da permisos sobre otro grupo.
3. **Grupos de Vida no se rediseña**: la asistencia de Grupos de Vida sigue con su flujo actual. Operating Core expone una **adapter integration** read-only que reusa lo que ya existe.
4. **Captura específica, ledger común**: cada dominio tiene su UX de captura (check-in Niños, lista del líder, kiosko), pero todos escriben al mismo `participation_ledger`.
5. **Hardware no bloquea MVP**: no asumir impresoras, tablets, QR. El sistema debe operar 100% con computadoras y celulares desde día 1.
6. **Capacidad operativa ≠ capacidad física**: la capacidad efectiva puede cambiar por fecha, servicio, salón, ambiente, voluntarios disponibles o contexto. El modelo debe representar esa variabilidad.
7. **Notificaciones**: en esta fase, sistema + email. WhatsApp API queda fuera. Links compartibles sí.
8. **Formularios simples**: campos básicos, estados, dueño/scope. Sin workflows avanzados, sin lógica condicional pesada, sin aprobaciones sofisticadas.
9. **Recursos**: biblioteca simple con `archivo/link`, categoría, área, rol visible. Sin tracking de cumplimiento.
10. **Sin rediseñar Grupos de Vida**, sin romper dashboards existentes, sin romper flujos de asistencia de grupos pequeños actuales.
11. **Sin usar `uno_a_uno`** — decisión CLOSED como `archive`. Preflight sigue activo en `lib/platform/preflight.ts` (no se llama `registerPlatformUnoAUnoDecision` desde ningún artefacto de Fase 3). La unión canónica de 11 kinds del Operating Core excluye `one_on_one_logged`.
12. **Cambios aditivos**: cualquier migración es no-destructiva, todo es retrocompatible con producción actual.
13. **Strict TDD**: tests primero, RED verificado, GREEN implementado, REFACTOR con cobertura.
14. **Dashboards operativos, no avanzados**: conteos, asistencia, pendientes, alertas. Tendencias, comparativas y predicciones NO entran en esta fase.

## Alcance funcional

### 1. Servicios configurables

Una iglesia puede tener 1, 2 o N servicios por domingo. El modelo debe:

- representar `Service` (id, nombre, hora_inicio, hora_fin, día_semana, ubicación, capacidad_agregada);
- permitir agregar/quitar servicios sin código;
- soportar múltiples campuses (un campus con su set de servicios);
- alimentar la asistencia y la capacidad operativa por servicio.

`Service` no se confunde con `Experience` (Fase 1) ni con `Event`/`EventInstance` (Fase 3): `Service` es un horario semanal recurrente configurable, `Experience` es una organización (Niños, Estudiantes, DPS), `Event`/`EventInstance` son ocurrencias concretas. Un servicio de las 9am puede contener niños + estudiantes + universitarios + grupos de vida a la vez. Las ediciones del schedule NO mutan ni duplican filas históricas de `Event`/`EventInstance`; la materialización futura honra el nuevo schedule.

### 2. Eventos / Actividades / Talleres

Una sola entidad `Event` con `kind` configurable. Tipos válidos en Fase 3:

- `service` (sermón dominical);
- `group_meeting` (reunión de grupo pequeño);
- `workshop` (taller con inscripción);
- `activity` (actividad puntual);
- `custom` (admin-defined).

`camp` **no es un kind válido en Fase 3** — se rechaza al validar el input. La razón histórica queda como referencia a Fase 13, pero el kind NO se persiste en este cambio.

Atributos:

- nombre, descripción, fecha_inicio, fecha_fin;
- lugar (room, ambiente, online);
- capacidad_total, capacidad_operativa (override por instancia);
- visibilidad (público, solo miembros, solo staff);
- estado (borrador, abierto, en_curso, cerrado, cancelado);
- equipo responsable (vinculado a Dream Team por experiencia/equipo; la asignación respeta el scope de Dream Team del actor y NO muta la fila de Dream Team);
- `parent_event_id` opcional (relacionar cohortes o series).

La creación de eventos se autoriza por la capability `operating_core.events.manage` scoped por Experience; los directores la reciben por default y la delegación es scope-bound. **No se hace un chequeo de string de rol**. La cancelación es soft: marca `estado = cancelled` y preserva el historial; no hay hard delete.

`Event` se vincula con `Experience` (Fase 1) por scope: un taller de Talleres de Crecimiento tiene `experience='talleres_crecimiento'`. Esto es **fundamental** para que dashboards y permisos funcionen.

### 3. Inscripciones

`Registration`:

- persona_id (Fase 1);
- event_id;
- estado: pendiente, confirmada, asistida, no_asistio, cancelada, rechazada. (Estados terminales: asistida, no_asistio, cancelada, rechazada. La denegación manual usa `rechazada`; la cancelación del usuario o del sistema usa `cancelada`.)
- origen: admin, líder, link_publico, kiosk, self_service;
- created_by (persona_id del staff o null si fue link);
- created_at, updated_at, confirmed_at, attended_at;
- datos_adicionales (jsonb para campos específicos del evento, NO modelados como columnas fijas);
- companion_ids (jsonb array de persona_ids para acompañantes).

Reglas:

- Antes de crear una persona nueva, **obligatorio** buscar en `Persona` por **cédula como identificador fuerte** y, en paralelo, por nombre + teléfono/email. La resolución consume el contrato público de `lib/platform/persona.ts` (`decision`, `candidates`, `reviewRequired`) — **sin inventar un score paralelo**. Si hay match exacto de cédula, se reutiliza la persona existente (reusa `usuarios.id`; la cuenta/auth, si existe, se reutiliza vía `usuarios.auth_id`). Si el contrato devuelve `single_candidate` con `reviewRequired === false`, se reutiliza ese candidato. Si devuelve candidatos ambiguos o `reviewRequired === true`, **se requiere confirmación de un operador autorizado** antes de cualquier persistencia. Si devuelve `no_match`, se crea la persona mínima con `autoMerge=false`.
- La cédula es el **identificador de identidad** más fuerte disponible y se persiste en `Persona` reusando el campo existente `public.usuarios.cedula` y la señal existente `PlatformPersonaUsuario.cedula`. **No se agrega ninguna columna de metadato de país** (`cédula_country` queda fuera); el adaptador de resolución de visitantes opera sobre los campos protegidos sin modificarlos.
- Inscripción autenticada vía admin o líder del evento.
- Inscripción por link público: el link se genera con `token` firmado, de un solo uso o expiración configurable. NO requiere cuenta de usuario.
- Inscripción self-service: solo en Fase 12.
- Modo de confirmación por evento (`automatic` | `manual`). `automatic` es el default: confirma en orden de llegada hasta la capacidad efectiva y encola el overflow en una waitlist ordenada; `manual` deja las nuevas filas en `pendiente` hasta aprobación. Overflow waitlistable devuelve HTTP 200 `{ outcome: 'waitlisted' }`. 409 se reserva para: capacidad no-waitlistable, transición inválida, conflicto de idempotencia irreconcilable.

### 4. Attendance / Participation Ledger

Una sola tabla `participation_events` (ya existe contrato en Fase 1, `lib/platform/participation.ts`; Fase 3 añade los nuevos kinds en un módulo hermano):

- persona_id, event_id, service_id, experience_id;
- kind ∈ {`attendance`, `visitor_capture`, `registration`, `cancellation`, `check_in`, `check_out`, `attendance_update`, `service_assignment`, `requirement_update`, `transition`, `document_received`} — unión canónica de **11 kinds** del Operating Core (`attendance` ya existe en Fase 1; los otros 10 son aditivos). `one_on_one_logged` queda explícitamente fuera de Fase 3 (decisión cerrada: `uno_a_uno=archive`, Fase 3 precede a Fase 4);
- status: `present`, `absent`, `excused`, `late`, `partial`, `pending`, `confirmed`, `cancelled`;
- occurred_at;
- captured_by (persona_id staff o null si fue automatic);
- capture_source: `manual`, `kiosk`, `qr_scan`, `link`, `import`, `system`;
- metadata (jsonb: contexto adicional bounded por kind, **sin PII sensible en claro**; para `visitor_capture` solo se persiste `match_method`, actor/source y `persona_id` resuelto — nunca la cédula cruda);
- retention_policy (referencia a Fase 1; los defaults específicos del Operating Core se difieren a Legal).

Toda operación de asistencia, inscripción, check-in, etc., genera un `participation_events`. Esto es lo que alimenta el historial longitudinal.

### 5. Capacidad base + capacidad operativa por instancia

`Capacity` se modela en dos niveles:

- **Capacity base**: por ambiente/grupo/salón/evento. Atributos: `max`, `kind`, `effective_from`, `effective_to`.
- **Capacity operativa por instancia**: por fecha + servicio + ambiente. Atributos: `max_override`, `reason`, `set_by`, `set_at`. Esto es **crítico** para Niños donde el límite real depende de voluntarios disponibles ese día.

Capacidad operativa es **manual** en el MVP. La setea el director/líder autorizado por `operating_core.capacity.manage` antes del evento. La autorización es scoped por Experience, con directores como grantees default; **no depende de un chequeo de string de rol**. La capacidad algorítmica basada en voluntarios asignados queda **diferida** a una fase posterior.

Reglas de validación:

- Sin override: el límite efectivo es `capacity_base`.
- Override por debajo de `capacity_base`: se persiste; alerta a los `capacity_managers` scoped; overflow waitlistable devuelve HTTP 200 `{ outcome: 'waitlisted' }`; overflow no-waitlistable devuelve 409 `{ code: 'capacity_exceeded' }`.
- Override por encima de `capacity_base`: se **rechaza** con error de validación de dominio. No se capa silenciosamente ni se persiste.

### 6. Formularios simples

`Form`:

- slug, título, descripción;
- owner_experience_id (qué experiencia lo usa);
- fields: array de `{key, type, required, options, hint}`;
- states: `draft`, `published`, `archived`;
- submissions: colección de respuestas `FormSubmission`;
- permisos: `form.view`, `form.submit`, `form.export`.

`type` válidos en esta fase: `text`, `email`, `phone`, `number`, `date`, `select`, `multiselect`, `checkbox`, `textarea`. NO lógica condicional pesada. NO firmas digitales. NO uploads.

### 7. Biblioteca simple de recursos

`Resource`:

- title, description, url, kind (link, file, video);
- area_experience_id (qué área lo usa);
- visible_to_roles (array de role global ids o capability ids);
- category, tags;
- created_by, created_at.

Sin tracking de cumplimiento, sin SCORM, sin analytics avanzados. Esto NO es LMS.

### 8. Notificaciones

`Notification`:

- recipient_person_id;
- kind: `system`, `email`;
- template_key (referencia a `lib/platform/operating-core/notifications/templates/` con versionado `<key>.vN`);
- payload (jsonb con datos del template);
- status: `pending`, `sent`, `failed`;
- sent_at (timestamp de envío del email), read_at (timestamp de lectura de la notificación de sistema).

Reglas:

- Outbox compartido: el Operating Core no introduce un motor de entrega paralelo. Reusa la infraestructura de outbox compartida con Dream Team (`support_event_outbox` como precedente).
- Plantillas versionadas en código, no editables desde UI. Una versión vieja NO se elimina hasta al menos 90 días después de su última emisión.
- Triggers requeridos: confirmación de inscripción, placement en waitlist, promoción desde waitlist, cancelación (al líder responsable o capability holder), reminder configurable (default T-24h), no-show (`no_asistio`).
- Email usa el `Resend` actual (ver `lib/email/` y `emails/`).
- Sistema: insert en tabla, render en dashboard.
- Retry con backoff exponencial acotado. Tras agotar el techo documentado, la fila pasa a estado terminal `failed`, observable por operadores autorizados.
- Sin SMS, sin WhatsApp API en esta fase.
- Link compartible: url firmada con TTL de 7 días (configurable) que permite completar formulario o confirmar asistencia sin cuenta.
- Retención de emails enviados: defaults **diferidos** a una decisión Legal/Product separada. NO se confunde con la retención de participación (que es decisión de Legal).

### 9. Dashboards operativos básicos

Tres vistas por dominio:

- **Director**: conteos (eventos próximos, inscripciones pendientes, alertas activas, items que requieren acción), tabla de items por atender.
- **Líder**: lista de miembros/participantes, próxima reunión, items pendientes del líder.
- **Operador (kiosk/portal)**: vista limitada al evento actual.

Los conteos se derivan del **ledger único** del Operating Core y distinguen **métricas de registration vs attendance**:

- Registration: conteos de `registration`, `cancellation`, `attendance_update`.
- Attendance: conteos de `attendance`, `check_in`, `check_out`.

El período operativo por defecto es hoy más la próxima ventana de ocurrencias; es configurable por vista pero siempre derivable del ledger. Los widgets del Operating Core se agregan como **sección aditiva con nombre explícito** sobre los dashboards existentes — los layouts de Fase 1/Fase 2 NO se rediseñan.

NO construir (diferido a Product/Ops):

- targets concretos de KPI operativos;
- analytics avanzados (ML, cohortes, churn, retención, predictivo);
- BI dashboards externos;
- reportes programados automáticos (Fase futura).

### 10. Integración segura con Grupos de Vida

`GruposVidaAttendanceAdapter`:

- consume el modelo de asistencia de Grupos de Vida **sin modificarlo**;
- emite `participation_events` con `kind='attendance'`, `experience_id` del grupo, y un `capture_source` que identifica el origen del bridge;
- respeta los campos existentes de Grupos de Vida;
- es **read-only** sobre tablas de Grupos de Vida (verificado: `lib/platform/adapters/grupos-vida.ts` 0 bytes diff post-Fase 2). El bridge NO emite `kind='registration'` desde el bridge path; `kind='attendance_update'` se reserva para correcciones de observaciones previas.
- **Start-clean**: el bridge observa solo capturas nuevas hacia adelante; NO hace backfill del historial de Grupos de Vida hacia el ledger del Operating Core.
- Un visitante nuevo en un domingo de Grupos de Vida se enruta por el adaptador de resolución de visitantes (`visitor-resolution.ts`), que emite `kind='visitor_capture'` (solo metadatos no-PII) antes del `attendance`.

Fase 3 NO agrega columnas a tablas de Grupos de Vida, NO modifica RLS de Grupos de Vida, NO toca los RPCs protegidos (incluido `buscar_usuarios_para_grupo`). El esquema propio del Operating Core es estrictamente **aditivo**, se aplica únicamente después de que la auditoría aprobada del Issue #103 (SECURITY DEFINER) cierre, y se ejecuta vía la rama de staging antes de cualquier merge a `main`.

### 11. Modelos derivados (decidir en SDD)

- `Waitlist`: cola de espera ordenada para eventos con capacidad. Persistida como filas `pendiente` con membresía ordenada; interactúa con promociones idempotentes de un slot por vez (cancelación o aumento de capacidad efectiva).
- `RepeatSeries`: eventos recurrentes (semanal, mensual) con `recurrence_rule` (subset cerrado de RRULE) y `EventInstance` materializado lazy/determinístico; los overrides por instancia no mutan la serie.
- `AttendanceAuditLog`: historial de cambios manuales de asistencia. Se materializa como filas `attendance_update` en el ledger con referencia `corrects_event_id`, no como tabla separada.
- `ReminderSchedule`: programación de recordatorios automáticos. El default configurable es T-24h. Se modela como jobs del outbox de notificaciones.

Las decisiones concretas de modelado (tablas reales vs derivación desde `participation_events` con `kind` específico) las cierra el SDD.

## Fuera de alcance

- Operación específica de Niños / Estudiantes / The Living Room / DPS.
- Migraciones destructivas a Grupos de Vida.
- Firma digital legal de consentimientos.
- Mensajería interna 1:1 entre usuarios.
- Integración WhatsApp API.
- Campamentos con pagos y becas (Fase 13).
- Hardware específico: tablets, kioscos, impresoras, etiquetas, QR scanning.
- Rediseño de dashboards existentes.
- Ruta Espiritual completa (Fase 11).
- Routing de la iglesia a nivel operativo (salas, logística) más allá de capacidad y eventos.
- Onboarding de voluntarios con cursos y evaluaciones (Fase 1 limitó esto).
- Self-service de padres y miembros (Fase 12).
- Analytics avanzado: cohortes, churn, tendencias.
- Decisión de producto sobre `uno_a_uno` (CLOSED como `archive`); reavivar esa decisión requiere un issue nuevo aprobado fuera del alcance de Fase 3.

## Investigación obligatoria en el repo

El agente debe investigar como mínimo:

- `lib/platform/**` completo (Fase 1 + Fase 2: session, persona, experiences, navigation, routeGuard, flags, family, adapters, preflight, participation, grants, rollout, auth-timeout).
- `lib/platform/dream-team/**` completo.
- `lib/supabase/database.types.ts` completo (5,491 líneas).
- `lib/actions/asistencia-avanzada.actions.ts` (302 líneas actualmente sin cobertura) y los `app/api/asistencia/**` si existen.
- `lib/actions/group.actions.ts` y `lib/actions/groupMember.actions.ts`.
- `lib/actions/support.actions.ts` y `lib/actions/support-capabilities.actions.ts` (referencia para patrón de formularios simples).
- `app/(auth)/dashboard/page.tsx` y `lib/dashboard/obtenerDatosDashboard.ts` (entender qué consume el dashboard hoy; los dashboards existentes de Fase 1/Fase 2 **no se rediseñan**; los widgets de Operating Core se agregan como sección aditiva).
- `app/(auth)/grupos-vida/**` y `lib/actions/configuracion-grupos-vida.actions.ts` (no tocar, solo entender; el adapter read-only del Operating Core vive en un módulo hermano).
- `lib/auth/requireAuth.ts`. (Nota: `lib/auth/requireRole.ts` no existe como archivo independiente; `requireRole` vive dentro de `lib/auth/requireAuth.ts`.)
- `hooks/useCurrentUser.ts` (Fase 2 fix #258).
- `app/api/dream-team/**` (Fase 2 API routes).
- `docs/grupos-vida.md` y `docs/dashboard-por-rol.md` (si existe).
- `docs/cambios-desde-ultimo-commit.md` y `docs/PR/` (si existen) para entender cambios recientes.
- Migraciones en `supabase/migrations/` con foco en:
  - las 8 tablas `dream_team_*` recién aplicadas (20260707183000);
  - tablas existentes de grupos, asistencia, eventos;
  - RPCs `buscar_usuarios_para_grupo`, `agregar_relacion_familiar_segura`, etc. (verificar firma).
- `scripts/smoke-*.mjs` y `scripts/test-*.mjs` (patrón de smoke tests).
- `docs/sdd-issue-99-...` y `docs/sdd-issue-102-...` (si existen) para entender Fase 1 ya implementada en main.
- `lib/platform/adapters/family.ts` y `lib/platform/adapters/participation-adapter.ts` (stubs a llenar).
- `lib/platform/dream-team/route-access.ts` para el patrón de auth + capability + flag.

Documentos fuente externos (solo si necesita validar necesidades de ministerios):

- `~/Documents/#Global/SISTEMA GDV/NiÑos validacion directores 2026.docx`
- `~/Documents/#Global/SISTEMA GDV/Estudiantes validación directores (1).docx`
- `~/Documents/#Global/SISTEMA GDV/The Living Room validación directores (1) (1).docx`
- `~/Documents/#Global/SISTEMA GDV/DPS validación directores.docx.pdf`

## Estado pre-fase actual (validado el 2026-07-13)

| Check | Estado |
|---|---|
| main HEAD | `9ced829` |
| Hotfixes post-Fase 2 | `#258` useCurrentUser timeout, `#260` DashboardLayout root, archive commit |
| Tests | 840 passing, 24 skipped (`integration:supabase`), 0 failed |
| TypeScript | `tsc --noEmit` exit 0 |
| `lib/platform/grants.ts` (3cf786d→main) | 0 bytes diff |
| `lib/platform/participation.ts` | 0 bytes diff |
| `lib/platform/navigation.ts` | 0 bytes diff |
| `lib/platform/routeGuard.ts` | 0 bytes diff |
| `lib/platform/persona.ts` | 0 bytes diff |
| `lib/platform/preflight.ts` | 0 bytes diff |
| `lib/platform/flags.ts` | 0 bytes diff |
| `lib/platform/adapters/grupos-vida.ts` | 0 bytes diff |
| `lib/supabase/database.types.ts` | 0 bytes diff |
| `buscar_usuarios_para_grupo` firma | intacta ({apellido, email, id, nombre, telefono, ya_es_miembro}) |
| Staging | 8 tablas `dream_team_*` + 1 helper |
| Producción | 0 tablas `dream_team_*` (intacta) |

## Pendientes heredados que deben resolverse en o antes de Fase 3

### Issue #103 (security, pre-Phase-2)

> "fix(security): auditar crear_grupo y RPCs security definer con p_auth_id".

Status: `priority:high`, `status:approved`, sin asignar. No bloquea Fase 3 por sí solo, pero la auditoria de RPCs `SECURITY DEFINER` debe ser **el primer PR de Fase 3** porque condiciona la seguridad de las nuevas APIs que Fase 3 va a crear.

### `uno_a_uno` decisión de producto — CLOSED

`lib/platform/preflight.ts` bloquea uso hasta que se llame `registerPlatformUnoAUnoDecision({ ok: true, decision: 'baseline' | 'archive' | 'reintroduce', evidence })`. **Decisión cerrada como `archive`** para Fase 3: no se invoca `registerPlatformUnoAUnoDecision` desde ningún artefacto de Fase 3; el preflight permanece bloqueado indefinidamente; la unión canónica de 11 kinds del Operating Core excluye `one_on_one_logged`. No hay trabajo técnico de Fase 3 asociado a esta decisión. Reabrirla requiere un nuevo issue aprobado fuera del alcance de Fase 3.

### Bug en `.github/workflows/pr-size.yml`

El workflow `PR Size Guard` corre con `on: pull_request`, no `pull_request_target`, y el snapshot de labels del evento original no incluye `size:exception` aplicada por `--label` después del `gh pr create`. Resultado: el check falla con `PR has 7189 changed lines` aunque la label esté aplicada. Re-triggers manuales confirman persistencia.

Recomendación: añadir `if:` que excluya PRs con `size:exception`. Es trabajo del equipo de repo, no del orquestador de Fase 3.

Recomendación de Fase 3: el primer PR de Fase 3 puede incluir un fix minimalista del workflow (1 línea `if:`) si el equipo de repo lo aprueba, o seguir documentando el workaround en el body del PR. Decisión del orquestador.

### `jest.config.ts` `coverageThreshold.branches: 3`

Aclaración numérica: Jest 30 interpreta `branches: 3` como **3%** (no 0.03%). El valor es válido; no es la causa de los fallos del suite. **Recomendación:** eliminar el bloque entero `coverageThreshold` como mejora de hygiene (el piso global aporta poca señal y los thresholds por módulo pertenecen a los criterios de aceptación de cada slice). Reducir a `branches: 0.03` no aporta beneficio práctico sobre la versión actual y por eso no se recomienda. El PR trivial de hygiene es el primer slice de Fase 3.

**Separado de eso**, el suite de cobertura falla por un timeout de cinco segundos en `__tests__/components/mobile-platform-navigation.test.tsx`, no por el threshold. Ese timeout es un prerrequisito de baseline verde y requiere su propio issue/PR aprobado (incrementar el timeout del test a 30s o corregir la lentitud subyacente). El baseline 840+ passing debe estar restaurado antes de cualquier slice de feature.

### `lib/platform/**` no está en `collectCoverageFrom`

A pesar de que los módulos tienen tests exhaustivos, no se miden contra threshold. Se sugiere incluir `lib/platform/**/*.ts` en el coverage target. Trivial en `jest.config.ts`.

### `lib/platform/adapters/participation-adapter.ts` coverage 48.33%

In-memory adapter tiene cobertura baja. Se sugiere incluir tests de in-memory para mantener contrato simétrico con Supabase writer.

### Retention defaults "pending legal review"

`lib/platform/participation.ts` tiene defaults marcados `pending legal review`. Operating Core debe **validar con legal** antes de aplicar cualquier tabla de DB que los use.

## Dependencias externas a Fase 3

- **Persona única** (Fase 1): completa.
- **Capabilities / grants** (Fase 1): completos. Nuevas capabilities de Operating Core se agregan al catálogo.
- **Grups de Vida adapter** (Fase 1): listo. Fase 3 solo lo invoca para integrar asistencia.
- **Dream Team + servicios** (Fase 2): completos. Fase 3 consume `DreamTeamRepository` para asignar equipos a eventos.
- **Participation events writer** (Fase 2): listo (Supabase writer). Fase 3 lo usa extensivamente.
- **Auth + flags** (Fase 1 + Fase 2): listos. Fase 3 añade `NEXT_PUBLIC_OPERATING_CORE_ENABLED` con su rollout propio.

## Preguntas que el agente debe responder

1. ¿Cómo se modela `Event` con su polimorfismo (kind) sin caer en una tabla genérica inmanejable?
2. ¿Cómo se integra la captura de Grupos de Vida sin modificar nada de Grupos de Vida?
3. ¿Cuál es el contrato de `Registration` y su ciclo de vida (pendiente → confirmada → asistida | no_asistio; pendiente → cancelada | rechazada; confirmada → cancelada; con asistida, no_asistio, cancelada y rechazada como terminales)?
4. ¿Qué hace el sistema cuando `capacity_operativa` se vacía o se contradice con la base?
5. ¿Cómo se elige entre `kind='attendance'` y `kind='registration'` en participation_ledger?
6. ¿Cuál es la UX mínima de captura por dominio: Niños (check-in), Grupos de Vida (lista del líder), Estudiantes (lista del líder), The Living Room (lista), DPS (coordinador), Talleres (inscripción)?
7. ¿Cómo se evita que un mismo `Registration` se cree dos veces por doble click o por dos líderes distintos?
8. ¿Cómo se relacionan `Event` y `DreamTeam` para asignar equipo responsable?
9. ¿Cómo se separa `Operating Core notifications` de `dream_team_notifications` (Fase 2) sin duplicar infraestructura?
10. ¿Cómo se prepara `Operating Core` para las siguientes fases (Niños, Estudiantes, etc.) sin anticipar UI específica?
11. ¿Cuál es la estrategia de RLS para nuevas tablas? (Fase 2 usa `auth_has_dream_team_capability` helper — Fase 3 debe seguir el patrón o proponer uno nuevo).
12. ¿Cómo se manejan eventos recurrentes (semanales) sin proliferación de filas?
13. ¿Cuál es el plan de coverage thresholds para las nuevas tablas?
14. ¿Qué hooks / signals disparan emails (inscripción confirmada, recordatorio, no-asistencia)?
15. ¿Cómo se versionan los `Notification` templates para evitar romper emails viejos?
16. ¿Cómo se gestionan los `Resource` cuando cambia el `area_experience_id`?
17. ¿Cuál es el patrón de retry de emails fallidos?

## Validación con ejemplos

El diseño debe soportar al menos estos 3 casos:

### Caso 1 — Domingo normal en Grupos de Vida

```text
Domingo 9am, Grupo "Familias en Victoria" (líder: Carlos).
- Carlos abre el dashboard y ve "Tomar asistencia" para este servicio.
- Marca presente a 12 personas; a María la dejó pendiente.
- El sistema genera participation_events(kind='attendance') para cada uno.
- Una persona nueva "Lucía" llega sin registro. Carlos la registra por nombre+teléfono → busca Persona → si no existe, crea mínima con autoMerge=false.
- Lucía queda registrada como nueva Persona + participation_event(kind='attendance', status='present').
- Fase 3 no crea ni agenda ningún artefacto 1:1 desde este flujo: el módulo 1:1 es Fase 4 y Fase 3 precede a Fase 4.
```

### Caso 2 — Taller de Crecimiento

```text
Director de Talleres crea taller "Teología Nivel 1" con cupo 20.
- Link público generado: https://gbc.app/taller/teologia-nivel-1?token=...
- 25 personas se inscriben por el link. Las primeras 20 quedan confirmadas. Las siguientes 5 quedan en waitlist.
- 2 días antes del taller: emails automáticos a confirmados y a waitlist ("estás en cola").
- Día del taller: líder toma asistencia. Sistema graba participation_events.
- Después del taller: líder registra completación. Sistema actualiza ruta espiritual.
- Si alguien cancela, pasa el siguiente de waitlist a confirmado (email automático).
```

### Caso 3 — Domingo Niños, ambiente con capacidad operativa

```text
Domingo 9am, ambiente "Upstreet 1er grado" (capacidad base 20).
- Director setea capacidad operativa 14 para este servicio (motivo: 2 voluntarios faltaron).
- Check-in: llegan 18 niños. Los primeros 14 pasan; 2 quedan en cola de espera; 2 van a otro salón (regla de capacidad operativa).
- Alertas automáticas al director: capacidad operativa alcanzada.
- Check-out: códigos de seguridad verificados por salón. Check-out genera participation_event(kind='check_out') y libera el slot al pool efectivo.
- Fase 3 no crea ni agenda ningún artefacto 1:1 con padres desde este flujo.
```

## Criterios de aceptación del diseño

- **Tubo único, UX diversa**: una sola `participation_events`, múltiples experiencias de captura.
- **Grupos de Vida intacto**: 0 bytes diff en `lib/platform/adapters/grupos-vida.ts`, 0 migraciones sobre tablas de Grupos de Vida, 0 cambios en su RLS.
- **Persona única preservada**: no se duplican personas; `autoMerge=false` por defecto; búsqueda de Persona antes de crear.
- **Capacidad operativa representable**: el modelo permite override por instancia con motivo.
- **Inscripciones confiables**: idempotencia por `(persona_id, event_id)`; cola de espera configurable; emails automáticos al cambiar estado.
- **Notificaciones verificables**: cada notificación emitida queda registrada con `status`, `sent_at`, `read_at`.
- **Recursos accesibles**: biblioteca simple con permisos por área/rol; sin tracking de cumplimiento.
- **Formularios reutilizables**: el mismo `Form` puede ser usado por varias experiencias vía `owner_experience_id`.
- **Dashboards operativos**: tres vistas (Director, Líder, Operador), sin analytics avanzados.
- **Trazabilidad**: `participation_events` lleva `captured_by` y `capture_source` en cada fila.
- **No romper nada existente**: `lib/platform/**` mantiene 0 bytes diff post-Fase 3.
- **Hardware opcional**: el sistema funciona sin impresoras, tablets ni QR.
- **Estricto TDD**: cada slice tiene tests RED-GREEN-REFACTOR verificables.

## Decisiones arquitectónicas clave que el SDD debe cerrar

| # | Decisión | Opciones |
|---|---|---|
| 1 | Polimorfismo de `Event` | tabla única + `kind` / tabla por kind / inheritance con discriminator |
| 2 | Forma del `participation_event` payload | jsonb libre / columnas específicas por kind / hibrid |
| 3 | Idempotencia de `Registration` | unique constraint `(persona_id, event_id)` / soft check / hash |
| 4 | Captura para Grupos de Vida | adapter pass-through / ETL batch / endpoint de sincronización |
| 5 | Capacidad operativa | hard-coded manual / algorithmic con dream team / mix |
| 6 | Templates de notificación | archivos en repo / DB / mix |
| 7 | Política de retención de `participation_events` | retención por `kind` / por `experience` / por evento / global |
| 8 | Auditoría de cambios de asistencia | append-only `attendance_audit_log` / nuevo `participation_event(kind='attendance_update')` |
| 9 | Strategy de RLS para tablas nuevas | helper Postgres por capacidad / policies por rol / mix |
| 10 | Strategy de feature flag | un flag global `OPERATING_CORE_ENABLED` / flag por sub-fase |
| 11 | Backfill / migration de datos existentes | ninguno (start clean) / backfill desde grupos_vida asistencia / mix |
| 12 | Cómo se desactiva un evento cancelado | soft delete / hard delete / cancel flag |
| 13 | Cobertura mínima por tabla nueva | 70/60/60/70 / 80/70/70/80 / decidida en SDD |
| 14 | Periodicidad de eventos recurrentes | materialización vs lazy generation vs hybrid |
| 15 | Cómo se mide `kind='attendance'` vs `kind='registration'` en dashboards | UI derivada del ledger / métricas precomputadas / mix |
| 16 | Cómo se notifica al líder cuando alguien cancela | in-app + email / solo email / solo in-app |
| 17 | Quién puede crear eventos | director / líder / operador / configurable |
| 18 | Cómo se gestiona el idioma de los emails | i18n via next-intl / solo español / mix |
| 19 | Política de retención de emails enviados | borrar tras N días / soft archive / forever |
| 20 | Cómo se mide el éxito de Fase 3 | KPIs operativos / tiempo de captura / adoption |

## Estructura sugerida de slices

Esta es una sugerencia, **no una restricción**. El SDD puede proponer otra distribución si está justificada.

1. **Slice 1 — Schemas contract-only (migración aditiva)**: nuevas tablas para `events`, `services`, `registrations`, `form_definitions`, `form_submissions`, `resources`, `notifications`. Sin UI. Sin RLS compleja (helper básico). Tests de contrato. **No se edita `lib/platform/{participation,flags}.ts`**: los nuevos kinds viven en `lib/platform/operating-core/participation-kinds.ts` y los flags en `lib/platform/operating-core/flags.ts`.
2. **Slice 2 — Repositorios + adapters**: `lib/platform/operating-core/repositories/*.ts` con contratos y fakes. Tests exhaustivos sin Supabase.
3. **Slice 3 — Participación ledger integration**: integrar el contrato público de `lib/platform/participation.ts` (solo lectura/escritura de los 7 kinds existentes) más los nuevos kinds aditivos en módulos hermanos. **El archivo `lib/platform/participation.ts` permanece byte-idéntico**; el read-guard del Operating Core vive en `lib/platform/operating-core/participation.ts` y refleja la regla de strict-equality scope de Fase 1.
4. **Slice 4 — Captura Grupos de Vida adapter**: integrar asistencia existente sin tocar Grupos de Vida. Read-only en `lib/platform/adapters/operating-core-grupos-vida.ts`. Start-clean (sin backfill histórico); emite solo `kind='attendance'` desde el bridge y `kind='attendance_update'` solo para correcciones.
5. **Slice 5 — Capture UX contracts**: contratos compartidos sobre el ledger (`specs/operating-core-capture-ux/spec.md`). Fase 3 no entrega UI de producción por dominio. Quick-mark y bulk-select funcionan sin hardware.
6. **Slice 6 — Formularios simples**: schema, render, submit, listado básico, alineado con los estados compartidos del Capture UX.
7. **Slice 7 — Recursos**: biblioteca, listado, detalle, ACL simple. Cambios de ownership archivan el registro previo y crean sucesor.
8. **Slice 8 — Notificaciones**: outbox compartido, plantillas versionadas en código (Español default), retry con backoff acotado. `read_at` en sistema, `sent_at` en email.
9. **Slice 9 — Dashboards operativos**: tres vistas (Director, Líder, Operador), conteos de registration y attendance derivados del ledger único y distinguidos normativamente. KPI targets/trends diferidos a Product/Ops.
10. **Slice 10 — Capacidad operativa**: base + override por instancia. Override above-base se rechaza (sin cap silencioso). Auth por `operating_core.capacity.manage` (directores default; sin role-string check).
11. **Slice 11 — Inscriptions + waitlist**: ciclo de vida completo con la state machine canónica (6 estados), modo automatic/manual por evento, waitlist ordenada, promoción idempotente de un slot por vez. 409 reservado.
12. **Slice 12 — Eventos recurrentes**: modelado de series con RRULE subset cerrado, materialización lazy, override por instancia sin mutación retroactiva de la serie.
13. **Slice 13 — Servicios configurables (multi-campus)**: schedule semanal distinto de Experience/Event/EventInstance; edición de schedule no muta ni duplica filas de Event.
14. **Slice 14 — Rollout flags + retrocompatibilidad**: `NEXT_PUBLIC_OPERATING_CORE_*`, kill switch, integración con `routeAccess` y `routeGuard` (todo en módulo hermano `lib/platform/operating-core/flags.ts`).

Cada slice debe ser un PR separado con su propio `type:*`, issue aprobado y tests. Si un slice supera 400 líneas, dividir o pedir `size:exception` (ya autorizado por defensa real de cohesión operativa).

## Riesgos principales

1. Sobrecargar el `participation_ledger` con kinds no previstos (afectar performance de queries por `kind`).
2. Implementar `Event` demasiado genérico y terminar con muchos `if (kind === 'X')` por todos lados.
3. Tocar accidentalmente Grupos de Vida o su RLS.
4. Crear más de un mecanismo de notificación (Fase 2 ya tiene uno para Dream Team).
5. Hacer migraciones que rompan Fase 1 o Fase 2.
6. Subir cobertura a costa de perder tiempo en features más importantes.
7. Crear formularios con lógica condicional compleja (contrario al principio "formularios simples").
8. Definir capacidad operativa sin validar con casos reales de Niños (capacidades variables).
9. Implementar self-service de inscripciones que escapa al principio "sin cuenta de usuario" para padres en esta fase.
10. Construir dashboards avanzados cuando el alcance es solo operacional.
11. Rediseñar Grupos de Vida accidentalmente.
12. Crear un sistema de emails paralelo al de Fase 2.
13. Acoplar Operating Core al calendario de Fase 14 (Logística de Voluntarios) cuando esos vienen después.
14. Activar `OPERATING_CORE_ENABLED` en producción antes de validar ≥7 días en staging.
15. Construir sobre `uno_a_uno` (decisión cerrada como `archive`; el módulo permanece bloqueado por preflight y la unión canónica de 11 kinds excluye `one_on_one_logged`).

## Stop conditions para el agente SDD

El agente debe detenerse y pedir nueva instrucción si:

- encuentra que debe migrar una tabla de Grupos de Vida o cambiar su RLS;
- encuentra que la firma de `buscar_usuarios_para_grupo` u otra RPC preexistente no coincide con el contrato esperado;
- un PR de Fase 3 supera 400 líneas sin poder dividirse limpiamente;
- necesita aplicar migraciones riesgosas (DROP, ALTER sobre tablas preexistentes);
- reabrir la decisión cerrada de `uno_a_uno` (que ya está en `archive`);
- el workflow `pr-size.yml` no permite merge aunque el código esté limpio;
- cualquier inconsistencia con los principios no negociables.

## Validación contra roadmap

Cada bullet del objetivo de Fase 3 en el roadmap maestro debe tener correspondencia directa con las **14 capabilities** del cambio `fase-03-operating-core`. Las specs viven en paths locales del cambio:

```
openspec/changes/fase-03-operating-core/specs/<capability>/spec.md
```

| Bullet roadmap | Capability (spec local) |
|---|---|
| servicios configurables (multi-iglesia, multi-campus) | `operating-core-services` |
| eventos / actividades / talleres | `operating-core-events` |
| inscripciones asistidas o por link público | `operating-core-registrations` |
| búsqueda de persona antes de crear (visitor-resolution) | `operating-core-visitor-resolution` |
| attendance / participation ledger | `operating-core-participation-ledger` |
| experiencias de captura específicas (contratos compartidos sobre el ledger) | `operating-core-capture-ux` |
| capacidad base y operativa | `operating-core-capacity` |
| formularios simples | `operating-core-forms` |
| biblioteca de recursos | `operating-core-resources` |
| notificaciones en sistema y email | `operating-core-notifications` |
| dashboards operativos básicos | `operating-core-dashboards` |
| eventos recurrentes (RRULE subset, materialización lazy) | `operating-core-recurrent-events` |
| integración read-only con Grupos de Vida | `operating-core-grupos-vida-bridge` |
| superficie de API (auth + capability + flag) | `operating-core-api-surface` |

Las 14 capabilities son: `operating-core-events`, `operating-core-services`, `operating-core-visitor-resolution`, `operating-core-registrations`, `operating-core-participation-ledger`, `operating-core-capacity`, `operating-core-forms`, `operating-core-resources`, `operating-core-notifications`, `operating-core-dashboards`, `operating-core-capture-ux`, `operating-core-recurrent-events`, `operating-core-grupos-vida-bridge`, `operating-core-api-surface`.

## Validación contra Fase 1

- `lib/platform/**` intacto (verificado: 0 bytes diff en módulos críticos tras Fase 2). Los módulos protegidos (`lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags}.ts` y `lib/platform/adapters/grupos-vida.ts`) **no se editan**. Operating Core añade nuevos kinds, flags y lectores en **módulos hermanos** (`lib/platform/operating-core/participation-kinds.ts`, `lib/platform/operating-core/flags.ts`, `lib/platform/operating-core/capture-ux.ts`, etc.) — la identidad byte-a-byte se mantiene.
- `Persona` se usa como `persona_id`, no se duplica.
- `lib/platform/experiences.ts` se extiende **aditivamente** (no es parte de la lista de protegidos) si Fase 3 introduce nuevas capabilities.
- `lib/platform/grants.ts` se consume para auditar grants nuevos.
- `lib/platform/preflight.ts` sigue bloqueando `uno_a_uno` (decisión cerrada como `archive`; no se invoca `registerPlatformUnoAUnoDecision` desde Fase 3).

## Validación contra Fase 2

- `lib/platform/dream-team/**` se consume para asignar equipos responsables a eventos. Ningún archivo bajo `lib/platform/dream-team/**` se edita.
- `lib/platform/dream-team/repository-supabase.ts` sirve como referencia de patrones para los repositorios de Operating Core (espejo de forma, no de archivo).
- `lib/platform/adapters/participation-adapter.ts` **no se extiende** con nuevos kinds de Operating Core. El writer del Operating Core vive en un módulo hermano (`lib/platform/operating-core/repositories/participation-supabase.ts`) y consume el contrato público de `lib/platform/participation.ts` para eventos del Fase 1, mientras que los kinds aditivos (`visitor_capture`, `attendance_update`, etc.) tienen su propio writer y read-guard en `lib/platform/operating-core/`.
- `app/api/dream-team/**` no se modifica.
- La firma del RPC `buscar_usuarios_para_grupo` permanece intacta (`(p_auth_id uuid, p_grupo_id uuid, p_query text, p_limit integer DEFAULT 10)` → `TABLE(id uuid, nombre text, apellido text, email text, telefono text, ya_es_miembro boolean)`).

## Reporte requerido al finalizar el SDD

```text
status:
issue:
artefactos_creados:
evidencia_investigada:
decisiones_propuestas:
decisiones_pendientes_para_equipo_de_repo:
riesgos:
dependencias:
fuera_de_alcance:
validacion_contra_roadmap:
validacion_contra_fase_1:
validacion_contra_fase_2:
plan_de_slices_estimado:
preguntas_abiertas:
siguiente_recomendado:
```

## Reglas de implementación (cuando se apruebe el SDD)

- Strict TDD activo.
- No tocar producción.
- No rediseñar Grupos de Vida ni su RLS.
- No usar `uno_a_uno` (`archive` cerrado; preflight permanece bloqueado; `one_on_one_logged` excluido de la unión de 11 kinds).
- No migraciones destructivas; toda migración es aditiva y solo se aplica después de cerrar la auditoría aprobada del Issue #103 (SECURITY DEFINER).
- No ampliar alcance del slice aprobado.
- Cada PR debe tener issue aprobado, label `type:*` único, checks verdes, tests relevantes y `size:exception` documentada si excede 400 líneas.
- Detenerse si requiere migraciones riesgosas, producción, Fase 4+, cambios de arquitectura o rediseño de Grupos de Vida.
- Antes de merge a `main`: verificar `git diff` sobre `lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags}.ts`, `lib/platform/dream-team/**`, `lib/platform/adapters/grupos-vida.ts`, `lib/supabase/database.types.ts` (solo `buscar_usuarios_para_grupo` byte-idéntico) y tablas preexistentes de Grupos de Vida. **No se editan los módulos protegidos**; Operating Core añade módulos hermanos.
- Después del merge: validar staging ≥7 días antes de producción.

## Documentos que el agente debe leer antes de trabajar

1. `docs/roadmap/globalconnect-roadmap-maestro-v1.md`
2. `docs/roadmap/handoffs/fase-01-platform-foundation.md`
3. `docs/roadmap/handoffs/fase-02-dream-team-base.md`
4. este handoff
5. `docs/roadmap/handoffs/fase-02-rollout.md`
6. `lib/platform/**` completo + tests
7. `openspec/changes/fase-01-platform-foundation/**`
8. `openspec/changes/fase-02-dream-team-base/**`
9. `openspec/specs/platform/dream-team/**` (consolidado)
10. Documentos externos de ministerios si necesita validar requisitos concretos.

## Nota final para el orquestador

No lanzar implementación directa desde este handoff. Primero el agente debe producir los artefactos SDD y vos los revisás. Luego, con el plan de slices aprobado, se mergea slice por slice contra `main` con el patrón `stacked-to-main` que funcionó en Fase 2.

Recomiendo que el primer PR de Fase 3 resuelva hygiene crítico: eliminación del bloque `coverageThreshold` en `jest.config.ts` (como mejora de hygiene; el valor `3` es válido en Jest 30, pero el piso global aporta poca señal). El fix del workflow `pr-size.yml` queda fuera del alcance del orquestador de Fase 3 — lo decide el equipo de repo.

Estado de las dos llaves que bloqueaban el SDD:

- **`uno_a_uno` = `archive` (CLOSED).** Preflight en `lib/platform/preflight.ts` permanece bloqueado indefinidamente; la unión canónica de 11 kinds del Operating Core excluye `one_on_one_logged`. No hay trabajo técnico de Fase 3 asociado a esa decisión.
- **Orden Fase 3 ↔ Fase 4: Fase 3 primero (CLOSED).** Si Fase 4 comparte el ledger, su unión se extenderá vía migración aditiva. Fase 3 se diseña sin esa restricción.

El esquema propio del Operating Core es estrictamente aditivo y se aplica únicamente después de que la auditoría aprobada del Issue #103 cierre. El baseline verde (840+ tests) debe estar restaurado — incluyendo el fix independiente del timeout de `mobile-platform-navigation.test.tsx` — antes del primer slice de feature.

Estado actual: **listo para planificar Fase 3** sin llaves pendientes; las decisiones cerradas son invariantes.
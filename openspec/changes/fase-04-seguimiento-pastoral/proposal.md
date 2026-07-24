# Proposal — Fase 4: Seguimiento Pastoral (1:1 + Tríada)

## 1. Contexto

Fase 4 materializa la **estación 4 de la ruta espiritual** sobre el cimiento ya construido de Fases 1 a 3. Su propósito pastoral es que el acompañamiento pastoral **no dependa solo de la memoria del líder** y **nunca se convierta en un dato más**: la plataforma registra y sugiere, los mentores validan.

Tres principios rectores cerrados con el pastor (`docs/REUNION_PASTOR_ROADMAP.html`):

- **El sistema sugiere, el mentor valida.** Ningún artefacto de F4 puede "promover" un paso espiritual sin un líder con rol formal.
- **Dos vistas, una sola verdad.** Panel oculto del mentor (notas privadas, hitos) + vista pública del usuario (roadmap agregado). La persona nunca ve notas privadas.
- **Todo lo que empieza debe terminar.** 1:1 y tríadas no pueden quedarse en estado intermedio sin motivo.

Regla operativa: **mantenerlo simple, sin workflows pesados** (`docs/roadmap/globalconnect-roadmap-maestro-v1.md:129`). F4 introduce 1:1 y Tríada como relaciones pastorales nuevas, sin tocar Grupos de Vida, sin mensajería interna, sin detalles sensibles profundos.

## 2. Outcome medible

Al cerrar F4 el sistema puede:

- Registrar cada 1:1 con fecha, mentor oficial, asistido(s) y resumen general bounded (500 caracteres), sin datos sensibles profundos.
- Resolver el mentor oficial por la cascada GDV → taller → servicio con GDV como ganador. **Una persona solo puede estar en un grupo de vida activo por temporada activa (P1);** la asignación es **automática, sin confirmación del líder (P2)** y la persona **no puede rechazarla (P3)**.
- Crear la tríada por **nuevo paso de manera automática** cuando la persona toma un nuevo paso espiritual (inscripción a taller, bautismo, inscripción a servicio), sin acción manual de un líder (P4).
- Visibilizar la tríada como articulación entre persona, mentor oficial y un tercer actor pastoral (coordinador de área o líder del nuevo paso). En la tríada por simultaneidad, el coordinador del área **no ve** las notas privadas del líder de grupo de vida: la conversación pastoral queda entre los dos líderes (P7).
- Cerrar todo lo que abre: 1:1 y tríadas no quedan en estado intermedio sin motivo obligatorio.
- Modelar la pareja que toma 1:1 como un **único registro** con dos participantes y un único resumen compartido (P8). Los hitos compartidos son solo los generados por **grupos de matrimonio**; el resto del avance es individual (P9).
- Producir **métricas básicas** en el dashboard del líder: conteo de 1:1 por período, líderes más activos, distribución de tríadas por tipo, alarmas de personas en grupo de vida sin 1:1 en los últimos noventa días. Una página dedicada de métricas es tarea de fase futura.
- Mantener el principio pastoral: la persona ve **solo el roadmap agregado** (fechas, hitos validados, próximo paso sugerido). **Nunca** ve notas privadas del mentor (P6).
- Detectar automáticamente **palabras clave de crisis pastoral seria** al cierre de un 1:1 y emitir una alerta al pastor o administrador con permiso completo, sin alterar el contenido de la nota original (P16).

## 3. Capacidades / contratos

Estas son las capabilities del nuevo `experience: 'pastoral'`. La fase `sdd-spec` las traduce a delta specs en `openspec/changes/fase-04-seguimiento-pastoral/specs/<name>/spec.md`.

### 3.1 Capacidades nuevas

| Capability key | ScopeType | Descripción contractual |
|---|---|---|
| `pastoral.one_on_one.create` | `one_on_one` | Crear 1:1 individual o de pareja. La asignación del mentor oficial es automática por cascada (P2) y la persona no puede rechazarla (P3). |
| `pastoral.one_on_one.read` | `one_on_one` | Leer 1:1 con tres círculos: persona acompañada solo roadmap agregado (P6), líder creador ve todo, director inmediato y pastor/admin con permiso completo ven detalles. |
| `pastoral.one_on_one.write_notes` | `one_on_one` | Escribir notas privadas del mentor. Restringido al autor del 1:1. |
| `pastoral.one_on_one.validate_step` | `one_on_one` | Validar un paso espiritual dentro de un 1:1. Solo el mentor oficial. El permiso `pastoral.read.all` no habilita esta acción (P5). |
| `pastoral.one_on_one.complete` | `one_on_one` | Cerrar 1:1 como `completado` con `resumen` bounded obligatorio. Para parejas, un único resumen compartido (P8). |
| `pastoral.triada.create` | `triada` | Crear tríada (cardinalidad 3 fija). La tríada por nuevo paso se crea automáticamente al tomar el nuevo paso (P4). |
| `pastoral.triada.read` | `triada` | Leer tríada con cuatro círculos: persona acompañada solo roadmap; miembros ven roadmap más hitos sin notas privadas; director inmediato en formato agregado; pastor/admin con permiso completo ve detalles. |
| `pastoral.triada.write_notes` | `triada` | Notas privadas del mentor oficial (solo el mentor autor más `pastoral.read.all`). En tríada por simultaneidad, el coordinador del área no ve estas notas (P7). |
| `pastoral.triada.disband` | `triada` | Disolver tríada con motivo obligatorio. Solo el mentor oficial. |
| `pastoral.mentor.cascade.resolve` | `experiencia` | Resolver mentor oficial por cascada GDV → taller → servicio, con un único grupo de vida activo por temporada (P1). |
| `pastoral.read.all` | `experiencia pastoral` | Permiso único para pastor y administrador: lectura completa de todo 1:1 y toda tríada, sin capacidad de validar pasos (P5). |
| `pastoral.crisis.detect` | `experiencia pastoral` | Detectar palabras clave de crisis pastoral seria al cierre de un 1:1 y emitir alerta automática al pastor o administrador (P16). La nota original queda intacta. |

### 3.2 Capacidades modificadas

Ninguna. **Las capabilities existentes de F1, F2 y F3 no se reabren.** F4 extiende `PLATFORM_CAPABILITIES` en `lib/platform/experiences.ts` aditivamente.

### 3.3 Experiencia y scopeType nuevos

F4 introduce `experience: 'pastoral'` y `scopeType: 'one_on_one' | 'triada'` en `PLATFORM_EXPERIENCES_CATALOG` (extensión aditiva, no edición de los archivos protegidos).

### 3.4 Modelo de participación (13 kinds nuevos más el de crisis)

Todos con `sensitivity = 'internal'`, salvo `pastoral_crisis_detected` que se registra con `sensitivity = 'sensitive'` por la naturaleza del evento (P16). Viven en `lib/platform/pastoral/participation-kinds.ts` (sibling), nunca en `lib/platform/operating-core/kinds.ts` (protegido). Se escriben vía la **misma tabla `operating_core_participation_eventos`** de Fase 3 con `kind` con prefijo `pastoral_`:

```text
pastoral_one_on_one_logged               -- se programó un 1:1
pastoral_one_on_one_completed            -- se cerró con resumen
pastoral_one_on_one_cancelled            -- se canceló con motivo
pastoral_one_on_one_note_logged          -- mentor agregó nota privada (no vista pública)
pastoral_one_on_one_followup_set         -- se asignó seguimiento
pastoral_one_on_one_followup_completed   -- se cumplió el seguimiento
pastoral_one_on_one_step_validated       -- mentor validó un paso espiritual
pastoral_triada_formed                   -- tríada activa
pastoral_triada_member_added             -- entró un nuevo actor
pastoral_triada_member_removed
pastoral_triada_disbanded                -- tríada cerrada con motivo
pastoral_triada_step_suggested           -- sistema sugirió un paso (pendiente de validación)
pastoral_triada_step_validated           -- mentor validó un paso durante tríada
pastoral_crisis_detected                 -- se detectó palabra clave de crisis al cierre de un 1:1 (P16)
```

## 4. Restricciones de no-regreso (decisiones cerradas)

### 4.1 Decisiones pastorales cerradas (no se reabren)

| # | Decisión | Fuente |
|---|---|---|
| **PC-1** | 1:1 siempre por **líder inmediato** de la persona (líder GDV, líder de taller o coordinador de servicio). | `REUNION_PASTOR_ROADMAP.html:2100` |
| **PC-2** | Cascada del mentor en **3 niveles**: GDV > grupo de corto plazo > servicio. **GDV pesa más**. | `REUNION_PASTOR_ROADMAP.html:1934-1937` |
| **PC-3** | **Mentores no oficiales excluidos**: los elegidos sin rol formal no entran al sistema. | `REUNION_PASTOR_ROADMAP.html:1940` |
| **PC-4** | 1:1 contiene solo **reportes generales**, nada de detalles pastorales sensibles profundos. | `REUNION_PASTOR_ROADMAP.html:1956`; roadmap maestro línea 125 |
| **PC-5** | Tríada visibiliza al **líder actual + mentor oficial + un tercer actor pastoral**. | `REUNION_PASTOR_ROADMAP.html:1949-1952` |
| **PC-6** | **Sistema sugiere, mentor valida**. Las decisiones de progreso nunca las toma la plataforma sola. | `REUNION_PASTOR_ROADMAP.html:1907` |
| **PC-7** | **Dos vistas, una fuente**: panel oculto del mentor + vista pública del roadmap del usuario. | `REUNION_PASTOR_ROADMAP.html:1956` |
| **PC-8** | **"Todo lo que empieza debe terminar"**: motivos auditables al cerrar o disolver. | Decisión pastoral explícita |
| **PC-9** | La **iglesia asigna el mentor**. La persona no puede pedir cambio unilateral. La asignación es automática por cascada y no requiere confirmación de líder; tampoco admite rechazo de la persona. | Confirmación pastoral P2 y P3 |

### 4.2 Decisiones tentativas resueltas en la fase de specs

Las decisiones marcadas como **(tentativa — ajustar si procede)** quedaron confirmadas con el pastor y el equipo pastoral durante la fase de specs. La traza completa vive en §4.4. Resumen ejecutivo:

- **Pareja como único `one_on_one`** con dos participantes y un único resumen compartido: confirmado (P8).
- **Tríada con cardinalidad 3 fija**: confirmado. La tríada por nuevo paso se crea de forma automática cuando la persona toma ese paso (P4).
- **Notificación al programar el 1:1**: confirmado. Se entrega a **ambos** (líder y asistido) por el buzón compartido de Fase 3, con plantilla `pastoral.one_on_one_scheduled.v1` (P10).
- **Recordatorio del 1:1**: confirmado, en MVP y para **ambos**, vía correo electrónico y WhatsApp. La notificación push queda como **tarea futura**, fuera del MVP (P11).
- **Motivo obligatorio** al cancelar o disolver un 1:1 o una tríada: confirmado. Catálogo cerrado, mismo patrón que `DREAM_TEAM_MOTIVOS` de Fase 2.
- **Detección de palabras clave de crisis pastoral** al cierre del 1:1: confirmado y promovido al **MVP** con la nueva capacidad `pastoral.crisis.detect` (P16). El alertamiento automático al pastor o administrador reemplaza la idea previa de escalada manual.

### 4.3 Decisiones heredadas de F1/F2/F3 (no se reabren)

- **F4 preserva byte-identidad** de: `lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags,family}.ts`, `lib/platform/dream-team/**`, `lib/platform/operating-core/{kinds,state,capture-states,participation-read-guard,capture-ux-types,types}.ts`, `lib/platform/adapters/grupos-vida.ts`. F4 añade solo en `lib/platform/pastoral/**`.
- `uno_a_uno=archive` sigue bloqueado en `lib/platform/preflight.ts`. F4 NO invoca `registerPlatformUnoAUnoDecision`.
- `buscar_usuarios_para_grupo` firma intacta.
- Multi-tenant OUT of MVP.
- RLS con helper Postgres `auth_has_pastoral_capability(p_capability_key text)`, patrón `auth_has_dream_team_capability` y `auth_has_operating_core_capability`.
- Append-only audit log vía nueva fila de participación (no mutación).
- Feature flags con kill switch call-time: `NEXT_PUBLIC_PASTORAL_*` siblings a `lib/platform/operating-core/flags.ts` (no edit del archivo protegido).
- Strict TDD: tests primero, RED → GREEN → REFACTOR con cobertura (Jest 30 + RTL).
- Migraciones DDL aditivas: cero `DROP`, cero `ALTER` sobre tablas preexistentes.
- `version + 409` en transiciones de estado (precedente Fase 2).
- F4 reusa el **outbox compartido de F3** (`lib/platform/operating-core/notification-outbox/`) para notificaciones pastorales con `template_key: 'pastoral.*'`.

### 4.4 Decisiones pastorales confirmadas en la fase de specs (P1–P16)

Las decisiones de esta tabla se firmaron con el pastor y el equipo pastoral durante la reunión de specs de Fase 4. **No se reabren** en esta iteración. Cada decisión aterriza en al menos un requisito o escenario de los specs aditativos (§4.5 lista de specs modificados).

| # | Decisión confirmada | Traducción en el sistema |
|---|---|---|
| **P1** | Una persona solo puede estar en **un grupo de vida activo por temporada activa**. Grupos de vida inactivos o temporadas pasadas no cuentan. | La cascada del mentor trabaja contra una única membresía activa de grupo de vida. Si llegara más de una, la cascada se queda con la activa y descarta el resto. `pastoral-mentor-cascade` no necesita regla de desempate. |
| **P2** | La asignación del mentor oficial es **automática**, **sin confirmación del líder**. | El flujo de creación del 1:1 no expone paso de confirmación para el líder. `pastoral-mentor-cascade` se evalúa on demand cada vez que se necesita un mentor, sin cachear confirmaciones. |
| **P3** | La persona **no puede rechazar** la asignación del mentor oficial. | El sistema no ofrece una vía para que el asistido solicite un mentor alternativo. La iglesia asigna; el asistido ora y acompaña. |
| **P4** | La tríada por nuevo paso se **crea automáticamente** cuando la persona toma un nuevo paso (inscripción a taller, bautismo, inscripción a servicio). | `pastoral-triada-create` se dispara desde el evento pastoral de paso tomado, no desde una acción manual del líder. Si ya existe una tríada activa para esa persona, el sistema orienta a una conversación pastoral en lugar de crear una duplicada. |
| **P5** | `pastoral.read.all` es una **capacidad única** para pastor y administrador. Habilita lectura completa; **no habilita** validar pasos (separación leer vs validar). | El permiso `pastoral.read.all` se entrega por defecto al pastor y al administrador. Toda acción de validación se rechaza cuando el actor solo tiene esa capacidad. |
| **P6** | La persona acompañada ve **solo el roadmap agregado** del 1:1 (fechas, hitos validados, próximo paso sugerido). **No** ve notas privadas del mentor ni detalles pastorales. | `pastoral-one-on-one-read` aplica un círculo reducido para la persona: campos públicos únicamente. El rechazo a campos privados se ejecuta en la consulta, no en la vista. |
| **P7** | En la tríada por simultaneidad, el coordinador del área **no ve** las notas privadas del líder de grupo de vida. Solo ve hitos validados y el roadmap agregado. La conversación pastoral privada queda entre los dos líderes y, en última instancia, el pastor o administrador con `pastoral.read.all`. | `pastoral-triada-read` y `pastoral-triada-notes` filtran el círculo del coordinador del área para excluir las notas del mentor oficial autor, sin alterar la regla general de miembros. |
| **P8** | Una pareja que toma 1:1 comparte **un único registro de 1:1** con dos participantes y un único resumen bounded 500 caracteres. | `pastoral-one-on-one-create` admite uno o dos participantes como pareja. `pastoral-one-on-one-complete` exige un único `resumen` para todos. El ciclo de vida y las notificaciones son compartidas para la pareja. |
| **P9** | La pareja comparte **únicamente los hitos generados por grupos de matrimonio**. Los hitos individuales (trayectoria personal) permanecen independientes por persona. | `pastoral-one-on-one-read` filtra los hitos por tipo de evento: solo los hitos de grupo de matrimonio se proyectan como compartidos en el roadmap de ambos. |
| **P10** | Al programar un 1:1, **ambos** reciben notificación: el líder y el o los asistidos. Disparador: buzón compartido de Fase 3, plantilla `pastoral.one_on_one_scheduled.v1`. | `pastoral-notifications` entrega a las dos audiencias. La plantilla declara ambos destinatarios en el mensaje. |
| **P11** | El recordatorio del 1:1 llega a **ambos**. **Canales en MVP:** correo electrónico y WhatsApp. La notificación push queda como **tarea futura**, fuera del MVP. | `pastoral-notifications` define los canales y la audiencia del recordatorio. La notificación push se documenta como deuda explícita para una fase posterior. |
| **P14** | Si la persona **no está en grupo de vida**, ni en taller, ni sirviendo, **no tiene mentor oficial**. Las ramas parciales conservan el mentor del único contexto activo: solo servir → coordinador del servicio; solo taller → líder del taller. | `pastoral-mentor-cascade` define el resultado explícito de ausencia de candidato, y las ramas "solo servir" y "solo taller" como productos válidos. `pastoral-one-on-one-create` no se invoca cuando la cascada devuelve ausencia. |
| **P15** | Mudanza y multi-iglesia quedan **fuera del MVP** de Fase 4. Las tablas pastorales referencian la persona canónica de Fase 1 sin campos de iglesia o campus. Cuando multi-iglesia llegue, se agregará por migración aditiva. | Ninguna migración de F4 introduce `church_id`, `campus_id` ni `tenant_id`. La deuda queda explícita en §12 (R5). |
| **P16** | El sistema **detecta palabras clave de crisis pastoral seria** durante el cierre del 1:1 y alerta automáticamente al pastor o administrador con permiso completo. | Nueva capacidad `pastoral.crisis.detect`. Spec `pastoral-crisis-keywords` describe el catálogo cerrado, el disparador y el evento pastoral `pastoral_crisis_detected` en el libro mayor compartido. La nota original queda intacta; el alertamiento es adicional. |

P12 (objetivo pastoral medible) y P13 (visibilidad de métricas en tablero público) se resuelven en §11: métricas básicas en el dashboard del líder, **sin tablero público**. No se reabren.

### 4.5 Lista de specs modificados y nuevos por P1–P16

Esta tabla conecta cada decisión confirmada con el spec concreto que la traduce. Sirve como mapa de trazabilidad para code review.

| Decisión | Spec que la aterriza |
|---|---|
| P1 | `pastoral-mentor-cascade` (un único grupo de vida activo) |
| P2 | `pastoral-mentor-cascade` + `pastoral-one-on-one-create` (sin confirmación) |
| P3 | `pastoral-one-on-one-create` (no expone rechazo) |
| P4 | `pastoral-triada-create` (creación automática por nuevo paso) |
| P5 | `pastoral-read-all` + `pastoral-one-on-one-validate-step` (separación leer/validar) |
| P6 | `pastoral-one-on-one-read` (círculo del asistido solo roadmap) |
| P7 | `pastoral-triada-read` + `pastoral-triada-notes` (coordinador sin notas del líder) |
| P8 | `pastoral-one-on-one-create` + `pastoral-one-on-one-complete` (un solo resumen) |
| P9 | `pastoral-one-on-one-read` (hitos de grupo de matrimonio compartidos) |
| P10 | `pastoral-notifications` (notificación al programar, ambos) |
| P11 | `pastoral-notifications` (recordatorio, ambos, canales del MVP) |
| P14 | `pastoral-mentor-cascade` (rama sin candidato) |
| P15 | Restricción transversal sin spec propio (deuda documentada en §12) |
| P16 | Spec nuevo `pastoral-crisis-keywords` + `pastoral-experience` (capacidad nueva) |

## 5. Prerrequisitos

Antes del primer PR de feature de F4, `main` debe tener:

- [ ] **Issue #103 cerrado** (auditoría SECURITY DEFINER de RPCs con `p_auth_id`). F4 introduce nuevos RPCs con RLS y debe respetar el patrón fijado.
- [ ] **Baseline verde** restaurado: `pnpm test` pasa y `mobile-platform-navigation.test.tsx` con timeout resuelto (precedente F3 hygiene).
- [ ] **Fase 3 mergeada a `main`** con sus 24 slices (S00–S23).
- [ ] **`coverageThreshold`** saneado en `jest.config.ts` (acción de hygiene ya recomendada por F3).
- [ ] **`workflow pr-size.yml`** label-timing resuelto (o trabajo aceptado como `size:exception` explícito, fuera del alcance de F4).

## 6. Modelo de seguridad y permisos

F4 introduce **círculos de visibilidad** que respetan el principio pastoral "no exponer lo sagrado como dato". Las decisiones P5, P6 y P7 rigen el reparto:

| Actor | Qué ve | Capacidad requerida |
|---|---|---|
| **Persona acompañada (asistido)** | Su propio roadmap agregado del 1:1 (fechas, hitos validados, próximo paso sugerido) y su tríada como vista pública. **Nunca** notas privadas del mentor ni detalles pastorales (P6). | Lectura agregada por experiencia pastoral; sin capacidad de administración. |
| **Líder creador del 1:1 / mentor oficial** | 1:1 que creó con todo su contenido (incluye sus notas privadas); tríadas donde es mentor oficial. Escribe sus notas privadas y valida pasos. | `pastoral.one_on_one.{read,write_notes,validate_step}` y `pastoral.triada.{read,write_notes,disband}` |
| **Otro miembro de la tríada** | Hitos validados y roadmap agregado; **no** ve las notas privadas del mentor oficial autor. En tríada por simultaneidad, esto incluye al coordinador del área, que además **no ve** las notas del líder de grupo de vida (P7). | `pastoral.triada.read` |
| **Director inmediato del área** | Lectura agregada de 1:1 y tríadas de su equipo (sin notas privadas y sin capacidad de validar). | Capacidad de lectura agregada por experiencia. |
| **Pastor o administrador con permiso completo** | Lectura completa: notas privadas, hitos validados, motivos, historial. **No valida pasos** (eso sigue siendo exclusivo del mentor oficial — P5). | `pastoral.read.all` |

Reglas duras (cubiertas por tests):

- Toda escritura pastoral exige un actor con rol pastoral formal. La persona **nunca** se autovalida pasos.
- Notas privadas filtran por autor más `pastoral.read.all`. Los demás miembros de la tríada no las ven, incluido el coordinador del área en tríadas por simultaneidad (P7).
- El reporte `resumen` bounded a 500 caracteres; validador rechaza patrones sensibles (documentos, salud mental, confesiones).
- La capacidad `pastoral.read.all` **no** habilita validar pasos, aunque la persona sea pastor (P5). La validación sigue siendo exclusiva del mentor oficial del 1:1 o de la tríada.

## 7. Modelo de tríada

Cardinalidad 3 fija (confirmada). Tres roles:

| Rol | Quién | Notas |
|---|---|---|
| **`asistida`** | La persona acompañada | Una por tríada. |
| **`mentor_oficial`** | Líder inmediato (resuelto por cascada GDV → taller → servicio) | Inmutable mientras la tríada esté `activa`. Otros miembros rotan, el mentor oficial no. |
| **`tercer_actor`** | Coordinador de área (simultaneidad) o líder del nuevo paso (nuevo paso) | Rota por `pastoral_triada_member_added` / `removed`. |

### 7.1 Tríada por nuevo paso

Cuando la persona toma un nuevo paso (taller, bautismo, área de servicio): la tríada se **crea automáticamente** desde el evento pastoral de paso tomado (P4). Entra el líder del nuevo paso como tercer actor. La tríada visibiliza la articulación entre el mentor actual y el líder del paso siguiente.

### 7.2 Tríada por simultaneidad

Si la persona asiste a GDV y también sirve en un área: el coordinador del área entra como tercer actor. El mentor oficial sigue siendo el líder de GDV (porque pesa más). La tríada visibiliza la conversación pastoral entre los dos líderes.

**P7 —** En la tríada por simultaneidad, el coordinador del área **no ve** las notas privadas que el líder de grupo de vida escribió como mentor oficial autor. Solo ve los hitos validados y el roadmap agregado. La conversación pastoral privada queda entre los dos líderes y, en última instancia, el pastor o administrador con `pastoral.read.all`.

En ambos casos: **una sola fuente de verdad**, dos vistas (mentor tiene panel oculto con notas privadas; persona tiene roadmap agregado).

## 8. Lifecycle del 1:1

**Set cerrado de estados** (confirmado, alineado con `DREAM_TEAM_ESTADOS` de Fase 2):

```text
programado → en_curso → completado | no_realizado
                      → cancelado (motivo obligatorio)
programado | en_curso → reprogramado (round-trip)
completado, no_realizado, cancelado, reprogramado → terminales (en el sentido de Hoja: no retornan)
```

| Transición | Precondición |
|---|---|
| Cualquier estado terminal | Motivo obligatorio si `cancelado`. |
| Cancelar / reprogramar | Solo mentor oficial (actor con capability `pastoral.one_on_one.complete`). |
| Cerrar como `no_realizado` | Trigger programado (T-7d, T-1d) notifica al mentor antes. Ventana de 7 días para reprogramar. Si no responde: `no_realizado` con motivo `vencido_por_tiempo`. |

Append-only: correcciones no mutan filas previas; emiten nueva fila con `corrects_event_id`.

Pareja (confirmado, P8): un solo `one_on_one` con dos filas en `pastoral_one_on_one_participantes`, una por cada persona. **Un único** `resumen` bounded 500 caracteres compartido para la pareja. Los hitos individuales permanecen por persona; solo los hitos generados por **grupos de matrimonio** se proyectan en el roadmap compartido (P9).

## 9. Lifecycle de la tríada

```text
activa → en_pausa → activa (round-trip permitido)
      → disuelta (terminal, motivo obligatorio)
      → completada (terminal, sin motivo obligatorio: propósito pastoral cumplido)
en_pausa → disuelta
```

**Catálogo cerrado de motivos de disolución** (confirmado): `gdv_liderazgo_removed`, `servicio_retirado`, `cambio_de_temporada`, `pastoral_decision`, `otro`. Cada disolución genera `pastoral_triada_disbanded` con motivo.

Una tríada disuelta es terminal: no se reforma. Una nueva tríada para la misma persona (por nuevo contexto pastoral) crea fila nueva en `pastoral_triada` con `contexto='reformada'`.

## 10. Notificaciones

F4 reusa el **outbox compartido de Fase 3**. Los templates van con `template_key` con prefijo `pastoral.` y versionados. La audiencia de cada evento respeta las decisiones P10, P11 y P16:

| Evento | Template | Disparador | Audiencia |
|---|---|---|---|
| 1:1 programado | `pastoral.one_on_one_scheduled.v1` | Líder crea/abre 1:1 | **Ambos**: mentor oficial y asistidos (P10) |
| Recordatorio del 1:1 | `pastoral.one_on_one_reminder.v1` | Scheduled job T-24h | **Ambos**: mentor oficial y asistidos (P11) |
| 1:1 cerrado con resumen | `pastoral.one_on_one_completed.v1` | Líder completa | Director inmediato |
| 1:1 cancelado | `pastoral.one_on_one_cancelled.v1` | Líder cancela con motivo | Director inmediato |
| 1:1 con 7 días sin acción | `pastoral.one_on_one_expiring.v1` | Scheduled job T-7d | Mentor oficial |
| 1:1 con 1 día sin acción | `pastoral.one_on_one_expiring_soon.v1` | Scheduled job T-1d | Mentor oficial |
| 1:1 marcado `no_realizado` | `pastoral.one_on_one_expired.v1` | Scheduled job al expirar | Mentor oficial y asistidos |
| Tríada activa | `pastoral.triada_formed.v1` | Miembro entra a tríada | Todos los miembros |
| Tríada miembro entra o sale | `pastoral.triada_member_changed.v1` | Cambio de membresía | Miembros restantes |
| Tríada disuelta | `pastoral.triada_disbanded.v1` | Disolución con motivo | Todos los miembros |
| Paso sugerido | `pastoral.triada_step_suggested.v1` | Sistema sugiere paso | Asistido (vista pública) |
| Paso validado | `pastoral.triada_step_validated.v1` | Mentor valida paso | Asistido (vista pública) |
| **Alerta de crisis pastoral** | `pastoral.crisis.alert.v1` | Cierre de 1:1 con coincidencia de palabra clave (P16) | Pastor y administrador con permiso completo; el líder autor ve la alerta en su propio buzón |

**Canales del MVP (P11):** correo electrónico y WhatsApp para todas las notificaciones pastorales. La notificación push queda como **tarea futura**, fuera del MVP, y se documenta en §12.

## 11. Métricas básicas

Empezamos sencillos. Las métricas alimentan conversaciones del equipo pastoral y del líder, **no** se publican en un tablero público. La página dedicada de métricas queda como tarea de fase futura. En el MVP viven como **tarjetas simples en el dashboard del líder** y del pastor:

- **Conteo de 1:1 por período.** Cuántos 1:1 se han programado y cuántos se han cerrado por ventana (mes o trimestre, a definir con el pastor).
- **Líderes más activos.** Ranking simple de líderes por número de 1:1 cerrados en la ventana. La función pura `líderes_activos_por_ventana` entrega el top N, sin comparación porcentual ni metas duras (no se reabre P12 en MVP).
- **Distribución de tríadas por tipo.** Cuántas tríadas activas son por `nuevo_paso` y cuántas por `simultaneidad`. Un pastor puede ver el peso de cada contexto pastoral.
- **Alarmas de grupo de vida sin 1:1 en los últimos noventa días.** Lista de personas en grupo de vida activo que no tienen un 1:1 cerrado en los últimos 90 días. Es la única alerta pastoral del MVP: cada caso se entrega al líder del grupo de vida correspondiente.

Mismas cuatro funciones puras patrón `lib/platform/dream-team/metrics.ts`: `uno_auno_por_periodo`, `lideres_activos_por_ventana`, `triadas_por_tipo`, `alarma_gdv_sin_uno_auno_en_90_dias`. Las métricas son accesibles solo al líder habilitado y al pastor o administrador con permiso completo. **No** se exponen en tablero público.

## 12. Riesgos y mitigaciones

| # | Riesgo | Likelihood | Mitigación |
|---|---|---|---|
| R1 | Sobrecargar la unión de 11 kinds con 13 nuevos sin namespace. | Media | Sibling `lib/platform/pastoral/participation-kinds.ts`; prefijo `pastoral_` en `kind`. Índices parciales por prefijo. |
| R2 | Confusión con `kind='transition'` operacional de F3. | Media | Prefijo explícito `pastoral_` en queries; separación clara dashboard operacional vs roadmap pastoral. |
| R3 | Cascada del mentor asigna un líder incorrecto tras cambio reciente de GDV. | Media | Asignación **on-demand** al abrir 1:1, no cacheada. Si cambió hace < 7 días: `pending_confirmation` con el nuevo líder. |
| R4 | Notas privadas del mentor filtradas en vista pública del roadmap. | Alta | Doble enforcement: read guard rechaza el kind para el asistido; query SQL filtra explícitamente `NOT IN (note kinds)`. |
| R5 | Drift entre decisión pastoral y la implementación. | Alta | Toda decisión pastoral confirmada se traduce a un **escenario Given/When/Then** en el spec. Tests fixtures estilo `end-to-end-ana.test.ts`. |
| R6 | El módulo `pastoral` se vuelve cajón de sastre. | Alta | Límite explícito: F4 cubre 1:1 + Tríada + reportes + notas + hitos. NO cubre agenda cultos, counseling profundo, derivación a profesionales, integración WhatsApp. |
| R7 | Capabilities pastorales no se asignan a nadie. | Alta | Script de seeding (precedente Fase 2): capabilities a líderes GDV activos, coordinadores de área activos, `pastoral.read.all` a pastor/admin. |
| R8 | Scheduled job "todo lo que empieza debe terminar" genera falsos positivos. | Media | Notifica al mentor en T-7d y T-1d antes de aplicar. Ventana de 7 días para reprogramar. |
| R9 | PRs individuales superan budget de 400 líneas. | Media | Estrategia `force-chained stacked-to-main` estilo Fase 3. Estimación tentativa: 14-19 PRs. `size:exception` documentada en W2/W3/W4/W7. |

## 13. Plan de rollout

Mismo patrón que F2 y F3 (`lib/platform/rollout.ts`):

| Etapa | Duración | Gate |
|---|---|---|
| **Staging** | 7 días mínimo | Suite completa verde + smoke pastoral + tests RLS. |
| **Admin-only** | Mientras se valida con dirección | Solo director general + pastor con `pastoral.read.all` escriben. Lectura agregada para líderes habilitados. |
| **Internal** | Líderes designados | Líderes habilitados ven los 1:1 que les corresponden; tríadas operativas sobre datos sintéticos primero. |
| **Public** | Producción abierta | Activación de `NEXT_PUBLIC_PASTORAL_*` solo después de validación pastoral con el equipo y el pastor. |

Cada transición va con `NEXT_PUBLIC_PASTORAL_*=on` explicito y kill switch call-time en cada endpoint (precedente F3). Sin activar flags en producción hasta que el pastor apruebe.

## 14. Criterios de éxito

- [ ] 6 tablas nuevas con migración aditiva aplicada en staging (`pastoral_one_on_one`, `pastoral_one_on_one_participantes`, `pastoral_one_on_one_notas`, `pastoral_triada`, `pastoral_triada_miembros`, `pastoral_triada_eventos`).
- [ ] Helper Postgres de capacidades pastorales creado y referenciado por las políticas de fila de las 6 tablas (mismo patrón que el helper de capacidades de Fase 2).
- [ ] Capacidades pastorales nuevas bajo `openspec/changes/fase-04-seguimiento-pastoral/specs/`, una por capacidad, con Given/When/Then, más el spec nuevo `pastoral-crisis-keywords` que cubre `pastoral.crisis.detect`.
- [ ] Módulos protegidos **byte-idénticos** después de F4 (verificación por diferencia contra `main`).
- [ ] El módulo de clases operativas y el de participación longitudinal siguen byte-idénticos.
- [ ] 13 nuevos kinds con prefijo `pastoral_` y `sensitivity = 'internal'`, escritos en el libro mayor compartido, más el nuevo kind `pastoral_crisis_detected` para la detección de palabras clave (P16).
- [ ] Pareja: un único `one_on_one` con dos `participantes` y un único `resumen` bounded 500 caracteres (P8). Hitos de grupo de matrimonio compartidos; el resto permanece individual (P9).
- [ ] Cascada del mentor con un único grupo de vida activo por temporada (P1), asignación automática sin confirmación del líder (P2), sin opción de rechazo de la persona (P3) y rama explícita de "sin candidato" cuando no hay grupo, taller ni servicio (P14).
- [ ] Tríada por nuevo paso creada automáticamente desde el evento pastoral de paso tomado (P4). Si ya existe una tríada activa, se rechaza y se orienta a una conversación pastoral.
- [ ] Motivo obligatorio al cancelar o disolver; rechazo si falta motivo con código `MISSING_MOTIVO` (precedente Fase 2).
- [ ] `version + 409` en transiciones (precedente Fase 2).
- [ ] Notas privadas: la barrera de lectura rechaza al asistido y a miembros no autor; en tríadas por simultaneidad, el coordinador del área tampoco las ve (P7).
- [ ] Vista pública del roadmap del asistido solo expone el agregado (fechas, hitos, próximo paso) y nunca notas privadas (P6). Los hitos compartidos de pareja se filtran por tipo de evento (P9).
- [ ] Permiso `pastoral.read.all` rechaza explícitamente la validación de pasos (P5), con escenario de prueba que cubre el caso.
- [ ] Detección de palabras clave de crisis activa al cierre del 1:1 (P16): alerta al pastor o administrador por el buzón compartido con plantilla `pastoral.crisis.alert.v1`, evento pastoral `pastoral_crisis_detected` registrado, contenido original intacto.
- [ ] Notificaciones pastorales del 1:1 llegan a **ambos** (líder y asistidos) al programar (P10) y al recordar (P11). Canales del MVP: correo electrónico y WhatsApp. La notificación push queda documentada como tarea futura.
- [ ] Buzón compartido de Fase 3 absorbiendo plantillas `pastoral.*` (sin buzón paralelo).
- [ ] Métricas básicas (cuatro funciones) en el dashboard del líder y del pastor, sin tablero público.
- [ ] `pnpm test` verde con cero regresiones en F1/F2/F3.
- [ ] Cada cambio atómico dentro del presupuesto de revisión o con `size:exception` documentada.
- [ ] Documentación pastoral-amigable en mensajes de error ("Esta información es privada entre tu líder y el equipo pastoral").

## 15. Open questions residuales

### 15.1 Pastorales

Ninguna abierta. Las dieciséis preguntas pastorales (P1–P16) quedaron cerradas en la fase de specs y se listan en §4.4.

### 15.2 Técnicas (a resolver en la fase de diseño)

- Algoritmo de la cascada del mentor: nombre de la temporada activa de grupo de vida y fuente de verdad del "activo por temporada" (P14).
- Mecanismo del recordatorio del 1:1 en MVP con canales correo y WhatsApp: plantillas de redacción y disparador de tiempo exacto para el envío (P11).
- Catálogo cerrado de palabras clave de crisis pastoral (P16): redacción exacta, categorías (duelo, crisis matrimonial, ideación suicida, violencia intrafamiliar, crisis de fe), y estrategia de mantenimiento del catálogo.
- Cálculo del "próximo paso sugerido" en el roadmap público (reglas declarativas contra columna desnormalizada).
- Forma del evento pastoral de crisis detectada (`pastoral_crisis_detected`) en `operating_core_participation_eventos`: forma del dato, idempotencia al reintentar el cierre, deduplicación con detecciones previas del mismo 1:1.
- Métricas: qué pasa cuando un líder deja de ser activo (servicio pausado). ¿Sus métricas se preservan en histórico o se ocultan?
- Diseño UX: si la captura rápida del 1:1 desde el celular reutiliza los seis estados de captura UX de Fase 3 o requiere una pantalla dedicada.
- Migración futura a multi-tenant: confirmar que las tablas pastorales se mantengan compatibles con `church_id` opcional vía migración aditiva (P15 sigue fuera del MVP).

---

**Próximo paso:** `sdd-spec` debe escribir los delta specs en `openspec/changes/fase-04-seguimiento-pastoral/specs/` (uno por capability nueva, mismo grano que F3: 6-8 requirements por spec, Given/When/Then por scenario, RFC 2119 keywords).

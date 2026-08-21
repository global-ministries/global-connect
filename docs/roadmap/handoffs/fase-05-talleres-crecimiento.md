# Handoff — Fase 5: Talleres de Crecimiento (Operating)

## Estado del programa

- Fase 1 — Platform Foundation: cerrada, mergeada en `main`.
- Fase 2 — Dream Team Global Base: cerrada, mergeada en `main`.
- Fase 3 — Operating Core: cerrada, mergeada en `main`.
- Fase 4 — Seguimiento Pastoral: W14–W27 mergeados a `main`, con UI pendiente de validación y recap posterior.
- Fase 5 — Talleres de Crecimiento: **PR1–PR19 del plan + segunda ola PR21–PR43 implementadas y mergeadas en `main`.** SDD change aún activo (sin `sdd-verify`/`sdd-archive`). `tsc --noEmit` limpio; `pnpm test` verde salvo 11 fallas en `pr16.test.ts` por mock desactualizado (código de producción correcto). Ver reconciliación en `openspec/changes/fase-05-talleres-crecimiento/tasks.md`.

## Objetivo de la fase

Construir el módulo de **Talleres de Crecimiento** como programas operativos de corto plazo, sobre `OperatingCoreEvent` con `kind='workshop'`. Incluye catálogo de talleres, periodos de inscripción, grupos simultáneos, asistencia por sesión, finalización, reportes administrativos, certificados verificables e integración futura con la Ruta de Crecimiento Espiritual. El módulo es 100% aditivo y no modifica módulos protegidos.

## Tipos de talleres

- **Individual**: inscripción personal, asistencia y estado final por persona.
- **Pareja**: inscripción en unidad (matrimonio o novios), asistencia individual por integrante, estado final unificado y reporte único.

## Modalidades de inscripción

- **Periodo general**: abierto/cerrado por el Director General; aplica automáticamente a todos los talleres activos configurados con esa modalidad.
- **Permanente / custom**: inscripción continua, con recurrencia configurable (ej. `primer domingo de cada mes`). El sistema calcula la próxima ocurrencia válida.

## Modelo de liderazgo y equipo

| Rol | Alcance | Capacidad operativa |
|---|---|---|
| Director General | Global en Fase 5 | Crea, desactiva y reactiva talleres. Abre/cierra periodos. Autoriza equipo de servicio. Resuelve solicitudes de retiro. Hereda todas las funciones del coordinador. |
| Coordinador | Talleres asignados | Aprueba inscripciones. Crea y administra grupos. Asigna líderes y voluntarios dentro del equipo autorizado. Quita puestos. Solicita retiros definitivos. Edita contenido público, recursos informativos y privados. |
| Líder | Grupo asignado | Registra asistencia, marca sesiones como realizadas, confirma finalización, crea el reporte final del grupo. Edita día y hora de reunión. |
| Voluntario | Grupo asignado | Lectura: calendario, recursos, participantes con contacto, asistencia y estado final. |
| Participante | Inscripción propia | Consulta información del taller, se inscribe, ve su grupo, recursos y estado de la inscripción. |

Reglas clave:
- Una persona puede estar asignada en varios talleres con roles distintos.
- Una persona no puede ser líder y voluntaria en el mismo grupo, ni ser participante y equipo operativo en el mismo grupo.
- El Director General es la única excepción para combinar roles.
- Una persona solo puede tener un rol por taller.
- La reasignación de rol, salvo el retiro definitivo, la hace el coordinador; el retiro definitivo del equipo requiere solicitud aprobada por el Director General.

## Inscripciones y estados

- Cualquier persona del sistema puede inscribirse, incluidos miembros, nuevos, líderes, voluntarios, coordinadores y pastores.
- Dos vías: autoinscripción y alta administrativa.
- Toda inscripción comienza `pendiente` y requiere aprobación explícita; el origen no la exime.
- Estados:
  - `pendiente → aprobado` (por coordinador o director)
  - `pendiente → no aprobado` (requiere motivo administrativo interno)
  - `no aprobado → pendiente` (solo mientras el periodo siga activo)
- En modalidad permanente, si llega la fecha/hora de inicio y la inscripción sigue pendiente, se reprograma automáticamente a la siguiente ocurrencia.
- El sistema no procesa pagos ni checkout; pago y logística se gestionan fuera del sistema.

## Periodos generales

- Apertura y cierre por fecha automática o manual.
- Una intervención manual del Director General prevalece sobre la programación automática.
- Es posible cerrar y reabrir un taller específico dentro de un periodo general activo.

## Grupos y asignación

- Un taller puede tener varios coordinadores activos.
- Un taller puede contener varios grupos simultáneos.
- Coordinadores crean grupos, asignan líderes y voluntarios desde el equipo autorizado y distribuyen participantes aprobados.
- Los líderes y voluntarios se asignan a grupos específicos, no al taller completo.
- Líderes pueden cambiar día y hora de reunión: solo esta sesión, o esta sesión y las siguientes.
- La cantidad de sesiones, la duración estimada y la recurrencia son del Taller; la hora es del grupo.
- Los grupos se marcan como `Completado` automáticamente cuando todas las sesiones están cerradas, todas las asistencias guardadas y todos los reportes enviados.

## Asistencias, sesiones y recursos

- Estados de asistencia: `Presente` o `Ausente`. Inmutables después de guardar.
- Sesiones estrictamente secuenciales: no se puede saltar a la siguiente sin cerrar la actual.
- Guardar asistencia cierra la sesión y, en modo progresivo, desbloquea los recursos asociados.
- Modo de liberación configurable al crear el taller: todos los recursos al aprobar o progresivo por sesión.
- Recursos fijos del taller son independientes de los recursos de cada sesión.
- Recursos son vivos para grupos activos y nuevos; grupos completados conservan un snapshot congelado.

## Reportes finales

- Solo el líder activo puede crear el reporte del grupo.
- Solo se habilita cuando todas las sesiones están cerradas.
- El líder define manualmente el estado final de cada participante: `Completado`, `No completado`, `Abandonó`.
- Campos obligatorios: estado final y observaciones generales. Resto opcionales.
- Para talleres de parejas, un único reporte por unidad.
- El reporte se bloquea al enviar; la reapertura la hace únicamente un coordinador o director, con motivo obligatorio, y solo el actor que reabre puede editar y cerrar.
- La firma es con el nombre del líder y la fecha; tras corrección administrativa se preserva la firma original y se añade el autor y fecha de la corrección.

## Historial, certificados y verificación

- El participante conserva historial longitudinal de talleres y estados.
- En talleres de parejas, el estado final es por unidad; el snapshot es por unidad.
- El participante ve solo resumen y certificado; no ve detalles administrativos ni de asistencia.
- Solo `Completado` conserva acceso permanente al snapshot de recursos.
- El certificado se genera automáticamente al marcar `Completado`.
- Es descargable en PDF, con un identificador único verificable.
- El QR dirige a la ruta pública `/verificar-certificado/[codigo]` (compartida con futuras áreas como Grupos de Vida y eventos).
- La página de verificación no requiere autenticación y muestra solo información no sensible.
- Los firmantes del certificado son configurables por el taller.

## Eventos internos y notificaciones

- Fase 5 no implementa canales externos (email, push, WhatsApp).
- Produce y almacena eventos de dominio con contexto completo (taller, edición, grupo, persona, fecha, metadata).
- Los eventos cubren participante, equipo operativo y hitos administrativos.
- El catálogo debe estar documentado, versionado y ser extensible.
- Una fase posterior conectará los canales.

## Métricas

- Tasas y conteos de finalización por taller, periodo, edición y tipo.
- Comparativa entre periodos, ediciones y tipos.
- Filtros por fecha, tipo de evento, participante y grupo.
- Visibilidad según alcance: Director General global, coordinador solo sus talleres asignados, líder y voluntario solo su grupo.

## Integración con futura Ruta de Crecimiento Espiritual

- La Ruta consumirá Fase 5 a través de una **capa de integración dedicada** (no acceso directo a tablas).
- Esto aísla cambios, versiona el contrato y permite proteger datos sensibles.
- El contrato debe incluir snapshots de talleres, periodos, sesiones, estados finales y reportes.

## Decisiones tentativas D15–D26 (de exploración previa)

| # | Decisión | Descripción |
|---|---|---|
| D15 | State machine del taller | `borrador → abierto → en_curso → cerrado \| cancelado` |
| D16 | State machine de completación por persona | `inscripto → asistiendo → completado \| abandono \| no_completado` |
| D17 | 5 nuevos kinds de participación | `taller_cohort_started`, `taller_session_attended`, `taller_session_missed`, `taller_completion_recorded`, `taller_completion_failed` |
| D18 | 13 capabilities nuevas | con `experience: 'talleres_crecimiento'` |
| D19 | Modalidades de inscripción | periodo general vs permanente/custom |
| D20 | Parejas | matrimonio y novios como tipos distintos del vínculo |
| D21 | Asistencia | simple, dos estados, inmutable |
| D22 | Recursos | vivos para activos/nuevos, snapshot para completados |
| D23 | Reporte | pertenece al grupo, no al líder |
| D24 | Certificados | QR + URL pública de verificación |
| D25 | Eventos | internos, documentados y versionados |
| D26 | Integración con Ruta futura | capa de integración, no acceso directo |

## Amenazas / riesgos identificados

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Inscripción huérfana tras cambio de modalidad | El cambio no afecta inscripciones existentes; cada una sigue su flujo original |
| R2 | Reprogramación silenciosa | Solo ocurre cuando la inscripción sigue `pendiente` al iniciar; auditar cambios |
| R3 | Lectura cruzada de reportes | Permisos estrictos por rol; líder futuro solo del mismo taller; motivo obligatorio en `no aprobado` |
| R4 | Contactos de participantes después del retiro | Política unificada: ex-líder, ex-voluntario y ex-coordinador solo conservan historial mínimo |
| R5 | Recursos congelados en grupos completados | Snapshot al cierre, no se actualiza con cambios futuros |
| R6 | Capacidad referencial mal interpretada | Solo es orientativa, sin bloqueos ni advertencias |
| R7 | Cambio de nombre del taller rompe referencias | Snapshot por registro; historiales muestran el nombre de la fecha del hecho |
| R8 | Renombre del grupo no claro | Aplicar solo a esta sesión o a esta y las siguientes |
| R9 | Prerrequisito sin verificar | El sistema bloquea, pero la verificación de vínculo se hace fuera del sistema |
| R10 | Cambio de cantidad de sesiones afecta grupos activos | Solo permitido si no hay inscripciones aprobadas |

## Hallazgos críticos previos

1. `talleres_crecimiento.admin.manage` ya está referenciada en navegación pero no declarada como capability; este gap se cierra en F5.
2. F4 ya consume talleres mediante `resolverLiderDeTaller`; F5 completa el adapter existente sin modificar la interfaz.
3. Los nuevos kinds de participación usan prefijo `taller_` en archivo hermano, sin tocar `lib/platform/operating-core/kinds.ts`.

## Principios no negociables

1. **Byte-identity de módulos protegidos**: 16 archivos de F1/F2/F3 nunca se editan. F5 añade módulos hermanos en `lib/platform/talleres/**`.
2. **`auth.uid()` directo**: nunca usar `public.current_persona_id()`.
3. **Nombres únicos de policies**: sufijos `_select`, `_update`, `_insert`, `_delete`.
4. **Strict TDD**: RED → GREEN → REFACTOR, `pnpm test` verde + `tsc --noEmit` 0.
5. **Cero DDL destructivo**: solo `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ADD COLUMN`, `INSERT`.
6. **Multi-tenant fuera del MVP**: `church_id`/`campus_id` deferred a fase futura.
7. **Reuso de UI existente**: mismas tarjetas, tablas, iconos, colores y distribución que el resto de GlobalConnect.
8. **Capacidades dinámicas**: el menú lateral y móvil se filtra por capability, sin renderizar items no autorizados.
9. **Eventos internos, no canales**: Fase 5 no envía emails, push ni WhatsApp; la entrega multicanal pertenece a otra fase.
10. **Pagos fuera del alcance**: inscripción sin checkout; pago y logística se gestionan fuera del sistema.

## Mapa de capacidades tentativo

| Capability | Quién la recibe |
|---|---|
| `talleres.participation.read` | Participante, líder, voluntario, coordinador, director |
| `talleres.participation.create` | Participante, coordinador, director |
| `talleres.participation.review` | Coordinador, director |
| `talleres.lead.read` | Líder activo, coordinador, director |
| `talleres.lead.write` | Líder activo, coordinador, director |
| `talleres.volunteer.read` | Voluntario activo, coordinador, director |
| `talleres.coordinator.read` | Coordinador, director |
| `talleres.coordinator.write` | Coordinador, director |
| `talleres.director.read` | Director |
| `talleres.director.write` | Director |
| `talleres.admin.manage` | Director |
| `talleres.metrics.read` | Coordinador, director |

(Las capabilities finales se definirán en `sdd-spec` y `sdd-design`.)

## Estructura de archivos esperada

```
lib/platform/talleres/
├── participation-kinds.ts
├── enrollment.ts
├── groups.ts
├── attendance.ts
├── reports.ts
├── certificates.ts
├── events.ts
├── metrics.ts
└── route-integration.ts
```

## Rutas URL por namespace

| Namespace | Roles | Ejemplos |
|---|---|---|
| `/talleres/*` | Participante, público | `/talleres/explorar`, `/talleres/mis-talleres`, `/talleres/historial`, `/talleres/certificados/[id]` |
| `/talleres/equipo/*` | Líder, voluntario | `/talleres/equipo/mis-grupos`, `/talleres/equipo/mis-grupos/[id]/asistencia`, `/talleres/equipo/mis-grupos/[id]/reporte`, `/talleres/equipo/recursos` |
| `/talleres/coordinacion/*` | Coordinador | `/talleres/coordinacion/resumen`, `/talleres/coordinacion/inscripciones`, `/talleres/coordinacion/talleres`, `/talleres/coordinacion/equipos`, `/talleres/coordinacion/reportes`, `/talleres/coordinacion/solicitudes` |
| `/talleres/direccion/*` | Director General | `/talleres/direccion/resumen`, `/talleres/direccion/talleres`, `/talleres/direccion/periodos`, `/talleres/direccion/equipos`, `/talleres/direccion/solicitudes`, `/talleres/direccion/metricas`, `/talleres/direccion/reportes` |
| `/verificar-certificado/[codigo]` | Público | Verificación pública reutilizable |

## UI y navegación

- Grupo propio en el menú lateral y móvil: `Talleres de Crecimiento`.
- Sub-items filtrados dinámicamente por capability.
- Multi-rol unificado: un usuario con varios roles ve un solo grupo con todos los items permitidos.
- El grupo se oculta si el usuario no tiene ninguna capability de Fase 5.
- El sub-item `Explorar Talleres` reemplaza `Catálogo` o `Ver Talleres`.
- Sub-items visibles a los roles relevantes:
  - Participante: `Explorar Talleres`, `Mis Talleres`, `Historial`.
  - Voluntario: `Mis Grupos`, `Próximas Sesiones`, `Recursos`.
  - Líder: `Mis Grupos`, `Asistencia`, `Reportes Finales`, `Recursos`.
  - Coordinador: `Resumen`, `Inscripciones Pendientes`, `Talleres`, `Equipos`, `Reportes`.
  - Director General: `Resumen Global`, `Talleres`, `Periodos`, `Equipos`, `Solicitudes`, `Métricas`, `Reportes`.
- Contadores numéricos en items con colas operativas, siguiendo el patrón del Design System.
- Botón de acción flotante (FAB) y patrón visual: igual que en Grupos de Vida.
- Director General con asignación de líder ve `Mis Grupos` como cualquier líder.

## Prerrequisitos para merge

- [ ] F1–F4 mergeadas a `main`.
- [ ] `sdd-init` ejecutado para esta sesión.
- [ ] Exploración, propuesta, specs, diseño y tasks completos en `openspec/changes/fase-05-talleres-crecimiento/`.
- [ ] `sdd-apply` ejecutado con todos los PRs mergeados.
- [ ] `sdd-verify` ejecutado con verificación verde.
- [ ] `git diff main...HEAD -- <16 protected files>` = VACÍO.
- [ ] `pnpm test:ci` verde con 0 failed.
- [ ] `tsc --noEmit` exit 0.
- [ ] `npx supabase type-check` o equivalente exit 0.

## Riesgos residuales

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Estimación de 14–19 PRs encadenadas | Alta | Alta | Revisión tras `sdd-tasks`; chained PRs por concern |
| Pagos/logística no modelados | Media | Media | Confirmar explícitamente fuera del sistema en cada pregunta |
| Cambios retroactivos en capacidad y configuración | Media | Alta | Snapshot por grupo; cambios solo afectan ediciones futuras |
| Multi-rol Director-líder | Baja | Baja | Excepción documentada y filtrado por capability en UI |

## Próximos pasos

1. Correr preflight de SDD para esta sesión.
2. Iniciar `/sdd-new fase-5-talleres-crecimiento` para crear la propuesta formal.
3. Continuar con `sdd-spec`, `sdd-design` y `sdd-tasks`.
4. Implementar con `sdd-apply` y verificar con `sdd-verify`.
5. Archivar con `sdd-archive` al cierre.

## Archivos protegidos (byte-identity)

F5 NO modifica estos archivos:

```
lib/platform/flags.ts
lib/platform/route-access.ts
lib/platform/grants.ts
lib/platform/participation.ts
lib/platform/navigation.ts
lib/platform/routeGuard.ts
lib/platform/persona.ts
lib/platform/preflight.ts
lib/platform/adapters/grupos-vida.ts
lib/platform/operating-core/kinds.ts
lib/platform/operating-core/state.ts
lib/platform/operating-core/capture-states/capture-states.ts
lib/platform/operating-core/capture-ux/capture-ux-types.ts
lib/platform/operating-core/types.ts
lib/platform/dream-team/route-access.ts
lib/supabase/database.types.ts
```

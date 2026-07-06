# Handoff — Fase 2: Dream Team Global Base

Este handoff es una guía para que un agente/orquestador SDD investigue y prepare la fase **Dream Team Global Base**. No es una especificación final ni una instrucción para implementar directamente.

## Contexto previo

Fase 1 — Platform Foundation fue completada y mergeada en `main` (commit final c364128). Esto incluye:

- `lib/platform/session/` (PlatformSession desde backend auth)
- `lib/platform/persona.ts` (Persona operacional, dedupe, auth opcional)
- `lib/platform/experiences.ts` (catálogo de experiencias, capabilities allowlist, fail-closed)
- `lib/platform/adapters/grupos-vida.ts` (adapter read-only de Grupos de Vida, sin rediseño)
- `lib/platform/family.ts` y `lib/platform/family/canAccessMinorData.ts` (taxonomía + guard)
- `lib/platform/participation.ts` (contrato longitudinal)
- `lib/platform/grants.ts` (auditoría + métricas de grants)
- `lib/platform/rollout.ts` (gates staged + fix-forward/rollback)
- `lib/platform/preflight.ts` (bloqueo de `uno_a_uno` sin decisión formal)
- navegación contextual (sidebar/header/menú inferior/dashboard)
- routeGuard server-side reusable con `routeGuard` corregido para que flag OFF sea fail-open
- 666+ tests; 20 PRs mergeados; 20 issues cerradas

Documentos a leer obligatoriamente antes de empezar:

- `docs/roadmap/globalconnect-roadmap-maestro-v1.md`
- `docs/roadmap/handoffs/fase-01-platform-foundation.md`
- `docs/roadmap/handoffs/fase-02-dream-team-base.md` (este archivo)
- todo el código de `lib/platform/**` y sus tests
- `openspec/changes/fase-01-platform-foundation/` (exploración, propuesta, design, tasks y specs)

## Objetivo de la fase

Modelar a toda persona que sirve en la iglesia como base global de servicio, con:

- servicios por experiencia/equipo/rol
- jerarquías flexibles por área
- estado de servicio
- requisitos configurables por área/rol
- conexión con Grupos de Vida, DPS, Talleres, Niños, Estudiantes, The Living Room y futuras experiencias
- preparación para onboarding y métricas (sin implementar onboarding completo todavía)

## Resultado esperado del agente

Debe producir artefactos SDD de planificación:

1. exploración técnica
2. propuesta
3. especificación funcional
4. diseño técnico
5. plan de tareas por slices seguros

No debe implementar hasta que esos artefactos sean revisados y aprobados.

## Principios no negociables

- Dream Team = toda persona que sirve en cualquier experiencia, NO un ministerio con director único.
- Una persona puede tener varios roles de servicio simultáneos en diferentes experiencias/equipos.
- Servicio es un tipo distinto de relación; no se mezcla con asistencia, familia o grupos.
- Roles globales siguen siendo pocos; las nuevas funciones se modelan con scoped responsibilities / capabilities / grants.
- Jerarquías de área son configurables: director puede existir sin coordinador, y viceversa.
- Requisitos por área/rol son configurables y no se hardcodean como obligatorios por defecto.
- Grupos de Vida no se rediseña; integración segura.
- Todo debe funcionar aunque la persona no tenga cuenta auth (Persona sin auth ya existe).
- No usar `uno_a_uno` mientras no haya decisión formal de producto.
- Cambios aditivos y compatibles con producción; no migraciones destructivas.

## Alcance funcional

### 1. Servicio por experiencia/equipo/rol

Investigar y diseñar cómo una persona se asocia a un equipo dentro de una experiencia con un rol específico.

Ejemplo:

```text
Persona
├── sirve en DPS / Producción Técnica / Cámara como Voluntario
├── sirve en Estudiantes / Transit como Líder de grupo
└── sirve en Talleres / Punto de Partida como Líder
```

Debe soportar:

- múltiples servicios simultáneos
- cambios de estado
- fecha de inicio/fin
- historial longitudinal (alimentando `lib/platform/participation.ts`)

### 2. Jerarquías configurables

- director, coordinador y voluntario son opcionales por área/equipo
- una persona puede tener varios roles jerárquicos
- no asumir jerarquía rígida de 3 niveles

### 3. Estado de servicio

Estados mínimos:

- postulado
- en orientación
- activo
- en pausa
- inactivo
- retirado

Transiciones y motivos deben ser auditables.

### 4. Requisitos por área/rol

- configurables (requerido / opcional / no aplica)
- fecha de verificación
- persona que verificó
- estado: pendiente / completado / vencido / no aplica
- por área/rol

### 5. Relación con Grupos de Vida

- Grupos de Vida sigue siendo su propio dominio
- los líderes/directores de Grupos de Vida son parte de Dream Team
- usar adapter read-only existente en `lib/platform/adapters/grupos-vida.ts`
- no reemplazar flujos actuales de Grupos de Vida

### 6. Connection con áreas y capacidades

- las responsabilidades de servicio deben integrarse con `lib/platform/experiences.ts` y `lib/platform/grants.ts`
- las capabilities deben poder asignarse a roles de servicio
- los grants deben ser auditables (ya hay base en Fase 1)

### 7. Métricas de Dream Team (base, no avanzadas)

Métricas mínimas viables:

- cuántos sirven por experiencia/equipo
- cuántos están activos
- distribución de roles
- voluntarios con requisitos vencidos

No construir dashboards avanzados todavía (eso es Operating Core / dashboards operativos).

## Fuera de alcance

- Onboarding completo con cursos, videos, evaluaciones
- Firma digital legal
- Mensajería interna
- Integración con WhatsApp API
- Campamentos, pagos, becas
- Operación de Niños / Estudiantes / The Living Room / DPS
- Implementación del `uno_a_uno`
- Rediseño de Grupos de Vida
- Cambios destructivos en DB

## Investigación obligatoria en el repo

El agente debe investigar como mínimo:

- `lib/platform/**` completo (Fase 1 foundation)
- `lib/platform/adapters/grupos-vida.ts` y `lib/platform/persona.ts`
- tablas actuales de usuarios, roles, grupos y relaciones
- `hooks/useCurrentUser.ts` y su integración con capacidades
- `components/ui/sidebar-moderna.tsx`, `header-movil.tsx`, `menu-inferior-movil.tsx` (entender el menú contextual que ya existe)
- `app/(auth)/dashboard/page.tsx` y `lib/dashboard/obtenerDatosDashboard.ts`
- acciones y migraciones de Grupos de Vida
- documentación de Grupos de Vida en `docs/grupos-vida.md`
- `lib/auth/requireAuth.ts` y helpers de sesión
- `app/(auth)/configuracion/**` (entender cómo se asignan capacidades hoy)
- documentos fuente externos si necesita validar necesidades de ministerios

## Preguntas que el agente debe responder

1. ¿Cómo se representa un servicio activo de una persona en cualquier experiencia?
2. ¿Cómo se modela una persona con varios servicios simultáneos?
3. ¿Cómo se configuran jerarquías por área/equipo?
4. ¿Qué campos y estados mínimos requiere el servicio?
5. ¿Cómo se asocian requisitos por área/rol?
6. ¿Cómo se conecta Dream Team con `lib/platform/grants.ts`?
7. ¿Cómo se conecta Dream Team con `lib/platform/participation.ts`?
8. ¿Cómo se muestra un voluntario activo en el dashboard contextual?
9. ¿Cómo se evita que un líder de Grupos de Vida no se muestre como Dream Team y viceversa?
10. ¿Qué cambios de DB serían aditivos y seguros?

## Validación con ejemplo

El diseño debe soportar este caso:

```text
Ana
├── sirve en DPS / Producción Técnica / Cámara
│   ├── estado: activo
│   ├── rol: Voluntario
│   ├── requisitos: política de equipos firmada
│   └── grants: dps.team.view
├── sirve en Estudiantes / Transit
│   ├── estado: activo
│   ├── rol: Líder de grupo
│   ├── requisitos: capacitación de liderazgo
│   └── grants: students.attendance.manage (scope: grupo Transit 2do año)
└── sin servicio en Talleres
```

El sistema debe:

- permitir los dos servicios simultáneos
- diferenciar cada uno con su rol, estado, grants y requisitos
- permitir desactivar uno sin afectar al otro
- alimentar el historial longitudinal de Ana
- no romper Grupos de Vida

## Criterios de aceptación del diseño

- Dream Team modela a toda persona que sirve, sin importar su rol o área.
- Un líder/coordinador/director de Grupos de Vida es Dream Team.
- Una persona puede tener múltiples servicios activos.
- Las jerarquías por área son configurables (no se asume director→coordinador→voluntario).
- Requisitos por área/rol son configurables y nunca hardcodeados como obligatorios por defecto.
- Estados de servicio y requisitos son auditables.
- Integración segura con Grupos de Vida vía adapter read-only existente.
- Sin cambios destructivos en DB.
- Sin uso de `uno_a_uno` mientras no haya decisión formal.
- No introducen regresiones en Grupos de Vida.
- La navegación contextual y el dashboard pueden consumir Dream Team (preparación, no consumo obligatorio ahora).

## Riesgos principales

- Sobrecargar `usuarios` o duplicar identidad.
- Crear roles de servicio rígidos que no escalen a múltiples áreas.
- Acoplar requisitos tan fuerte que sea difícil ajustarlos.
- Romper Grupos de Vida al mapear líderes.
- Aplicar migraciones riesgosas o destructivas.
- Diseñar sobre `uno_a_uno` antes de decisión formal.
- Construir onboarding encubierto dentro de la fase.

## Reporte requerido al finalizar

```text
status:
issue:
resumen_ejecutivo:
evidencia_investigada:
decisiones_propuestas:
riesgos:
dependencias:
fuera_de_alcance:
validacion_contra_roadmap:
validacion_contra_fase_1:
preguntas_abiertas:
siguiente_recomendado:
```

## Reglas de implementación (cuando se apruebe SDD)

- Strict TDD activo.
- No tocar producción.
- No rediseñar Grupos de Vida.
- No usar `uno_a_uno` sin decisión formal previa.
- No migraciones destructivas.
- No ampliar alcance del slice aprobado.
- Cada PR debe tener issue aprobado, label `type:*`, checks verdes y tests.
- PR bajo 400 líneas o con `size:exception` registrada.
- Detenerse si requiere migraciones riesgosas, producción, Fase 3, cambios de arquitectura o rediseño de Grupos de Vida.

## Documentos que el agente debe leer

- `docs/roadmap/globalconnect-roadmap-maestro-v1.md`
- este handoff
- `lib/platform/**` y sus tests
- `openspec/changes/fase-01-platform-foundation/**`
- documentos externos de ministerios si necesita validar

## Nota para el orquestador

No lanzar implementación directa desde este handoff. Primero usarlo para crear el SDD específico de Fase 2 y revisar sus artefactos antes de permitir `sdd-apply`.

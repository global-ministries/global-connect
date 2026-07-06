# Roadmap Maestro v1 — GlobalConnect

Este documento es una guía estratégica **pre-SDD**. No es una especificación de implementación. Su propósito es mantener el panorama completo para que futuros agentes/orquestadores creen SDDs específicos por fase, ejecuten en orden y reporten contra este plan.

## Principios no negociables

- **Una persona, muchos contextos**: una misma persona puede ser padre, líder, servidor, director, participante de taller, miembro de grupo, etc.
- **Dream Team = toda persona que sirve** en cualquier experiencia.
- **Experiencias** es la capa organizacional: Grupos de Vida, DPS, Niños, Estudiantes, The Living Room, Talleres de Crecimiento y futuras experiencias.
- **Grupos de Vida no se rediseña** en este roadmap inicial; se integra con extremo cuidado porque tiene uso fuerte en producción.
- **Roles globales pocos + responsabilidades/capabilities scoped**. Evitar explosión de roles.
- **Cada experiencia tiene su operación propia**, pero comparte identidad, participación, permisos, notificaciones e historial.
- **Hardware no bloquea MVP**: QR, tablets, kioscos e impresoras son optimizaciones posteriores.
- **Historial longitudinal se captura temprano**, aunque los dashboards avanzados lleguen después.

## Taxonomía base

```text
Experiencias
├── Grupos de Vida
├── Niños
│   ├── Waumbaland
│   └── Upstreet
├── Estudiantes
│   ├── Transit
│   └── InsideOut
├── The Living Room
│   └── Etapa universitaria
├── DPS
├── Talleres de Crecimiento
└── futuras experiencias

Dream Team
└── toda persona que sirve en cualquier experiencia

Operating Core
└── servicios, eventos, inscripciones, asistencia, capacidad, formularios, recursos y notificaciones

Ruta Espiritual
└── progreso/journey espiritual de la persona
```

## Fases

### Fase 1 — Platform Foundation

**Objetivo:** crear el cimiento común de identidad, relaciones, acceso y experiencias.

Incluye:

- persona única;
- familias, padres/tutores y relaciones;
- menores preparados desde el modelo, aunque NextGen opere después;
- Experiencias como capa organizacional;
- Access Foundation;
- responsabilidades y capabilities scoped;
- dashboard/menu contextual por responsabilidades activas;
- deduplicación de personas;
- historial longitudinal base;
- integración segura con Grupos de Vida existente;
- revisión de drift relacionado con `uno_a_uno` antes de usarlo.

**No incluye:** rediseño de Grupos de Vida.

**Validación:** una persona puede tener múltiples contextos sin duplicarse ni recibir permisos indebidos.

**Estado: CERRADA** (Fase 1 completa, 7 sub-fases, 20 PRs mergeados a `main` en `c364128`).

- 14 módulos `lib/platform/` (session, persona, experiences, navigation, routeGuard, flags, family, adapters, preflight, participation, grants, rollout, etc.).
- 666 tests pasan en `pnpm test:ci` (62 suites + 26 node tests).
- Flag `NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED=off` en Vercel (decisión de producto: foundation invisible, no entrega valor de usuario, no se reactiva hasta rollout staged documentado).
- Bugfix crítico PR #243: `routeGuard` ya no redirige con flag OFF (fail-open).
- PR #235 marcado con `size:exception` (636 líneas, sobre budget de 400; accepted por defensa real de contrato de datos sensibles).

**Riesgos residuales:**
- Retention defaults en `lib/platform/participation.ts` marcados "pending legal review".
- DB adapters reales (`FamilyReadRepository`, `ParticipationReadRepository`) son interfaces con stubs; las impls con Supabase son scope de fases futuras.
- `uno_a_uno` drift: preflight bloquea uso; decisión de producto pendiente (baseline/archive/reintroduce).
- `lib/platform/**` no está en `jest.config.ts` `collectCoverageFrom` (sugerido como follow-up).

### Fase 2 — Dream Team Global Base

**Objetivo:** modelar a toda persona que sirve.

Incluye:

- servicio por experiencia/equipo/rol;
- jerarquías flexibles y configurables;
- director/coordinador/voluntario opcional según área;
- estado de servicio;
- requisitos configurables por área/rol;
- conexión con Grupos de Vida, DPS, Talleres, Niños, Estudiantes y otras experiencias.

**No incluye todavía:** onboarding completo, cursos, flujos avanzados de capacitación ni firmas digitales.

### Fase 3 — Operating Core

**Objetivo:** construir la tubería operativa común.

Incluye:

- servicios configurables;
- eventos, actividades y talleres;
- inscripciones asistidas o por link público;
- búsqueda de persona existente antes de crear una nueva;
- attendance/participation ledger común;
- experiencias de captura específicas por dominio;
- capacidad base y capacidad operativa por instancia;
- formularios simples;
- biblioteca simple de recursos;
- notificaciones en sistema y por email;
- dashboards operativos básicos.

**No incluye todavía:** portal self-service completo, mensajería interna, integración profunda con WhatsApp ni analytics avanzados.

### Fase 4 — Seguimiento Pastoral: 1:1 + Triada

**Objetivo:** ofrecer seguimiento simple, seguro y transversal.

Incluye:

- 1:1 para Grupos de Vida;
- 1:1 para The Living Room;
- soporte para 1:1 individual o de pareja;
- reportes generales, no detalles pastorales sensibles profundos;
- visibilidad para líder creador, director inmediato y pastor/admin con permiso;
- Triada como relación de seguimiento/servicio.

**Regla:** mantenerlo simple, sin workflows pesados.

### Fase 5 — Talleres de Crecimiento Base

**Objetivo:** operar talleres formativos que alimentan la Ruta Espiritual.

Incluye:

- catálogo de talleres;
- fechas/cohortes;
- inscripción;
- asistencia;
- completación;
- líderes, co-líderes y servidores;
- conexión con Dream Team para quienes sirven;
- historial de participación para quienes asisten.

**Importante:** asistir a un taller no convierte a una persona en Dream Team; servir en el taller sí.

### Fase 6 — The Living Room Operativo

**Objetivo:** operar la etapa universitaria entre Estudiantes y Adultos.

Incluye:

- grupos universitarios propios;
- asistencia a grupos/eventos;
- uso del 1:1;
- servicio y conexión con Dream Team;
- mentoría;
- transición hacia Adultos / Grupos de Vida;
- métricas de salud comunitaria.

**Importante:** The Living Room no es NextGen ni Grupos de Vida.

### Fase 7 — DPS Operations

**Objetivo:** construir herramientas específicas de DPS sobre Dream Team y Operating Core.

Incluye:

- estructura multiárea de DPS;
- dashboards DPS;
- evaluaciones vía formularios;
- recursos;
- repertorio;
- media/comunicaciones;
- atención al invitado;
- herramientas específicas por subárea según prioridad.

**Reglas:** DPS no es solo música. GlobalConnect complementa Planning Center Services; no lo reemplaza. No hay integración técnica con PCO en la primera etapa.

### Fase 8 — NextGen Foundation

**Objetivo:** preparar la base común de Niños + Estudiantes.

Incluye:

- Niños: Waumbaland + Upstreet;
- Estudiantes: Transit + InsideOut;
- menores/adolescentes;
- padres/tutores;
- datos sensibles con permisos estrictos;
- comunicación base;
- transiciones asistidas por director;
- permisos por edad/contexto.

### Fase 9 — Niños Operativo

**Objetivo:** operar Waumbaland + Upstreet.

Incluye:

- ambientes y salones como unidad operativa;
- check-in/check-out manual/asistido;
- capacidad por servicio/salón;
- necesidades especiales;
- autorizados para recoger;
- alertas;
- reportes básicos.

**Posterior:** QR, etiquetas, impresoras, kioscos y self check-in.

### Fase 10 — Estudiantes Operativo

**Objetivo:** operar Transit + InsideOut.

Incluye:

- registro de adolescentes;
- visitantes;
- grupos propios de Estudiantes;
- asistencia nominal;
- líderes de grupo;
- comunicación con estudiantes/padres;
- métrica Foyer → Living Room → Kitchen;
- liderazgo estudiantil básico;
- transición hacia The Living Room.

**No incluye temprano:** campamentos completos, pagos, becas, lista de espera ni consentimientos digitales avanzados.

### Fase 11 — Ruta Espiritual Completa

**Objetivo:** construir el journey espiritual longitudinal.

Incluye:

- pasos de ruta;
- progreso;
- hitos;
- talleres/retiros completados;
- recomendaciones;
- dashboards de crecimiento;
- próximos pasos personalizados.

### Fase 12 — Portal / Self-service

**Objetivo:** habilitar acceso para miembros normales, padres y voluntarios.

Incluye:

- cuenta de miembro;
- inscripción autenticada;
- historial personal;
- actualización de datos;
- portal de padres;
- vincular hijos;
- autogestión de inscripciones;
- notificaciones personalizadas.

### Fase 13 — Campamentos / Eventos Avanzados

**Objetivo:** operar eventos complejos.

Incluye:

- campamentos;
- pagos registrados;
- becas;
- lista de espera;
- documentos/consentimientos;
- ficha médica extendida;
- validación legal futura.

**Primera aproximación recomendada:** tracking de documentos físicos recibidos/verificados antes que firma digital legal.

### Fase 14 — Logística de Voluntarios

**Objetivo:** manejar refrigerio y operación semanal de servidores.

Incluye:

- planificación semanal de servidores;
- apertura de registro los lunes;
- cierre de registro miércoles 4:00 p.m.;
- confirmación de refrigerio;
- reporte para Cocina / Atención al Voluntario;
- QR de validación;
- control de entrega el domingo.

**Depende de:** portal/acceso de voluntarios, notificaciones y Dream Team maduro.

### Fase 15 — Hardware / Automatización

**Objetivo:** optimizar procesos ya probados.

Incluye:

- tablets;
- kioscos;
- impresoras;
- etiquetas;
- QR scanning;
- self check-in;
- automatizaciones avanzadas.

## Decisiones arquitectónicas clave

### Persona y permisos

- Una persona puede tener muchos contextos.
- Una relación da contexto, no permisos infinitos.
- Ser padre no permite administrar Niños.
- Ser bajista no permite administrar DPS.
- Asistir a un taller no permite administrarlo.
- Ser director de etapa no permite ver todos los 1:1 de la iglesia.

### Grupos y participación

- Grupos de Vida se conserva como dominio existente de producción.
- Grupos de Estudiantes son propios de Estudiantes.
- Grupos de The Living Room son universitarios propios.
- Niños usa ambientes/salones, no grupos pequeños.
- Todos deben alimentar historial/participación común cuando aplique.

### Asistencia

- Operating Core mantiene un ledger común.
- Cada dominio tiene experiencia de captura propia.
- Grupos de Vida no se reemplaza de golpe; se integra/adapta con cuidado.

### Capacidad

- Existe capacidad base y capacidad operativa por instancia.
- La capacidad puede cambiar por fecha, servicio, ambiente, voluntarios disponibles o contexto.

### Comunicación

- Primera versión: notificaciones en sistema, email, links compartibles y flujos compatibles con WhatsApp manual.
- Futuro: mensajería interna e integración profunda con WhatsApp.

## Guía para futuros agentes SDD

Cada agente debe:

1. Leer este roadmap antes de proponer.
2. Investigar el código actual antes de diseñar.
3. Revisar documentos fuente si la fase toca Niños, Estudiantes, The Living Room o DPS.
4. No rediseñar Grupos de Vida salvo instrucción explícita.
5. Mantener persona única y relaciones contextuales.
6. Usar capabilities scoped, no crear roles infinitos.
7. Separar servicio, participación, familia, liderazgo y permisos.
8. Preservar operación sin hardware cuando aplique.
9. Reportar al cerrar:
   - qué investigó;
   - qué propuso;
   - riesgos;
   - dependencias;
   - qué queda fuera;
   - validación contra este roadmap.

## Documentos fuente

- `/Users/isaacpaezz/Documents/#Global/SISTEMA GDV/NiÑos validacion directores 2026.docx`
- `/Users/isaacpaezz/Documents/#Global/SISTEMA GDV/Estudiantes validación directores (1).docx`
- `/Users/isaacpaezz/Documents/#Global/SISTEMA GDV/The Living Room validación directores (1) (1).docx`
- `/Users/isaacpaezz/Documents/#Global/SISTEMA GDV/DPS validación directores.docx.pdf`

## Próximo paso

Preparar el handoff detallado de **Fase 1 — Platform Foundation** para que un agente SDD pueda investigar, proponer y diseñar sin perder el contexto del programa completo.

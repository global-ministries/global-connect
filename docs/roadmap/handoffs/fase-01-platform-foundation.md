# Handoff — Fase 1: Platform Foundation

Este handoff es una guía para que un agente/orquestador SDD investigue y prepare la fase **Platform Foundation**. No es una especificación final ni una instrucción para implementar directamente.

## Objetivo de la fase

Crear el cimiento común para que GlobalConnect pueda conectar personas, familias, experiencias, responsabilidades, permisos e historial sin duplicar identidades ni romper Grupos de Vida.

## Resultado esperado del agente

El agente debe producir artefactos SDD para esta fase:

1. exploración técnica del estado actual;
2. propuesta de cambio;
3. especificación funcional;
4. diseño técnico;
5. plan de tareas por slices seguros.

No debe implementar hasta que esos artefactos sean revisados y aprobados.

## Contexto estratégico

Platform Foundation desbloquea todas las fases posteriores:

- Dream Team necesita saber quién sirve y en qué experiencia/equipo.
- Operating Core necesita una persona única para inscripciones, asistencia e historial.
- 1:1 necesita scopes claros de líder/director/pastor/admin.
- Talleres de Crecimiento necesita participantes, líderes y completación.
- The Living Room, Niños y Estudiantes necesitan grupos/ambientes propios sin mezclarse con Grupos de Vida.
- Portal/Self-service futuro necesita cuentas normales y vinculación con personas existentes.

## Principios no negociables

- Una persona puede tener múltiples contextos simultáneos.
- Una relación da contexto, no permisos infinitos.
- Grupos de Vida es producción-crítico y no se rediseña en esta fase.
- Roles globales deben seguir siendo pocos.
- Nuevas responsabilidades deben modelarse con scopes/capabilities, no con explosión de roles.
- Padres/tutores y menores deben estar previstos desde el modelo aunque NextGen opere más adelante.
- El sistema debe soportar personas sin cuenta auth.
- Todo cambio debe ser aditivo o compatible con producción.

## Alcance funcional

### 1. Persona única

Investigar y diseñar cómo GlobalConnect debe representar una persona única que puede tener o no cuenta de usuario.

Debe cubrir:

- persona con cuenta auth;
- persona sin cuenta auth;
- miembro existente;
- visitante/persona nueva;
- padre/tutor;
- menor/adolescente;
- voluntario/servidor;
- líder/director/coordinador según contexto.

### 2. Relaciones familiares y contextuales

Debe preparar el modelo para:

- cónyuges;
- padres/tutores;
- hijos;
- autorizados o contactos relacionados;
- relaciones de liderazgo o cuidado;
- relaciones futuras de transición.

### 3. Experiencias

Crear o diseñar la capa conceptual de experiencias:

```text
Experiencias
├── Grupos de Vida
├── Niños
├── Estudiantes
├── The Living Room
├── DPS
├── Talleres de Crecimiento
└── futuras experiencias
```

Las experiencias organizan responsabilidad y alcance. No son lo mismo que Dream Team.

### 4. Access Foundation

Diseñar el modelo para:

- roles globales pocos;
- responsabilidades scoped por experiencia/equipo/grupo/salón;
- capabilities scoped;
- grants auditables;
- helpers de sesión que devuelvan responsabilidades activas;
- menú/dashboard contextual según responsabilidades.

Referencia conceptual: el patrón de capabilities de soporte sirve como inspiración, pero no debe reutilizarse directamente como tabla genérica.

### 5. Protección de Grupos de Vida

Debe investigar el sistema actual de Grupos de Vida y proponer integración segura.

No se permite:

- reescribir asistencia de Grupos de Vida;
- cambiar semántica de roles existentes sin migración compatible;
- romper dashboards existentes;
- mezclar grupos NextGen con Grupos de Vida;
- alterar flujos de producción sin plan de compatibilidad.

### 6. Historial longitudinal base

Diseñar una base para capturar eventos de participación/historial desde temprano.

Ejemplos futuros:

- inscripción;
- asistencia;
- completación;
- servicio activo;
- transición;
- asignación a grupo/equipo;
- documento recibido;
- 1:1 registrado;
- cambios de estado relevantes.

No se requiere timeline visual en esta fase.

### 7. Dedupe / búsqueda de persona existente

Toda inscripción o captura futura debe buscar una persona existente antes de crear una nueva.

Esta fase debe investigar y proponer la base para evitar duplicados.

## Fuera de alcance

- Implementar Dream Team completo.
- Implementar check-in/check-out de Niños.
- Implementar grupos de Estudiantes o The Living Room.
- Implementar Portal/Self-service.
- Implementar Ruta Espiritual completa.
- Implementar campamentos.
- Rediseñar Grupos de Vida.
- Crear una mensajería interna.
- Crear hardware/QR/kioscos.

## Investigación obligatoria en el repo

El agente debe investigar como mínimo:

- `lib/supabase/database.types.ts`;
- `lib/getUserWithRoles.ts`;
- `lib/auth/requireAuth.ts`;
- `hooks/useCurrentUser.ts`;
- `lib/dashboard/obtenerDatosDashboard.ts`;
- `app/(auth)/dashboard/page.tsx`;
- `components/ui/sidebar-moderna.tsx`;
- `components/ui/header-movil.tsx`;
- `components/ui/menu-inferior-movil.tsx`;
- acciones y migraciones actuales de Grupos de Vida;
- patrón de `support_user_capabilities` y helpers relacionados;
- tablas actuales de usuarios, familias, relaciones, roles y grupos;
- estado de tablas `uno_a_uno` y posible drift entre DB live/types/migraciones.

## Preguntas que el agente debe responder

1. ¿Qué parte del modelo actual ya soporta persona única y qué parte está acoplada a usuario auth?
2. ¿Cómo se deben representar personas sin cuenta sin romper flujos existentes?
3. ¿Qué estructura mínima de experiencias se necesita para fases futuras?
4. ¿Cómo se modelan responsabilidades scoped sin explotar roles globales?
5. ¿Qué debe cambiar en menú/dashboard para mostrar múltiples responsabilidades?
6. ¿Cómo se integra Grupos de Vida sin rediseñarlo?
7. ¿Qué historial longitudinal mínimo debe capturarse desde esta fase?
8. ¿Qué migraciones serían aditivas y seguras?

## Validación con ejemplos

El diseño debe soportar este caso:

```text
Una persona es director de etapa de Grupos de Vida,
sirve en DPS Música como bajista,
está casada,
tiene un hijo en Waumbaland,
tiene otro hijo en InsideOut,
y asiste como participante a un taller De hombre a hombre.
```

El sistema debe separar:

- rol global;
- responsabilidad en Grupos de Vida;
- servicio en Dream Team/DPS;
- relaciones familiares;
- participación en taller;
- permisos reales por scope.

## Criterios de aceptación del diseño

- El diseño mantiene Grupos de Vida funcionando sin rediseño.
- El diseño permite múltiples contextos por persona.
- El diseño evita crear roles globales por cada función.
- El diseño prepara menores/tutores sin construir NextGen todavía.
- El diseño prepara dashboard/menu contextual.
- El diseño permite historial longitudinal futuro.
- El diseño tiene una estrategia clara de deduplicación.
- El diseño identifica riesgos de RLS, permisos y migraciones.

## Riesgos principales

- Romper Grupos de Vida en producción.
- Duplicar personas por no resolver identidad primero.
- Crear roles excesivos y difíciles de mantener.
- Exponer información familiar, pastoral o de menores por scopes débiles.
- Diseñar solo para adultos y luego rediseñar para NextGen.
- Ignorar drift de `uno_a_uno`.

## Reporte requerido al finalizar

El agente debe reportar:

```text
status:
resumen_ejecutivo:
artefactos_creados:
evidencia_investigada:
decisiones_propuestas:
riesgos:
dependencias:
fuera_de_alcance:
validacion_contra_roadmap:
preguntas_abiertas:
siguiente_recomendado:
```

## Documentos que debe leer antes de trabajar

- `docs/roadmap/globalconnect-roadmap-maestro-v1.md`
- Este handoff.
- Documentos fuente externos solo si necesita validar necesidades futuras de Niños, Estudiantes, The Living Room o DPS.

## Nota para el orquestador

No lanzar implementación directa desde este handoff. Primero usarlo para crear el SDD específico de Fase 1 y revisar sus artefactos antes de permitir `sdd-apply`.

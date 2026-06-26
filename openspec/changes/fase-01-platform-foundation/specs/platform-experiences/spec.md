# Especificación: platform-experiences

## Propósito

Definir Experiencias como contextos organizacionales que agrupan operación, responsabilidades y navegación sin confundirse con Dream Team.

## Requirements

### Requirement: Catálogo organizacional de Experiencias

El sistema MUST representar Experiencias como contextos organizacionales. El catálogo inicial MUST cubrir Grupos de Vida, DPS, Niños, Estudiantes, The Living Room, Talleres de Crecimiento y futuras experiencias. Una Experiencia MUST organizar scopes; MUST NOT ser un rol global.

#### Scenario: Contexto disponible para responsabilidades
- GIVEN una responsabilidad se asigna en DPS Música
- WHEN se evalúa su scope
- THEN el sistema la asocia a la Experiencia DPS
- AND puede distinguir equipo/subcontexto sin crear rol global.

#### Scenario: Experiencia futura
- GIVEN una nueva experiencia se agrega después
- WHEN se define en el catálogo
- THEN puede participar del mismo contrato de Persona, scopes e historial
- AND no requiere duplicar identidad.

### Requirement: Experiencia no equivale a Dream Team

El sistema MUST separar pertenencia/contexto de Experiencia, servicio Dream Team y participación. Dream Team MUST derivarse de servicio activo en una experiencia/equipo, no de asistir, tener familia o aparecer en el catálogo.

#### Scenario: Servicio en DPS Música
- GIVEN una Persona sirve como bajista en DPS Música
- WHEN se calcula su contexto de servicio
- THEN puede contar como Dream Team por servicio scoped
- AND MUST NOT recibir administración global de DPS.

#### Scenario: Participación en taller
- GIVEN una Persona asiste a “De hombre a hombre”
- WHEN se evalúa Dream Team
- THEN la asistencia registra participación
- AND MUST NOT convertirla en servidor ni administrador del taller.

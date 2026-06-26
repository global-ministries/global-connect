# Especificación: platform-participation-history

## Propósito

Definir un contrato longitudinal genérico para participación e historial, reutilizable por experiencias futuras sin crear ledgers separados por módulo.

## Requirements

### Requirement: Ledger longitudinal genérico

El sistema MUST definir un único contrato genérico de historial/participación para eventos relevantes de una Persona. Operating Core concretará eventos y captura después. El sistema MUST NOT diseñar ledgers aislados por módulo cuando el evento representa participación transversal.

#### Scenario: Evento transversal
- GIVEN una Persona asiste a una actividad o sirve en una experiencia
- WHEN el dominio registra participación futura
- THEN produce un evento compatible con el contrato común.

#### Scenario: Módulo intenta crear ledger propio
- GIVEN una experiencia propone historial aislado para asistencia equivalente
- WHEN se revisa la spec
- THEN debe integrarse al ledger común o justificar excepción.

### Requirement: Semántica mínima de evento

El contrato de evento MUST distinguir Persona, experiencia o dominio fuente, tipo de evento, fecha/hora, scope/referencia y actor cuando aplique. El evento MUST describe historial; MUST NOT otorgar permisos por sí mismo.

#### Scenario: Taller “De hombre a hombre”
- GIVEN una Persona participa en “De hombre a hombre”
- WHEN se registra historial
- THEN el evento indica participación en Talleres de Crecimiento
- AND MUST NOT otorgar Dream Team, liderazgo ni administración de taller.

#### Scenario: Servicio y participación separados
- GIVEN la misma Persona sirve como bajista DPS y asiste a un taller
- WHEN se consulta historial
- THEN ambos eventos pueden coexistir con tipos/sources distintos
- AND no se mezclan permisos entre ellos.

### Requirement: Lectura, sensibilidad y retención del ledger

El ledger MUST clasificar sensibilidad de eventos, aplicar límites de lectura por Persona/scope/fuente, definir retención por tipo de evento y reforzar acceso mediante backend/RLS. Lecturas agregadas o longitudinales MUST minimizar datos y MUST NOT exponer historial sensible sin autorización explícita.

#### Scenario: Lectura longitudinal autorizada
- GIVEN un actor tiene capability scoped para ver historial de una Persona dentro de una experiencia
- WHEN consulta el ledger
- THEN el sistema devuelve solo eventos del scope permitido
- AND aplica clasificación de sensibilidad y retención.

#### Scenario: Lectura fuera de boundary
- GIVEN un actor intenta leer eventos de otra experiencia, familia o dato sensible sin grant
- WHEN consulta el ledger
- THEN el sistema MUST denegar por backend/RLS
- AND MUST registrar la denegación sin revelar existencia de datos sensibles.

### Requirement: Drift de `uno_a_uno` como bloqueo futuro

El sistema MUST documentar el drift de `uno_a_uno` como bloqueo para implementación futura de 1:1. Antes de cualquier uso futuro, la implementación MUST ejecutar preflight estático/schema que verifique migración local, tipos, tablas live esperadas, RLS y rollback. Esta fase MUST NOT corregir, migrar, usar ni reconciliar tablas `uno_a_uno`; solo debe preservar el riesgo para diseño posterior.

#### Scenario: Evento 1:1 solicitado temprano
- GIVEN un diseño intenta basarse en `uno_a_uno` durante Fase 1
- WHEN se valida contra el alcance
- THEN el uso MUST bloquearse hasta reconciliación futura
- AND no se aplica migración ni reparación ahora.

#### Scenario: Preflight `uno_a_uno` falla
- GIVEN una implementación futura toca 1:1 sin baseline migration, archivo formal del drift o reintroducción explícita
- WHEN corre el preflight estático/schema
- THEN el cambio MUST fallar antes de implementación
- AND debe exigir verificación RLS y criterios de rollback.

#### Scenario: Recuperación futura aprobada
- GIVEN se decide recuperar `uno_a_uno`
- WHEN se propone baseline, archivo o reintroducción formal
- THEN debe incluir verificación RLS, migración/archivo versionado y rollback probado
- AND no debe mezclar esa recuperación con cambios de ledger no relacionados.

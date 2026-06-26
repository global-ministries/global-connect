# Especificación: platform-persona

## Propósito

Definir Persona como identidad canónica de dominio para GlobalConnect, separada de la cuenta de autenticación y compatible con `usuarios` existente.

## Requirements

### Requirement: Persona canónica separada de auth

El sistema MUST tratar a Persona como el concepto canónico para una persona real. `usuarios` MUST evaluarse y adaptarse primero como representación operacional de Persona. Una Persona MAY tener cuenta auth, pero Persona MUST NOT ser equivalente a cuenta auth. La sesión autenticada MUST resolverse desde `auth.uid()`/server session; un `personaId` provisto por cliente MUST NOT funcionar como identidad autenticada.

#### Scenario: Persona con cuenta auth
- GIVEN una Persona existente tiene `usuarios.id` y una cuenta auth vinculada
- WHEN la sesión resuelve identidad de dominio
- THEN el sistema usa la Persona como sujeto funcional
- AND la cuenta auth solo autentica acceso.

#### Scenario: `personaId` cliente rechazado como identidad
- GIVEN un cliente envía un `personaId` distinto del sujeto resuelto por `auth.uid()`
- WHEN el backend construye sesión o permisos
- THEN el sistema MUST ignorarlo como identidad autenticada
- AND solo MAY usarlo como filtro si el sujeto backend tiene scope explícito.

#### Scenario: Persona sin cuenta auth
- GIVEN una Persona existe para menor, visitante, familiar o participante sin login
- WHEN un flujo futuro necesita referenciarla
- THEN el sistema puede relacionarla por Persona
- AND MUST NOT crear una cuenta auth obligatoria.

#### Scenario: Persona sin auth no abre sesión directa
- GIVEN una Persona no tiene cuenta auth vinculada
- WHEN se solicita sesión, menú o dashboard directo
- THEN el sistema MUST NOT abrir acceso directo para esa Persona
- AND solo puede exponerse mediante cuenta vinculada o actor autorizado con scope explícito.

#### Scenario: Nueva tabla no aprobada
- GIVEN una propuesta intenta crear identidad paralela sin evaluar `usuarios`
- WHEN se revisa el diseño
- THEN el cambio MUST justificar por qué `usuarios` no puede adaptarse
- AND MUST NOT duplicar identidades prematuramente.

### Requirement: Búsqueda y deduplicación previa

El sistema MUST preparar búsqueda de Persona existente antes de crear registros futuros con minimización de datos, resultados enmascarados, auditoría y límites de lookup por flujo/actor/scope. La deduplicación SHOULD considerar señales mínimas como email, teléfono, cédula, nombre/apellido y fecha de nacimiento cuando exista. El sistema MUST NOT fusionar Personas sin regla explícita y trazable, y MUST NOT permitir enumeración de PII.

#### Scenario: Registro futuro encuentra coincidencia
- GIVEN una inscripción futura aporta email o teléfono ya asociado a una Persona
- WHEN se busca antes de crear
- THEN el sistema presenta datos mínimos/enmascarados según autorización
- AND registra auditoría del lookup.

#### Scenario: Coincidencia ambigua
- GIVEN dos Personas comparten señales parciales
- WHEN la deduplicación no alcanza confianza suficiente
- THEN el sistema MUST conservar ambas sin fusionarlas automáticamente
- AND debe marcar revisión humana futura.

#### Scenario: Búsqueda sin autorización suficiente
- GIVEN un actor intenta buscar por datos personales fuera de su flujo o scope permitido
- WHEN ejecuta el lookup
- THEN el sistema MUST denegar o devolver resultado no enumerable
- AND MUST registrar la denegación sin exponer PII adicional.

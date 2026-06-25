# Especificación: platform-family-context

## Propósito

Definir relaciones familiares/contextuales y permisos base para cónyuges, padres/tutores, hijos y familiares existentes, sin construir operación NextGen. `autorizado` y `contacto` son conceptos futuros explícitos de relación/capability salvo que nueva evidencia los mapee a tipos existentes.

## Requirements

### Requirement: Relaciones como contexto, no permisos amplios

El sistema MUST modelar relaciones como contexto de Persona, no como permisos amplios. La evidencia actual de `enum_tipo_relacion` cubre `conyuge`, `padre`, `hijo`, `tutor`, `hermano` y `otro_familiar`; `autorizado` y `contacto` MUST tratarse como conceptos futuros explícitos de relación/capability hasta que evidencia de esquema/producto indique otro mapeo. Una relación MAY habilitar visibilidad o acciones base explícitas, pero MUST NOT otorgar permisos operativos de experiencia por sí sola.

#### Scenario: Cónyuge vinculado
- GIVEN dos Personas están vinculadas como cónyuges
- WHEN se consulta contexto familiar autorizado
- THEN el sistema reconoce la relación
- AND MUST NOT otorgar liderazgo, administración o acceso pastoral por esa relación.

#### Scenario: Contacto/autorizado vinculado
- GIVEN una implementación futura introduce autorizado o contacto como vínculo explícito
- WHEN una experiencia evalúa elegibilidad
- THEN puede usar el vínculo como contexto limitado
- AND MUST validar capability/scope antes de exponer datos sensibles.

#### Scenario: Tipo existente no equivale a autorizado
- GIVEN una relación actual tiene tipo `otro_familiar`, `hermano`, `padre`, `hijo`, `tutor` o `conyuge`
- WHEN se evalúa permiso de autorizado/contacto
- THEN el sistema MUST NOT inferirlo automáticamente
- AND requiere mapeo explícito o evidence-backed capability.

### Requirement: Menores y tutores con permisos base

El sistema MUST preparar menores y tutores con protección de datos sensibles. Padres/tutores MAY tener permisos base explícitos para ver vínculo familiar, datos mínimos del menor necesarios para contacto/consentimiento, y gestionar contactos autorizados definidos cuando una policy lo permita. Contactos/autorizados MAY recibir solo visibilidad/acciones mínimas para contacto o retiro según capability. Todo acceso MUST ser deny-by-default y reforzado por backend/RLS; MUST NOT administrar salones, grupos, asistencia, check-in/check-out o reportes NextGen por ser tutores/contactos/autorizados.

#### Scenario: Padre de Waumbaland e InsideOut
- GIVEN una Persona es padre/tutor de un niño en Waumbaland y un estudiante en InsideOut
- WHEN se evalúa su contexto familiar
- THEN ve relación familiar y elegibilidad de permisos base definidos
- AND MUST NOT operar Niños ni Estudiantes sin responsabilidad scoped.

#### Scenario: Menor sin cuenta auth
- GIVEN un menor existe como Persona sin cuenta auth
- WHEN se relaciona con tutor o contacto
- THEN el sistema conserva identidad y contexto familiar
- AND MUST proteger datos sensibles por autorización explícita.

#### Scenario: Tutor sin responsabilidad operativa
- GIVEN una Persona es tutor de un menor
- WHEN intenta operar salón, asistencia, check-in/check-out o reportes NextGen
- THEN el sistema MUST denegar por defecto
- AND solo MAY permitir la acción con responsabilidad/capability scoped independiente.

#### Scenario: Contacto autorizado con datos mínimos
- GIVEN una Persona está autorizada explícitamente para contacto o retiro
- WHEN consulta información del menor
- THEN el sistema MUST exponer solo datos mínimos permitidos por policy
- AND MUST NOT exponer historial sensible, pastoral, asistencia o datos de otros familiares.

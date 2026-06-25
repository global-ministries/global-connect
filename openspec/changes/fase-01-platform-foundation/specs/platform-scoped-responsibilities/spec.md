# Especificación: platform-scoped-responsibilities

## Propósito

Definir responsabilidades y capabilities scoped para sesión, menú y dashboard multi-contexto con pocos roles globales.

## Requirements

### Requirement: Responsabilidades y capabilities con scope

El sistema MUST mantener pocos roles globales y autorizar trabajo operativo mediante responsabilidades/capabilities scoped por experiencia, equipo, grupo, etapa, salón u otro contexto aprobado. Los grants MUST ser allowlisted, auditables y preparados para administración futura; esta fase MUST NOT construir UI de administración de grants. Scopes ausentes, malformados, desconocidos, duplicados o conflictivos MUST fallar cerrado.

#### Scenario: Capability scoped permitida
- GIVEN una Persona tiene responsabilidad de director de etapa en Grupos de Vida
- WHEN solicita ver datos de su etapa
- THEN el sistema permite solo acciones dentro de ese scope.

#### Scenario: Rol global innecesario rechazado
- GIVEN una nueva función puede modelarse como responsabilidad scoped
- WHEN se propone crear un rol global específico
- THEN el diseño MUST preferir scope/capability
- AND MUST NOT expandir roles globales sin justificación.

#### Scenario: Scope inválido falla cerrado
- GIVEN una capability llega sin scope, con scope malformado, desconocido, duplicado o conflictivo
- WHEN se evalúa autorización
- THEN el sistema MUST denegar acceso
- AND MUST registrar la denegación para auditoría.

### Requirement: Contrato de sesión, menú y dashboard contextual

El sistema MUST exponer en la primera slice un contrato de lectura para sesión, menú y dashboard que incluya Persona, roles globales mínimos, responsabilidades activas, capabilities y contextos visibles. La identidad de sesión MUST derivarse de `auth.uid()`/server session; `personaId` cliente MUST NOT autenticar. La UI MUST filtrar navegación por permisos reales y MUST NOT mostrar acciones fuera de scope, mientras backend/RLS MUST denegar acceso directo equivalente.

#### Scenario: Persona multi-contexto validada
- GIVEN una Persona es director de etapa GDV, bajista DPS, cónyuge, padre de hijos en Waumbaland e InsideOut, y participante de “De hombre a hombre”
- WHEN se construyen sesión, menú y dashboard
- THEN ve contextos de GDV etapa, DPS Música propio, Familia e historial de taller
- AND MUST NOT ver administración DPS, operación NextGen, administración de taller ni 1:1 global sin grants.

#### Scenario: Acción visible sin permiso
- GIVEN una entrada de menú requiere capability ausente
- WHEN se renderiza navegación o dashboard
- THEN la entrada MUST ocultarse o quedar inaccesible
- AND el servidor MUST denegar acceso directo equivalente.

#### Scenario: Persona sin auth en navegación
- GIVEN una Persona no tiene cuenta auth vinculada
- WHEN se construye sesión, menú o dashboard
- THEN el sistema MUST NOT darle acceso directo
- AND solo MAY exponerla a un actor autenticado con relación/capability scoped explícita.

#### Scenario: Falla de sesión de plataforma
- GIVEN PlatformSession o un adapter falla durante menú/dashboard
- WHEN se renderiza la experiencia autenticada
- THEN el sistema MUST conservar navegación/dashboard legado cuando sea seguro
- AND MUST denegar capacidades nuevas hasta recuperar el contrato.

### Requirement: Auditoría y observabilidad de grants

El sistema MUST auditar grants/capabilities con actor, fuente, estado before/after cuando aplique, decisión y motivo de denegación. Las denegaciones y anomalías MUST producir métricas/alertas revisables en producción antes de ampliar rollout.

#### Scenario: Grant concedido o revocado
- GIVEN un grant cambia en implementación futura
- WHEN se persiste el cambio
- THEN el sistema MUST registrar actor, fuente, before/after y decisión
- AND el evento debe estar disponible para revisión operativa.

#### Scenario: Denegación anómala en producción
- GIVEN aumentan denegaciones por capability o scope desconocido
- WHEN se superan umbrales definidos
- THEN el sistema MUST emitir métrica/alerta
- AND el rollout debe detenerse o revertir al fallback seguro.

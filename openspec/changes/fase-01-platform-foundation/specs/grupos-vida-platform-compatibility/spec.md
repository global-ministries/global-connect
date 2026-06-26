# Especificación: grupos-vida-platform-compatibility

## Propósito

Definir compatibilidad aditiva entre Platform Foundation y Grupos de Vida sin rediseñar, reemplazar ni alterar comportamiento productivo existente.

## Requirements

### Requirement: Preservar flujos productivos de Grupos de Vida

El sistema MUST conservar las tablas, RPCs, RLS, acciones, dashboards y flujos actuales de Grupos de Vida como source of truth operativo. Platform Foundation MUST NOT reemplazar asistencia, visibilidad, edición, reportes ni semántica de roles de Grupos de Vida en esta fase.

#### Scenario: Asistencia GDV existente
- GIVEN un líder registra asistencia con el flujo actual de Grupos de Vida
- WHEN Platform Foundation se diseña
- THEN ese flujo sigue siendo válido
- AND MUST NOT ser reemplazado por el ledger genérico.

#### Scenario: RPC/RLS existente
- GIVEN una RPC o policy actual decide visibilidad de grupo
- WHEN una pantalla GDV existente consulta permisos
- THEN la decisión productiva se conserva
- AND Platform Foundation no la reinterpreta directamente.

### Requirement: Integración mediante adaptadores/contratos

El sistema MUST integrar Grupos de Vida mediante adaptadores o contratos que expongan contexto de Persona, experiencia y scope sin mutar el dominio GDV. Los adapters SHOULD mapear responsabilidades existentes a contextos de plataforma para sesión, menú, dashboard e historial futuro.

#### Scenario: Director de etapa GDV
- GIVEN una Persona es director de etapa por el modelo actual de GDV
- WHEN se construye contexto de plataforma
- THEN aparece una responsabilidad scoped “Grupos de Vida — director de etapa”
- AND sus acciones siguen delegadas a permisos GDV existentes.

#### Scenario: Adapter no disponible
- GIVEN el adapter GDV no puede mapear un permiso con seguridad
- WHEN se evalúa acceso desde plataforma
- THEN el sistema MUST fallar cerrado
- AND debe conservar acceso por el flujo GDV existente si corresponde.

### Requirement: Sin permisos cruzados desde Grupos de Vida

El sistema MUST NOT usar una responsabilidad de Grupos de Vida para otorgar permisos en DPS, NextGen, Talleres, familia o 1:1 global. Cualquier permiso cruzado requiere responsabilidad/capability explícita en el scope correspondiente.

#### Scenario: Persona del caso de validación
- GIVEN la Persona es director de etapa GDV, bajista DPS, padre/tutor y participante de taller
- WHEN se evalúan permisos
- THEN puede actuar como director solo dentro de GDV autorizado
- AND MUST NOT administrar DPS, NextGen, Talleres ni 1:1 por su responsabilidad GDV.

# Propuesta: Fase 1 — Platform Foundation

## Intención

Definir la base SDD para una Persona única con múltiples contextos, sin duplicar identidades ni romper Grupos de Vida. Esta fase es planificación: contrato funcional/técnico para identidad, experiencias, acceso contextual, familia e historial.

## Alcance

### Incluido
- Evaluar `usuarios` como Persona canónica operacional; cuenta auth opcional.
- Diseñar experiencias, responsabilidades/capabilities scoped, sesión, menú y dashboard contextual.
- Preparar menores/tutores, dedupe e historial longitudinal genérico.
- Definir compatibilidad aditiva con Grupos de Vida y documentar `uno_a_uno` como drift bloqueante futuro.

### Fuera de alcance
- Implementar producto, migraciones funcionales, Supabase apply o `sdd-apply`.
- Rediseñar Grupos de Vida, crear admin UI de grants o construir flujos NextGen/DPS/Talleres.
- Corregir o migrar `uno_a_uno` en esta fase.

## Capacidades

### Nuevas capacidades
- `platform-persona`: Persona única sobre `usuarios`, auth opcional y dedupe/búsqueda.
- `platform-experiences`: catálogo de experiencias y contextos organizacionales.
- `platform-scoped-responsibilities`: responsabilidades, capabilities scoped, grants auditables y contrato de sesión/menu/dashboard.
- `platform-family-context`: relaciones familiares, menores/tutores y permisos base sin operación NextGen.
- `platform-participation-history`: ledger longitudinal genérico para participación/historial.
- `grupos-vida-platform-compatibility`: integración aditiva con Grupos de Vida sin reemplazar RPCs/RLS actuales.

### Capacidades modificadas
- Ninguna. `support-ticket-system` y `casas-anfitrionas-permissions` quedan como precedentes, no como requisitos modificados.

## Enfoque

Proponer una foundation aditiva: `usuarios.id` representa Persona mientras el diseño valida límites; servicio, participación, familia, liderazgo y permisos se mantienen separados. El patrón de soporte inspira capabilities auditables, pero no se reutiliza como tabla global.

## Áreas de implementación futura y evidencia

| Área | Impacto planificado | Descripción |
|------|--------------------|-------------|
| `lib/getUserWithRoles.ts`, `lib/auth/requireAuth.ts`, `hooks/useCurrentUser.ts` | Implementación futura | Posible evolución posterior del contrato de sesión con contextos activos. |
| `lib/dashboard/obtenerDatosDashboard.ts`, `app/(auth)/dashboard/page.tsx`, `components/ui/*movil.tsx`, `sidebar-moderna.tsx` | Implementación futura | Posible evolución posterior de menú/dashboard multi-contexto. |
| `lib/supabase/database.types.ts`, `supabase/migrations/**` | Evidencia / prerrequisito futuro | Fuente de evidencia para tablas, RLS, RPCs, relaciones, soporte y drift `uno_a_uno`; este PR no las modifica. |
| `lib/actions/group*.ts`, `lib/actions/asistencia-avanzada.actions.ts` | Compatibilidad futura | Límite planificado para integrar Grupos de Vida sin reemplazar flujos actuales. |

## Riesgos

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Scopes débiles exponen datos familiares/menores. | Media | Requisitos explícitos de privacidad y RLS/server/UI. |
| `personaId` elegido por cliente suplanta identidad. | Alta | Resolver sesión desde `auth.uid()`/server session y prohibir identidad autenticada seleccionada por cliente. |
| Búsqueda/dedupe enumera PII. | Media | Minimización, masking, auditoría, límites de lookup y denegación por defecto. |
| Reemplazar Grupos de Vida accidentalmente. | Media | Spec de compatibilidad; no tocar RPCs/RLS existentes. |
| Rollout futuro rompe menú/dashboard. | Media | Feature flag/kill switch, fallback legado, despliegue staged y gates de error. |
| `openspec/config.yaml` ausente. | Baja | Usar convención compartida; decidir inicialización antes de fases posteriores. |

## Plan de revisión y rollback

Revisión documental contra issue #200, roadmap y handoff. Rollback: revertir todos los artefactos OpenSpec de este PR (`proposal.md`, `design.md`, `tasks.md`, `exploration.md` y `specs/**`) y los artefactos Engram asociados; no hay cambios de datos ni comportamiento.

## Dependencias

- `exploration.md`, roadmap maestro, handoff Fase 1, specs existentes de soporte/casas.
- Aprobación antes de implementación futura / `sdd-apply`; los artefactos de spec, diseño y tareas de este PR siguen siendo planificación.

## Criterios de éxito

- [ ] Specs pueden derivar capacidades sin inventar tablas prematuras ni grants UI.
- [ ] Caso validado: una Persona es director de etapa GDV, bajista DPS Música, cónyuge, padre de Waumbaland e InsideOut, y participante de “De hombre a hombre” sin permisos cruzados.
- [ ] Todo queda compatible/aditivo y sin cambios de comportamiento.

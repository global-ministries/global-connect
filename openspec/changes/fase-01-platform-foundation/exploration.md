## Exploration: Fase 1 — Platform Foundation

### Current State

GlobalConnect ya tiene una base parcial para el modelo de una persona única, pero está distribuida entre identidad, roles globales y lógica específica de Grupos de Vida. La tabla `usuarios` funciona como entidad de persona y permite `auth_id` nullable, por lo que puede representar personas sin cuenta auth; sin embargo, la mayoría de helpers de sesión (`getUserWithRoles`, `requireAuth`, `useCurrentUser`) siguen partiendo de Supabase Auth y devuelven principalmente `usuario`, roles globales y capacidades de soporte.

El sistema actual separa algunos contextos, pero todavía no existe una capa transversal de `experiencias`, responsabilidades scoped, capacidades scoped generales ni ledger común de participación. Grupos de Vida sí tiene scoping propio en producción mediante `segmento_lideres`, `director_etapa_grupos`, `director_general_segmentos`, `grupo_miembros`, RPCs como `puede_ver_grupo`, `puede_editar_grupo`, `obtener_grupos_para_usuario`, `registrar_asistencia` y reportes/dashboard de asistencia. Este sistema debe conservarse y adaptarse, no rediseñarse.

El patrón de `support_user_capabilities` demuestra una autorización más granular que roles globales: capacidades allowlisted, helpers privados, grants auditables, RLS, jerarquía `view/reply/manage` y gating UI/server. Es un buen patrón conceptual, pero está acoplado a soporte y no debe reutilizarse como tabla genérica de plataforma.

Familias y relaciones ya existen: `familias`, `relaciones_usuarios` y el enum `enum_tipo_relacion` (`conyuge`, `padre`, `hijo`, `tutor`, `hermano`, `otro_familiar`). Hay RPCs seguras para agregar/eliminar relaciones y búsqueda familiar, con RLS scoped. Esto alcanza para preparar cónyuges, padres/tutores e hijos como contexto, pero no debe interpretarse como permisos automáticos.

El dashboard y la navegación todavía colapsan el acceso a un solo contexto principal. `obtenerDatosDashboard` calcula un `rolPrincipal`; `app/(auth)/dashboard/page.tsx` renderiza un dashboard por rol único; `sidebar-moderna` y `header-movil` duplican navegación estática por roles/capacidades de soporte; `menu-inferior-movil` no filtra por roles ni capacidades. Esto no soporta bien a una persona con múltiples responsabilidades simultáneas.

`uno_a_uno` presenta drift a resolver antes de diseño/aplicación: `database.types.ts` y la base Supabase live exponen `uno_a_uno_reuniones` y `uno_a_uno_participantes` con RLS y 0 filas, pero no se encontró migración local ni rutas/actions relacionadas al buscar `uno_a_uno`. Debe reconciliarse antes de apoyarse en esas tablas.

Caso requerido validado desde evidencia actual:

- La misma persona puede existir una sola vez en `usuarios` y tener cuenta auth opcional.
- Puede ser director de etapa de Grupos de Vida mediante `segmento_lideres` + `director_etapa_grupos`, sin rediseñar Grupos de Vida.
- Puede tener contexto familiar con cónyuge e hijos mediante `relaciones_usuarios`/`familias`, sin que eso otorgue permisos NextGen.
- Puede recibir capacidades/responsabilidades scoped futuras para DPS Música, talleres y dashboard contextual, pero hoy esas capas no existen.
- Asistir a un taller “De hombre a hombre” debe modelarse como participación, no como permiso ni Dream Team.

### Affected Areas

- `lib/supabase/database.types.ts` — evidencia de tablas actuales, enums, RPCs, `support_user_capabilities` y drift de `uno_a_uno`.
- `lib/getUserWithRoles.ts` — helper actual de sesión limitado a auth + roles globales.
- `lib/auth/requireAuth.ts` — autorización server-side basada en auth y roles globales.
- `hooks/useCurrentUser.ts` — estado cliente devuelve `usuario`, `roles` y `supportCapabilities`, pero no responsabilidades scoped generales.
- `lib/dashboard/obtenerDatosDashboard.ts` — resuelve un solo `rolPrincipal` y delega a RPC de dashboard por rol.
- `app/(auth)/dashboard/page.tsx` — renderiza una experiencia de dashboard por rol único.
- `components/ui/sidebar-moderna.tsx` — navegación desktop estática por roles y capacidades de soporte.
- `components/ui/header-movil.tsx` — navegación móvil drawer duplicada con la misma lógica estática.
- `components/ui/menu-inferior-movil.tsx` — navegación inferior móvil fija, sin gating por roles/capacidades.
- `lib/actions/group.actions.ts`, `lib/actions/groupMember.actions.ts`, `lib/actions/solicitudes-grupo.actions.ts`, `lib/actions/asistencia-avanzada.actions.ts` — flujos de Grupos de Vida que dependen de RPCs y scoping actual.
- `lib/actions/support.actions.ts`, `lib/actions/support-capabilities.actions.ts`, `lib/support/capabilities.ts` — patrón existente de capacidades granulares, auditable y allowlisted.
- `supabase/migrations/**` — fuente de permisos/RPCs actuales; evidencia de scoping de Grupos de Vida, soporte, casas anfitrionas y drift de `uno_a_uno`.
- `openspec/specs/support-ticket-system/spec.md`, `openspec/specs/casas-anfitrionas-permissions/spec.md` — precedentes de capacidades y permisos scoped sin explosión de roles.

### Approaches

1. **Foundation aditiva sobre `usuarios` como persona canónica** — Mantener `usuarios.id` como persona única por ahora, agregar en fases futuras tablas/modelos aditivos para experiencias, responsabilidades scoped, capacidades scoped, participación/historial y dedupe, y exponer un helper de sesión con contextos activos. Grupos de Vida se integra por adaptadores desde su modelo actual.
   - Pros: compatible con producción, respeta el modelo de una persona, evita roles globales innecesarios, permite NextGen futuro sin construirlo todavía, conserva Grupos de Vida.
   - Cons: conserva el nombre legado `usuarios` aunque conceptualmente sea persona; requiere cuidado de RLS y migraciones incrementales.
   - Effort: Medium

2. **Rediseño hacia una nueva tabla `personas` y reescritura de Grupos de Vida** — Crear una capa nueva y migrar identidad, grupos, asistencia y permisos hacia ella.
   - Pros: modelo conceptual más limpio a largo plazo.
   - Cons: alto riesgo de romper producción, duplica identidad durante la transición, contradice la restricción de no rediseñar Grupos de Vida.
   - Effort: High

3. **Reutilizar `support_user_capabilities` como sistema global** — Extender la tabla de soporte para otros dominios con más strings de capacidades.
   - Pros: rápido y basado en un patrón existente.
   - Cons: acopla plataforma a soporte, no modela scopes ricos, degrada auditoría semántica y puede crear permisos ambiguos.
   - Effort: Low inicialmente, High después

### Recommendation

Usar el enfoque 1: una foundation aditiva y compatible con producción. La propuesta debería definir `usuarios` como persona canónica operacional, con cuenta auth opcional, y agregar una capa scoped separada para experiencias, responsabilidades, capacidades, participación/historial y deduplicación. Grupos de Vida debe quedar como dominio existente protegido: sus tablas/RPCs siguen siendo source of truth operativo y se exponen al nuevo modelo por mapeos/adaptadores.

Direcciones de diseño para la siguiente fase:

- Modelar `Experiencias` como catálogo organizacional, no como roles globales.
- Separar servicio, participación, familia, liderazgo y permisos en estructuras distintas.
- Generalizar el patrón conceptual de soporte: capacidades allowlisted, grants auditables, helper de sesión y checks RLS/server/UI, pero con scope por experiencia/equipo/grupo/salón y sin reutilizar `support_user_capabilities`.
- Preparar menores/tutores con relaciones y scopes de datos sensibles, sin construir operación NextGen todavía.
- Cambiar dashboard/menu hacia contexto múltiple: una persona puede ver “Grupos de Vida — director de etapa”, “DPS Música — servidor/bajista”, “Familia — padre/tutor”, “Taller — participante” sin recibir permisos cruzados.
- Definir dedupe/búsqueda antes de crear personas desde futuras inscripciones: señales mínimas por email, teléfono, cédula, nombre/apellido y fecha de nacimiento cuando exista.
- Reconciliar `uno_a_uno` antes de usarlo: decidir si se versiona migración faltante, se archiva como drift o se reintroduce formalmente en la fase futura de 1:1.

### Risks

- Romper Grupos de Vida si se reemplazan sus RPCs, RLS o tablas en lugar de integrarlas por compatibilidad.
- Filtrar datos familiares, pastorales o de menores si relaciones contextuales se tratan como permisos.
- Mantener el dashboard/menu por `rolPrincipal` produciría permisos visibles incorrectos para usuarios multi-contexto.
- Crear capacidades globales sin scope recrearía la explosión de roles con otro nombre.
- `uno_a_uno` tiene evidencia de drift entre tipos/live DB y migraciones locales; no debe usarse como base sin reconciliación.
- `openspec/config.yaml` no existe en el repo aunque hay `openspec/specs/`; el orquestador debería decidir si inicializar/configurar OpenSpec antes de fases posteriores.

### Ready for Proposal

Yes — la exploración tiene evidencia suficiente para que `sdd-propose` defina una fase aditiva de Platform Foundation. El orquestador debe indicar que el cambio NO implementa producto todavía, NO rediseña Grupos de Vida, y debe proponer una base compatible para persona única, experiencias, responsabilidades/capabilities scoped, relaciones, dedupe, historial y dashboard/menu contextual.

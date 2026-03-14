# Changelog

Todos los cambios notables del proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Conventional Commits](https://www.conventionalcommits.org/).

---

## [1.9.3] - 2026-03-14

### Agregado
- Co-anfitriones en casas anfitrionas: selector de co-anfitrión (cónyuge) con columna `co_anfitrion_id`
- Eliminación configurable de miembros: selector de rol mínimo para eliminar directo vs solicitud de egreso
- Dashboard de riesgo v2: donut chart distribución, area trend 4 semanas, tabla miembros críticos, barras por segmento
- Página de miembros en riesgo (`/grupos-vida/miembros-riesgo`) con filtros por nivel y búsqueda por nombre
- Widget de notas de líderes en dashboard + página de listado (`/notas-lideres`)
- Ranking de asistencia por miembros: más constantes y más ausencias (`/asistencia/historial/mas-constantes`, `mas-ausencias`)
- Agrupación por cónyuges en asistencia de grupos tipo Matrimonios
- Página de configuración global (`/configuracion`) con branding, datos de organización, umbrales
- Solicitudes rediseñadas con tabs (Pendientes/Completadas), filtros por tipo, tabla responsive
- Botón flotante `BotonFlotante.tsx` para acciones principales en móvil
- RPC `obtener_roles_sistema_usuario` (SECURITY DEFINER) para control de permisos
- RPC `rpc_casas_visibles_por_rol` para filtrar casas según rol del usuario
- Icono de notificaciones (Bell) en headers desktop y móvil
- Subida de logos personalizados con redimensionado en configuración global
- Hook `useBranding` para consumir logos de la organización
- Tabla `configuracion_plataforma` para branding global

### Cambiado
- API routes de miembros (`POST /api/grupos/[id]/miembros`, `PATCH/DELETE .../[usuarioId]`) ahora usan `crear_solicitud_grupo` en vez de RPCs directas
- Filtros de temporada combinan todas las tabs deduplicadas por ID
- KPIs se calculan desde `baseKpi` (sin filtros de búsqueda) para mostrar totales reales
- Paginación fija a 100 items (selector de pageSize eliminado)
- Mapa de grupos envuelto con `DashboardLayout` para mostrar sidebar en desktop
- Umbral de riesgo cambiado de < 100% a < 70%
- FK `director_etapa_grupos.grupo_id` cambiada a `ON DELETE CASCADE`
- Egreso de miembros cambiado de soft-delete (`SET fecha_salida`) a hard-delete
- Rechazo de solicitud de activación ahora hace hard-delete del grupo
- CHECK constraint de solicitudes expandido para incluir `egreso` y `traslado`
- RPC `obtener_detalle_grupo` filtra `fecha_salida IS NULL`
- Vista `config_efectiva` CTE para resolver `NULL = NULL` en join de configuración global

### Seguridad
- Aprobación de casas restringida a admin, pastor, director_general (líderes excluidos con check `puedeAprobar` separado)
- Queries de casas usan `adminDb` para bypass de RLS en joins de `usuarios`
- `catch (e: any)` → `catch (e: unknown)` con type narrowing en API routes
- Validación Zod de `parroquia_id` acepta string vacío: `z.string().uuid().or(z.literal("")).optional()`

### Corregido
- `upsertDireccion` ya no envía `estado_id`, `municipio_id`, `pais_id` (columnas que no existen en `direcciones`)
- `to24h()` devuelve `HH:MM:SS` (por requerimiento de PostgreSQL `time` type)
- Configuración de grupos usa `.maybeSingle()` en vez de `.single()` (soporta 0 filas)
- Selector de casas aprobadas en edición de grupo funcional (adminDb + filtro miembros)
- "Guardar Cambios" silencioso resuelto: Zod validaba `""` como UUID inválido
- Detalle de evento: permisos de edición corregidos por rol
- `NULL = NULL` en SQL: CTE `config_efectiva` resuelve join con `campus_id IS NULL`
- `FormularioSegmento`: botón "Crear Segmento" ahora funcional con handler + modal
- Selector de hora en asistencia con mejor spacing mobile

---

## [1.9.1] - 2026-03-12

### Agregado
- Asistencia avanzada con 4 tipos de presencia: presente, ausente, tarde, justificado
- Notas pastorales por reunión: descripción, puntos de oración, notas privadas del líder
- Opción "No hubo reunión" con motivo obligatorio (el grupo no entra en reportes)
- Conteo de visitantes configurables por módulo (desactivado por defecto)
- Vista de salud de miembros (`v_salud_miembros_grupo`) con niveles de riesgo dinámicos
- Dashboard de riesgo para directores: KPIs globales, top-5 grupos en riesgo, tendencia 4 semanas
- RPC `registrar_asistencia` v2: backward compatible con formato v1 (`presente: bool`) y v2 (`tipo_presencia: text`)
- RPCs de reportes: `obtener_reporte_retencion`, `obtener_reporte_crecimiento_neto`, `obtener_dashboard_riesgo`
- 6 Server Actions en `asistencia-avanzada.actions.ts` con Zod runtime validation y JSDoc
- Zod schemas compartidos en `lib/types/asistencia-avanzada.types.ts` (9 schemas)
- Componentes: `RegistroAsistenciaAvanzado` (formulario completo), `VistaSaludMiembros` (KPIs + tabla riesgo)
- Páginas: `/grupos-vida/[id]/asistencia` (registro v2), `/grupos-vida/[id]/salud`, `/grupos-vida/dashboard-riesgo`
- Solicitudes de edición tardía: tipo `edicion_asistencia` con metadata jsonb
- 11 columnas de configuración en `configuracion_grupos_vida`: ventana de edición, visitantes, umbrales, correo

### Cambiado
- `asistencia`: nueva columna `tipo_presencia` con CHECK constraint; datos existentes migrados (`presente=true→'presente'`, `presente=false→'ausente'`)
- `eventos_grupo`: 8 columnas nuevas (tipo, descripción, puntos de oración, visitantes, no hubo reunión)
- `configuracion_grupos_vida`: 11 columnas de configuración de asistencia con defaults
- Navegación sidebar: enlace a Dashboard Riesgo para directores y admins

### Seguridad
- `es_superadmin`: parámetro estandarizado a `p_auth_id` (migración `20260312_fix_es_superadmin_param.sql`)
- Role guard en dashboard-riesgo: solo `admin`, `pastor`, `director_etapa`, `director_general`
- RPCs de reportes validan permisos internamente con `puede_editar_grupo` y `es_superadmin`
- Solicitudes de edición tardía requieren motivo ≥10 caracteres

### Corregido
- Castings residuales de Fase 1 eliminados (`as any` en `group.actions.ts`, `as unknown as` en `casas-anfitrionas.actions.ts`)
- `registrar_asistencia` v2 usa `ON CONFLICT DO UPDATE` para evitar duplicados

### Migración de Datos
- 9,547 registros de asistencia migrados: `presente=true → tipo_presencia='presente'`, `presente=false → tipo_presencia='ausente'`
- 785 eventos existentes: `registrado_en` poblado con `fecha::timestamptz`
- `motivo_inasistencia` existente preservado sin pérdida

---

## [1.9.0] - 2026-03-12

### Agregado
- Sistema de solicitudes de grupo: ingresos, traslados, egresos, cambios de rol y activación
- 4 tablas nuevas: `solicitudes_grupo`, `historial_movimientos_grupo`, `director_general_segmentos`, `configuracion_grupos_vida`
- RPCs: `crear_solicitud_grupo`, `procesar_solicitud_grupo`, `expirar_solicitudes_vencidas`, `contar_solicitudes_pendientes`
- Función helper `es_director_general_de_grupo` para aprobaciones scoped por segmento
- Vista `v_solicitudes_pendientes` con datos enriquecidos de miembro, grupo y temporada
- 8 Server Actions en `solicitudes-grupo.actions.ts` con Zod runtime validation
- Componentes: `TablaSolicitudes`, `ModalProcesarSolicitud`, `FormNuevaSolicitud`, `BadgeSolicitudes`, `HistorialMovimientos`, `ConfiguracionPanel`
- Páginas: `/grupos-vida/solicitudes`, `/grupos-vida/solicitudes/mis-solicitudes`, `/grupos-vida/configuracion`
- Campo `estado` en temporadas (`planificacion`, `activa`, `finalizada`) con migración de datos
- Configuración de expiración de solicitudes (días configurables por módulo)
- Columna `expira_en` en solicitudes con EXCLUDE constraint para evitar duplicados
- Extensión `btree_gist` habilitada para EXCLUDE constraints

### Cambiado
- `temporadas`: nueva columna `estado` con CHECK constraint; datos existentes migrados según campo `activa`
- Director General ahora tiene scope configurable por segmentos (tabla `director_general_segmentos`)

### Seguridad
- RLS habilitado en 4 tablas nuevas con 9 policies
- `es_director_general_de_grupo` resuelve `auth_id → usuario_id` antes de validar scope
- Aprobaciones scoped: DG solo puede aprobar solicitudes de sus segmentos asignados
- Admin/Pastor tienen bypass global

### Corregido
- `es_superadmin` en `es_director_general_de_grupo` ahora recibe `v_user_id` correcto (no `auth.uid()`)
- Modal de procesar solicitud con accesibilidad: Escape, overlay click, ARIA

---

## [1.8.0] - 2026-03-12

### Agregado
- Módulo Grupos de Vida reestructurado bajo `app/(auth)/grupos-vida/`
- Submódulo Casas Anfitrionas: CRUD completo, mapa con geocodificación, asignación a grupos
- 6 migraciones SQL: casas anfitrionas, geocodificación, dirección extendida, segmento-ubicaciones
- Helper `extraerRelacion<T>` para casting type-safe de relaciones Supabase
- 6 componentes: `TablaCasasAnfitrionas`, `FormCasaAnfitriona`, `MapaCasas`, `DetalleCasa`, `SeleccionGrupo`, `EstadisticasCasas`
- Tipo genérico `ResultadoAccion<T>` para server actions tipados

### Cambiado
- Rutas migradas: `app/dashboard/*` → `app/(auth)/*` (86 archivos, +3933 -360)
- Links actualizados en componentes, server actions y sidebar
- Sidebar con submenús colapsables para Grupos de Vida

### Corregido
- 3 server actions con `ResultadoAccion<unknown>` tipadas con interfaces explícitas
- `as unknown as` eliminado en `group.actions.ts` — usa `extraerRelacion<T>`
- CSS variables `--color-success` y `--color-warning` definidas en `globals.css`

---

## [1.7.0] - 2026-03-11

### Agregado
- `SelectSistema`: nuevo componente select con glassmorphism, dark mode y ARIA
- `TextareaSistema`: nuevo componente textarea con glassmorphism, dark mode y auto-resize
- `BadgeSistema`: componente de badges con variantes (success, warning, error, info)
- `SeparadorSistema`: divisor horizontal consistente
- `SkeletonSistema`: placeholder de carga con dimensiones y forma configurables
- Header móvil con títulos dinámicos por ruta (`resolverTitulo`) — 18 rutas internas
- Botón de regreso (`botonRegreso`) integrado en 15 páginas internas

### Cambiado
- `InputSistema`: añadido `min-h-[44px]`, `aria-invalid`, `aria-describedby`, ID automático para labels
- `TabsSistema`: migrado de `bg-white/60` a `bg-card/60`, `text-gray-600` a `text-muted-foreground`
- `ProfilePhotoUploader`: 15 reemplazos de `gray-*` y `bg-white` a tokens semánticos
- Charts de Recharts: tooltips y ejes migrados de hexadecimales hardcoded a CSS variables (`var(--border)`, `var(--foreground)`)
- `DonutChart`: `#f1f5f9` reemplazado con `var(--muted)` para estado vacío
- Tablas responsivas: eliminado `overflow-x-auto` y `min-w-full` en favor de `overflow-hidden` con columnas colapsables
- Botones migrados a variantes `ghost`/`outline` de `BotonSistema`
- Purga global: 0 instancias de `gray-*`, `bg-white` o hexadecimales hardcoded en `components/`
- `docs/sistema-diseno.md`: actualizado con dark mode, nuevos componentes y deprecaciones

### Deprecado
- `BotonGradiente` (`boton-gradiente.tsx`) → usar `BotonSistema variante="primario"`
- `CampoInputConIcono` (`campo-input-con-icono.tsx`) → usar `InputSistema icono={...}`
- `TarjetaEstadistica` (`tarjeta-estadistica.tsx`) → usar `TarjetaSistema` + `BadgeSistema`

### Corregido
- `TrendWidget`: hexadecimales hardcoded en ejes y tooltips reemplazados con CSS vars
- `catch (e: any)` → `catch (e: unknown)` para type-safety estricta
- `Record<string, any>` → `Record<string, unknown>` en tipos
- `bg-white/60` → `bg-card/60` en componentes glass

---

## [1.6.0] - 2026-03-10

### Agregado
- Helper reutilizable `lib/helpers/direccion.helper.ts` — `upsertDireccion()` para grupos y usuarios

### Cambiado
- `group.actions.ts`: eliminado doble UPDATE en `updateGroup` (ahora 1 solo UPDATE atómico)
- `group.actions.ts`: eliminados todos los `console.log` de debug (27 ocurrencias)
- `group.actions.ts`: `createGroup` acepta `campus_id` opcional y lo asigna al grupo
- `createGroupSchema` incluye `campus_id` como campo opcional validado
- RPC `crear_grupo`: acepta `p_campus_id uuid DEFAULT NULL` — asigna campus en el INSERT

### Seguridad
- RLS habilitado en `audit_grupo_miembros` con policy por campus (`es_superadmin` o campus asignado)
- RLS habilitado en `segmento_ubicaciones` — lectura para usuarios autenticados
- RLS habilitado en `director_etapa_ubicaciones` — lectura para usuarios autenticados
- Eliminadas 9 FK constraints duplicadas (legacy `fk_*`) en 5 tablas sin pérdida de datos

---

### Agregado
- Arquitectura multi-campus completa (schema, RLS, RPCs, frontend)
- 4 tablas nuevas: `campus`, `campus_localidades`, `usuario_campus`, `director_general_directores`
- 3 helpers SQL: `es_superadmin()`, `mis_campus_ids()`, `mi_campus_principal()`
- 16 políticas RLS en tablas de campus
- 6 RPCs actualizados con `p_campus_id` opcional (retrocompatibles)
- RPC `resumen_dashboard_admin` con filtro por campus
- Context provider `CampusProvider` con persistencia en localStorage (`hooks/useCampus.tsx`)
- Selector de campus/localidad para desktop (`SidebarModerna`) y móvil (`HeaderMovil`)
- Dashboard admin reactivo al cambio de campus (re-fetch automático de KPIs)
- Documentación técnica completa en `docs/multi-campus.md`

### Cambiado
- `hooks/use-kpis-grupos.ts` acepta `campusId` opcional
- `hooks/use-usuarios-con-permisos.ts` acepta `campusId` opcional
- `app/api/grupos/kpis/route.ts` soporta query param `campus_id`
- `DashboardAdmin` ahora re-fetches datos al cambiar campus
- `database.types.ts` regenerado con tablas de campus

### Migración de Datos
- 171 grupos asignados al campus Barquisimeto (115 Barquisimeto, 56 Cabudare)
- 1020 usuarios asignados al campus Barquisimeto
- Columnas `campus_id` y `localidad_id` añadidas a `grupos`, `segmentos`, `segmento_lideres`

---

## [1.4.0] - 2026-03-10

### Agregado
- Helper `lib/auth/requireAuth.ts` con funciones `requireAuth()` y `requireRole(rol)` para Server Actions
- RPCs de Supabase: `puede_editar_usuario(p_auth_id, p_target_user_id)` y `puede_crear_usuario(p_auth_id)`
- Verificación server-side en `users/[id]/edit/page.tsx` (redirect si no tiene permiso)
- Verificación server-side en `users/create/page.tsx` (redirect si no tiene permiso)

### Seguridad
- `updateUser` y `createUser` requieren `requireAuth()` + verificación de permisos vía RPC
- `addFamilyRelation` y `deleteFamilyRelation` requieren `requireAuth()`
- `createSeason` y `updateSeason` requieren `requireRole('admin')`
- `uploadUserProfilePhoto` y `deleteUserProfilePhoto` verifican `puede_editar_usuario`
- `geocodeAddress` requiere `requireAuth()`
- Botón "Editar" y "Editar Perfil" ocultos para miembros en detalle de usuario
- Botón "Agregar Miembro" oculto para roles sin permiso de creación
- Botón "Crear Grupo" restringido a admin, pastor, director-general, director-etapa (líder removido)

### Corregido
- Encoding UTF-8 corrupto en `user.actions.ts`
- Eliminado archivo `.backup` huérfano de `users/[id]/page.tsx`
- Eliminados `console.log` de debug en `user.actions.ts`

---

## [1.3.0] - 2026-03-09

### Cambiado
- Clientes Supabase migrados a patrón `getAll/setAll` (server, admin, client)
- Genérico `Database` añadido a todos los clientes para type safety
- Middleware reescrito: un solo cliente, sin code exchange, sin tokens en URL
- Auth callback simplificado: detección de recovery por query param
- `auth.actions.ts` simplificado: sin admin fallback, sin debug logs, tipos correctos
- 9 archivos migrados del singleton `supabase` a `createClient()`
- `ResetPasswordForm.tsx` ya no lee tokens de URL (security fix)

### Eliminado
- `lib/supabase/service-role.ts` (duplicado de `admin.ts`, 0 consumidores)
- `lib/obtenerRolesUsuarioActual.ts` (0 importaciones)
- Admin fallback en signup que creaba usuarios con `admin.auth.admin.createUser(email_confirm: true)`
- Pasaje de tokens como parámetros de URL en middleware (vulnerabilidad de seguridad)
- `console.log` de debug en middleware y auth actions

---

## [1.2.0] - 2026-03-09

### Agregado
- SDK de Resend (`resend@6.9.3`) y React Email (`@react-email/components@1.0.8`)
- Infraestructura de email: `lib/email/resend.ts` (singleton client) y `lib/email/send.ts` (helper genérico)
- 4 templates React Email con design system dark GlobalConnect:
  - `emails/bienvenida.tsx` — bienvenida post-registro
  - `emails/verificacion-email.tsx` — verificación de email
  - `emails/reset-password.tsx` — restablecimiento de contraseña
  - `emails/invitacion-grupo.tsx` — invitación a grupo
- Componentes compartidos: `EmailLayout.tsx` (layout base) y `EmailButton.tsx` (CTA)
- Server Actions de email: `enviarEmailBienvenida()` y `enviarInvitacionGrupo()`
- Script `email:dev` para preview de templates en `localhost:3001`

---

## [1.1.0] - 2026-03-09

### Agregado
- Configuración de Jest + React Testing Library con 7 smoke tests (`__tests__/lib/supabase/`)
- CI pipeline en GitHub Actions: lint, type-check y build (`.github/workflows/ci.yml`)
- Script de backup pre-migración (`scripts/db-backup.sh`)
- `CHANGELOG.md` para registro de cambios por fase

### Eliminado
- Rutas debug (`app/api/debug/roles/`, `app/api/debug/toolbar/`)
- Componente `ClearAuthCookies` de la página de login
- Dependencia deprecada `@supabase/auth-helpers-nextjs`
- Archivo deprecado `page-old.tsx` de usuarios

### Corregido
- Prop `deshabilitado` → `disabled` en `GroupAudit.client.tsx`
- `createSupabaseServerClient()` sin `await` en `addFamilyRelation.ts`
- Tipos de base de datos sincronizados con esquema actual (`database.types.ts`)
- Fallback de env vars en CI para builds sin secrets de GitHub

---

## [1.0.0] - 2026-03-09

Versión base del sistema antes del proceso de hardening y refactorización.

### Incluye
- Dashboard con módulos: usuarios, grupos, asistencia, configuración
- Autenticación con Supabase Auth SSR (login, signup, logout)
- Middleware de protección de rutas
- Gestión de grupos: CRUD, miembros, auditoría, feed, planes, XP/gamificación
- Gestión de usuarios: listado, perfiles, roles, relaciones familiares
- Sistema de roles: admin, pastor, director-general, director-etapa, líder, miembro
- Segmentos y temporadas para organización de grupos
- Google Maps para ubicaciones de grupos
- Sidebar responsive con navegación por módulo
- Design system VisionOS/Glassmorphism (`sistema-diseno.tsx`)
- RPCs de Supabase para permisos y consultas complejas
- RLS policies para seguridad a nivel de base de datos

---

## Convenciones

| Categoría | Uso |
|-----------|-----|
| **Agregado** | Funcionalidades nuevas |
| **Cambiado** | Cambios en funcionalidades existentes |
| **Deprecado** | Funcionalidades que se eliminarán próximamente |
| **Eliminado** | Funcionalidades eliminadas |
| **Corregido** | Corrección de bugs |
| **Seguridad** | Correcciones de vulnerabilidades |

# Changelog

Todos los cambios notables del proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Conventional Commits](https://www.conventionalcommits.org/).

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

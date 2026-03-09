# Changelog

Todos los cambios notables del proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Conventional Commits](https://www.conventionalcommits.org/).

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

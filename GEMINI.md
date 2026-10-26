# GlobalConnect AI Agent Skills

> **Single Source of Truth** — Este archivo define todos los skills de IA para GlobalConnect.
> **Todo en `.agent/skills/`** — única carpeta para Antigravity. 17 skills de dominio + `skill-creator` + `skill-sync`.

---

## CRITICAL: Auto-invoke Policy

**El agente DEBE revisar las skills relevantes ANTES de ejecutar cualquier tarea.**
Cuando detectes cualquiera de los triggers de la tabla de abajo, **invoca obligatoriamente** el skill correspondiente leyendo su `SKILL.md` con `view_file` antes de escribir código.

> Si hay duda de cuál skill usar, revisa TODAS las que puedan ser relevantes. Es mejor leer de más que escribir código incorrecto.

---

## Available Skills — Global

Todas en `.agent/skills/` — el directorio de Antigravity, fuente única de verdad.

| Skill | Path | Descripción |
|-------|------|-------------|
| `nextjs-app-router-fundamentals` | [SKILL.md](/.agent/skills/nextjs-app-router-fundamentals/SKILL.md) | App Router, layouts, loading states, metadata |
| `vercel-react-best-practices` | [SKILL.md](/.agent/skills/vercel-react-best-practices/SKILL.md) | Performance, bundle, re-renders, Server Components |
| `typescript` | [SKILL.md](/.agent/skills/typescript/SKILL.md) | Strict mode, utility types, generics, type narrowing |
| `supabase-postgres-best-practices` | [SKILL.md](/.agent/skills/supabase-postgres-best-practices/SKILL.md) | Queries, índices, RLS, connection pooling |
| `supabase-auth` | [SKILL.md](/.agent/skills/supabase-auth/SKILL.md) | Auth SSR, PKCE, sesiones, refresh tokens |
| `security-nextjs` | [SKILL.md](/.agent/skills/security-nextjs/SKILL.md) | Headers, CSRF, Server Action auth, env vars |
| `systematic-debugging` | [SKILL.md](/.agent/skills/systematic-debugging/SKILL.md) | Debugging 4 fases: Root Cause, Pattern, Hypothesis, Fix |
| `code-review` | [SKILL.md](/.agent/skills/code-review/SKILL.md) | PR checklist, N+1, type-safety, accesibilidad |
| `git-commit` | [SKILL.md](/.agent/skills/git-commit/SKILL.md) | Commits atómicos, mensajes semánticos |
| `conventional-commit` | [SKILL.md](/.agent/skills/conventional-commit/SKILL.md) | Conventional Commits: feat/fix/docs/chore, scopes |
| `deploy-to-vercel` | [SKILL.md](/.agent/skills/deploy-to-vercel/SKILL.md) | Deploy, preview branches, env vars, troubleshooting |
| `global-connect-design` | [SKILL.md](/.agent/skills/global-connect-design/SKILL.md) | Sistema de diseño del repo: pantallas, componentes, mobile nativo, checklist pre-PR |
| `technical-writer` | [SKILL.md](/.agent/skills/technical-writer/SKILL.md) | Docs técnicos, README, JSDoc, guías de usuario |
| `vercel-kv` | [SKILL.md](/.agent/skills/vercel-kv/SKILL.md) | Redis serverless (Upstash): rate limiting, caché de RPCs |
| `cloudflare-r2` | [SKILL.md](/.agent/skills/cloudflare-r2/SKILL.md) | Object storage S3-compatible, sin egress fees |
| `resend` | [SKILL.md](/.agent/skills/resend/SKILL.md) | SDK Resend: send-email, templates, inbound, webhooks |
| `email-best-practices` | [SKILL.md](/.agent/skills/email-best-practices/SKILL.md) | Deliverability, DNS auth, compliance, list hygiene |
| `resend-email-design` | [SKILL.md](/.agent/skills/resend-email-design/SKILL.md) | React Email templates, diseño cross-client, GlobalConnect style |
| `test-driven-development` | [SKILL.md](/.agent/skills/test-driven-development/SKILL.md) | TDD: Red-Green-Refactor, anti-patterns, verificación |
| `javascript-typescript-jest` | [SKILL.md](/.agent/skills/javascript-typescript-jest/SKILL.md) | Jest + React Testing Library: unit, integration, mocks |
| `skill-creator` | [SKILL.md](/.agent/skills/skill-creator/SKILL.md) | Cómo crear nuevos skills |
| `skill-sync` | [SKILL.md](/.agent/skills/skill-sync/SKILL.md) | Cómo sincronizar skills a GEMINI.md |

> Instalar nuevas skills: `./.agent/install-skill.sh <repo>@<skill> --yes`

---

## Auto-invoke Skills

Cuando realices cualquiera de estas acciones, **SIEMPRE** invoca el skill correspondiente **PRIMERO**:

### Diseño y UI

| Acción | Skill a invocar |
|--------|-----------------|
| Crear o modificar una pantalla, página, layout o componente de UI | `global-connect-design` (PRIMERO) |
| Ajustar diseño responsive o mobile, estilos, tokens, estados vacíos o de carga | `global-connect-design` (PRIMERO) |
| Cualquier skill genérico de diseño (`frontend-design`, `ui-ux-pro-max`, `web-design-guidelines`, `sleek-design-mobile-apps`) | Solo después de `global-connect-design`; si se contradicen, gana `global-connect-design` y `docs/design-system/` |

### Performance y Escalabilidad

| Acción | Skill a invocar |
|--------|-----------------|
| Trabajar con Next.js App Router, layouts, loading states | `nextjs-app-router-fundamentals` |
| Trabajar con Server Components o Server Actions | `nextjs-app-router-fundamentals` + `vercel-react-best-practices` |
| Crear o modificar Route Handlers (`app/api/`) | `nextjs-app-router-fundamentals` |
| Optimizar bundle, imports dinámicos, lazy loading | `vercel-react-best-practices` |
| Eliminar waterfalls de datos, uso de Suspense | `vercel-react-best-practices` |
| Configurar `cache`, `revalidate`, ISR | `vercel-react-best-practices` + `nextjs-app-router-fundamentals` |
| Escribir queries SQL, diseñar índices | `supabase-postgres-best-practices` |
| Optimizar RPCs, detectar N+1 en Postgres | `supabase-postgres-best-practices` |
| Configurar connection pooling (Supavisor) | `supabase-postgres-best-practices` |
| Agregar caché de datos dinámicos entre invocaciones serverless | `vercel-kv` |
| Implementar rate limiting en API routes | `vercel-kv` |

### Robustez y Tipos

| Acción | Skill a invocar |
|--------|-----------------|
| Escribir o modificar tipos TypeScript | `typescript` |
| Usar utility types (Partial, Pick, Omit, Record) | `typescript` |
| Type narrowing, type guards, discriminated unions | `typescript` |
| Inferir tipos desde Zod schemas | `typescript` |
| Tipar resultados de queries Supabase | `typescript` |
| Bug inesperado, comportamiento extraño, test fallando | `systematic-debugging` |
| Investigar root cause antes de proponer fix | `systematic-debugging` |
| Error en producción, bug difícil de reproducir | `systematic-debugging` |

### Seguridad

| Acción | Skill a invocar |
|--------|-----------------|
| Modificar middleware de autenticación | `security-nextjs` + `supabase-auth` |
| Agregar validación de auth en Server Actions | `security-nextjs` |
| Revisar exposición de variables `NEXT_PUBLIC_*` | `security-nextjs` |
| Configurar headers HTTP de seguridad | `security-nextjs` |
| Trabajar con Supabase Auth SSR | `supabase-auth` |
| Implementar flujo de login/logout/refresh | `supabase-auth` |
| Configurar RLS políticas por usuario | `supabase-auth` + `supabase-postgres-best-practices` |
| Manejar sesiones server-side con cookies | `supabase-auth` |

### Infraestructura y Storage

| Acción | Skill a invocar |
|--------|-----------------|
| Desplegar a Vercel (producción o preview) | `deploy-to-vercel` |
| Configurar env vars en Vercel | `deploy-to-vercel` |
| Troubleshoot build failures o Edge Functions | `deploy-to-vercel` |
| Migrar storage de Supabase a Cloudflare | `cloudflare-r2` |
| Integrar R2 para assets de alto volumen | `cloudflare-r2` |
| Evaluar costos de egress en storage | `cloudflare-r2` |
| Implementar caché Redis serverless | `vercel-kv` |
| Configurar Vercel KV / Upstash | `vercel-kv` |

### Email (Resend)

| Acción | Skill a invocar |
|--------|-----------------|
| Crear o modificar templates de email en React Email | `resend-email-design` |
| Diseñar emails transaccionales (bienvenida, invitación, reset) | `resend-email-design` |
| Hacer estilos cross-client, responsivos para email | `resend-email-design` |
| Enviar emails con el SDK de Resend | `resend` |
| Configurar single vs batch email, adjuntos, scheduling | `resend` |
| Manejar webhooks de entrega (bounced, delivered, opened) | `resend` + `email-best-practices` |
| Evaluar deliverability, DNS (SPF/DKIM/DMARC) | `email-best-practices` |
| Limpiar listas de contactos, manejar bounces/suppression | `email-best-practices` |
| Asegurar compliance (CAN-SPAM, GDPR) en emails | `email-best-practices` |
| Configurar warm-up de dominio para nuevo proveedor | `email-best-practices` |

### Testing y Calidad del Código

| Acción | Skill a invocar |
|--------|-----------------|
| Escribir tests antes de código (TDD) | `test-driven-development` |
| Bug fix con ciclo Red-Green-Refactor | `test-driven-development` |
| Crear unit tests o integration tests en Jest | `javascript-typescript-jest` |
| Testear componentes React con Testing Library | `javascript-typescript-jest` |
| Crear mocks de Supabase, APIs externas | `javascript-typescript-jest` |
| Revisar cobertura de tests antes de PR | `test-driven-development` + `javascript-typescript-jest` |

### Workflow y Calidad

| Acción | Skill a invocar |
|--------|-----------------|
| Crear un commit de git | `conventional-commit` + `git-commit` |
| Generar mensaje de commit desde un diff | `conventional-commit` |
| Revisar código de un PR | `code-review` |
| Detectar N+1 queries, naming issues, type-safety en PR | `code-review` |
| Escribir documentación técnica o de usuario | `technical-writer` |
| Crear o actualizar README, guías de usuario, JSDoc | `technical-writer` |
| Generar docs de API o de migración | `technical-writer` |

### Crear/Modificar Skills

| Acción | Skill a invocar |
|--------|-----------------|
| Crear un nuevo skill | `skill-creator` |
| Sincronizar skills a GEMINI.md | `skill-sync` |
| Actualizar las tablas de auto-invoke | `skill-sync` |

---

## Auto-invoke Workflows

Cuando el agente opere en un **rol específico** o en un **flujo por fases**, DEBE ejecutar el workflow correspondiente.

### Ciclo de Vida por Fase

```
ARQUITECTO  →  DESARROLLADOR  →  AUDITOR  →  ARQUITECTO  →  DOCUMENTACIÓN  →  SIGUIENTE FASE
   plan           feat(scope)      review      aprueba         docs(scope)
```

| Paso | Rol | Workflow | Skills principales | Commit |
|------|-----|----------|--------------------|--------|
| 1 | Arquitecto | `/architect-phase-planning` | Todas las del módulo | — |
| 2 | Desarrollador | `/developer-execution` | `typescript`, `nextjs-app-router-fundamentals`, `security-nextjs`, + las del plan | `feat(scope)` |
| 3 | Auditor | `/auditor-review` | `code-review`, `security-nextjs`, `typescript`, + las del alcance | — |
| 3b | Desarrollador (fix) | `/developer-execution` | Las mismas del paso 2 | `fix(scope)` |
| 4 | Arquitecto (aprobación) | `/architect-phase-planning` | — | — |
| 5 | Documentación | `/documentation-management` | `technical-writer`, `conventional-commit`, `git-commit` | `docs(scope)` |

### Naming de Artifacts

Todos los artifacts siguen el patrón: `{modulo}-fase{N}-{tipo}.md`

| Tipo | Generado por | Ejemplo |
|------|-------------|---------|
| `plan-desarrollo` | Arquitecto | `grupos-fase1-plan-desarrollo.md` |
| `plan-auditoria` | Arquitecto | `grupos-fase1-plan-auditoria.md` |
| `reporte-desarrollo` | Desarrollador | `grupos-fase1-reporte-desarrollo.md` |
| `walkthrough` | Desarrollador | `grupos-fase1-walkthrough.md` |
| `correcciones-r{N}` | Auditor | `grupos-fase1-correcciones-r1.md` |
| `reporte-auditoria` | Auditor | `grupos-fase1-reporte-auditoria.md` |

### Cuándo Ejecutar Cada Workflow

| Acción / Trigger | Workflow |
|------------------|----------|
| Planificar una fase, diseñar arquitectura de módulo | `/architect-phase-planning` |
| Implementar código, ejecutar un plan de desarrollo | `/developer-execution` |
| Auditar, revisar código, hacer code review de fase | `/auditor-review` |
| Actualizar docs, changelog, página de actualizaciones | `/documentation-management` |

---

## Project Overview

**GlobalConnect** es una aplicación web de gestión para una organización eclesiástica.

| Component | Location | Description |
|-----------|----------|-------------|
| Pages / Routes | `app/` | App Router: páginas, layouts, rutas API |
| Components | `components/` | UI, dashboard, modales, mapas, layouts |
| Hooks | `hooks/` | Lógica de negocio: paginación, permisos, KPIs |
| Lib | `lib/` | Server actions, Supabase clients, utilidades |
| Database | `supabase/` | Migraciones SQL, RPCs, policies, config |
| Docs | `docs/` | Documentación funcional y técnica; sistema de diseño en `docs/design-system/` |
| Skills | `skills/` + `.agents/skills/` | AI agent skills |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router), Server Components — versión exacta en `package.json` |
| **Language** | TypeScript (strict) |
| **UI** | React 19, TailwindCSS 4, Radix UI, lucide-react |
| **Design** | Sistema de diseño propio: [`docs/design-system/`](docs/design-system/README.md) |
| **Gráficos** | recharts |
| **Mapas** | @vis.gl/react-google-maps |
| **Formularios** | react-hook-form + zod |
| **Backend** | Supabase (Auth SSR, Postgres, Storage) |
| **Cache** | Vercel Edge Network + ISR (principal), Vercel KV (secundario) |
| **Storage** | Supabase Storage (actual), Cloudflare R2 (futuro) |
| **Deploy** | Vercel |
| **Package Manager** | pnpm |

---

## Key Patterns

- **Server Components por defecto** — Client Components SOLO para interactividad o hooks del browser
- **Supabase clients por contexto**:
  - `lib/supabase/server.ts` — Server Actions y pages
  - `lib/supabase/admin.ts` — Operaciones privilegiadas (solo tras validar rol)
  - `lib/supabase/client.ts` — Client Components
- **RLS + RPCs** — Toda la seguridad se gestiona a nivel DB
- **Permisos** — `getUserWithRoles()` / `obtenerRolesUsuarioActual()` en el servidor
- **Idioma** — Español en código, UI y docs
- **Paginación** — Server-side, 20 elementos/página, debounce 400ms

---

## 🎨 Design System Rules (OBLIGATORIO para toda UI)

**Fuente única:** [`docs/design-system/`](docs/design-system/README.md). Ningún otro doc, comentario ni skill genérico define estilos; si algo contradice esa carpeta, gana la carpeta.
**Referencia visual:** el prototipo aprobado de Servidores, [`docs/design-system/prototipos/servidores.html`](docs/design-system/prototipos/servidores.html).
**Skill obligatorio:** [`.agent/skills/global-connect-design/SKILL.md`](.agent/skills/global-connect-design/SKILL.md) antes de cualquier trabajo de UI. Tiene prioridad sobre `frontend-design`, `ui-ux-pro-max`, `web-design-guidelines` y `sleek-design-mobile-apps`.

### Reglas

- **Un solo sistema.** No inventar estilos nuevos ni variantes locales de componentes canónicos. Si falta algo, se agrega al sistema ([components.md](docs/design-system/components.md#planned-components)).
- **Escritorio a ancho completo** con los márgenes actuales (16px / 24px desde `sm` / 48px desde `lg`); **en celular, como app nativa** ([mobile.md](docs/design-system/mobile.md)).
- **Anatomía de pantalla de lista:** header con breadcrumb → hero (título + resumen) → toolbar → métricas de atención → tarjetas de alcance → lista ([patterns.md](docs/design-system/patterns.md#list-screen-anatomy)).
- **Un solo drawer de detalle** por ítem en vez de menús por fila; acciones ocultas según permisos.
- **Tokens semánticos siempre** ([foundations.md](docs/design-system/foundations.md)): `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`, `border-border`; estados `success` / `warning` / `info` / `danger` (texto legible con `-text`); marca `bg-brand`, `bg-brand-tint`, `text-brand-text`. **Prohibido:** `gray-*`, `slate-*`, `zinc-*`, `bg-white`, `#hex`, `backgroundColor: 'white'`, `bg-destructive` en código nuevo (usar `danger`).
- **El look glass está retirado:** no usar `glass-panel*` ni tokens `--glass-*` en código nuevo.
- **Números** en Geist Mono tabular (`font-mono tabular-nums`).
- **Accesibilidad:** objetivos de 44px, `aria-pressed` en toggles, `aria-current` en la ubicación actual, focus ring visible, `aria-label` en botones de solo ícono, respetar `prefers-reduced-motion`.
- **Sin scroll horizontal:** `minmax(0, 1fr)` y `min-w-0` en columnas con texto; tablas se convierten en filas en celular.
- **Animaciones:** `transition-colors` / `transition-opacity` / `transform`; nunca `transition-all`.
- Al migrar un área: actualizar [migration.md](docs/design-system/migration.md) y agregarla a `migratedToDesignSystem` en `eslint.config.mjs`.

### Imports canónicos

```tsx
import {
  PaginaSistema, SeccionesSistema, CamposSistema, PieAccionesSistema,
  TarjetaSistema, BotonSistema, InputSistema, SelectSistema, TextareaSistema,
  TituloSistema, TextoSistema, EnlaceSistema,
  BadgeSistema, SeparadorSistema, SkeletonSistema,
} from "@/components/ui/sistema-diseno"
import { PanelLateralSistema } from "@/components/ui/panel-lateral-sistema"
import { TabsSistema, TabsList, TabsTrigger, TabsContent } from "@/components/ui/TabsSistema"
import { PastillaFiltro, GrupoPastillas } from "@/components/ui/PastillasFiltro"
import { TarjetasFiltro } from "@/components/ui/TarjetasFiltro"
import { BotonFlotante } from "@/components/ui/BotonFlotante"
```

- Página: `PaginaSistema` (`titulo`, `descripcion`, `acciones`, `regreso`, `breadcrumbs`). `ContenedorDashboard` es legado; `ContenedorPrincipal` + `FondoAutenticacion` solo fuera del dashboard (auth).
- `BotonSistema`: `variante="primario|secundario|outline|ghost|peligro"`, `tamaño="sm|md|lg"`, `cargando`, `icono`, `asChild` (un `Link`), `soloIcono` + `aria-label`.
- API completa, tabla de deprecados (`BotonGradiente`, `ui/button`, `ui/card`, `ui/input`, `CampoInputConIcono`, `TarjetaEstadistica`, `tarjeta-glassmorphism`…) y componentes planeados: [components.md](docs/design-system/components.md).

### Notificaciones

```tsx
import { useNotificaciones } from '@/hooks/use-notificaciones'
const toast = useNotificaciones()
toast.success('Guardado')
toast.error('Error al guardar')
```

---

## Development

```bash
pnpm i            # Instalar dependencias
pnpm dev          # Servidor de desarrollo
pnpm gen:types    # Generar tipos de Supabase
pnpm db:push:staging  # Aplicar migraciones en staging
```

---

## Commit & PR Guidelines

Convencional Commits: `<type>[scope]: <description>`

**Types:** `feat`, `fix`, `docs`, `chore`, `perf`, `refactor`, `style`, `test`

Antes de crear un PR:
1. Ejecutar smoke tests relevantes
2. Actualizar docs en `docs/` si es necesario
3. Adjuntar screenshots para cambios de UI

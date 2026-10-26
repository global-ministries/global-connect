# Migration status

Where each area stands against this design system, what is still open, and
the guardrail that keeps migrated areas from sliding back.

Status measured on `origin/main` `ff8a7bea` (2026-10-26). Update this file
in the same PR that migrates an area.

## The rule

1. An area is **migrated** when its pages use `PaginaSistema`, it imports no
   `ui/button`, `ui/card` or `boton-gradiente`, it uses the status and brand
   tokens instead of raw palette colors, and it passes the pre-PR checklist
   in [`.agent/skills/global-connect-design/SKILL.md`](../../.agent/skills/global-connect-design/SKILL.md).
2. In the same PR, add its paths to `migratedToDesignSystem` in
   [`eslint.config.mjs`](../../eslint.config.mjs). From then on the
   `no-restricted-imports` rule fails the lint if the area imports a legacy
   primitive again.
3. The rule is scoped to migrated paths on purpose: a repo-wide warning
   would raise the 480-warning lint budget, so it waits until migrations
   lower the count.
4. Phase 2–3 of design system v2 (the prototype patterns) is a second pass:
   an area that is "migrated" (v1) still adopts the list anatomy, phone
   shell and planned components when its turn comes.

## Status per area

Legend: **v1** = migrated to the foundations (PaginaSistema, control scale,
tokens). **Lint** = listed in `migratedToDesignSystem`. **v2** = follows the
prototype patterns.

| Area | Paths | v1 | Lint | v2 | Notes |
| --- | --- | --- | --- | --- | --- |
| Servidores (pilot) | `app/(auth)/admin/dream-team/servidores`, `components/dream-team/servidores` | yes | no | pending | Pilot of v2 (task T6), starts after TLR T2 merges. Parity checklist: `odd/tasks/sistema-diseno-v2.md` L3. "Agrupar por equipo" is removed (the scope cards replace it). |
| Mi equipo | `app/(auth)/dream-team/mi-equipo`, `components/dream-team` | yes | no | pending | Uses `TarjetasFiltro` and `PastillasFiltro`; one row per person (#604). Next after Servidores. |
| Estructura | `app/(auth)/admin/dream-team/estructura`, `components/dream-team/estructura` | yes | no | pending | TLR T2 is changing dated shifts here. |
| Grupos de Vida | `app/(auth)/grupos-vida`, `components/grupos`, `components/grupos-vida` | yes | yes | pending | `components/ui/FiltrosGrupos` brings its own `p-6`; the filter panel cancels the panel body padding around it. Drop that padding when it migrates. Another agent is active on `feat/grupos-filtros`. |
| Niños | `app/(auth)/ninos`, `app/ninos`, `components/ninos` | no | no | pending | Still on `ContenedorDashboard` (10 pages); `components/ninos/panel-lateral.tsx` uses raw `Sheet`; `checkin-client.tsx` uses `glass-panel`; own `EstadoVacio`. Other agents are active (`ninos-cobertura`, `ninos-vinculos`). |
| Tickets / Ayuda | `app/(auth)/ayuda` (`tickets`, `reportar`, `admin`) | yes | no | pending | Migrated, imports no legacy UI; add to the lint list. Support queue at `default` width. |
| Talleres | `app/(auth)/talleres`, `components/talleres` | yes | no | pending | Every page uses `PaginaSistema` (Crear Temporada and the certificate at `form` width); icon-only actions are `BotonSistema soloIcono`; destructive confirms use `variante="peligro"`. Add to the lint list. `app/(auth)/admin/talleres` belongs to the admin area. |
| Usuarios | `app/(auth)/users`, `components/users`, `components/ui/filtros-usuarios.tsx` | yes | no | pending | List, filters panel, detail, edit, create, attendance migrated; imports no legacy UI. Add to the lint list. `UserEditForm`, `UserCreateForm` and `ReporteAsistenciaUsuario` live outside the area and migrate with the forms. |
| Configuración | `app/(auth)/configuracion` | yes | no | pending | `/configuracion`, `/configuracion/soporte`, `/configuracion/grupos-vida` use `ancho="form"` (deprecated width; move to `SeccionesSistema`). |
| Administración (Dream Team loading) | `app/(auth)/admin/dream-team/**/loading.tsx` | yes | no | pending | Loading skeletons use the default width like their pages. |
| Notas de líderes | `app/(auth)/notas-lideres` | yes | no | pending | Add to the lint list. |
| Actualizaciones | `app/(auth)/actualizaciones` | yes | no | pending | Feed at `form` width. Add to the lint list. |
| Pastoral | `app/(pastoral)`, `components/pastoral` (as documented) | yes (per old notes) | no | pending | These paths are not present on `ff8a7bea`; confirm where the pastoral screens live before adding them to the lint list. Old notes: lists, dashboards `default`; asistido roadmap, 1:1 detail, capture form, report form `form`; destructive actions recolor the primary button (`components/pastoral/estilos.ts`) — switch to `peligro` and the link-wrapped buttons to `asChild`. |
| Uno a uno | `app/(auth)/mis-uno-a-uno`, `components/uno-a-uno` | no | no | pending | `mis-uno-a-uno` still on `ContenedorDashboard`. |
| Dashboard | `app/(auth)/dashboard`, `components/dashboard` | no | no | pending | `ContenedorDashboard`; `components/dashboard` imports a legacy primitive; `KpisGruposPanel` uses `ui/select` and a 32px (`h-8 w-8`) icon button below the 44px size. "Dashboard" label stays in English until the page and its tests move to "Inicio" together. |
| Perfil | `app/(auth)/perfil`, `components/perfil` | no | no | pending | `ContenedorDashboard`. |
| Auth | `app/auth`, `app/signup`, `components/auth` | n/a | no | pending | `ContenedorPrincipal` + `FondoAutenticacion`; `components/auth` imports a legacy primitive. |
| Shared reports | `components/reportes` | yes | no | pending | `DashboardRiesgo` takes chart colors from the status tokens; "En riesgo" mixes `--warning` and `--danger` (`color-mix(in oklch, …)`) in SVG fills and inline styles, while its text and tile stay `orange-*` and "Atención" text stays `amber-*`. Move the text to `text-warning-text` / `text-danger-text`. |
| App chrome | `components/ui/{sidebar-moderna,desktop-header,header-movil,menu-inferior-movil}.tsx`, `components/navegacion` | yes | — | pending | Uses `--glass-*` tokens and `glass-panel-elevated` (drawer, popovers). Phone nav bar + large title is planned. |

## Open follow-ups

Carried over from the v1 docs, still open on `ff8a7bea`:

- Lint list: add Usuarios, Talleres, Ayuda/Tickets, Notas de líderes,
  Actualizaciones (and Pastoral once located) to `migratedToDesignSystem`.
  Left for a follow-up so parallel area branches do not conflict on
  `eslint.config.mjs`.
- Navigation: the drawer still shows Talleres as a plain link (only the
  sidebar opens `TalleresNavSubmenu`). With platform navigation on, the
  bottom bar shows every platform item (no five-item cap); labels truncate
  instead of scrolling.
- `ui/button` `size="icon"` does not require `aria-label` at the type level.
  The calendar day cells use it without one.
- `ui/card` still uses `rounded-xl`; move it to the surface radius when
  cards migrate.
- Grupos de Vida destructive actions use the outline button with danger
  classes (`border-danger/40 text-danger hover:bg-danger/10`); `peligro`
  exists now, so replace them.
- Grupos de Vida still uses `orange-*` classes (17 files); `text-brand-text`
  and `bg-brand-tint` exist now, so replace them.
- `TarjetaSistema` `default`/`elevated` render `glass-panel`; move them to
  the card surface (Phase 1).
- `BadgeSistema` uses raw palette colors and the `error` name; map to the
  status tokens (Phase 1).
- Remove `@deprecated` components once they have no consumers.
- The old roadmap's `TablaSistema` (sorting and pagination built in) is now
  the planned responsive list row ([components.md](components.md#planned-components)).

Resolved since the v1 docs (kept here so nobody re-opens them):
`BotonSistema` has a `peligro` variant; `BotonSistema` has a link form
(`asChild`) and no `Link` + `tabIndex={-1}` wrappers are left; a readable
warning text token exists (`--warning-text`) and Grupos de Vida no longer
uses `amber-700` / `yellow-700` text; Talleres confirms use `peligro`; the
Dream Team pages render `PaginaSistema` (no `ContenedorDashboard` islands);
`coloresMarca` points at the CSS variables.

## Decisions (2026-10-26)

The user accepted these eight foundations before Phase 1. They are binding; change them only through a new user decision recorded here.

1. **One select**: the native `SelectSistema`. On phones it opens the OS picker. The Radix `ui/select` is deprecated; its 3 usages (`GrupoDetailClient`, `KpisGruposPanel`, `turnos-servicio-dialog`) migrate.
2. **Primary button look**: `primario` becomes the flat brand fill of the prototype, with no gradient.
3. **Bottom sheet base**: vaul (`ui/drawer`), because drag-to-dismiss feels native. It is the phone variant of the detail drawer and filter sheet; `PanelLateralSistema` stays the side panel on desktop.
4. **Segmented control base**: plain buttons with `aria-pressed` inside `role="group"`, the same model as the pills. `ui/toggle-group` stays unused.
5. **Motion easing**: no new token. The prototype's `--ease` maps to the existing `--ease-out-quint`.
6. **Brand tint**: one tint. `bg-brand-tint` is the only pressed/selected fill; `PastillasFiltro` and `TarjetasFiltro` move off `var(--brand-accent)`.
7. **Shadow tokens**: adopt `--shadow-sheet` and `--shadow-fab` ([foundations.md](foundations.md#shadows)).
8. **Phone breakpoint**: below `md` (768px), the same switch as the app chrome, so the app has a single phone/desktop cut. Tablet layout is `md`–`lg` (768–1023px); desktop is `lg` and up.

# Components

The canonical catalog. Import these; do not rebuild them per screen. Most
primitives come from one file:

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

## Catalog

### Layout

| Component | File | API summary |
| --- | --- | --- |
| `PaginaSistema` | `components/ui/sistema-diseno.tsx` | `titulo`, `descripcion`, `acciones`, `regreso={{ href, texto }}`, `breadcrumbs`, `ancho="default" \| "form"` (form deprecated). See [layout.md](layout.md#page-paginasistema). |
| `SeccionesSistema` | same | Grid of section cards, tracks ≥ 26rem, empty tracks collapse |
| `CamposSistema` | same | Grid of fields, tracks ≥ 16rem, empty tracks kept |
| `PieAccionesSistema` | same | `fijo` (default `true`, sticky). Secondary first, primary last |
| `PanelLateralSistema` | `components/ui/panel-lateral-sistema.tsx` | `abierto`, `onAbiertoChange`, `titulo`, `descripcion`, `tamaño="md" \| "lg"` (480 / 640px), `pie`, `className` |
| `ContenedorDashboard` | `components/ui/sistema-diseno.tsx` | Legacy page wrapper under `PaginaSistema`: `titulo`, `accionPrincipal`, `botonRegreso`, `breadcrumbs`. New pages use `PaginaSistema`. |
| `ContenedorPrincipal` | same | Pages outside the dashboard shell (auth, landing): `titulo`, `descripcion`, `accionPrincipal` |
| `FondoAutenticacion` | same | Orb background for login and signup |

### Actions

| Component | File | API summary |
| --- | --- | --- |
| `BotonSistema` | `components/ui/sistema-diseno.tsx` | `variante="primario" \| "secundario" \| "outline" \| "ghost" \| "peligro"`, `tamaño="sm" \| "md" \| "lg"`, `cargando`, `icono`, `iconoPosicion="izquierda" \| "derecha"`, `asChild` (one `Link` child), `soloIcono` (requires `aria-label`, no children) |
| `BotonFlotante` | `components/ui/BotonFlotante.tsx` | FAB, phone only (`md:hidden`): `href` or `onClick`, `icono` (default `Plus`), `label` (accessible name) |

Button variants:

| `variante` | Look | Use |
| --- | --- | --- |
| `primario` (default) | Orange gradient | The one main action of a view |
| `secundario` | Secondary fill | Supporting actions |
| `outline` | 2px border | Neutral actions, cancel |
| `ghost` | Text only | Toolbars, low-emphasis actions |
| `peligro` | `bg-danger` / `text-danger-foreground` | Destructive actions (eliminar, desactivar) |

Do not fake the danger look with class overrides: the primary gradient is a
`background-image`, so `bg-red-*` on top of it needs `bg-none` hacks.

Navigation that looks like a button uses `asChild` with a single `Link`
child. The link gets the button classes and icons and stays one tab stop:

```tsx
<BotonSistema asChild variante="outline" icono={ArrowRight} iconoPosicion="derecha">
  <Link href="/grupos-vida">Ver grupos</Link>
</BotonSistema>

<BotonSistema asChild soloIcono icono={Pencil} aria-label="Editar">
  <Link href={`/fichas/${id}`} />
</BotonSistema>
```

With `asChild`, `disabled` and `cargando` set `aria-disabled` and
`pointer-events-none` instead of the button attribute. During a mutation
pass `cargando` (and `disabled`) so the button gives immediate feedback.

The prototype's primary button is a flat brand fill; whether `primario`
keeps its gradient is open (see [migration.md](migration.md#decisions-2026-10-26)).

### Forms

| Component | File | API summary |
| --- | --- | --- |
| `InputSistema` | `components/ui/sistema-diseno.tsx` | `label`, `icono` (left), `error` (sets `aria-invalid` and `aria-describedby`), `accesorio` (right slot, e.g. show password), all input props. 44px. `className` goes on the input. |
| `SelectSistema` | same | Native select: `label`, `opciones={[{ valor, etiqueta }]}`, `placeholder`, `value`, `onValueChange`, `error`. 44px. |
| `TextareaSistema` | same | `label`, `filas`, `error`; starts at 44px and grows |
| Shared form parts | `components/forms` | `SeccionFormulario` (labelled section card, `role="region"`), `AvisoFormulario` (`error` / `info` / `marca`). See [patterns.md](patterns.md#forms). |

### Surfaces and status

| Component | File | API summary |
| --- | --- | --- |
| `TarjetaSistema` | `components/ui/sistema-diseno.tsx` | `variante="default" \| "elevated" \| "outlined"`; `rounded-2xl p-6`. `default`/`elevated` still render the legacy `glass-panel`; prefer `outlined` until Phase 1 moves all three to the card surface. |
| `BadgeSistema` | same | `variante="default" \| "success" \| "warning" \| "error" \| "info"`, `tamaño="sm" \| "md" \| "lg"`. Uses raw palette colors and `error` instead of the `danger` token name; Phase 1 maps it to the status tokens. |
| `SeparadorSistema` | same | 1px `bg-border` line |
| `SkeletonSistema` | same | `ancho`, `alto`, `redondo` |

### Typography

| Component | API summary |
| --- | --- |
| `TituloSistema` | `nivel={1 \| 2 \| 3 \| 4}`, `variante="default" \| "sutil"` |
| `TextoSistema` | `variante="default" \| "sutil" \| "muted"`, `tamaño="sm" \| "base" \| "lg"` |
| `EnlaceSistema` | `variante="default" \| "marca" \| "sutil"`, `href`, `comoSpan`, `target`, `rel` |

### Filters and navigation inside a screen

| Component | File | API summary |
| --- | --- | --- |
| `TarjetasFiltro` | `components/ui/TarjetasFiltro.tsx` | KPI cards that ARE the filter (choose WHERE): `todas`, `items` (`{ id, label, subtitulo, total, badge }`), `seleccionadoId`, `onSeleccionar`, `unidad`, `etiqueta`, `modoCompacto` (many categories → compact list with its own search), `buscarEtiqueta`. Every card is a `<button aria-pressed>`. Scrollable row on phones, 2 → 3 → 5 column grid from `md`. Used by Mi equipo and Servidores. |
| `PastillaFiltro`, `GrupoPastillas` | `components/ui/PastillasFiltro.tsx` | Count pills that refine WHAT: `etiqueta`, `cantidad` (optional, mono bold), `activa` (`aria-pressed`), `onClick`. `GrupoPastillas` (`etiqueta` = group name) scrolls horizontally on phones and wraps from `md`. The caller owns the rule (single choice, second tap clears, toggles). |
| `TabsSistema`, `TabsList`, `TabsTrigger`, `TabsContent` | `components/ui/TabsSistema.tsx` | Radix Tabs with system styles; same props as Radix. Use for sections of one screen, not for view modes (use the segmented control). |

### App chrome

| Component | File | Notes |
| --- | --- | --- |
| `SidebarModerna` | `components/ui/sidebar-moderna.tsx` | Desktop sidebar: groups, collapsible, campus selector, tooltips when collapsed. `useSidebarModerna()` reads the collapsed state. |
| `DesktopHeader` | `components/ui/desktop-header.tsx` | Sticky header: `titulo`, `accionPrincipal`, `breadcrumbs`, `botonRegreso`. Rendered by `ContenedorDashboard`; do not mount it directly. |
| `HeaderMovil` | `components/ui/header-movil.tsx` | Phone top bar: menu drawer, route title (`titulo`), avatar menu |
| `MenuInferiorMovil` | `components/ui/menu-inferior-movil.tsx` | Phone tab bar; entries from the navigation registry (`prioridadMovil`) |

Notifications: `useNotificaciones()` (`hooks/use-notificaciones`), see
[patterns.md](patterns.md#feedback-toasts-and-progress).

## Deprecated and duplicate components

Legacy components stay until they have no consumers. New code uses the
canonical one. "To decide" rows are open decisions for the user
([migration.md](migration.md#decisions-2026-10-26)).

| Legacy | Canonical | Status |
| --- | --- | --- |
| `components/ui/boton-gradiente.tsx` (`BotonGradiente`) | `BotonSistema variante="primario"` | decided (`@deprecated`; lint error in migrated areas) |
| `components/ui/button.tsx` (shadcn `Button`) | `BotonSistema` | decided (lint error in migrated areas; sizes already aligned) |
| `components/ui/campo-input-con-icono.tsx` (`CampoInputConIcono`) | `InputSistema icono={…}` | decided (`@deprecated`) |
| `components/ui/input.tsx` (shadcn `Input`) | `InputSistema` | decided |
| `components/ui/tarjeta-estadistica.tsx` (`TarjetaEstadistica`) | `TarjetaSistema` + `BadgeSistema`; for KPIs, the planned attention metric | decided (`@deprecated`) |
| `components/ui/tarjeta-glassmorphism.tsx` | `TarjetaSistema` | decided (glass look retired) |
| `components/ui/card.tsx` (shadcn `Card`) | `TarjetaSistema` | decided (lint error in migrated areas) |
| `components/ui/select.tsx` (Radix select) | `SelectSistema` (native) | decided (migrate the 3 usages) |
| `components/ui/tabs.tsx` (shadcn tabs, unused) | `TabsSistema` | decided |
| `components/ui/sidebar.tsx` (shadcn sidebar, unused) | `SidebarModerna` | decided |
| `components/ui/skeleton.tsx` | `SkeletonSistema` | decided |
| `components/ui/toggle-group.tsx` (unused) | planned segmented control (plain `aria-pressed` buttons) | decided (not used) |
| `components/ui/drawer.tsx` (vaul) | base of the planned bottom sheet (phone variant of the detail drawer and filter sheet) | decided (vaul) |
| `components/ninos/panel-lateral.tsx` (raw `Sheet`) | `PanelLateralSistema` | decided (migrates with Niños) |
| `components/cuentas/invitar-cuenta-panel.tsx` (raw `Sheet`) | `PanelLateralSistema` | decided |
| `EstadoVacio` in `components/ninos/estado-vacio.tsx`, `components/dream-team/estado-vacio.tsx`, `components/grupos-vida/selector-propietario-casa.tsx` (local), `EstadoVacioAsistencia` in `components/asistencia/partes-asistencia.tsx` | planned canonical empty state | decided (one component; keep it a server-safe component, see the RSC note in `components/dream-team/estado-vacio.tsx`) |
| `components/dream-team/servidores/barra-filtros.tsx`, `hoja-filtros.tsx` (local) | planned filter toolbar + sheet | decided (extracted in Phase 1) |
| Classes `glass-panel*` | `bg-card border border-border` | decided (see [foundations.md](foundations.md#legacy-tokens)) |

## Planned components

Phase 1 (task T5) builds these, extending what exists where possible. Each
comes from a pattern in the prototype
([`prototipos/servidores.html`](prototipos/servidores.html)). Names are
working names; the implementation PR fixes them here.

| Planned | Prototype pattern (CSS class) | Extends | Notes |
| --- | --- | --- | --- |
| Attention metrics | `.attention` / `.metric` | new; replaces `TarjetaEstadistica` and ad hoc KPI tiles; `TarjetasFiltro` card look | 4 toggle buttons (`aria-pressed`): status dot, label, mono value, proportion bar, hint. 4 columns desktop, 2×2 tablet and phone (phone hides bar and hint). Pressing one applies its filter. |
| Scope cards (tree) | `.scope` / `.node` | `TarjetasFiltro` | Add flags (`info` "por activar", `warning` "sin cuenta"), an etapa stacked bar, the responsible line, and drill-down (entering a node updates the breadcrumb). Phone: inset grouped list rows with count and chevron. |
| Filter toolbar + sheet | `.toolbar`, `#fsheet` | `components/dream-team/servidores/barra-filtros.tsx` + `hoja-filtros.tsx`, `PastillasFiltro`, `PanelLateralSistema` | Search (with `/` shortcut on desktop), "Filtros" button with active count, segmented view switch, active filter chips with "Limpiar todo". Sheet: pill groups, selects, sort, view, footer "Limpiar" + "Ver N personas". |
| Segmented control | `.seg` | plain `aria-pressed` buttons (decided) | 2–3 options, `role="group"` + `aria-pressed`; pressed segment inverts (`bg-foreground text-background`). Desktop toolbar; on phone it moves into the filter sheet. |
| Responsive list row | `.list`, `.list-h`, `.row` | new | Desktop: table-like grid with sortable headers (`aria-sort`). Tablet: two-line rows. Phone: inset grouped rows (avatar, name, secondary line, status dot, chevron). Rows open the detail drawer. Includes loading rows and the empty state. |
| Detail drawer / bottom sheet | `.sheet#drawer` | `PanelLateralSistema` (add a phone bottom-sheet presentation with grab handle) | Identity header, quick actions (WhatsApp, Llamar, Editar ficha), callouts, per-item cards with key/value grid and actions. |
| Phone nav bar + large title | `.navbar`, `.large` | `HeaderMovil`, `PaginaSistema` | Back with the previous level's label, compact title fading in after 48px of scroll, up to two brand-colored icon actions with count badge; large title + summary block. |
| Status dot | `.d`, `.estado`, `.metric .dot` | `BadgeSistema` (align to `success`/`warning`/`info`/`danger` tokens) | 8px dot + label; label may hide on phone but stays in the accessible name. |
| Canonical empty state | `.empty` | the four `EstadoVacio` copies | Title + one line of guidance; two cases: no data yet (points at the primary action) and no match (points at "Limpiar todo"). Server-safe. |
| Canonical skeleton rows | `.skel` | `SkeletonSistema` | Row-height shimmer blocks matching the list row; respects reduced motion. |
| Hero slot | `.hero` | `PaginaSistema` | Title + summary in the content column on desktop/tablet; on phone it renders the large title. |

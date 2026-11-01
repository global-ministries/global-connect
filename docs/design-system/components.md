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
// Design system v2 (Phase 1)
import { PuntoEstado } from "@/components/ui/punto-estado"
import { MetricasAtencion } from "@/components/ui/metricas-atencion"
import { ControlSegmentado } from "@/components/ui/control-segmentado"
import { EstadoVacioSistema, SkeletonLista } from "@/components/ui/estado-vacio-sistema"
import { HojaInferior } from "@/components/ui/hoja-inferior"
import { DetalleResponsivo } from "@/components/ui/detalle-responsivo"
import { NavegacionMovilProvider, BarraNavegacionMovil, TituloGrande } from "@/components/ui/barra-navegacion-movil"
import { BarraHerramientas, BotonFiltrosMovil, ChipsFiltrosActivos } from "@/components/ui/barra-herramientas"
import { HojaFiltros, GrupoFiltro, SelectsFiltro } from "@/components/ui/hoja-filtros"
import { ListaResponsiva } from "@/components/ui/lista-responsiva"
```

Every piece is on one page with sample data: the gallery at `/design-system`
(local and preview deployments only, see [README.md](README.md#gallery)).

## Catalog

### Layout

| Component | File | API summary |
| --- | --- | --- |
| `PaginaSistema` | `components/ui/sistema-diseno.tsx` | `titulo`, `descripcion`, `acciones`, `regreso={{ href, texto }}`, `breadcrumbs`, `ancho="default" \| "form"` (form deprecated). See [layout.md](layout.md#page-paginasistema). |
| `SeccionesSistema` | same | Grid of section cards, tracks ≥ 26rem, empty tracks collapse |
| `CamposSistema` | same | Grid of fields, tracks ≥ 16rem, empty tracks kept |
| `PieAccionesSistema` | same | `fijo` (default `true`, sticky). Secondary first, primary last |
| `PanelLateralSistema` | `components/ui/panel-lateral-sistema.tsx` | `abierto`, `onAbiertoChange`, `titulo`, `descripcion`, `tamaño="md" \| "lg" \| "estructura"` (480 / 640 / 560px; `ANCHOS_PANEL`; `estructura` is the Estructura node panel), `pie`, `className` |
| `ContenedorDashboard` | `components/ui/sistema-diseno.tsx` | Legacy page wrapper under `PaginaSistema`: `titulo`, `accionPrincipal`, `botonRegreso`, `breadcrumbs`. New pages use `PaginaSistema`. |
| `ContenedorPrincipal` | same | Pages outside the dashboard shell (auth, landing): `titulo`, `descripcion`, `accionPrincipal` |
| `FondoAutenticacion` | same | Orb background for login and signup |

### Actions

| Component | File | API summary |
| --- | --- | --- |
| `BotonSistema` | `components/ui/sistema-diseno.tsx` | `variante="primario" \| "secundario" \| "outline" \| "ghost" \| "peligro"`, `tamaño="sm" \| "md" \| "lg"`, `cargando`, `icono`, `iconoPosicion="izquierda" \| "derecha"`, `asChild` (one `Link` child), `soloIcono` (requires `aria-label`, no children) |
| `BotonFlotante` | `components/ui/BotonFlotante.tsx` | FAB, phone only (`md:hidden`): `href` or `onClick`, `icono` (default `Plus`), `label` (accessible name). Flat `bg-brand-strong` fill (hover `bg-brand-strong-hover`), white icon, `shadow-fab`; no gradient |

Button variants:

| `variante` | Look | Use |
| --- | --- | --- |
| `primario` (default) | Flat `bg-brand-strong` fill, hover `bg-brand-strong-hover`, white text (4.70:1), no gradient (see [foundations.md](foundations.md#brand-color-decided)) | The one main action of a view |
| `secundario` | Secondary fill | Supporting actions |
| `outline` | 2px border | Neutral actions, cancel |
| `ghost` | Text only | Toolbars, low-emphasis actions |
| `peligro` | `bg-danger` / `text-danger-foreground` | Destructive actions (eliminar, desactivar) |

Do not fake the danger look with class overrides; use `peligro`.

The primary action in the desktop header ("Asignar servicio") uses
`tamaño="sm"`: 36px visual, with a hit area of at least 44px.

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

`primario` is the prototype's flat brand fill (decision 2 in
[migration.md](migration.md#decisions-2026-10-26)). `secundario` and
`peligro` still carry `shadow-lg`; see the open follow-ups in
[migration.md](migration.md#open-follow-ups).

### Forms

| Component | File | API summary |
| --- | --- | --- |
| `InputSistema` | `components/ui/sistema-diseno.tsx` | `label`, `icono` (left), `error` (sets `aria-invalid` and `aria-describedby`), `accesorio` (right slot, e.g. show password), all input props. 44px. `className` goes on the input. |
| `SelectSistema` | same | Native select: `label`, `opciones={[{ valor, etiqueta }]}`, `placeholder`, `value`, `onValueChange`, `error`. 44px. |
| `TextareaSistema` | same | `label`, `filas`, `error`; starts at 44px and grows |
| `Interruptor` | `components/ui/interruptor.tsx` | On/off switch: `activo`, `onCambio(siguiente)`, `aria-label` (required, names what it turns on: "Turno Domingo 9:00"), plus button props (`disabled`, `title`). A real `<button role="switch" aria-checked>`, 44px target around a 44×24 track; on = brand track, off = muted at 55%. Used for roles and campus shifts in Estructura. |
| Shared form parts | `components/forms` | `SeccionFormulario` (labelled section card, `role="region"`), `AvisoFormulario` (`error` / `info` / `marca`). See [patterns.md](patterns.md#forms). |

### Surfaces and status

| Component | File | API summary |
| --- | --- | --- |
| `TarjetaSistema` | `components/ui/sistema-diseno.tsx` | `variante="default" \| "elevated" \| "outlined"`; `rounded-2xl p-6`. Cards are flat: `default` and `elevated` render the card surface (`bg-card border border-border`, no glass, no shadow); `elevated` keeps its name for existing callers. `outlined` adds `shadow-lg`. |
| `BadgeSistema` | same | `variante="default" \| "success" \| "warning" \| "error" \| "info"`, `tamaño="sm" \| "md" \| "lg"`. Still uses raw palette colors and `error` instead of the `danger` token name; mapping it to the status tokens is an open follow-up ([migration.md](migration.md#open-follow-ups)). For a status, prefer `PuntoEstado`. |
| `SeparadorSistema` | same | 1px `bg-border` line |
| `SkeletonSistema` | same | `ancho`, `alto`, `redondo` |
| `PuntoEstado` | `components/ui/punto-estado.tsx` | Status dot plus label: `tono="success" \| "warning" \| "info" \| "danger" \| "muted"`, `etiqueta`, `ocultarEtiquetaEnMovil` (label hides below `md` but stays in the accessible name). The dot is decorative. Server-safe. Exports `FONDO_TONO` (fill class per tone) and `TonoEstado`. |
| `MetricasAtencion` | `components/ui/metricas-atencion.tsx` | Attention metrics that ARE the filter: `metricas` (`{ id, etiqueta, valor, total?, pista?, tono, activa }`), `onAlternar(id)`, `etiqueta` (group name). Each card is a `<button aria-pressed>` with a status dot, the value in mono, a proportion bar (`valor / total`) and a hint. 4 columns from `lg`, 2×2 below; on phone the cards are compact (no bar, no hint). Pressed: `bg-brand-tint`, the brand border from `md`, a 1.5px inset brand ring on phone. Replaces `TarjetaEstadistica` and ad hoc KPI tiles. |
| `EstadoVacioSistema` | `components/ui/estado-vacio-sistema.tsx` | The canonical empty state: `icono` (lucide component or element), `titulo`, `subtitulo` (one line of guidance), `accion`. Centered and muted, no card of its own; render it inside the list container. Server-safe on purpose (no `'use client'`), so server pages can pass a lucide icon. |
| `SkeletonLista` | same file | Loading rows at the list row height (72px): `filas` (default 6). `role="status"`, `aria-busy`, "Cargando" for screen readers. `ListaResponsiva cargando` renders it. |

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
| `PastillaFiltro`, `GrupoPastillas` | `components/ui/PastillasFiltro.tsx` | Count pills that refine WHAT: `etiqueta`, `cantidad` (optional, mono bold), `activa` (`aria-pressed`), `onClick`, `tono` (optional `PuntoEstado` dot before the label, decorative; e.g. the Estructura problem pills). `GrupoPastillas` (`etiqueta` = group name) scrolls horizontally on phones and wraps from `md`. The caller owns the rule (single choice, second tap clears, toggles). |
| `TabsSistema`, `TabsList`, `TabsTrigger`, `TabsContent` | `components/ui/TabsSistema.tsx` | Radix Tabs with system styles; same props as Radix. Use for sections of one screen, not for view modes (use `ControlSegmentado`). |
| `ControlSegmentado` | `components/ui/control-segmentado.tsx` | 2–3 option view switch ("Por persona / Por servicio"): `opciones` (`{ valor, etiqueta }`), `valor`, `onCambio`, `etiqueta` (group name). `role="group"` with `aria-pressed` buttons; the pressed one inverts (`bg-foreground text-background`). 36px segments, 44px on touch. Desktop toolbar; on phone it goes into the filters sheet. |

### Lists and toolbar

| Component | File | API summary |
| --- | --- | --- |
| `BarraHerramientas` | `components/ui/barra-herramientas.tsx` | Toolbar of a list screen: `busqueda={{ valor, onCambio, placeholder, etiqueta }}`, `filtrosActivos` (badge count on "Filtros"), `onAbrirFiltros`, `vista` (slot, usually `ControlSegmentado`). "/" focuses the search on desktop unless the user types elsewhere. Below `md` the search fills the width (filled, no border) and the Filtros button and view slot hide. |
| `BotonFiltrosMovil` | same file | Phone Filtros button for the `BarraNavegacionMovil` actions: `filtrosActivos`, `onClick`. 44px icon with a `bg-brand-strong` count badge; named "Filtros, N activos". |
| `ChipsFiltrosActivos` | same file | One brand-tint chip per active filter: `chips` (`{ id, etiqueta }`), `onQuitar(id)` ("Quitar …" buttons with 44px targets), `onLimpiarTodo` ("Limpiar todo" from two chips up). One scrolling row on phone, wraps from `md`. Renders nothing without chips. |
| `HojaFiltros` | `components/ui/hoja-filtros.tsx` | The filters sheet: a `DetalleResponsivo` with `abierta`, `onCambioAbierta`, `titulo` (default "Filtros"), `resultados`, `unidad={{ singular, plural }}`, `onLimpiar`. Footer "Limpiar" \| "Ver N personas". Filters apply live; "Ver N" only closes. |
| `GrupoFiltro` | same file | One block of the sheet: `titulo` (small uppercase label, also the group's accessible name), children. |
| `SelectsFiltro` | same file | Grid for long-list selects (Rol, Turno, Inicio): 3 columns from `md`, 1 on phone. |
| `ListaResponsiva` | `components/ui/lista-responsiva.tsx` | The list of a list screen: `columnas` (`{ id, titulo, ordenable?, ancho?, ocultarEnTablet? }`), `filas`, `claveFila`, `renderCelda(fila, columnaId)`, `renderFilaMovil(fila)` (`{ titulo, subtitulo?, avatar?, insignias?, meta? }`), `onAbrirFila`, `etiquetaFila` ("Abrir Ana Pérez"), `orden={{ columna, sentido }}`, `onOrdenar`, `vacio`, `cargando`, `etiqueta`. One ARIA table at every width: from `md` a header grid with sortable header buttons (`aria-sort` and ↑/↓ on the active one); columns with `ocultarEnTablet` show from `lg`; below `md` inset grouped rows (avatar, title, subtitle, meta, chevron). Every row ends in a real button stretched over the row; interactive content in a cell needs `relative z-10`. |

### Overlays

| Component | File | API summary |
| --- | --- | --- |
| `HojaInferior` | `components/ui/hoja-inferior.tsx` | Phone bottom sheet on vaul (`ui/drawer`): `abierta`, `onCambioAbierta`, `titulo`, `descripcion`, `pie` (sticky equal-width footer), `className`. Grab handle, close button, up to 90% height, 26px top radius, safe-area padding, `shadow-sheet`. Escape, the scrim and dragging down close it; focus is trapped and returned. |
| `DetalleResponsivo` | `components/ui/detalle-responsivo.tsx` | One API for detail and filter overlays: `abierto`, `onCambioAbierto`, `titulo`, `descripcion`, `pie`, `ancho` (any `ANCHOS_PANEL` key: `md`, `lg`, `estructura`). `PanelLateralSistema` from `md`, `HojaInferior` below; renders nothing on the server (no hydration mismatch). Same file: `useEsEscritorio()` (`true` from 768px, `null` on the server) for screens whose phone tree differs, like the Estructura org chart. |

### Phone navigation

| Component | File | API summary |
| --- | --- | --- |
| `NavegacionMovilProvider` | `components/ui/barra-navegacion-movil.tsx` | Connects the bar to the large title of the same screen. Without it the bar always shows its compact title. |
| `BarraNavegacionMovil` | same file | Phone-only (`md:hidden`) sticky translucent bar: `titulo` (compact title, also names the `nav`), `atras={{ etiqueta, href? \| onClick? }}` ("Volver a …"), `acciones` (up to two 44px icon buttons, e.g. `BotonFiltrosMovil`). The compact title fades in once `TituloGrande` scrolls under the bar. Screens opt in; the app chrome is unchanged. |
| `TituloGrande` | same file | Phone large title (28px, `h1`; decided 2026-10-28, the code still renders 34px) plus `resumen` (wrap numbers in `strong`); `md:hidden`, the desktop title stays in the header. |

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
| `components/ui/tarjeta-estadistica.tsx` (`TarjetaEstadistica`) | `TarjetaSistema` + `BadgeSistema`; for KPIs, `MetricasAtencion` | decided (`@deprecated`) |
| `components/ui/tarjeta-glassmorphism.tsx` | `TarjetaSistema` | decided (glass look retired) |
| `components/ui/card.tsx` (shadcn `Card`) | `TarjetaSistema` | decided (lint error in migrated areas) |
| `components/ui/select.tsx` (Radix select) | `SelectSistema` (native) | decided (migrate the 3 usages) |
| `components/ui/tabs.tsx` (shadcn tabs, unused) | `TabsSistema` | decided |
| `components/ui/sidebar.tsx` (shadcn sidebar, unused) | `SidebarModerna` | decided |
| `components/ui/skeleton.tsx` | `SkeletonSistema` | decided |
| `components/ui/toggle-group.tsx` (unused) | `ControlSegmentado` (plain `aria-pressed` buttons) | decided (not used) |
| `components/ui/drawer.tsx` (vaul) | base of `HojaInferior`; screens use `HojaInferior` or `DetalleResponsivo`, not the raw drawer | decided (vaul) |
| `components/ninos/panel-lateral.tsx` (raw `Sheet`) | `PanelLateralSistema` | decided (migrates with Niños) |
| `components/cuentas/invitar-cuenta-panel.tsx` (raw `Sheet`) | `PanelLateralSistema` | decided |
| `EstadoVacio` in `components/ninos/estado-vacio.tsx`, `components/dream-team/estado-vacio.tsx`, `components/grupos-vida/selector-propietario-casa.tsx` (local), `EstadoVacioAsistencia` in `components/asistencia/partes-asistencia.tsx` | `EstadoVacioSistema` (and `SkeletonLista` for loading) | decided; the four copies still exist and migrate with their areas (server-safe, see the RSC note in `components/dream-team/estado-vacio.tsx`) |
| `components/dream-team/servidores/barra-filtros.tsx`, `hoja-filtros.tsx` (local) | `BarraHerramientas`, `ChipsFiltrosActivos`, `HojaFiltros` | decided; extracted in Phase 1, Servidores adopts them in T6 |
| Classes `glass-panel*` | `bg-card border border-border` | decided (see [foundations.md](foundations.md#legacy-tokens)) |

## Planned components

Phase 1 built most of the prototype pieces (catalog above). These remain.
Each comes from a pattern in the prototype
([`prototipos/servidores/`](prototipos/servidores/)). Names are
working names; the PR that builds one moves it into the catalog.

| Planned | Prototype pattern (CSS class) | Extends | Notes |
| --- | --- | --- | --- |
| Scope cards (tree) | `.scope` / `.node` | `TarjetasFiltro` | Add flags (`info` "por activar", `warning` "sin cuenta"), an etapa stacked bar, the responsible line, and drill-down (entering a node updates the breadcrumb). The responsible line is a single line: first name + first surname, truncated with an ellipsis; the full name goes in `title` and in `sr-only` text. Phone: inset grouped list rows with count and chevron. Built with Servidores (T6). |
| Canonical breadcrumb (`MigasPan`) | `.crumbs` | `DesktopHeader` `breadcrumbs` slot | Only if the desktop header's `breadcrumbs` slot is not enough once Servidores drills into the tree; otherwise pass the crumbs to `PaginaSistema breadcrumbs`. |
| Skeleton shimmer | `.skel` | `SkeletonLista` | `SkeletonLista` pulses today; the prototype sweeps a gradient. Needs a `shimmer` keyframe in `app/globals.css` (global reduced-motion rule already stops it). |
| Hero slot | `.hero` | `PaginaSistema` | Title + summary in the content column on desktop/tablet; on phone `TituloGrande` covers it. |
| Detail drawer content | `.sheet#drawer` | `DetalleResponsivo` | Identity header, quick actions (WhatsApp, Llamar, Editar ficha), callouts, per-item cards with key/value grid and actions. Built with Servidores (T6), extracted when a second screen needs it. |
| Attendance mark pair (G1, `MarcaAsistencia`) | `.marca` (`design/estudiantes-asistencia/01-lider-celular.html`) | `ControlSegmentado` | Per-row Presente / Ausente toggle: the `ControlSegmentado` frame and pressed state with two 44px icon-only segments (✓ / ✕), each with `aria-label` and `aria-pressed`; a second tap on the pressed one clears the mark; `relative z-10` over the `ListaResponsiva` row button. Local in `components/estudiantes/lista/marca-asistencia.tsx` (Estudiantes C3b, leader list). |
| Search before create (G3, `BuscadorDuplicados`) | `#alta` step 1 (`design/estudiantes-asistencia/02-visitante-celular.html`) | `InputSistema` + inset rows + `BadgeSistema` | Search the whole church (cédula, teléfono, name) before registering someone; each result ends in a badge ("Ya está en tu lista", "En 3er año · Chicas") or "Agregar", and "Crear nueva" opens the short form; a possible duplicate found on create brings the matches back with "Es otra persona". Local in `components/estudiantes/visitante/` (`use-flujo-visitante.ts`, `flujo-visitante.tsx`), used by the leader list sheet and the group drawer's "Registrar nuevo"; Niños does the same in its own screens. |
| "Visitantes de hoy" strip (G2, `FranjaVisitantes`) | `.visitas` (`design/estudiantes-asistencia/03-vivo-escritorio.html`, `04-vivo-celular.html`) | inset list (`ListaInset`) + `BadgeSistema` | Recent-activity list: avatar initials, name with "Nuevo" (`BadgeSistema info`) for a first visit, group and año, "Registró … · 9:38"; newest first; each row opens its group's detail. Phones show 3 and "Ver los N visitantes" (the rest hidden with `max-md:hidden`, so desktop shows them all). Not a live region: new arrivals are announced by a toast, never the list. Empty: "Todavía no hay visitantes". Local in `components/estudiantes/vivo/franja-visitantes.tsx` (Estudiantes C4b, live view). |
| Live indicator (G4, `IndicadorEnVivo`) | `.vivo` (`design/estudiantes-asistencia/03-vivo-escritorio.html`) | `PuntoEstado` | "En vivo · Actualizado hace 10 s" with `PuntoEstado success`; `muted` with "En pausa · …" while the tab is hidden and "Reintentando · …" after a failed refresh (never color alone). The counter ticks every second inside the component only and is never announced (no `aria-live`); changes are announced elsewhere. Local in `components/estudiantes/vivo/indicador-en-vivo.tsx`, fed by the 15 s refresh loop `use-en-vivo.ts` (Estudiantes C4b). |
| Read-only inset row (G6) | `.m-row.ro` (`design/estudiantes-asistencia/06-grupos-escritorio.html`) | `ListaResponsiva` phone row | A roster row that opens nothing (a visitor in the group drawer). Composed locally as `FilaInset` in `components/estudiantes/filas-inset.tsx` (Estudiantes C2). |
| Inset row with its own action, add row (G7) | `.m-row.con-accion`, `.m-row.add` | `ListaResponsiva` phone row + `BotonSistema ghost sm` | A row with a trailing action ("Quitar" on a leader, "Agregar" / "Mover aquí" on a search result) and the "Agregar …" row with a `Plus` in brand text. Local `FilaInset accion` and `FilaAgregar` in `components/estudiantes/filas-inset.tsx`; would serve Grupos, Niños and Dream Team. |
| In-drawer navigation (G8) | `.sh-head .back` + swapped `.sh-body` | `DetalleResponsivo` | One drawer whose body swaps views (group → member, "Agregar integrante", "Líderes de …") with "‹ <grupo>" (`BotonAtrasMovil`) at the top and focus moved into the new view, instead of nested sheets. Local in `components/estudiantes/grupos/detalle-grupo.tsx` (`FilaNavegable` opens a view; "Registrar nuevo" swaps in the visitor form of G3). A canonical stack would add the back label, focus and scroll reset to `DetalleResponsivo`. |
| Multi-select inset list (G9, `ListaSeleccion`) | `.m-list.picks` | inset list | Native checkbox (`accent-[var(--brand-strong)]`), the whole row is its label, selected row in `bg-brand-tint`, count in the section hint. Local `FilaSeleccion` in `components/estudiantes/filas-inset.tsx`, used by `components/estudiantes/grupos/selector-lideres.tsx`. `PastillaFiltro` toggles stay for filters, not people. |
| Selection mode on a list (G10) | `.seleccion`, `.casilla` (`prototipos/usuarios/01-lista-escritorio.html`) | `ListaResponsiva` + a fixed action bar | An explicit "Seleccionar" mode (`aria-pressed` toolbar button; on phones a pill in the filters sheet): a 44px checkbox column (the stretched row button marks the row, so the checkbox is not its own tab stop), and a bar fixed at the bottom (card surface, `shadow-sheet`, above the tab bar on phones) with the count, "Toda la página", the action's select, the primary action and "Cancelar"; the action asks first in a dialog. Local in `components/users/lista/lista-usuarios.tsx` (`Casilla`) and `seleccion-usuarios.tsx` (Usuarios bulk role change). |

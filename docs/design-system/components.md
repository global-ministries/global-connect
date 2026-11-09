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
working names; the PR that builds one moves it into the catalog. The
pieces of the planning style, the standard for new work, are in
[Planning style components](#planning-style-components).

| Planned | Prototype pattern (CSS class) | Extends | Notes |
| --- | --- | --- | --- |
| Scope cards (tree) | `.scope` / `.node` | `TarjetasFiltro` | Add flags (`info` "por activar", `warning` "sin cuenta"), an etapa stacked bar, the responsible line, and drill-down (entering a node updates the breadcrumb). The responsible line is a single line: first name + first surname, truncated with an ellipsis; the full name goes in `title` and in `sr-only` text. Phone: inset grouped list rows with count and chevron. Built with Servidores (T6). |
| Canonical breadcrumb (`MigasPan`) | `.crumbs` | `DesktopHeader` `breadcrumbs` slot | Only if the desktop header's `breadcrumbs` slot is not enough once Servidores drills into the tree; otherwise pass the crumbs to `PaginaSistema breadcrumbs`. |
| Skeleton shimmer | `.skel` | `SkeletonLista` | `SkeletonLista` pulses today; the prototype sweeps a gradient. Needs a `shimmer` keyframe in `app/globals.css` (global reduced-motion rule already stops it). |
| Hero slot | `.hero` | `PaginaSistema` | Title + summary in the content column on desktop/tablet; on phone `TituloGrande` covers it. |
| Detail drawer content | `.sheet#drawer` | `DetalleResponsivo` | Identity header, quick actions (WhatsApp, Llamar, Editar ficha), callouts, per-item cards with key/value grid and actions. Built with Servidores (T6), extracted when a second screen needs it. |
| Attendance mark pair (G1, `MarcaAsistencia`) | `.marca` (`design/estudiantes-asistencia/01-lider-celular.html`) | `ControlSegmentado` | Per-row Presente / Ausente toggle: the `ControlSegmentado` frame and pressed state with two 44px icon-only segments (✓ / ✕), each with `aria-label` and `aria-pressed`; a second tap on the pressed one clears the mark; `relative z-10` over the `ListaResponsiva` row button. Superseded in the leader list by the planning-style `MarcasFila` (Presente circle over `MarcaLlegada` + written «Ausente», `components/estudiantes/planificacion/marcas.tsx`, `odd/tasks/estudiantes-estilo-dps.md`); the ✓ / ✕ pair was removed. |
| Volunteer mark trio (G10, `MarcaVoluntario`) | — (C5, no artboard; three-state sibling of `.marca`) | `ControlSegmentado` | Per-row Presente / Avisó / Faltó: the `ControlSegmentado` frame and pressed state with three 44px text segments, each with `aria-pressed`, disabled outside the marking window; a second tap on the pressed one clears the mark. Sits in an inset row whose marks go under the name on phones and at its end from `sm`. Local in `components/estudiantes/voluntarios/fila-voluntario.tsx` (Estudiantes C5, volunteer attendance); Niños keeps its own pre-v2 row (`components/ninos/voluntarios-fila.tsx`) until that area migrates. |
| Search before create (G3, `BuscadorDuplicados`) | `#alta` step 1 (`design/estudiantes-asistencia/02-visitante-celular.html`) | `InputSistema` + inset rows + `BadgeSistema` | Search the whole church (cédula, teléfono, name) before registering someone; each result ends in a badge ("Ya está en tu lista", "En 3er año · Chicas") or "Agregar", and "Crear nueva" opens the short form; a possible duplicate found on create brings the matches back with "Es otra persona". Local in `components/estudiantes/visitante/` (`use-flujo-visitante.ts`, `flujo-visitante.tsx`), used by the leader list sheet and the group drawer's "Registrar nuevo"; Niños does the same in its own screens. |
| "Visitantes de hoy" strip (G2, `FranjaVisitantes`) | `.visitas` (`design/estudiantes-asistencia/03-vivo-escritorio.html`, `04-vivo-celular.html`) | inset list (`ListaInset`) + `BadgeSistema` | Recent-activity list: avatar initials, name with "Nuevo" (`BadgeSistema info`) for a first visit, group and año, "Registró … · 9:38"; newest first; each row opens its group's detail. Phones show 3 and "Ver los N visitantes" (the rest hidden with `max-md:hidden`, so desktop shows them all). Not a live region: new arrivals are announced by a toast, never the list. Empty: "Todavía no hay visitantes". Local in `components/estudiantes/vivo/franja-visitantes.tsx` (Estudiantes C4b, live view). |
| Live indicator (G4, `IndicadorEnVivo`) | `.vivo` (`design/estudiantes-asistencia/03-vivo-escritorio.html`) | `PuntoEstado` | "En vivo · Actualizado hace 10 s" with `PuntoEstado success`; `muted` with "En pausa · …" while the tab is hidden and "Reintentando · …" after a failed refresh (never color alone). The counter ticks every second inside the component only and is never announced (no `aria-live`); changes are announced elsewhere. Local in `components/estudiantes/vivo/indicador-en-vivo.tsx`, fed by the 15 s refresh loop `use-en-vivo.ts` (Estudiantes C4b). |
| Read-only inset row (G6) | `.m-row.ro` (`design/estudiantes-asistencia/06-grupos-escritorio.html`) | `ListaResponsiva` phone row | A roster row that opens nothing (a visitor in the group drawer). Composed locally as `FilaInset` in `components/estudiantes/filas-inset.tsx` (Estudiantes C2). |
| Inset row with its own action, add row (G7) | `.m-row.con-accion`, `.m-row.add` | `ListaResponsiva` phone row + `BotonSistema ghost sm` | A row with a trailing action ("Quitar" on a leader, "Agregar" / "Mover aquí" on a search result) and the "Agregar …" row with a `Plus` in brand text. Local `FilaInset accion` and `FilaAgregar` in `components/estudiantes/filas-inset.tsx`; would serve Grupos, Niños and Dream Team. |
| In-drawer navigation (G8) | `.sh-head .back` + swapped `.sh-body` | `DetalleResponsivo` | One drawer whose body swaps views (group → member, "Agregar integrante", "Líderes de …") with "‹ <grupo>" (`BotonAtrasMovil`) at the top and focus moved into the new view, instead of nested sheets. Local in `components/estudiantes/grupos/detalle-grupo.tsx` (`FilaNavegable` opens a view; "Registrar nuevo" swaps in the visitor form of G3). A canonical stack would add the back label, focus and scroll reset to `DetalleResponsivo`. |
| Multi-select inset list (G9, `ListaSeleccion`) | `.m-list.picks` | inset list | Native checkbox (`accent-[var(--brand-strong)]`), the whole row is its label, selected row in `bg-brand-tint`, count in the section hint. Local `FilaSeleccion` in `components/estudiantes/filas-inset.tsx`, used by `components/estudiantes/grupos/selector-lideres.tsx`. `PastillaFiltro` toggles stay for filters, not people. |
| Selection mode on a list (G10) | `.seleccion`, `.casilla` (`prototipos/usuarios/01-lista-escritorio.html`) | `ListaResponsiva` + a fixed action bar | An explicit "Seleccionar" mode (`aria-pressed` toolbar button; on phones a pill in the filters sheet): a 44px checkbox column (the stretched row button marks the row, so the checkbox is not its own tab stop), and a bar fixed at the bottom (card surface, `shadow-sheet`, above the tab bar on phones) with the count, "Toda la página", the action's select, the primary action and "Cancelar"; the action asks first in a dialog. Local in `components/users/lista/lista-usuarios.tsx` (`Casilla`) and `seleccion-usuarios.tsx` (Usuarios bulk role change). Servidores uses the same surface without a mode for expired invitations to register (`CasillaInvitacion`, `BarraSeleccionInvitaciones` in `components/dream-team/servidores/invitaciones-servidores.tsx`): the checkbox sits above the row button (`relative z-10`) and is its own tab stop, "Seleccionar todas las invitaciones vencidas" sits above the list, and the selection clears when the filters change. |
| Event history (G13, `Historial`) | `.hist` (`design/invitaciones/05-mezcla-escritorio.html`) | `PuntoEstado` | A short timeline inside a drawer: an `ol` named by its small uppercase heading, each entry a `PuntoEstado` dot (tone = what happened: `info` sent, `warning` expired, `success` done; never color alone, the text says it), the event text and a muted line with date and who. Local in `components/cuentas/aviso-invitacion-cuenta.tsx` (history of the invitation to register, Servidores drawer); the entries come from `entradasHistorial` in `components/cuentas/textos-invitacion.ts`. |
| Save bar for edit forms (G11) | `.barra-g` (`prototipos/usuarios/05-editar-escritorio.html`) | the selection bar (G10) surface | Sticky at the bottom of a form, only while there are unsaved changes: status, "Cancelar", "Guardar cambios", plus the "¿Descartar los cambios?" guard for links and `beforeunload`. Local `BarraGuardar`, `DialogoDescartar` and `useGuardaSalida` in `components/users/editar/` (Editar persona, Mi perfil). See [patterns.md](patterns.md#forms). |
| Field with notice and change dot (G12) | `.campo`, `.msg`, `.mod` (same prototype) | `InputSistema`, `SelectSistema` | A label with the required mark and a brand "changed" dot, one message line (error › warning notice › hint) wired to `aria-describedby`, and the warning border. `InputSistema` takes a string label and renders its own `text-red-500` error (f8), so Editar persona composes them locally (`CampoTexto`, `CampoSelect` in `components/users/editar/campos-editar.tsx`) with state classes on `aria-invalid` / `data-revisar`. A `label: ReactNode` and an `aviso` prop on the canonical inputs would remove the local copy. |
| Single-choice list (GP1, `ListaOpciones`) | `.m-row.pick.opcion` (`design/estudiantes-asistencia/09-promocion-escritorio.html`) | inset list (G9 picker row) | A `fieldset` + `legend` of native radios (`accent-[var(--brand-strong)]`) where each row is its label, with a title and a wrapping sentence of consequence; the chosen row in `bg-brand-tint`; a disabled row shows its reason in `warning-text`. `ControlSegmentado` fits only 2–3 short labels. Local in `components/estudiantes/promocion/tarjeta-decision.tsx` (Estudiantes C6b3, the 3er año decision of "Promover temporada"). |
| Before → after cell (GP2) | `.lista.tabla.promo` (same artboard) | `ListaResponsiva` | Two columns "Grupo hoy" · "Queda como" on desktop; on phone the row's second line is a `→` icon, an `sr-only` "Queda como" and the new value. Composed in `components/estudiantes/promocion/lista-promocion.tsx`; reports and future migrations (Niños → Estudiantes) would reuse a change preview row. |
| Confirmation dialog with a summary list (GP3, `DialogoConfirmacion`) | `.dlg .res` (same artboard; `prototipos/usuarios`) | `ui/dialog` | `role="alertdialog"`, title as a question, one line of consequence, an icon list of totals (numbers in mono), an error line inside, `DialogFooter` Cancelar · action, closing blocked while it applies. Local in `components/estudiantes/promocion/dialogo-promocion.tsx`; Usuarios and Mi familia have their own dialogs without the list. |
| Warning tone for `AvisoFormulario` | `.aviso.warn` (`06-grupos-escritorio.html`, `09-promocion-escritorio.html`) | `AvisoFormulario` | `AvisoFormulario` has `error` / `info` / `marca` only. The warning notice ("Se aplica una vez al año…", "Transit se queda sin grupo de 1er año…", "Este grupo no tiene líder") is composed on `border-warning/30 bg-warning/10` with an `AlertTriangle` in `warning-text` in `components/estudiantes/promocion/partes-promocion.tsx` (`AvisoPromocion`, which also adds the icon to `info` / `marca`). A `tono="warning"` (and an optional icon) on `AvisoFormulario` would remove it. |
| Funnel steps (GR1, `EmbudoEtapas`) | `.embudo` / `.etapa` (`design/estudiantes-asistencia/11-reportes-escritorio.html`) | `MetricasAtencion` card look | Steps of a funnel that open a list instead of filtering: name, value in mono, one-line definition, a brand bar with the conversion to the next step ("75% de los conocidos") and a decorative arrow between steps from md; inset rows with a chevron on phones; each step is a button with `aria-haspopup="dialog"` and its full sentence as the name. Local in `components/estudiantes/reportes/embudo-conexion.tsx` (Estudiantes C6d3, «Embudo de conexión» Sin grupo → En grupo → Sirviendo); Grupos de Vida and Niños could reuse it. |
| Trend indicator (GR2, `IndicadorTendencia`) | `.tend` (same artboard) | — | Arrow + word ("Sube 6", "Baja 17", "Estable" under 3 points, "Sin datos previos") on `success-text` / `danger-text` / `muted-foreground`, named "Baja 17 puntos frente al período anterior" (`role="img"`), never color alone; compact rows drop "Sin datos previos". Local in `components/estudiantes/reportes/partes-reportes.tsx`; `TarjetaKpiAsistencia` has no trend either. |
| Date range filter (GR3, `FiltroRangoFechas`) | `.rango` pills + `#filtros` Desde / Hasta (same artboard) | `GrupoPastillas` + `HojaFiltros` | Quick ranges as single-choice pills on the page ("Últimas 8 semanas · Este mes · Mes anterior · Últimos 6 meses · Elegir fechas"), Desde / Hasta `InputSistema type="date"` in the filters sheet with the reason when they cannot apply, and a chip for a custom range. Composed in `components/estudiantes/reportes/` (`reportes-client.tsx`, `filtros-reportes.tsx`); Niños reports (pills and inputs in a card) and `FiltroFechasAsistencia` (collapsible) are the other two patterns today. |
| Percentage cell (GR4, `CeldaPorcentaje`) | `.asis` (same artboard) | `ListaResponsiva` cell | Value in mono and a proportion bar on the patterns.md scale (≥80 success, ≥60 warning, ≥40 brand, else danger), "Sin reuniones" when there is no figure. Local in `components/estudiantes/reportes/partes-reportes.tsx`. `TarjetasFiltro` scope cards cannot draw this one-segment bar nor take a percentage as their big number (they show a count + unit), so the Reportes ámbito cards show the groups and put the % in their second line. |
| Connection card (GC1, `TarjetaConexion`) | `.s-card.cx` (`design/estudiantes-asistencia/13-conexiones-escritorio.html`) | `TarjetaSistema` | Small summary card inside a drawer: icon + title, then one big number in mono ("3 · 1:1 realizados en el rango") or value rows with the GR4 bar, a short key/value list and a footnote; 2 × 2 from a 520px wide panel (`@container` of `PanelLateralSistema`), stacked below. `MetricasAtencion` cards are toggles and `TarjetaKpiAsistencia` is a page KPI, so neither fits. Local in `components/estudiantes/reportes/conexiones-persona.tsx` (Estudiantes C7c, the four «Conexiones» of The Living Room). |
| Not recorded yet (GC2, `EstadoSinRegistro`) | `.cx-pend` (same artboard) | — | Muted block (`bg-muted`, info icon, a bold line and one sentence) for data the app does not collect yet ("Aún no se registra"), told apart from a real zero and from `EstadoVacioSistema`, which points at a fix. No number and no warning. Local in `components/estudiantes/reportes/conexiones-persona.tsx` (Con Jesús; retiros, CGL e Irresistibles). |

### Planning style components

The pieces of the planning style (DPS artboards in
[`prototipos/planificacion-dps/`](prototipos/planificacion-dps/)), the
standard for new work since 2026-11-07. None is in `components/ui` yet:
status **planificado**, or **compuesto localmente en Estudiantes** for
the pieces B2–B6 that Estudiantes composes in
`components/estudiantes/alcance/` (the scope bar, B1, is in
[layout.md](layout.md#scope-bar-barra-de-alcance)). Names are working
names; the PR that builds one moves it into the catalog and the gallery. Reuse the existing piece named under
"Extends" before adding anything.

Density rule for all of them: dense rows (32px person rows, 36px table and
sheet rows, 30px condensed) only in data-dense desktop views; under
`pointer: coarse` rows grow to 44px (48px for editable table rows) and
hover-only actions stay visible. Forms, `ListaResponsiva` and phones keep
44px. Values in
[foundations.md](foundations.md#density-rows-and-targets).

| Planned | Artboard pattern (CSS class) | Extends | Status | Notes |
| --- | --- | --- | --- | --- |
| Header band (`EncabezadoAmplio`) | `.hd` (01–04) | `PaginaSistema` header | planificado | `bg-card border-b`, 16px 24px. Left: optional cover (`PortadaSerie`), then breadcrumb (13px, `›`), `h1` 24px, and either the summary line (15px) or the date pill + meta line. Right: 36px actions (secondary links such as "Matriz", the "Acciones ▾" menu, at most one `primario`). |
| Cover thumbnail (`PortadaSerie`) | `.cover` | — | planificado | 160 × 100px, `rounded-md`, the series art; until there is an image, a `chart-1`/`chart-5` tint with the series name in 13px / 750 uppercase. Decorative (`aria-hidden`); the title carries the name. |
| Date pill (`PastillaFecha`) | `.dp` | — | planificado | `rounded-full` border on `bg-background`: "‹ Domingo 8 nov 2026 ›", 13px / 500, round 30px buttons (44px on touch) named "Domingo anterior, 1 de noviembre". Steps between the dates that exist (Sundays of the plan), not calendar days. |
| Actions menu (`MenuAcciones`) | `.menu` (01) | `ui/dropdown-menu` | planificado | "Acciones ▾" button with `aria-haspopup="menu"`, items 36px with icon, arrow keys, `Escape` returns focus. Holds the secondary actions of the view ("Copiar del domingo anterior", "Pasar asistencia", "Imprimir plan"); bulk ones confirm in a 420px dialog. |
| Context sidebar (`BarraContexto`, `SeccionContexto`) | `.ps` (01, 02) | — | planificado | 240px `bg-card border-r`, scrolls on its own. Sections split by `border-t`, each with a 12px uppercase heading and an optional "Agregar" text action (`brand-text`, 12px): Horarios (times in mono), Equipos (collapsible list with "N convocados · N falta"), Archivos, Notas (author · day). Desktop only; on phones its content moves into the page or a sheet. |
| Section tabs | `.seg` nav (01, 02) | `TabsSistema` / link tabs (`components/ninos/pestanas-sistema.ts`) | exists, use it | "Orden \| Equipos \| Ensayo pronto": the segmented look `TabsSistema` already has; route tabs are links with `aria-current="page"`; a future tab is disabled with "pronto". The summary and `EstadoGuardado` share its row. |
| Autosave status (`EstadoGuardado`) | `.sv` (01–04) | `PuntoEstado` look | planificado | Right end of the toolbar, 12px muted, `role="status"`: "Guardando…" → check + "Guardado"; on failure "No se pudo guardar · Reintentar" in `danger-text`. Replaces save buttons in planning views (see [patterns.md](patterns.md#inline-edit-and-autosave)). |
| Team columns (`ColumnasEquipo`, `ColumnaEquipo`) | `.cols`, `.col`, `.ch`, `.pt`, `.pr`, `.fl`, `.ad` (01) | — | planificado | A horizontal scroll region (`role="region"`, `tabindex="0"`, `aria-label`) of 196px columns (`bg-card border rounded-md`, 10px gap). Column head: title 14px / 650, "N convocados · N falta", options button. Per position: a `bg-muted` header row (12px / 600, `n/m` mono), 32px person rows (24px initials avatar, name 13px / 500, "Quitar a …" × on hover), one "Falta" row per unfilled position (danger count badge; opens the assign popover) and a hover "+ Convocar" row. A last muted column explains what is outside the plan ("Otros equipos"). |
| Initials avatar (`AvatarIniciales`) | `.av` | — | planificado | 24px (desktop rows) / 32px (phone rows), initials 10px / 12px 650, hue from the name over `chart-1…5` (26% fill, 40% border). Decorative. |
| Assign popover (`PopoverAsignar`) | `.pop` (01, 03) | `ui/popover` | planificado | Anchored to the cell or "Falta" row, flips to stay on screen, 280–290px, `rounded-md`, `shadow-sheet`. Title "Convocar para <puesto>" / "<puesto> · <fecha>", context line, the people already there (highlight and remove buttons), a 34px search and candidates with one context line ("Ya sirve ese día en Video" in `warning-text`, "Sirvió el domingo anterior", "Libre ese día"). Picking saves at once; `Escape` closes and returns focus. |
| Assignment matrix (`MatrizAsignacion`) | `table[role=grid]` (03) | — | planificado | Rows = team › position (team rows `bg-muted` with "N faltan"), columns = dates. Sticky first column (190px) and two sticky header rows: series band (30px, `chart-*` top border and tint, name + weeks) and dates (44px, link to that plan, "Próximo" tag). Cells: name chips (12px, `bg-muted`, `rounded-sm`), "Falta N", "—" when the position does not apply that day (hatched special-day column). Roving `tabindex`; see [patterns.md](patterns.md#matrix-assign). |
| Highlight a person (`ResaltadoPersona`) | `.hlc` (03) | `ChipsFiltrosActivos` chip | planificado | Brand-tint chip in the toolbar "Resaltado: <nombre> · 3 de 8 domingos" with a "Quitar resaltado" ×; that person's chips turn `bg-brand-tint border-brand` 650 in every cell. Toggled from the popover's target button (`aria-pressed`). It highlights, never filters. |
| Density toggle | `.seg[aria-label=Densidad]` (03, 04) | `ControlSegmentado` | exists, use it | "Condensado \| Normal" (`aria-pressed`). Condensed: 30px rows and 12px text in the sheet; first names + initial on one line in the matrix. Local preference, not in the URL. |
| Spreadsheet (`HojaCalculo`) | `table[role=grid]` (04) | — | planificado | One row per date, 36px rows, 13px cells truncated with the full text in `title`. Frozen Fecha (146px) and Serie (250px, 4px `chart-*` stripe, "n/m" week) columns ending in a 2px border; sticky 34px header; sticky month separator rows (`bg-muted`, "ENERO 2026 · 4 domingos", the label sticks left while scrolling sideways); special and free days as hatched full rows with a tag; past dates muted; empty cells read "Agregar" on hover. Keyboard in [patterns.md](patterns.md#spreadsheet-keyboard). |
| Column picker (`MenuColumnas`) | `.cp` (04) | — | planificado | "Columnas 8/10 ▾" button (`aria-expanded`) opening a checkbox list (32px rows, `accent-[var(--brand-strong)]`); at least one column stays on; `Escape` closes. |
| Inline field (`CampoEnLinea`) | `.ed` (02), `td.ed` (04) | `InputSistema` look | planificado | An input that reads as text: transparent border, the border shows on hover, on focus a `brand` border + 2px brand/20 ring on `bg-background`; `aria-invalid` turns the border `danger`. Durations and times in mono. |
| Reorder handle (`AsaArrastre`) | `.grip` (02) | — | planificado | 28px grip (44px on touch), faint until row hover or focus, named "Mover <elemento>. Usa flechas arriba y abajo"; drag or ↑ / ↓ on the focused handle. |
| Arrival toggle (`MarcaLlegada`) | `.ck` (05) | `Interruptor` semantics, sibling of G1 `MarcaAsistencia` | planificado | One big round toggle per person: a 30px circle with a 2px border in a 44px target, `aria-pressed`, named "Llegó: <nombre>"; pressed = `success` fill with a check, and the name turns muted 500. One tap saves, a second undoes. See [mobile.md](mobile.md#attendance-list-planning-style). |
| Dense read-only table (B2, `TablaDensa`) | `table` (`design/estudiantes-dps/11`, `13`, `15`) | `HojaCalculo` look, `ListaResponsiva` rows | compuesto localmente en Estudiantes | For reading, not editing (`HojaCalculo` edits with Excel keys; `ListaResponsiva` has no bands nor frozen column). 36px rows (30px «Condensado», 44px on touch or with a second line), 13px cells truncated at 280px, numbers in mono. Sticky 34px header whose sortable columns are buttons with `aria-sort` and an arrow; frozen first column (`th scope="row"`, 2px border) whose button opens the row's panel (a click on the row does the same); sticky `bg-muted` section bands ("Grupos de Chicas · 3 grupos · 39 integrantes"); the open row `aria-selected` with the brand tint (opaque over `bg-card` so frozen cells hide what scrolls under them). It sits in a bordered region that scrolls both ways, with `MenuColumnas` and the density toggle in the toolbar. Local in `components/estudiantes/alcance/tabla-densa.tsx` and `herramientas-tabla.tsx` (Grupos, Promover temporada, Reportes). |
| Range pill (B3, `PastillaRango`) | `.rp`, `.pop` (`design/estudiantes-dps/15`) | `PastillaFecha` look, `ui/popover` | compuesto localmente en Estudiantes | The date pill in the header band with the range always in sight ("Últimas 8 semanas · 14 sep – 8 nov ▾"); it opens a 300px popover (`dialog` "Rango de fechas") with the quick ranges (`aria-pressed`, the current one in brand text) and «Elegir fechas» (Desde / Hasta, applied once valid, the reason when not). Unites GR3 `FiltroRangoFechas` and `PastillaFecha` on desktop; phones keep the quick-range pills and the filters sheet. Local in `components/estudiantes/alcance/pastilla-rango.tsx` (Reportes). |
| Docked panel (B4, `PanelLateralSistema acoplado`) | `.drw` + `body.dock` (`design/estudiantes-dps/11`, `13`, `15`) | `DetalleResponsivo` | compuesto localmente en Estudiantes | From 1280px the detail panel (480px, 640px for a wide card) docks at the right under the desktop header and the view leaves it room, so the open row stays in sight and another row opens in the same panel; not modal, focus on its title, `Escape` closes and returns the focus. Its header has a small context line, the title and a description. Below 1280px it is `DetalleResponsivo`. A 640px card folds the scope bar ([layout.md](layout.md#docked-detail-panel)). Local in `components/estudiantes/alcance/panel-acoplado.tsx`. |
| Tabs inside a panel (B5) | `.seg[role=tablist]` in `.drw` (`design/estudiantes-dps/11`, `12`) | `TabsSistema` | compuesto localmente en Estudiantes | Integrantes \| Líderes \| Ajustes (PCO Groups) at full panel width under the key figures, with the counts in mono; the destructive action («Desactivar») lives under Ajustes, away from daily use. With the in-panel navigation (G8) the tab is kept while an inner view ("‹ <grupo>") opens and comes back to it; the inner view takes the focus, the tab list keeps arrow keys. Local in `components/estudiantes/grupos/vista-grupo.tsx` and `detalle-grupo.tsx`. |
| Attention toggles in a list (B6) | `.sc[aria-pressed]` (`design/estudiantes-dps/11`, `13`); `.met` (`12`, `14`) | `MetricasAtencion` | compuesto localmente en Estudiantes | In the scope bar the attention metrics become 32px rows: name, number in mono (`warning-text` when it needs action), the hint under it; `aria-pressed`, a second press clears; the active filter also shows as a chip. On phones, one row of 64px cards (2 × 2 with four) with label and number. Local `FilaAlcance` in `components/estudiantes/alcance/barra-alcance.tsx` and `MetricasCompactas` in `movil-alcance.tsx`. |

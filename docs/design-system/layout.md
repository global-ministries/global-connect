# Layout

How a page is framed: the app shell, the page primitive, its header, gutters
and the containers inside it. Values come from
[foundations.md](foundations.md); recipes that combine them are in
[patterns.md](patterns.md).

## App shell

| Width | Chrome | Source |
| --- | --- | --- |
| Desktop (`lg`+) | Sidebar (248px in the prototype; collapsible) + sticky header + content at full width | `components/ui/sidebar-moderna.tsx`, `components/ui/desktop-header.tsx` |
| Tablet (`md`–`lg`) | Collapsed icon sidebar (76px in the prototype) + header; gutters 24–28px | same |
| Phone (< `md`) | Top bar + bottom tab bar + FAB; no sidebar, no desktop header | `components/ui/header-movil.tsx`, `components/ui/menu-inferior-movil.tsx`, `components/ui/BotonFlotante.tsx` |

- Content is `grid-template-columns: <sidebar> minmax(0, 1fr)`: the
  `minmax(0, …)` and `min-w-0` on the content column are what keep wide
  children from pushing the page sideways.
- The (auth) layout offsets the page by the top and bottom bar heights; the
  bars pad by the safe-area insets.
- `components/ui/sidebar.tsx` (shadcn sidebar) is unused; the shell is
  `sidebar-moderna`.

## Page: `PaginaSistema`

Every authenticated page uses `PaginaSistema`
([`components/ui/sistema-diseno.tsx`](../../components/ui/sistema-diseno.tsx)).
It builds on `ContenedorDashboard`, which existing pages keep until they
migrate.

| Width | Class | Use |
| --- | --- | --- |
| `default` | `max-w-none` (full content width) | Every page: lists, dashboards, tables, maps, forms, details |
| `form` | `max-w-3xl` (768px), left-aligned | Deprecated. Kept until the last pages move to `SeccionesSistema`; do not use |

- Gutters: 16px mobile, 24px from `sm`, 48px from `lg`, the same as the
  desktop header so content lines up with the title.
- Vertical rhythm: `space-y-6` between sections.
- Props: `titulo`, `regreso` (back link `{ href, texto }`), `acciones` and
  `breadcrumbs` render in the sticky desktop header; `descripcion` renders
  as muted text above the content. `className` applies to the content
  column.
- On mobile the top bar shows the route title and pages keep their own
  mobile actions (FAB or in-page buttons).

```tsx
<PaginaSistema titulo="Crear Temporada" regreso={{ href: "/grupos-vida/temporadas", texto: "Temporadas" }}>
  …
</PaginaSistema>
```

`ContenedorPrincipal` is for pages without the dashboard shell (auth,
landing); `FondoAutenticacion` is the orb background of login and signup.

## Desktop header and breadcrumb

`DesktopHeader` is sticky, 64px tall in the prototype, with a translucent
background (`color-mix` of the page color + blur) and a bottom border.

- Left: the breadcrumb. Each crumb is a button or link; the last one has
  `aria-current="page"`; separators are `/` in a faint color. The breadcrumb
  is the scope of the screen: in Servidores it reads
  `Servidores / Dirección de Niños / Waumba Land`, and tapping a crumb goes
  back to that level.
- Right: the page's one primary action (`acciones`, e.g. "Asignar
  servicio", hidden when the user cannot do it) and the user menu.
- With `regreso`, the back link sits before the title.
- Translucent blur is allowed here and on the phone bars only (system
  chrome). Content surfaces are opaque.

## Hero: title and summary

The first block of the content column on desktop and tablet.

- `h1` (24px, see [foundations.md](foundations.md#typography-decided)) and
  one summary line in muted 15px with the key numbers in `strong`
  ("**48** personas sirven en **12** equipos").
- The summary is written from the current scope and filters, so it doubles
  as feedback ("Mostrando 6 de 48").
- On phones the hero is replaced by the large title (see
  [mobile.md](mobile.md#large-title)).
- Today `PaginaSistema` puts the title in the header and `descripcion` above
  the content; a hero slot is planned
  ([components.md](components.md#planned-components)).

## Section headings

A section inside a page opens with a small heading row: `h2` 12px uppercase
muted on the left, an optional hint on the right ("Tocá para entrar"), 12px
below. On phone the hint is hidden and the heading gets 4px inset to line up
with the inset list.

## Sections and fields: `SeccionesSistema`, `CamposSistema`

Pages use the whole screen. Wider screens show more blocks side by side, and
no width ever scrolls horizontally. Two grids do that, nested:

| Primitive | Columns | Empty tracks | Use |
| --- | --- | --- | --- |
| `SeccionesSistema` | as many as fit, each ≥ 26rem | collapse: one or two sections stretch to fill | the cards of a form or detail page |
| `CamposSistema` | as many as fit, each ≥ 16rem | kept: a short section keeps compact inputs | the fields inside one card |

- Each track is `minmax(min(100%, N), 1fr)`, so on a phone everything is one
  column and nothing overflows. Children get `min-w-0` for long text.
- `col-span-full` on a direct child takes the whole row: a table of members,
  a textarea, a map. `InputSistema` puts `className` on the input, so wrap
  the field in a `div` to span it.
- Do not wrap a form in a card and its sections in more cards; the sections
  are the cards. The action footer (`PieAccionesSistema`) goes after the grid.
- Use viewport breakpoints (`md:grid-cols-2`) only for page-level layouts,
  never for fields inside a card: the card width depends on its column.

```tsx
<form>
  <SeccionesSistema>
    <TarjetaSistema>
      <TituloSistema nivel={3}>Información básica</TituloSistema>
      <CamposSistema>
        <div className="col-span-full"><InputSistema label="Nombre" /></div>
        <SelectSistema label="Temporada" opciones={temporadas} />
        <SelectSistema label="Segmento" opciones={segmentos} />
      </CamposSistema>
    </TarjetaSistema>
    <TarjetaSistema>…</TarjetaSistema>
  </SeccionesSistema>
  <PieAccionesSistema>…</PieAccionesSistema>
</form>
```

## Action footer: `PieAccionesSistema`

Top border, page background, `safe-area-pb-md` bottom padding (12px or the
home-indicator inset). Sticky to the bottom of its scroll container by
default (`fijo={false}` to sit at the end). On mobile actions stack full
width with the last child on top; from `sm` they form a right-aligned row.
Put the secondary action first and the primary action last.

## Side panel: `PanelLateralSistema`

[`components/ui/panel-lateral-sistema.tsx`](../../components/ui/panel-lateral-sistema.tsx),
built on `ui/sheet`.

| Size | Width | Use |
| --- | --- | --- |
| `md` | 480px | Short forms, details |
| `lg` | 640px | Forms with repeated rows (e.g. several children) |

Full width on mobile. Fixed header (title, optional description), a
scrolling body that is a `@container` — lay out fields with `@md:`/`@lg:` so
they follow the panel width, not the viewport — and `PieAccionesSistema` for
the `pie` actions. Padding is 16px mobile, 24px from `sm`.

- A form inside the panel keeps its submit button in `pie`: give the `<form>`
  an `id` (`useId`) and the button `type="submit" form={id}`, so the button
  stays the form's default button (Enter still submits).
- Extra header content (e.g. a step indicator) goes at the top of the body;
  `descripcion` renders inside a `<p>`, so it takes text only.
- The prototype's detail drawer is 440px wide on desktop and a bottom sheet
  on phone: `DetalleResponsivo` renders this panel from `md` and
  `HojaInferior` below (see [patterns.md](patterns.md#detail-drawer)).

## Dialogs

Centered dialogs (`ui/dialog`) use the surface radius (`rounded-2xl` on
`DialogContent`), put their actions in `DialogFooter` (stacked full width on
mobile with the primary on top, a right-aligned row from `sm`) with the
default md buttons, and scroll inside (`max-h-[calc(100dvh-2rem)]
overflow-y-auto`) when the content can grow. Prefer a side panel or bottom
sheet for anything longer than a confirmation.

## Close buttons in sheets and dialogs

The built-in close button of `ui/sheet` and `ui/dialog` (and so of
`PanelLateralSistema`) is a 44px square (`size-11`) at `top-2 right-2`, with
a 16px icon, the control radius, a `focus-visible` ring and the accessible
name "Cerrar". Headers next to it reserve `pr-14` so titles never run under
it. Hide it on dialogs with `showCloseButton={false}`.

## Navigation

One registry, `lib/navegacion/registro.ts`, lists the app's own entries (id,
label, href, icon, `roles` / `capabilities`, group, bottom-bar priority). The
desktop sidebar, the mobile drawer and the mobile bottom bar all read it;
`components/navegacion/use-entradas-navegacion.ts` adds Dream Team and Niños
after Grupos de Vida and appends the platform items. Who sees an entry is
decided only by `canAccess` (`lib/navigation/canAccess.ts`).

- Add or rename an entry in the registry, never in a surface.
- Name an entry after the page it opens: `/ayuda/admin` is "Cola de soporte",
  `/configuracion/soporte` is "Configuración de soporte",
  `/grupos-vida/dashboard-riesgo` is "Salud de los Grupos".
- The bottom bar shows the entries with `prioridadMovil`, under the same role
  rule as the sidebar.
- Look comes from `components/navegacion/estilos-navegacion.ts`: 44px entries
  (`min-h-11`), the active entry on `bg-brand-tint text-brand-text` with a
  `text-brand` icon, `focus-ring`, and 44px icon-only buttons
  (`CLASE_BOTON_ICONO_NAV`) that always carry an `aria-label`.
- The collapsed sidebar labels each link (`aria-label`) and shows its tooltip
  on hover and on keyboard focus.
- Tests: `__tests__/components/navegacion/paridad-navegacion.test.tsx` pins
  the visible hrefs per role and per surface.

## Phone shell

Below `md` the page is a native-app screen. The full rules are in
[mobile.md](mobile.md); in short:

1. Navigation bar: back (when not at the root of the tab), compact title that
   appears on scroll, up to two icon actions on the right.
2. Large title and summary as the first content block.
3. Content in inset grouped lists on the grouped background, 16px gutters.
4. Tab bar at the bottom and the FAB for the primary action, both above the
   home indicator.
5. Drawers and filters open as bottom sheets.

Today `HeaderMovil` shows the route title with a menu and avatar. Screens
opt into the navigation bar with back and the large title with
`BarraNavegacionMovil` and `TituloGrande`
([components.md](components.md#phone-navigation)).

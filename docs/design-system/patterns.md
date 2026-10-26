# Patterns

Recipes built from the [components](components.md). The reference is the
Servidores prototype ([`prototipos/servidores.html`](prototipos/servidores.html));
screenshots: [desktop](prototipos/capturas/servidores-desk.png),
[tablet](prototipos/capturas/servidores-tablet.png),
[phone](prototipos/capturas/servidores-phone.png),
[phone light](prototipos/capturas/servidores-phone-light.png),
[phone filters](prototipos/capturas/servidores-phone-filters.png),
[phone person](prototipos/capturas/servidores-phone-person.png).

Widths below: desktop ≥ 1000px, tablet 560–1000px, phone < 560px (prototype
container widths; see [foundations.md](foundations.md#spacing-and-gutters-decided)).

## List screen anatomy

Every screen that lists people or items follows this order, top to bottom:

1. **Header** — desktop: breadcrumb (the scope) + the one primary action.
   Phone: navigation bar (back, compact title, filter icon).
2. **Hero** — title and a one-line summary with the key numbers. Phone:
   large title.
3. **Toolbar** — search, "Filtros" with active count, segmented view switch.
4. **Attention metrics** — 4 toggle cards with what needs action
   ("Sirviendo", "Por activar", "Sin cuenta", "Sin turno"). Pressing one
   filters the list; pressing it again clears it.
5. **Scope cards** — the next level of the tree (Direcciones → Áreas →
   Equipos). They choose WHERE; entering one updates the breadcrumb and
   every number on the screen. Hidden at the leaf level.
6. **List** — section heading, active filter chips, the rows, and a footer
   ("6 de 48 personas" · "Orden: persona A–Z").

| | Desktop | Tablet | Phone |
| --- | --- | --- | --- |
| Header | Breadcrumb + primary button | same, 28px gutters | Nav bar; primary action becomes the FAB |
| Hero | `h1` 30px + summary | same | Large title 34px + summary |
| Toolbar | Search, Filtros, segmented control in one wrapping row | same | Filled search only; Filtros moves to the nav bar icon, the view switch into the sheet |
| Metrics | 4 columns with bar and hint | 2×2 | 2×2 compact, no bar or hint, pressed = inset brand ring |
| Scope cards | Auto-fill grid (≥ 240px) with count, flags, etapa bar | same | Inset grouped list: name, responsible, count, chevron; warning flag only |
| List | Table-like rows with sortable headers | Two-line rows, no headers | Inset grouped rows with avatar, status dot, chevron |

Rules:

- Big cards choose WHERE, pills refine WHAT. Do not mix them in one control.
- All numbers on the screen (summary, metrics, cards, footer) follow the
  current scope and filters.
- Nothing scrolls horizontally except the chip row on phone.
- Grupos de Vida rows in Servidores are read-only: they open the drawer but
  without edit actions, with a note that they are managed from Grupos de Vida.

## Toolbar and filters sheet

- **Search**: `InputSistema` with a search icon, placeholder "Buscar por
  nombre o teléfono". Desktop shows the `/` shortcut (`kbd`); pressing `/`
  focuses it. Phone: filled (no border, `bg-foreground/8`), 40px, full width.
- **Filtros button**: outline button with the active-filter count badge
  (brand, mono). Opens the filters sheet.
- **Active chips**: one brand-tint chip per active filter with a 28px remove
  button (`aria-label="Quitar …"`), plus "Limpiar todo" when there are two or
  more. Phone: one scrollable row.
- **Filters sheet** (side panel on desktop, bottom sheet on phone):
  1. Etapa: single-choice pills with counts ("Todas 48", "Activo 31"…).
  2. Atención: independent toggle pills ("Sin cuenta", "Sin turno", "Por
     activar", "En varios equipos").
  3. Selects for long lists (Rol, Turno, Inicio): 3 columns desktop, 1 on
     phone.
  4. "Ordenar por" pills (second tap flips the direction, shown as ↑/↓).
  5. "Vista" pills (the segmented control's options, for phone).
  6. Footer: "Limpiar" (outline) + "Ver N personas" (primary, closes).
- Changes apply live; the footer count updates as filters change.

## Detail drawer

One drawer per item replaces per-row menus.

- Desktop and tablet: side panel from the right (prototype 440px; use
  `PanelLateralSistema` `md`), scrim behind, focus moves into it, `Escape`
  closes.
- Phone: bottom sheet up to 90% of the height, 26px top radius, grab handle,
  safe-area bottom padding.
- Content order:
  1. Identity: 56px avatar, name (`h3`, labels the dialog), secondary line,
     phone number in mono, close button.
  2. Quick actions: WhatsApp, Llamar, Editar ficha (66px stacked buttons).
     Disabled when not possible (no phone, invalid phone); hidden when the
     user lacks permission.
  3. Callouts for problems, each with its fix: "Revisar teléfono" (warning,
     "Corregir en la ficha"), "No tiene cuenta en la plataforma" ("Invitar a
     la plataforma").
  4. Per-item cards ("Dónde sirve"): team, path, status dot, key/value grid
     (Rol, Turno, Desde; 3 columns, 2 on phone), and actions ("Cambiar
     etapa", "Turnos", "Ver su equipo →").

## Empty and loading states

- **Loading**: keep the frame (header, toolbar, list header) and show 6
  skeleton rows at the row height. Route-level loading uses the App Router
  `loading.tsx` with the same frame built from `SkeletonSistema`.
- **Empty, no data**: title + one line pointing at the primary action
  ("Todavía no hay servidores acá" / "Usá «Asignar servicio» para sumar al
  primero.").
- **Empty, no match**: title + one line pointing at the filters ("Nadie
  coincide con estos filtros" / "Quitá alguno o usá «Limpiar todo».").
- Both render inside the list container, centered, muted. Use the one
  canonical empty state (planned; until then the area's existing one).
- Always handle loading, show errors visibly, and disable buttons during
  actions (`cargando`).

## Permission-gated actions

- The server decides permissions; the UI only hides what the user cannot do.
- Hide, do not disable, actions the user is not allowed to take (the
  primary header button, the FAB, "Editar ficha", "Cambiar etapa",
  "Turnos", "Invitar"). Disable only what is allowed but impossible right
  now (WhatsApp without a valid phone), and say why nearby.
- Read-only users see the same screen without the action buttons; the
  layout does not jump.
- Every action keeps its server-side check; hiding a button is not security.

## URL-synced filters

- Scope, search, every filter, sort and view live in the URL query, so a
  link reproduces the screen and Back undoes the last change.
- Keep legacy parameters working (Servidores: `?equipo=` and `?estado=`).
- Debounce search updates (400ms, as in server-side pagination).
- Proposed for Phase 1 (to confirm in the Servidores redesign): `replace`
  for typing and toggles, `push` for entering a scope level, so Back walks
  up the tree.

## Forms

Shared forms (`components/forms`: users, groups, seasons) use the whole page
width: their sections are cards on `SeccionesSistema` and their fields sit in
`CamposSistema` ([layout.md](layout.md#sections-and-fields-seccionessistema-campossistema)).
Pages render them straight in `PaginaSistema`, never inside another card.

- `SeccionFormulario`: a labelled section card (`TarjetaSistema` with an
  `<h2>`, optional icon chip and description, `role="region"`). Place it as
  a direct child of `SeccionesSistema`; its body is usually a
  `CamposSistema`. Forms with a single untitled section use a plain
  `TarjetaSistema`.
- Spanned (`col-span-full`): group names, textareas, the initial leader row,
  the location map and the location section itself.
- `AvisoFormulario`: inline notice; `error` uses the danger token and
  `role="alert"`, `info` the info token, `marca` the brand tint. Form-level
  notices go above or below the sections grid, not inside a field grid.
- Actions go in `PieAccionesSistema fijo={false}` after the grid (the mobile
  bottom bar would cover a sticky footer).
- Inputs: labelled, errors through `error` (ARIA is automatic), validate
  with react-hook-form + zod.

## Reports and attendance

Attendance reports (`components/asistencia`) share `FiltroFechasAsistencia`
(collapsible date filter), `TarjetaKpiAsistencia` (token-tinted icon chip,
label, value, optional link) and one percentage scale for bars and figures
(≥80 success, ≥60 warning, ≥40 brand, below danger). Their lists switch to
columns by container width (`@xl` / `@2xl`), so they never scroll sideways
at 360px. Tables that would scroll sideways at 360px render a card list
below `md`.

## Feedback: toasts and progress

- Toasts: `sonner`, rendered once in `app/layout.tsx` through
  `components/ui/sonner.tsx`. Always use `useNotificaciones()`
  (`hooks/use-notificaciones`), never `toast` directly.

```tsx
const toast = useNotificaciones()
toast.success('Datos guardados correctamente.')
toast.error(e?.message || 'No se pudieron guardar los cambios. Inténtalo de nuevo.')
```

- Route progress: `nextjs-toploader` in `app/layout.tsx` (brand color,
  3px, no spinner).
- Buttons: `cargando` + `disabled` while the mutation runs.

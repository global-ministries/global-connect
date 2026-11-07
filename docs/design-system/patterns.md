# Patterns

Recipes built from the [components](components.md). The reference is the
Servidores prototype v3 in [`prototipos/servidores/`](prototipos/servidores/):
[desktop](prototipos/servidores/01-escritorio.html),
[tablet](prototipos/servidores/02-tablet.html),
[phone](prototipos/servidores/03-celular.html). Screenshots:
[desktop](prototipos/capturas/servidores-v3-escritorio-claro.png),
[desktop dark](prototipos/capturas/servidores-v3-escritorio-oscuro.png),
[desktop filters](prototipos/capturas/servidores-v3-escritorio-filtros.png),
[tablet](prototipos/capturas/servidores-v3-tablet-claro.png),
[phone](prototipos/capturas/servidores-v3-celular-claro.png),
[phone dark](prototipos/capturas/servidores-v3-celular-oscuro.png),
[phone filters](prototipos/capturas/servidores-v3-celular-filtros.png).
[`prototipos/servidores.html`](prototipos/servidores.html) is the superseded v2.

Widths below: desktop `lg`+ (≥ 1024px), tablet `md`–`lg`, phone < `md` (768px)
(decided 2026-10-26; see [foundations.md](foundations.md#spacing-and-gutters-decided)).

New work follows the planning style (artboards in
[`prototipos/planificacion-dps/`](prototipos/planificacion-dps/)); its
recipes are at the end: [inline edit and autosave](#inline-edit-and-autosave),
[matrix assign](#matrix-assign), [spreadsheet keyboard](#spreadsheet-keyboard).
A people list keeps the anatomy below with the planning type, borders and
density.

## List screen anatomy

Every screen that lists people or items follows this order, top to bottom:

1. **Header** — desktop: breadcrumb (the scope) + the one primary action.
   Phone: navigation bar (back, compact title, filter icon).
2. **Hero** — title and a one-line summary with the key numbers. Phone:
   large title.
3. **Toolbar** — search, "Filtros" with active count, segmented view switch.
4. **Attention metrics** — 4 toggle cards with what needs action
   ("Sirviendo", "Por activar", "Sin cuenta", "Sin turno"). Pressing one
   filters the list; pressing it again clears it. Hints are short and say
   what to do: "Sin cuenta" reads "invitalos a la plataforma".
5. **Scope cards** — the next level of the tree (Direcciones → Áreas →
   Equipos). They choose WHERE; entering one updates the breadcrumb and
   every number on the screen. Hidden at the leaf level.
6. **List** — section heading, active filter chips, the rows, and a footer
   ("6 de 48 personas" · "Orden: persona A–Z").

| | Desktop | Tablet | Phone |
| --- | --- | --- | --- |
| Header | Breadcrumb + primary button (`tamaño="sm"`) | same, 28px gutters | Nav bar; primary action becomes the FAB |
| Hero | `h1` 24px + summary | same | Large title 28px + summary |
| Toolbar | Search, Filtros, segmented control in one wrapping row | same | Filled search only; Filtros moves to the nav bar icon, the view switch into the sheet |
| Metrics | 4 columns with bar and hint | 2×2 | 2×2 compact, no bar or hint, pressed = inset brand ring |
| Scope cards | Auto-fill grid (≥ 240px) with count, flags, etapa bar, single-line responsible | same | Inset grouped list: name, responsible, count, chevron; warning flag only |
| List (`ListaResponsiva`) | Table-like rows with sortable headers (`aria-sort`) | Same header grid and sortable headers; columns marked `ocultarEnTablet` (Turno) hide until `lg` | Inset grouped rows with avatar, status dot, chevron |

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
  canonical empty state (`EstadoVacioSistema`) and `SkeletonLista` for the
  loading rows.
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
- Create forms (no saved state to compare against): actions go in
  `PieAccionesSistema fijo={false}` after the grid.
- Edit forms with dirty state (Editar persona, prototype
  [`prototipos/usuarios/05-editar-escritorio.html`](prototipos/usuarios/05-editar-escritorio.html)
  and [`06-editar-celular.html`](prototipos/usuarios/06-editar-celular.html)):
  a **sticky save bar** that exists only while there are unsaved changes or a
  save runs. It is the selection bar's surface (`bg-card`, border,
  `rounded-2xl`, `shadow-sheet`), the last child of the form and
  `position: sticky` at the bottom, so it spans the content column. Phones:
  `bottom: calc(84px + env(safe-area-inset-bottom))`, above the tab bar
  (`MenuInferiorMovil`); from `md`: 24px from the bottom. Content: status
  ("N cambios sin guardar", "Revisa N campos" in `danger-text` after a
  failed attempt, "Guardando cambios…"), "Cancelar" (outline) and "Guardar
  cambios" (primary; "Guardar" on phones), both `tamaño="sm"`. Changed
  fields carry a 6px brand dot after the label (plus "(modificado)" for
  screen readers); Enter in a text field saves. Leaving with changes (any
  in-app link, the back button, Cancelar) asks "¿Descartar los cambios?"
  ("Seguir editando" | "Descartar", `peligro`), and `beforeunload` guards
  reloads. Code: `components/users/editar/` (`BarraGuardar`,
  `DialogoDescartar`, `useGuardaSalida`).
- Error summary: after a failed save attempt, an `AvisoFormulario`
  `error` above the sections ("Revisa N campos antes de guardar") with one
  link per field that moves the focus to it; the heading takes the focus.
  A server rule that belongs to a field (a duplicated cédula) is shown on
  that field and focuses it, not as a general error.
- Notices that must not block saving ("Revisar teléfono", an unrecognized
  cédula) sit under the field in `warning-text` with a `warning` border.
- Inputs: labelled, errors through `error` (ARIA is automatic), validate
  with react-hook-form + zod. Editar persona keeps its values in state with
  a pure validator (`lib/platform/usuarios/editar-validacion.ts`) that the
  server action (`updateUser`) shares, because it compares against the
  loaded values for the dirty state.

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
- Planning views announce each saved change in one polite live region
  ("Convocaste a Irene Saavedra para Pantallas.") instead of a toast.

## Inline edit and autosave

Planning style ([`02-plan-domingo-orden.html`](prototipos/planificacion-dps/02-plan-domingo-orden.html),
[`04-programacion-anual-hoja.html`](prototipos/planificacion-dps/04-programacion-anual-hoja.html)).
Edits happen where the value is shown and save on their own; there is no
"Guardar" button.

- Fields read as text (`CampoEnLinea`): the border shows on hover; focus
  shows the brand border and marks the row (`bg-brand-tint`).
- `Enter` or leaving the field saves; `Escape` restores the previous value.
  Saving an unchanged value does nothing.
- Invalid input keeps the focus, sets `aria-invalid` (danger border) and
  says the format in the live region ("Escribe la duración como
  minutos:segundos, por ejemplo 4:30.").
- Each save flips `EstadoGuardado` to "Guardando…" and back to "Guardado",
  and announces one sentence of what changed ("Duración de Hogar: 6:00.
  Horas recalculadas."). A failed save says so with "Reintentar" and keeps
  the typed value.
- Derived values recalculate at once (start times of both services from the
  durations; the summary "termina 10:35 y 12:35").
- After a re-render the focus returns to the same field or cell.
- Reorder: drag the row or, with the handle focused, `↑` / `↓`; announce
  "<elemento>: posición 2 de 3 en Banda" or "Ya está primero en Banda".
- Adding ("+ Elemento", "+ Encabezado") inserts the row and focuses its
  title with the text selected.
- Destructive or bulk changes ("Copiar del domingo anterior") still confirm
  in a dialog whose text says what stays untouched.
- Edit forms with many fields keep the save bar ([forms](#forms)); autosave
  is for per-cell and per-item edits in planning views.

## Matrix assign

Planning style ([`03-matriz-domingos.html`](prototipos/planificacion-dps/03-matriz-domingos.html);
the team columns of
[`01-plan-domingo-equipos.html`](prototipos/planificacion-dps/01-plan-domingo-equipos.html)
use the same popover).

- The matrix is a `role="grid"` with `aria-rowcount` / `aria-colindex` and
  one roving `tabindex="0"` cell. Arrows move, `Home` / `End` go to the
  first / last date; filtered-out rows are skipped.
- Click, `Enter` or `F2` opens `PopoverAsignar` on the cell (the cell gets
  `aria-selected` and an inset brand ring). Focus goes to the search; the
  popover lists who is already there (highlight, remove) and candidates
  with a context line, the conflict first in `warning-text` ("Ya sirve ese
  día en Monitores"). Picking or removing saves, keeps the popover open on
  the updated cell and announces the change.
- `Escape` or a click outside closes it and returns focus to the cell. A
  cell that does not apply announces why ("Pantallas no se convoca para
  Cena del Señor.") instead of opening.
- Unfilled positions show "Falta N" in the cell; team rows sum them
  ("2 faltan"); the header summary counts "N puestos sin cubrir".
- Highlight a person from the popover's target button: their chips light up
  in every date and the toolbar chip says "3 de 8 domingos", to see one
  person's load. One person at a time; clearing it is one button.
- Toolbar: team select ("Todos los equipos"), density toggle ("Condensado
  | Normal"), the highlight chip, `EstadoGuardado`; period with "‹ Hoy ›" in
  the header. A footer line lists the keys.
- Date headers link to that date's plan; the next date carries "Próximo".

## Spreadsheet keyboard

Planning style ([`04-programacion-anual-hoja.html`](prototipos/planificacion-dps/04-programacion-anual-hoja.html)).
For data people keep in Excel today; behaves like Excel.

| Key | Not editing | Editing |
| --- | --- | --- |
| Arrows | Move one cell | Move the caret |
| `Tab` / `Shift+Tab` | Next / previous cell, wrapping to the next row | Save and move right / left |
| `Enter` / `F2` / double click | Edit, text selected | `Enter`: save and move down |
| Any character | Replace the cell with it and keep typing | — |
| `Delete` / `Backspace` | Clear the cell (saves) | — |
| `Escape` | — | Cancel, keep the old value |
| Click elsewhere | Select that cell | Save first |

- The edited cell keeps its size (input fills it, brand outline) so the
  grid never jumps.
- Each input is named "<columna>, <fecha>" ("Opener, 15 de noviembre").
- Filters (year, month) and the column picker never lose the focused cell
  if it is still visible; the month filter announces "Mostrando octubre: 4
  domingos.".
- Long text truncates with an ellipsis and is read in full in `title` or
  while editing.
- Rows that are not editable (special days, free Sundays) are full-width
  hatched rows and are skipped by the keyboard.
- Creating many rows at once ("Nueva serie": name, first Sunday, weeks)
  goes through a dialog whose button says the result ("Crear 4 domingos").

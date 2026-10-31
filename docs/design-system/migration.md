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
| Servidores (pilot) | `app/(auth)/admin/dream-team/servidores`, `components/dream-team/servidores` | yes | yes | yes | First v2 screen (T6; reference: prototype v3 in [`prototipos/servidores/`](prototipos/servidores/); parity checklist `odd/tasks/sistema-diseno-v2.md` L3): breadcrumbs and phone back by tree level, attention metrics as filters (Sirviendo, Por activar, Sin cuenta, Sin turno; `?por_activar=1` is new, "Sin turno" is `?turno=sin_turno`), `HojaFiltros`, `ListaResponsiva` (Por persona / Por servicio), one detail drawer instead of the row menu, `EstadoVacioSistema` and `SkeletonLista`. "Agrupar por equipo" is removed; old `?agrupar=equipo` links open "Por persona". The URL uses `replace` for every change (no `push` per level yet: the island keeps its filters in local state, so Back would not re-read them). Left for Mi equipo's migration: `menu-servidor.tsx` (its permission rule `accionesDeServicio` now feeds the drawer; only tests render the menu). `tabla-servidores.tsx` and `telefono-servidor.tsx` were removed once Mi equipo v2 stopped using them (T7c). The scope cards are `TarjetasFiltro presentacion="alcance"` with flags, the etapa bar and the one-line responsible (`subtituloCorto`, decision 5 of [2026-10-28](#decisions-2026-10-28)). Aligned with prototype v3 and the app shell (#609): hero `h1` 24px/650; "Asignar servicio" `tamaño="sm"` with a 48px hit area; the root crumb reads "Todas las direcciones". On phones the shell header holds the `h1` ("Servidores") and the bell and has no back slot, so the screen has no `BarraNavegacionMovil`: a content row carries "‹ parent" (`BotonAtrasMovil`) and Filtros, and `TituloGrande nivel={2}` names the level below the root (at the root only the summary shows). The "Sin cuenta" hint stays "invitalos a la plataforma" (user correction 2026-10-28). |
| Mi equipo | `app/(auth)/dream-team/mi-equipo`, `components/dream-team/mi-equipo` | yes | yes | yes | Second v2 screen (T7a; prototype [`prototipos/mi-equipo/`](prototipos/mi-equipo/), S11 of `odd/tasks/sistema-diseno-v2.md`), same anatomy as Servidores: breadcrumbs "Dream Team / Mi equipo / <dirección> / …" and phone "‹ padre" by tree level (no "Toda la dirección" / "Volver a" cards), hero `h1` 24px with the Dirección selector, attention metrics as filters ("Por activar" replaces the pending strip), scope cards (`TarjetasFiltro presentacion="alcance"`), `BarraHerramientas` (search by name or phone), `HojaFiltros` (Etapa, Atención, Edad, Turno, Vista), `ListaResponsiva` (Por persona / Por servicio), one person panel (the shared `components/dream-team/detalle-persona.tsx`) instead of the per-servicio menu, and the TLR Calendario as a "Personas \| Calendario" tab (`TabsSistema`). Who may do what: `rolMiEquipo` / `accionesPersonaMiEquipo` in `lib/platform/dream-team/mi-equipo-filtros.ts` (the coordinador does not change the etapa). URL: `?direccion`, `?nivel`, the filters, `?vista`, `?tab`, all with `replace`. Removed: `franja-pendientes`, `menu-persona`, `tarjetas-equipos`, `lista-personas`, `encabezado`. `TabsSistema` (and the Niños link tabs in `components/ninos/pestanas-sistema.ts`) now has the `ControlSegmentado` look: card surface, inverted active tab, no orange or blur (T7c). |
| Estructura | `app/(auth)/admin/dream-team/estructura`, `components/dream-team/estructura` | yes | yes | yes | Third v2 screen (T7b; prototype direction B "Organigrama visual", [`prototipos/estructura/`](prototipos/estructura/) `07-b-escritorio` and `08-b-celular`, S12 of `odd/tasks/sistema-diseno-v2.md`). Breadcrumbs "Dream Team / Estructura", hero `h1` 24px with "N direcciones · N equipos activos · N personas sirviendo", tabs "Equipos \| Turnos del campus" (`TabsSistema`, `?tab=turnos`). Equipos from md: a connected box diagram left to right (campus box first; `disposicion-diagrama.ts` lays it out, one SVG path for the connectors), each box a button (avatar, name, responsable, people in mono, health dots, `aria-current` when open) with a round toggle ("−" / "+n", a dot when a folded branch hides a problem, `aria-expanded`); zoom 80–120 % that fits on load, pan by dragging or with the arrow keys on the focusable canvas, "Ajustar", "Expandir todo", "Contraer" and a legend. Below md: the vertical indented chart with connectors. The search ("/") and the problem pills (`PastillaFiltro tono`, counts from the view model) highlight and never hide. A box opens the node panel (`PanelNodo`: `DetalleResponsivo ancho="estructura"`, 560px; bottom sheet on phones). Phone FAB "Agregar subequipo" (the open node, or a picker of editable teams); on the shifts tab the primary action is "Agregar turno" (header and FAB) in a sheet. Turnos del campus: Semanales and Por fechas cards, "Desactivados (n)", an `Interruptor` per shift. URL: `?equipo` (legacy link; opens the panel), `?q`, `?problema`, `?tab`, `?expandidos`; only `?equipo` goes through the router (the server sends that node's shifts), the rest is `history.replaceState`. Without `?equipo` no panel opens (no default team anymore). "Sin turno" reads every `dream_team_equipo_turnos` row the viewer can see (one query). Removed: `detalle-equipo`, `lista-subequipos`, `roles-equipo`, `turnos-equipo`, `organigrama-movil`, `panel-arbol`, `tarjetas-resumen`, `use-panel-abierto` and the local `EstadoVacio` usage (now `EstadoVacioSistema`). Left unused in `lib/platform/dream-team/estructura-vista.ts`: `arbolVisible`, `inactivas`, `ancestrosDe`, `equipoPorDefecto` (still tested; drop in a cleanup). |
| Estudiantes | `app/(auth)/estudiantes`, `components/estudiantes` | yes | yes | yes | New area, built on v2 from the start (C2 of `odd/tasks/estudiantes-fase-b.md`; artboards 06 / 07 / 08 of `design/estudiantes-asistencia/`). `/estudiantes/grupos`: breadcrumbs "Estudiantes / <ámbito> / <sub-área>" and phone "‹ parent" (a fixed level, e.g. the directora de grupo's sub-área, is plain text), hero, `BarraHerramientas` (group, leader or student name), `MetricasAtencion` as filters (Por confirmar, Grupos sin líder, Desactivados; "Asistencia baja" and the Sunday column wait for C3), scope cards (`TarjetasFiltro presentacion="alcance"`: ámbitos, then sub-áreas), `HojaFiltros` (Año escolar, Ordenar por), `ListaResponsiva`, one group drawer (`DetalleResponsivo`) with in-drawer views, "Crear grupo" in the header and as `BotonFlotante`, the create / edit form as a `DetalleResponsivo`. URL: `?ambito&area&metrica&anio&orden&q` with `replace`. Gaps G6–G9 are composed locally (`components/estudiantes/filas-inset.tsx`, see [components.md](components.md#planned-components)). `?grupo=<id>` opens that group's drawer (the "‹ Grupos" of its leader list); the drawer has "Ver la lista" and an enabled "Registrar nuevo" (the visitor form, as visitante of the group's newest meeting). Leader list `/estudiantes/grupos/[grupoId]` (C3b; artboards 01 / 02 / 05): breadcrumbs "Estudiantes / <ámbito> / <grupo>" (the ámbito crumb links to the origin) and phone "‹ Grupos" / "‹ En vivo" / "‹ Estudiantes" from `?desde=grupos|vivo` (none for a leader whose only group it is), hero with the meeting line and the counts (`aria-live`), the entrenador's "Grupo que estás marcando" (`SelectSistema`) and `AvisoFormulario marca`, The Living Room's "Reunión del grupo" pills (this week and the two before, "Cada jueves"), "Otra fecha" and "Lugar (opcional)", search, `GrupoPastillas` Todos / Sin marcar / Presentes / Ausentes / Visitantes, the 3rd-visit suggestion, `ListaResponsiva` sections Integrantes / Visitantes (Nombre, Estado `PuntoEstado`, Año / Edad, Historial dots `ocultarEnTablet`, Marcar) with the ✓ / ✕ pair (G1, `components/estudiantes/lista/marca-asistencia.tsx`) that saves on tap with rollback, the row detail (`DetalleResponsivo`: WhatsApp / Llamar, Hoy, Representante, Datos), and "Agregar visitante" (header button, `BotonFlotante` on phones) opening the search-then-form sheet (G3, `components/estudiantes/visitante/`). URL: `?fecha&turno` (the meeting; newest by default) with `replace`. `/estudiantes`: "Mi grupo" entry; a leader with one group is sent to it, anyone else gets `ListaResponsiva` of their groups and managers "Gestionar grupos". Not in the menu yet (C4 adds the Estudiantes tab and the `/estudiantes/vivo` target of "‹ En vivo"), and `components/ui/header-movil.tsx` has no title for these routes, so the phone header shows the fallback until C4. |
| Grupos de Vida | `app/(auth)/grupos-vida`, `components/grupos`, `components/grupos-vida` | yes | yes | pending | `components/ui/FiltrosGrupos` brings its own `p-6`; the filter panel cancels the panel body padding around it. Drop that padding when it migrates. Another agent is active on `feat/grupos-filtros`. |
| Niños | `app/(auth)/ninos`, `app/ninos`, `components/ninos` | no | no | pending | Still on `ContenedorDashboard` (10 pages); `components/ninos/panel-lateral.tsx` uses raw `Sheet`; `checkin-client.tsx` uses `glass-panel`; own `EstadoVacio`. Other agents are active (`ninos-cobertura`, `ninos-vinculos`). |
| Tickets / Ayuda | `app/(auth)/ayuda` (`tickets`, `reportar`, `admin`) | yes | no | pending | Migrated, imports no legacy UI; add to the lint list. Support queue at `default` width. |
| Talleres | `app/(auth)/talleres`, `components/talleres` | yes | no | pending | Every page uses `PaginaSistema` (Crear Temporada and the certificate at `form` width); icon-only actions are `BotonSistema soloIcono`; destructive confirms use `variante="peligro"`. Add to the lint list. `app/(auth)/admin/talleres` belongs to the admin area. |
| Usuarios | `app/(auth)/users`, `components/users`, `components/ui/filtros-usuarios.tsx` | yes | list + ficha (edit page pending) | yes (list T8-2, ficha T8-3) | List `/users` on v2 (T8-2; prototype [`prototipos/usuarios/`](prototipos/usuarios/) `01-lista-escritorio` and `02-lista-celular`, S13 of `odd/tasks/sistema-diseno-v2.md`): crumb "Usuarios" + "Agregar persona" (`tamaño="sm"`; admin, pastor, director general, director de etapa, as the old "Agregar Miembro") and the FAB; hero `h1` 24px with "N personas · <ámbito> · N con teléfono · N con email" (a leader reads "de tus grupos"); search confirmed with Enter (name, phone, email, cédula; "Enter para buscar" while the draft differs), Filtros and "Seleccionar" (admin) in `BarraHerramientas`; Vínculos pendientes as a brand notice + "Revisar" panel (approve / reject as before); `MetricasAtencion` as filters (Nuevos 7 días, Sin grupo, Sin cuenta with "N con invitación enviada", Sin teléfono; they count the whole scope, only the campus narrows them); `HojaFiltrosUsuarios` (Rol several, Teléfono, Email, Grupo de Vida, Cuenta, Nuevos, Ordenar por; "Seleccionar personas" on phones); chips + "Limpiar todo"; `ListaResponsiva` (Persona with cédula and Nuevo / Revisar teléfono, Contacto and Campus from lg, neutral Rol, Grupo de Vida, "Cuenta · registro"); pagination 20/50/100. A row opens the person panel (`DetalleResponsivo`: WhatsApp / Llamar by `lib/platform/usuarios/contacto.ts` (decision 6: a leader for their own group), Email, Editar by `puede_editar_usuario`, callouts, "Asistencia", "Ver ficha completa"); in "Seleccionar" mode it marks the person, and "Cambiar rol" asks first. "Agregar persona" opens `UserCreateForm` in a panel; `/users/create` keeps working. Data: `components/users/lista/use-lista-usuarios.ts` on the v2 RPCs; `hooks/use-usuarios-con-permisos.ts` has no screen left. URL: `?q&roles&email&tel&grupo&cuenta&nuevos&orden&pagina&persona` with `replace`; the page size is local. Removed: the "+12.5%" KPI tiles, the fixed "Activo" badge, the unwired "Estado del usuario" filter, row checkboxes outside the mode. Ficha `/users/[id]` (T8-3; prototype `03-ficha-escritorio` and `04-ficha-celular`): server page, tabs Datos · Familia · Grupos · Asistencia · Servicio · Cuenta synced with `?tab=`; Asistencia covers Grupos de Vida, Estudiantes and Talleres (`obtener_asistencia_persona`); `/users/[id]/asistencia` redirects to the tab. Lint: list and ficha paths; the edit page (legacy `UserEditForm`) joins with the forms. Removed with no importer left: `components/users/UserList.tsx`, `hooks/use-usuarios-con-permisos.ts`. `UserEditForm` and `UserCreateForm` live outside the area and migrate with the forms. Pending cleanup: `components/asistencia/ReporteAsistenciaUsuario.client.tsx` has no screen left (the `/users/[id]/asistencia` redirect to the Asistencia tab replaced it; only its own test imports it), so it can be removed with that test. |
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
| App chrome | `components/ui/{sidebar-moderna,desktop-header,header-movil,menu-inferior-movil}.tsx`, `components/navegacion` | yes | — | next (Phase 2b) | App shell (sidebar, desktop header, phone header, tab bar, Más sheet): next (Phase 2b). Uses `--glass-*` tokens and `glass-panel-elevated` (drawer, popovers). `BarraNavegacionMovil` + `TituloGrande` exist (Phase 1); screens opt in, the chrome is unchanged. |

## Phase 1 — base components

Branch `feat/ds-fase-1` (2026-10-26). The pieces exist and are tested;
screens adopt them from Phase 2 (Servidores, T6) on. No screen changed
behavior; the looks changed on purpose (P1a).

| Part | Pieces | Status |
| --- | --- | --- |
| P1a foundations | `--shadow-sheet`, `--shadow-fab`; flat `TarjetaSistema` (`default`/`elevated` on the card surface); flat `primario`; `PastillasFiltro` and `TarjetasFiltro` on `bg-brand-tint` | done |
| P1b feedback | `PuntoEstado`, `MetricasAtencion`, `ControlSegmentado`, `EstadoVacioSistema`, `SkeletonLista` | done |
| P1c overlays and phone nav | `HojaInferior`, `DetalleResponsivo`, `NavegacionMovilProvider`, `BarraNavegacionMovil`, `TituloGrande` | done |
| P1d lists and toolbar | `BarraHerramientas`, `BotonFiltrosMovil`, `ChipsFiltrosActivos`, `HojaFiltros`, `GrupoFiltro`, `SelectsFiltro`, `ListaResponsiva` | done; `MigasPan` not built (see [components.md](components.md#planned-components)) |
| Gallery | `/design-system` (`app/(auth)/design-system/page.tsx`, `components/ui/galeria-sistema.tsx`) | done; 404 in production, login required on previews |

`ConfirmationModal` moved to the `peligro` variant (every caller is
destructive; the old gradient hid its forced red).

Fixed from the gallery review: pressed metrics on phone get the 1.5px inset
brand ring (they have no border there); the sort arrow in `ListaResponsiva`
headers had no space before it (a flex box drops the text space).

Open from Phase 1:

- `SkeletonLista` pulses; the prototype's gradient shimmer needs a `shimmer`
  keyframe in `app/globals.css`.
- `HeaderMovil` renders the route title as an `h1`; once a screen adopts
  `TituloGrande` (also an `h1`) the phone has two. Hide the header title or
  demote it on screens with a large title.
- `HojaInferior` hides the `ui/drawer` built-in handle with
  `[&>div:first-child]:hidden!`, which couples it to the drawer's markup.
  Give the drawer a prop or a `data-slot` for its handle instead.
- `BotonSistema` `secundario` and `peligro` keep `shadow-lg` while
  `primario` and the cards are flat.
- In dark mode the phone list card (`bg-card` on `--surface-primary`, no
  border below `md`) barely separates from the page.

## Open follow-ups

From the audit of the Servidores prototype v3 (2026-10-28):

- f1 — White on `--brand-primary` is 3.17:1 (primary button, FAB, count
  badges). Resolved by `--brand-strong` (decision 1 of
  [2026-10-28](#decisions-2026-10-28)); pending in `app/globals.css`
  (Phase 2a).
- f2 — The phone inset grouped background (`--bg-grouped` in the
  prototype) has no token. Add a grouped background token for phone.
- f3 — "Inactivo" uses a faint muted tone that has no token and no
  `PuntoEstado` `tono`. Add a faint/muted tone (its label still follows the
  12–13px contrast rule in [foundations.md](foundations.md#typography-decided)).
- f4 — `BotonFlotante` uses an orange gradient + `shadow-xl`; move it to
  `bg-brand-strong` + `shadow-fab`.
- f5 — `SelectsFiltro` switches columns at the `md` viewport breakpoint;
  inside a 480px side panel it should use `@container` queries.
- f6 — The tint comment in `app/globals.css` says 15%, while the tokens
  are 10% light / 13% dark. Also `--success-text` on a 15% success tint in
  light is 4.45:1 (below 4.5). Align the comment with the tokens and keep
  status tags off 15% tints until `--success-text` is checked there.
- f7 — `styles/globals.css` is an older shadcn token set that nothing
  imports. Remove it.
- f8 — `InputSistema` and `SelectSistema` errors use `text-red-500`; move
  them to `text-danger-text`.
- f9 — [`servidores-phone-person.png`](prototipos/capturas/servidores-phone-person.png)
  is stale (v2). The v3 screenshots are `servidores-v3-*.png`.
- App shell (sidebar, desktop header, phone header, tab bar, Más sheet):
  next (Phase 2b).

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
- `BadgeSistema` uses raw palette colors and the `error` name; map to the
  status tokens.
- Remove `@deprecated` components once they have no consumers.
- The old roadmap's `TablaSistema` (sorting and pagination built in) is now
  `ListaResponsiva` ([components.md](components.md#lists-and-toolbar));
  pagination is not built.

Resolved since the v1 docs (kept here so nobody re-opens them):
`BotonSistema` has a `peligro` variant; `BotonSistema` has a link form
(`asChild`) and no `Link` + `tabIndex={-1}` wrappers are left; a readable
warning text token exists (`--warning-text`) and Grupos de Vida no longer
uses `amber-700` / `yellow-700` text; Talleres confirms use `peligro`; the
Dream Team pages render `PaginaSistema` (no `ContenedorDashboard` islands);
`coloresMarca` points at the CSS variables; `TarjetaSistema`
`default`/`elevated` are on the card surface (Phase 1).

## Decisions (2026-10-28)

The user approved the corrected Servidores prototype (v3,
[`prototipos/servidores/`](prototipos/servidores/)) and the order: (1) port
it to these docs, (2) the app shell, (3) Servidores. Binding, same rule as
below.

1. **Brand contrast**: "Naranja un poco más oscuro". New tokens
   `--brand-strong` (#BE5413, white text 4.70:1) and `--brand-strong-hover`
   (#B04E11, 5.32:1), same in light and dark, for filled brand surfaces
   that carry text or icons (primary button, FAB, count badges).
   `--brand-primary` (#E96C20) stays for logo, focus, borders, tints and
   decoration; brand text uses `--brand-text`. Pending in
   `app/globals.css` (Phase 2a). See
   [foundations.md](foundations.md#brand-color-decided).
2. **Type scale**: phone large title 28px bold (was 34px); desktop and
   tablet hero `h1` 24px, weight 650, tracking `-0.02em` (was 30px).
3. **Small text contrast**: 12–13px text uses `--muted-foreground` or
   darker, never a fainter token; tags use the status `-text` tokens.
4. **Header action**: the desktop header primary action is `tamaño="sm"`
   (36px visual, ≥ 44px hit area).
5. **Scope cards**: the responsible line is single-line (first name + first
   surname, ellipsis; full name in `title` and `sr-only`).
6. **Phone tab bar**: labels fit at 390px without truncation (short labels,
   e.g. "Equipo").
7. **Copy**: the "Sin cuenta" metric hint reads "invitalos a la plataforma" (the 2026-10-28 "por invitar" change was reverted by the user).
8. **Source of truth**: `docs/design-system/` is the single source of
   truth; `design/system.md` is a derived snapshot. The current visual
   reference is [`prototipos/servidores/`](prototipos/servidores/) (3
   artboards); [`prototipos/servidores.html`](prototipos/servidores.html)
   is the superseded v2.

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

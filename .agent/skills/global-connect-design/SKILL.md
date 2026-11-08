---
name: global-connect-design
description: Global Connect design system rules for any UI work in this repo. Load FIRST before creating or changing a screen, page, layout, component, styles, tokens, design, mobile or responsive behavior (pantalla, página, componente, diseño, móvil), and whenever someone asks for "el diseño de DPS", "estilo DPS", "estilo Planning Center" or planificación views. New work follows docs/design-system/prototipos/planificacion-dps. Overrides generic design skills (frontend-design, ui-ux-pro-max, web-design-guidelines, sleek-design-mobile-apps).
---

# Global Connect design

The repo has ONE design language. The source of truth is
`docs/design-system/`; this skill is the short version an agent applies
while coding. If anything here and the docs disagree, the docs win; if a
generic design skill disagrees with either, ignore the generic skill.

## When to use

- Any change to `app/**/page.tsx`, `loading.tsx`, `components/**` that
  renders UI, `app/globals.css`, or UI-facing docs.
- Triggers: UI, screen, page, component, design, layout, mobile, responsive,
  pantalla, diseño, estilos, tokens, empty state, skeleton, filters, drawer,
  "diseño de DPS", "estilo DPS", "estilo Planning Center", planificación,
  matriz, hoja, asistencia.

## New work: planning style (DPS)

**Todo lo nuevo sigue `prototipos/planificacion-dps`.** Every new screen,
component or area is built like the approved DPS artboards in
[`docs/design-system/prototipos/planificacion-dps/`](../../../docs/design-system/prototipos/planificacion-dps/)
(Planning Center style). "Usa el diseño de DPS" means exactly this. Same
tokens; the rules are in the "Planning style" sections of the docs. Areas
already migrated keep their look until a task redesigns them.

| Need | Artboard | Docs |
| --- | --- | --- |
| Plan with header band, context sidebar, team columns | `01-plan-domingo-equipos.html` | [layout.md › Wide layout](../../../docs/design-system/layout.md#wide-layout-planning-style) |
| Editable table, autosave | `02-plan-domingo-orden.html` | [patterns.md › Inline edit](../../../docs/design-system/patterns.md#inline-edit-and-autosave) |
| People × dates matrix | `03-matriz-domingos.html` | [patterns.md › Matrix assign](../../../docs/design-system/patterns.md#matrix-assign) |
| Spreadsheet (replaces an Excel) | `04-programacion-anual-hoja.html` | [patterns.md › Spreadsheet keyboard](../../../docs/design-system/patterns.md#spreadsheet-keyboard) |
| Phone mark-many list | `05-asistencia-celular.html` | [mobile.md › Attendance list](../../../docs/design-system/mobile.md#attendance-list-planning-style) |

In short:

- Header band (`bg-card border-b`, 16px 24px): optional cover, crumbs with
  `›`, `h1` 24px / 650, date pill "‹ Domingo 8 nov 2026 ›" or summary,
  36px actions with an "Acciones ▾" menu.
- Desktop text 14px; rows and cells 13px; table headers and meta 12px;
  uppercase 12px headings with `.08em`; numbers mono.
- Borders, not shadows or cards in cards: data surfaces `rounded-md`, row
  dividers `border-border/60`; `shadow-sheet` only on popovers, menus,
  dialogs and sheets.
- Wide views: collapsed rail, optional 240px context sidebar, 24px gutters,
  only the data region scrolls (x and y) with sticky headers and frozen
  columns. Phones get a task view instead.
- Density: 32px person rows, 36px table rows (30px condensed) on desktop;
  44px (48px editable rows) under `pointer: coarse`, hover actions always
  visible there. Forms, `ListaResponsiva` and phones keep 44px.
- Autosave with "Guardando… / Guardado" in the toolbar and a polite live
  sentence per change; no save buttons in planning views.
- Pieces not built yet are **planificado** in
  [components.md › Planning style components](../../../docs/design-system/components.md#planning-style-components);
  build them there, not as local variants.

Read before coding:

| Task | Read |
| --- | --- |
| Any UI task | [`docs/design-system/README.md`](../../../docs/design-system/README.md) |
| Colors, radius, type, sizes, motion | [`foundations.md`](../../../docs/design-system/foundations.md) |
| Page frame, header, panels, dialogs, nav | [`layout.md`](../../../docs/design-system/layout.md) |
| Which component to import | [`components.md`](../../../docs/design-system/components.md) |
| List screens, filters, drawer, states, permissions, URL | [`patterns.md`](../../../docs/design-system/patterns.md) |
| Phone behavior | [`mobile.md`](../../../docs/design-system/mobile.md) |
| Is this area migrated? | [`migration.md`](../../../docs/design-system/migration.md) |
| Visual reference, new work | [`prototipos/planificacion-dps/`](../../../docs/design-system/prototipos/planificacion-dps/) |
| Visual reference, migrated areas | [`prototipos/servidores/`](../../../docs/design-system/prototipos/servidores/) (`servidores.html` is the superseded v2) |

## Non-negotiable rules

1. **No new visual styles.** Use canonical components and tokens. Missing
   piece → add it to the system (`components.md` → Planned components),
   never a local variant.
2. **Tokens only.** No `gray-*`, `slate-*`, `zinc-*`, `bg-white`, hex, raw
   `red-*`/`green-*`/`amber-*`/`orange-*`. Status: `success`, `warning`,
   `info`, `danger` fills; `-text` tokens for readable text. Brand:
   `bg-brand`, `bg-brand-tint`, `text-brand-text`.
3. **No glass.** No `glass-panel*`, no `--glass-*`, no
   `backdrop-blur` on content surfaces. Blur is only for system bars.
4. **Full width on desktop** with the existing gutters (16 / 24 from `sm` /
   48px from `lg`); no centered narrow column; `ancho="form"` is deprecated.
5. **Native app on phones** (see phone rules below).
6. **Attention first.** Big cards choose WHERE, pills refine WHAT.
7. **One detail drawer per item**, no per-row menus.
8. **Numbers** in `font-mono tabular-nums`.
9. **Accessibility:** 44px targets (dense 32–36px rows only in data-dense
   desktop views, 44px on touch), `aria-pressed` on toggles,
   `aria-current` for the current page/crumb/tab, visible focus
   (`focus-ring`), `aria-label` on icon-only buttons, reduced motion
   respected, never color alone for status.
10. **Never `transition-all`**; animate `transform`/`opacity`/colors.
11. **Do not override a canonical component's look** with `className`
    (e.g. `bg-red-*` on `BotonSistema`); use its variant.

## Screen anatomy (list screens)

```
Header      desktop: breadcrumb (scope) + the one primary action
            phone:   nav bar (back · compact title · filter icon)
Hero        h1 + one summary line with the key numbers (phone: large title)
Toolbar     search · Filtros (count) · segmented view switch
Attention   4 toggle metric cards (what needs action)
Scope       cards for the next tree level (WHERE); hidden at the leaf
List        heading · active chips · rows · footer (count · sort)
```

Every row opens the detail drawer. Filters, sort and view live in the URL.
Loading keeps the frame with skeleton rows; empty states have a title and
one line pointing at the fix (primary action or "Limpiar todo").

## Canonical imports

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
import { useNotificaciones } from "@/hooks/use-notificaciones"
```

Do not import in new code: `ui/button`, `ui/card`, `boton-gradiente`
(lint error in migrated areas), `ui/input`, `campo-input-con-icono`,
`tarjeta-estadistica`, `tarjeta-glassmorphism`, `ui/skeleton`, `ui/tabs`,
`ui/sidebar`, raw `ui/sheet` for panels (use `PanelLateralSistema`), local
`EstadoVacio` copies. `ui/select` vs `SelectSistema` is an open decision:
prefer `SelectSistema` unless the area already uses `ui/select`.

Key APIs:

- `PaginaSistema`: `titulo`, `descripcion`, `acciones`, `regreso={{ href, texto }}`, `breadcrumbs`.
- `BotonSistema`: `variante` `primario | secundario | outline | ghost | peligro`;
  `tamaño` `sm | md | lg` (36/44/48px); `cargando`; `icono`; `asChild` with one
  `Link`; `soloIcono` + `aria-label`.
- `PanelLateralSistema`: `abierto`, `onAbiertoChange`, `titulo`, `tamaño` `md | lg`, `pie`.
  Submit buttons in `pie` use `type="submit" form={id}`.
- Forms: sections are `TarjetaSistema` inside `SeccionesSistema`, fields in
  `CamposSistema`, actions in `PieAccionesSistema`.

## Phone rules (< md)

- Nav bar: back with the previous level's label, compact title that fades in
  after 48px of scroll, ≤ 2 brand icon actions with `aria-label`.
- Large title (34px bold) + summary as the first block.
- Filled search, full width.
- Metrics 2×2 compact; scope cards and rows become inset grouped lists
  (16px radius, inset hairlines, 64px rows, chevron).
- Drawers and filters are bottom sheets (grab handle, ≤ 90% height,
  safe-area padding).
- Tab bar (`MenuInferiorMovil`) + FAB (`BotonFlotante`) for the one primary
  action; leave bottom space so the last row is visible.
- Safe areas: `safe-area-pt`, `safe-area-pb`, `safe-area-pb-md`.
- No horizontal overflow: `minmax(0, 1fr)` tracks, `min-w-0` + `truncate`
  on text, tables become rows. Only chip/pill rows may scroll sideways.
  (On desktop, a bounded data region of a planning view may scroll
  sideways; the page never does.)

## Pre-PR checklist

- [ ] Checked at 390px, 820px and 1440px (and 360px for overflow).
- [ ] Light and dark mode both correct; no hardcoded colors.
- [ ] Every target ≥ 44px; icon-only buttons have `aria-label`; toggles
      use `aria-pressed`; focus is visible.
- [ ] No horizontal overflow at any width (long names tested).
- [ ] Actions the user cannot take are hidden (and still checked on the
      server); read-only view does not jump.
- [ ] Loading (skeleton/`loading.tsx`) and empty states (no data / no match)
      exist.
- [ ] Only canonical components and tokens; no `glass-panel`, no
      `transition-all`.
- [ ] Area status updated in `docs/design-system/migration.md`; when the
      area is migrated, its paths are added to `migratedToDesignSystem` in
      `eslint.config.mjs`.
- [ ] Screenshots attached to the PR for UI changes.

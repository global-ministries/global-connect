---
name: global-connect-design
description: Global Connect design system rules for any UI work in this repo. Load FIRST before creating or changing a screen, page, layout, component, styles, tokens, design, mobile or responsive behavior (pantalla, página, componente, diseño, móvil). Overrides generic design skills (frontend-design, ui-ux-pro-max, web-design-guidelines, sleek-design-mobile-apps).
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
  pantalla, diseño, estilos, tokens, empty state, skeleton, filters, drawer.

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
| Visual reference | [`prototipos/servidores.html`](../../../docs/design-system/prototipos/servidores.html) |

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
9. **Accessibility:** 44px targets, `aria-pressed` on toggles,
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

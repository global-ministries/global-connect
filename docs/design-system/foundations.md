# Foundations

Tokens every screen uses. Values live in
[`app/globals.css`](../../app/globals.css) (light in `:root`, dark in
`.dark`) and reach Tailwind 4 through `@theme inline`. Never hardcode a color,
radius or font that a token covers.

Status labels in this file: **decided** (use it), **legacy** (do not use in
new code; replacement given), **planned** (not in code yet; Phase 1 adds it),
**decided** (accepted by the user, see [migration.md](migration.md#decisions-2026-10-26)),
**decided, pending** (accepted by the user, not in `app/globals.css` or the
components yet; see [migration.md](migration.md#decisions-2026-10-28)).

## Color: surfaces and text

Use the semantic classes; they follow light and dark mode.

| Class | Token | Use |
| --- | --- | --- |
| `bg-background` | `--background` | Page background |
| `bg-[var(--surface-primary)]` | `--surface-primary` | App content area (set by `ContenedorDashboard`) |
| `bg-card` | `--card` | Cards, lists, panels, popovers |
| `bg-muted`, `bg-accent` | `--muted`, `--accent` | Tertiary fills, hover |
| `text-foreground` | `--foreground` | Body text |
| `text-muted-foreground` | `--muted-foreground` | Secondary text |
| `border-border` | `--border` | Borders and dividers |

Forbidden in components: `gray-*`, `slate-*`, `zinc-*`, `bg-white`, hex
values, `backgroundColor: 'white'`. Charts (Recharts) take `var(--border)` and
`var(--foreground)` for axes and tooltips.

## Status colors (decided)

| Fill | Text on the fill | Text on surfaces | Use |
| --- | --- | --- | --- |
| `--success` | `--success-foreground` | `--success-text` | Done, saved, present, "Activo" |
| `--warning` | `--warning-foreground` | `--warning-text` | Needs attention, pending, "Sin cuenta" |
| `--danger` | `--danger-foreground` | `--danger-text` | Errors, destructive actions, "Sin turno" |
| `--info` | `--info-foreground` | `--info-text` | Neutral notices, "Por activar" |

- Fills (`bg-warning`, `bg-success/10`, `border-danger/30`) are for
  backgrounds, borders, dots and icons. They are not text-safe: `--warning`
  is about 2:1 on white.
- Text and icons read on a card, the page or a tinted badge use the `-text`
  tokens (`text-warning-text`, `text-danger-text`). Each reaches at least
  4.5:1 on the card, the page and its own tint (10% light, 13% dark), in light and dark.
- `-foreground` is only for text on the solid fill (`bg-danger
  text-danger-foreground`).
- Use these instead of raw palette colors (`text-red-600`, `bg-green-500/10`).

```tsx
<span className="rounded-full bg-warning/15 px-2 text-warning-text">Pendiente</span>
```

Etapa colors in the prototype: Postulado `warning`, En orientación `info`,
Activo `success`, En pausa `muted-foreground`, Inactivo faint muted,
Retirado `danger`. A status is shown as a dot plus a label (see the status
dot, `PuntoEstado`, in [components.md](components.md#surfaces-and-status)), never as color
alone.

## Brand color (decided)

| Class | Token | Use |
| --- | --- | --- |
| `bg-brand`, `border-brand` | `--brand-primary` (#E96C20) | Logo, focus outline, borders, active indicators, decoration without text |
| — (pending) | `--brand-strong` (#BE5413) | Filled brand surfaces that carry text or icons: primary button fill, FAB, count badges. White text 4.70:1 |
| — (pending) | `--brand-strong-hover` (#B04E11) | Hover of those surfaces. White text 5.32:1 |
| `text-brand-foreground` | white | Text and icons on a filled brand surface |
| `bg-brand-tint` | `--brand-accent-strong` | Selected rows, pressed cards and pills, active nav entry |
| `text-brand-text` | `--brand-text` | Orange text at any size (≥ 4.5:1, light and dark) |

`--brand-strong` and `--brand-strong-hover` are **decided 2026-10-28,
pending in `app/globals.css` (Phase 2a)**. Same value in light and dark.
White on `--brand-primary` is only 3.17:1, so once they land:

- Filled brand surfaces with text or icons (`BotonSistema primario`,
  `BotonFlotante`, count badges such as the Filtros badge) use
  `--brand-strong`, hover `--brand-strong-hover`.
- `--brand-primary` stays for the logo, focus, borders, tints and
  decoration that carries no text.
- Text in brand color uses `--brand-text`, never `text-brand`.

Until Phase 2a, the code still fills those surfaces with `bg-brand`.

## Legacy tokens

Do not use these in new code. They stay in `globals.css` until no consumer
is left.

| Legacy | Replacement | Note |
| --- | --- | --- |
| `--glass-*` tokens, `glass-panel`, `glass-panel-elevated`, `glass-panel-subtle`, `glass-border-glow`, `scrollbar-glass` | `bg-card border border-border` (cards), `shadow-sheet` / `shadow-fab` (sheets, FAB) | The glass look is retired. `TarjetaSistema` renders the card surface (Phase 1). Translucent blur stays only for system bars (phone nav bar and tab bar, sticky desktop header). |
| `--destructive`, `bg-destructive`, `text-destructive` | `--danger`, `bg-danger`, `text-danger-text` | Same role, two names. shadcn primitives still read `--destructive`. |
| `--brand-primary-light` (#F59E0B), `--brand-dark` (#363D45), `--brand-accent` (8% tint), `--brand-primary-rgb` | `bg-brand`, `bg-brand-tint`, `text-foreground` | No Tailwind class. `PastillasFiltro` and `TarjetasFiltro` read `var(--brand-accent)` directly for the pressed state; Decided: one tint; Phase 1 moves them to `bg-brand-tint`. |
| `coloresMarca` (`components/ui/sistema-diseno.tsx`) | Tailwind classes | Now points at the CSS variables. Reach for it only where a class cannot (inline styles, SVG attributes). The old hex object is gone. |
| Raw `orange-*`, `amber-*`, `yellow-*` text | `text-warning-text`, `text-brand-text` | Older screens kept them because no readable warning text token existed; it exists now. |

## Radius (decided)

`--radius` is `0.75rem`; the Tailwind scale derives from it.

| Token | Class | Value | Use |
| --- | --- | --- | --- |
| control | `rounded-xl` | 16px | Buttons, inputs, selects, chips inside surfaces, segmented control |
| surface | `rounded-2xl` | 20px | Cards, lists, panels, dialogs, popovers |
| pill | `rounded-full` | — | Badges, filter pills, avatars on phone, counts |

Named utilities (`rounded-control`) were not added: `tailwind-merge` 2.x does
not recognize custom radius names, so `className` overrides would stop
replacing them.

The prototype uses 12px controls and 14px cards; the implementation maps them
to `rounded-xl` and `rounded-2xl`. Phone bottom sheets use a larger top
radius (prototype 26px, `rounded-t-3xl`).

## Typography (decided)

- Fonts: Geist (`font-sans`) and Geist Mono (`font-mono`), loaded in
  `app/layout.tsx` through the `geist` package.
- Numbers that are read or compared (metrics, counts, phone numbers, aligned
  dates) use `font-mono tabular-nums` with slight negative tracking
  (prototype `-.02em`).
- Scale from the prototype:

| Role | Desktop | Phone |
| --- | --- | --- |
| Page title (hero `h1`) | 24px, weight 650, tracking `-0.02em` (desktop and tablet) | Large title 28px, weight 700, tracking `-.03em` |
| Summary under the title | 15px muted | 15px muted |
| Section heading (`h2`) | 12px uppercase, tracking `.08em`, muted | same |
| Metric value | 30px mono | 26px mono |
| Row name | 15px semibold | 16px |
| Secondary line, tags | 13px / 12px | 13px / 11px |

- Decided 2026-10-28 (was 30px desktop and 34px phone): the hero `h1` is
  24px and the phone large title 28px. Pending in `TituloGrande` and the
  hero (Phase 2).
- Body text never goes below 12px. `TituloSistema` and `TextoSistema` keep
  their levels; see [components.md](components.md#typography).
- Contrast at small sizes: text at 12–13px (secondary lines, hints, tags,
  list headers) uses `--muted-foreground` or a darker token, never a fainter
  one (no `muted-foreground/60`, no faint gray). Status tags use the status
  `-text` tokens (`text-warning-text` on `bg-warning/10`), never the fill.

## Spacing and gutters (decided)

- 4px base grid.
- Page gutters: 16px phone, 24px from `sm`, 48px from `lg`
  (`p-4 sm:p-6 lg:px-12 lg:py-8`). The desktop header uses the same
  horizontal padding (`px-6 lg:px-12`), so content lines up with the title.
- Vertical rhythm: `space-y-6` between page sections (the prototype uses
  28px on desktop, 22px on phone).
- Gaps: 12px between cards in a grid, 10px on phone; 8px between pills.
- Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280. Decided
  (2026-10-26): phone layout below `md` (768px), tablet `md`–`lg`, desktop
  `lg` and up, matching the app chrome. (The prototype file switches at
  560/1000px container widths; the implementation uses these breakpoints.)

## Control size scale (decided)

Buttons and form controls share three heights. Both `BotonSistema` and
`ui/button` map to them.

| Size | Height | Use | `BotonSistema` | `ui/button` |
| --- | --- | --- | --- | --- |
| sm | 36px (44px on touch screens) | Dense tables and toolbars only | `tamaño="sm"` | `size="sm"` |
| md | 44px | Default for every form and action | `tamaño="md"` (default) | `size="default"` |
| lg | 48px | Hero and primary mobile calls to action | `tamaño="lg"` | `size="lg"` |
| icon | 44px square | Icon-only actions | `soloIcono` + `aria-label` | `size="icon"` |

- `sm` keeps a 44px touch target through `pointer-coarse:h-11`.
- `InputSistema`, `SelectSistema`, `ui/input` and the `ui/select` trigger are
  44px (md). `TextareaSistema` starts at 44px and grows.
- Filter pills are 44px (`PastillaFiltro`, `min-h-[44px]`); the prototype's
  40px pills and 36px segment buttons sit inside 44px rows.
- The FAB is 56px.

## Motion

Existing tokens (decided; in `globals.css`):

| Token | Value | Use |
| --- | --- | --- |
| `--ease-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Press feedback (`press-scale`), slide-up |
| `--ease-out-quint` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entrances |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Rare playful accents only |
| `--duration-instant` / `fast` / `normal` / `slow` / `slower` | 100 / 150 / 250 / 400 / 600ms | |
| `--stagger-delay` | 40ms | `stagger-children` |

Prototype motion (decided: no new easing token; the prototype `--ease` maps
to `--ease-out-quint`):

| Prototype | Value | Where |
| --- | --- | --- |
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | Sheets slide (340ms), card hover lift, metric bars (500ms) |
| row entrance `rise` | 350ms, 4px up + fade | List rows on desktop only; none on phone |
| skeleton shimmer | 1.2s linear | Loading rows |

Rules: animate `transform` and `opacity`, list properties explicitly
(`transition-colors`, `transition-opacity`); never `transition-all`. The
global `prefers-reduced-motion` block already cuts every animation; do not
override it.

## Shadows

Decided (2026-10-26). The prototype is flat: cards use a 1px border and no
shadow. Only floating layers get a shadow, through these two tokens (in
`app/globals.css` since Phase 1, as `shadow-sheet` and `shadow-fab`; the
legacy `--glass-shadow*` retire):

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--shadow-sheet` | `0 24px 60px -24px rgba(20,20,40,.28)` | `0 24px 60px -20px rgba(0,0,0,.7)` | Side panel, bottom sheet, popovers |
| `--shadow-fab` | `0 16px 36px -10px rgba(233,108,32,.75)` | same | FAB |

Do not add ad hoc shadows.

## Inventory behind the scale (origin/main, 2026-10-13)

Measured before deciding the scale, so adopting it does not make pages jump.

| What | Found |
| --- | --- |
| Page wrapper | `ContenedorDashboard` in 60 of 70 non-Niños pages (the other 10 render a client component that uses it). Full width, no `max-w`. |
| Page gutters | Content `p-4 sm:p-6 lg:px-12 lg:py-8`; desktop header `px-6 lg:px-12`. |
| Page widths | Almost no page caps its width. Ad hoc caps: `max-w-4xl` (configuración global), `max-w-3xl` (ticket text), `max-w-md` (empty states). |
| Page description | `descripcion` was accepted by `ContenedorDashboard` but not rendered; some pages rendered their own `<p>`. |
| `BotonSistema` heights | Every size had a `min-h-[44px]` floor: sm 44px, md 48px (`py-3`), lg 56px (`py-4`). 336 usages: 163 `sm`, 12 `lg`, the rest default `md`. |
| `ui/button` heights | sm 32px, default 36px, lg 40px, icon 36px, `rounded-md`. 25 importing files, 49 `size="sm"`. |
| Form controls | `InputSistema` / `SelectSistema` 50px (`min-h-[44px] py-3`); `ui/input` and `ui/select` 36px, `rounded-md`. |
| Radius | Controls `rounded-xl` (sistema) vs `rounded-md` (ui/*); surfaces `rounded-2xl` (TarjetaSistema) vs `rounded-xl` (ui/card) vs `rounded-3xl` (modals). |
| Brand colors | `coloresMarca` duplicated the CSS variables as hex (unused). |

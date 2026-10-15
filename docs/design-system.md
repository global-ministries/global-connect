# Design system foundations

One clear pattern for page widths, control sizes, radius and status colors.
The component catalog (in Spanish) lives in `docs/sistema-diseno.md`; this
file holds the decided scale and the rules every new or migrated screen
follows. Primitives live in `components/ui/sistema-diseno.tsx`.

## Inventory (origin/main, 2026-10-13)

Measured before deciding the scale, so adopting it does not make pages jump.

| What | Found |
| --- | --- |
| Page wrapper | `ContenedorDashboard` in 60 of 70 non-Niños pages (the other 10 render a client component that uses it). Full width, no `max-w`. |
| Page gutters | Content `p-4 sm:p-6 lg:px-12 lg:py-8`; desktop header `px-6 lg:px-12`. |
| Page widths | Almost no page caps its width. Ad hoc caps: `max-w-4xl` (configuración global), `max-w-3xl` (ticket text), `max-w-md` (empty states). |
| Page description | `descripcion` is accepted by `ContenedorDashboard` but not rendered; some pages render their own `<p>` instead. |
| `BotonSistema` heights | Every size had a `min-h-[44px]` floor: sm 44px, md 48px (`py-3`), lg 56px (`py-4`). 336 usages: 163 `sm`, 12 `lg`, the rest default `md`. |
| `ui/button` heights | sm 32px, default 36px, lg 40px, icon 36px, `rounded-md`. 25 importing files, 49 `size="sm"`. |
| Form controls | `InputSistema` / `SelectSistema` 50px (`min-h-[44px] py-3`); `ui/input` and `ui/select` 36px, `rounded-md`. |
| Radius | Controls `rounded-xl` (sistema) vs `rounded-md` (ui/*); surfaces `rounded-2xl` (TarjetaSistema) vs `rounded-xl` (ui/card) vs `rounded-3xl` (modals). |
| Brand colors | `coloresMarca` duplicated the CSS variables as hex (unused). |

## Page layout: `PaginaSistema`

Every authenticated page uses `PaginaSistema` (it builds on
`ContenedorDashboard`, which existing pages keep until they migrate).

| Width | Class | Use |
| --- | --- | --- |
| `default` | `max-w-none` (full content width) | Lists, dashboards, tables, maps |
| `form` | `max-w-3xl` (768px), left-aligned | Single-column forms and detail views |

- Gutters: 16px mobile, 24px from `sm`, 48px from `lg`, the same as the
  desktop header so content lines up with the title. Values kept from the
  inventory so adopting the primitive does not shift pages.
- Vertical rhythm: `space-y-6` between sections.
- Header: `titulo`, `regreso` (back link), `acciones` and `breadcrumbs` render
  in the sticky desktop header; `descripcion` renders as muted text above the
  content. On mobile the top bar shows the route title and pages keep their
  own mobile actions (FAB or in-page buttons).
- `className` applies to the content column.

```tsx
<PaginaSistema titulo="Crear Temporada" ancho="form" regreso={{ href: "/grupos-vida/temporadas", texto: "Temporadas" }}>
  …
</PaginaSistema>
```

## Action footer: `PieAccionesSistema`

Top border, page background, `safe-area-pb-md` bottom padding (12px or the
home-indicator inset). Sticky to the bottom of its scroll container by
default (`fijo={false}` to sit at the end). On mobile actions stack full
width with the last child on top; from `sm` they form a right-aligned row.
Put the secondary action first and the primary action last.

## Side panel: `PanelLateralSistema`

`components/ui/panel-lateral-sistema.tsx`, built on `ui/sheet`.

| Size | Width | Use |
| --- | --- | --- |
| `md` | 480px | Short forms, details |
| `lg` | 640px | Forms with repeated rows (e.g. several children) |

Full width on mobile. Fixed header (title, optional description), a
scrolling body that is a `@container` — lay out fields with `@md:`/`@lg:` so
they follow the panel width, not the viewport — and `PieAccionesSistema` for
the `pie` actions. Padding is 16px mobile, 24px from `sm`.

## Control size scale

Buttons and form controls share three heights. Both `BotonSistema` and
`ui/button` map to them, so both primitives look the same while screens
migrate.

| Size | Height | Use | `BotonSistema` | `ui/button` |
| --- | --- | --- | --- | --- |
| sm | 36px (44px on touch screens) | Dense tables and toolbars only | `tamaño="sm"` | `size="sm"` |
| md | 44px | Default for every form and action | `tamaño="md"` (default) | `size="default"` |
| lg | 48px | Hero and primary mobile calls to action | `tamaño="lg"` | `size="lg"` |
| icon | 44px square | Icon-only actions | `soloIcono` + `aria-label` | `size="icon"` |

- `sm` keeps a 44px touch target through `pointer-coarse:h-11`.
- `InputSistema`, `SelectSistema`, `ui/input` and the `ui/select` trigger are
  44px (md). `TextareaSistema` starts at 44px and grows.
- An icon-only `BotonSistema` (`soloIcono`) requires `aria-label` and takes no
  children; the type rejects anything else.

## Radius

| Token | Class | Value | Use |
| --- | --- | --- | --- |
| control | `rounded-xl` | 16px | Buttons, inputs, selects, chips inside surfaces |
| surface | `rounded-2xl` | 20px | Cards, panels, dialogs, popovers |
| pill | `rounded-full` | — | Badges, avatars |

Named utilities (`rounded-control`) were not added: `tailwind-merge` 2.x does
not recognize custom radius names, so `className` overrides would stop
replacing them.

## Status colors

Semantic tokens in `app/globals.css`, light and dark, exposed to Tailwind 4
through `@theme inline` (`bg-success`, `text-danger`, `border-warning/30`…).

| Token | Foreground | Use |
| --- | --- | --- |
| `--success` | `--success-foreground` | Done, saved, present |
| `--warning` | `--warning-foreground` | Needs attention, pending |
| `--danger` | `--danger-foreground` | Errors, destructive actions |
| `--info` | `--info-foreground` | Neutral notices |

Use these instead of raw palette colors (`text-red-600`, `bg-green-500/10`).
`coloresMarca` now points at the CSS variables; prefer the Tailwind classes
and reach for it only where a class cannot (inline styles, SVG attributes).

## Follow-ups

- Lint guardrail: `eslint.config.mjs` forbids `ui/button`, `ui/card` and
  `boton-gradiente` (as an error) only in the paths listed in
  `migratedToDesignSystem`. Add each area there when it migrates. A repo-wide
  warning would raise the 480-warning lint budget, so it waits until
  migrations lower the count.
- `ui/button` `size="icon"` does not require `aria-label` at the type level yet.
  The calendar day cells still use it without one; `KpisGruposPanel` now has
  its label but keeps a 32px (`h-8 w-8`) override below the 44px icon size.
- `ui/card` still uses `rounded-xl`; move it to the surface radius when cards
  migrate.
- Pastoral (`app/(pastoral)`, `components/pastoral`), Notas de líderes,
  Ayuda and Actualizaciones are migrated and import no `ui/button` or
  `ui/card`; add them to `migratedToDesignSystem`. Widths: lists, dashboards
  and the support queue `default`; the asistido roadmap, a 1:1 detail, its
  capture form, the report form and the Actualizaciones feed `form`. Tables
  that would scroll sideways at 360px (pastoral usuarios) render a card list
  below `md`. Destructive pastoral actions recolor the primary button
  (`components/pastoral/estilos.ts`); switch them to the danger variant and
  the link-wrapped buttons to the `href` form once those land here.

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

- Lint guardrail: a `no-restricted-imports` warning for `@/components/ui/button`,
  `ui/card` and `boton-gradiente` outside `components/ui/**` was not added. The
  repository lint budget is at its 480-warning cap and the rule would raise it.
  Add it once migrations lower the count.
- `ui/button` `size="icon"` does not require `aria-label` at the type level yet:
  `components/dashboard/widgets/KpisGruposPanel.tsx` and the calendar day cells
  use it without one.
- `ui/card` still uses `rounded-xl`; move it to the surface radius when cards
  migrate.

# Global Connect design system

One design language for the whole repo. Every screen, component, doc and
agent follows this folder. If something here disagrees with another doc, a
code comment or a generic design skill, this folder wins.

The visual reference is the approved Servidores prototype:
[`prototipos/servidores.html`](prototipos/servidores.html) (open it in a
browser and switch between Celular, Tablet and Escritorio) and its
screenshots in [`prototipos/capturas/`](prototipos/capturas/).

## Single source of truth

- Decisions live here, once. Other docs link here instead of restating
  values.
- Code lives in `components/ui/`, mainly
  [`components/ui/sistema-diseno.tsx`](../../components/ui/sistema-diseno.tsx).
  A screen never ships its own copy of a canonical component (its own empty
  state, its own filter sheet, its own card look).
- No new visual styles. If a screen needs something the system lacks, add it
  to the system (see [components.md](components.md#planned-components)) and
  then use it.
- `docs/design-system.md` and `docs/sistema-diseno.md` are stubs that point
  here. They stay because code comments and tests reference them.

## Principles

1. **One system.** Same tokens, same components, same anatomy on every
   screen. Two screens that do the same thing look and behave the same.
2. **Native-app feel on phones.** Below 560px a screen behaves like an iOS
   app: navigation bar with back, large title, filled search, inset grouped
   lists, bottom sheets, tab bar and FAB. See [mobile.md](mobile.md).
3. **Full width on desktop.** Pages use the whole content width with the
   existing gutters (16px phone, 24px from `sm`, 48px from `lg`). No centered
   narrow column. See [layout.md](layout.md).
4. **Attention first.** A list screen opens with what needs action (attention
   metrics), then where to look, then the list. Big cards choose WHERE
   (dirección, área, equipo); pills refine WHAT (etapa, "Sin cuenta").
5. **One detail drawer, not per-row menus.** Tapping a row opens one drawer
   (side panel on desktop, bottom sheet on phone) that holds every action for
   that item, each gated by permission.
6. **Numbers in Geist Mono, tabular.** Counts, metrics, phone numbers and
   dates that line up use `font-mono tabular-nums`.
7. **Accessible by default.** 44px touch targets; toggles use
   `aria-pressed`; the current page, crumb or tab uses `aria-current`;
   visible focus rings (`focus-ring`, brand outline); every icon-only button
   has an `aria-label`; animations respect `prefers-reduced-motion`.
8. **Status through tokens.** Colors come from semantic tokens
   (`success`, `warning`, `info`, `danger`, `brand`), never raw palette
   classes. See [foundations.md](foundations.md).

## File map

| File | What it holds |
| --- | --- |
| [foundations.md](foundations.md) | Tokens: color, status, brand, radius, typography, spacing, control sizes, motion, shadows; legacy tokens and their replacements |
| [layout.md](layout.md) | App shell, `PaginaSistema`, desktop header and breadcrumb, gutters, hero, sections and fields, action footer, side panel, dialogs, navigation, phone shell |
| [components.md](components.md) | Canonical catalog with API and file path, deprecation table, planned components |
| [patterns.md](patterns.md) | Recipes: list screen anatomy, filters sheet, detail drawer, empty and loading states, permission-gated actions, URL-synced filters, forms, feedback |
| [mobile.md](mobile.md) | Native-app rules for phones |
| [migration.md](migration.md) | Status per area, open follow-ups, the lint guardrail |
| [prototipos/](prototipos/) | Approved prototypes and screenshots |

## How agents use this

1. Before any UI work (screen, page, component, layout, responsive or mobile
   change), load the repo skill
   [`.agent/skills/global-connect-design/SKILL.md`](../../.agent/skills/global-connect-design/SKILL.md).
   It overrides generic design skills (`frontend-design`, `ui-ux-pro-max`,
   `web-design-guidelines`, `sleek-design-mobile-apps`).
2. Read the files above that match the task; for a list screen, start with
   [patterns.md](patterns.md#list-screen-anatomy).
3. Import canonical components; do not restyle them with class overrides to
   get a different look.
4. Check [migration.md](migration.md) for the area's status before editing,
   and update it (and `migratedToDesignSystem` in `eslint.config.mjs`) when an
   area migrates.
5. When the system lacks something, propose the component in
   [components.md](components.md#planned-components) instead of building a
   local variant.

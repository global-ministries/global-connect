# Mobile

On phones Global Connect looks and behaves like a native app. Reference:
the prototype in phone mode
([`prototipos/servidores.html`](prototipos/servidores.html), "Celular") and
[`capturas/servidores-phone.png`](prototipos/capturas/servidores-phone.png),
[`servidores-phone-light.png`](prototipos/capturas/servidores-phone-light.png),
[`servidores-phone-filters.png`](prototipos/capturas/servidores-phone-filters.png),
[`servidores-phone-person.png`](prototipos/capturas/servidores-phone-person.png),
[`servidores-phone-oriel.png`](prototipos/capturas/servidores-phone-oriel.png).

Test at 390px (and 360px for overflow). Desktop keeps its full-width layout;
these rules apply below the phone breakpoint only.

## Navigation bar

- Sticky at the top, translucent (`--glass`-like material + blur), height
  includes the top safe area (prototype: 44px inset + 48px bar).
- Three columns: back on the left, title in the middle, actions on the right.
- **Back**: chevron + the previous level's label in brand color (e.g.
  "Dirección de Niños"), truncated at ~120px, 44px tall. Hidden at the root
  of a tab.
- **Compact title**: hidden while the large title is visible; fades in
  (200ms) once the content scrolls past 48px, together with a hairline
  bottom border.
- **Actions**: up to two 44px icon buttons in brand color, each with an
  `aria-label`; a count badge sits on the filter icon when filters are
  active.

## Large title

- First block of the content: 34px bold title, tracking `-.03em`, and the
  summary line (15px muted, numbers in `strong`).
- Replaces the desktop hero; the desktop breadcrumb becomes the back button.

## Search

- Filled field: no border, `color-mix(fg 8%)` fill, 12px radius, 40px tall,
  full width, under the large title.
- No keyboard shortcut hint on phone.

## Metrics

- Attention metrics become a compact 2×2 grid (10px gap): 12px padding,
  16px radius, no border, value 26px mono; the bar and hint are hidden.
- Pressed state: inset 1.5px brand ring.

## Inset grouped lists

- Page background switches to the grouped background (`--bg-grouped` in the
  prototype: slightly darker than cards).
- Scope cards and people rows become rows inside one rounded container
  (16px radius, card fill, no border).
- Separators are 1px hairlines inset from the left (14px for text rows,
  66px for rows with an avatar so they start after it).
- Rows: at least 64px tall (44px minimum target), name 16px, secondary line
  13px truncated, status dot (label hidden visually, kept for screen
  readers), chevron. Pressed state on `:active`, no hover effect.
- No row entrance animation on phone.

## Bottom sheets

- Drawers and filter panels open from the bottom: full width, up to 90% of
  the height, 26px top radius, grab handle (38×5px) at the top, safe-area
  bottom padding.
- Scrim behind; `Escape`, the close button and tapping the scrim close it;
  focus moves into the sheet and returns to the trigger.
- Selects stack in one column; key/value grids use two columns.
- Footer actions sit in a two-column grid ("Limpiar" | "Ver N personas").

## Tab bar and FAB

- Tab bar: `MenuInferiorMovil`, translucent, entries from the navigation
  registry, active entry in brand color, 24px icons, safe-area bottom
  padding.
- FAB: `BotonFlotante`, 56px, brand fill, above the tab bar on the right, for
  the screen's one primary action (the desktop header button). Hidden when
  the user cannot take that action. Always has `label`.
- Leave room at the bottom of the content (prototype 140px) so the last row
  is not hidden under the tab bar and FAB.

## Safe areas

- Use the utilities in `app/globals.css`: `safe-area-pt`, `safe-area-pb`,
  `safe-area-pb-md` (action footers), `safe-area-pl`, `safe-area-pr`.
- `app/layout.tsx` sets `viewportFit: 'cover'`; every fixed bar pads by the
  inset.

## No horizontal overflow

The most common phone bug. A single long name or a nowrap row widens the
whole page.

- Grid tracks that hold text are `minmax(0, 1fr)`, never plain `1fr`
  (`1fr` is `minmax(auto, 1fr)` and grows to fit the content).
- Flex and grid children that hold text get `min-w-0`; the text gets
  `truncate` (or `overflow-hidden text-ellipsis whitespace-nowrap`).
- The content column of the shell is `minmax(0, 1fr)` with `min-w-0`.
- Tables do not use `overflow-x-auto` on phone: they become inset grouped
  rows or card lists below `md`.
- The only horizontal scroller allowed is a chip or pill row
  (`GrupoPastillas`, active chips), with the scrollbar hidden.
- Check at 360px with the longest real names.

## Touch and accessibility

- 44px minimum for every target (`pointer-coarse:h-11` on dense buttons).
- `touch-manipulation` on custom controls to remove the tap delay.
- Toggles use `aria-pressed`, the active tab `aria-current="page"`.
- Respect `prefers-reduced-motion` (sheets appear without sliding).

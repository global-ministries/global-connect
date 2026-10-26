# AGENTS.md

Global Connect is a Next.js (App Router) + Supabase management app for a
church organization: Dream Team, Grupos de Vida, Niños, Talleres, users,
support and reports. Code, UI and docs use Spanish names.

The detailed agent guide (skills, auto-invoke tables, workflows, stack, key
patterns) is [`GEMINI.md`](GEMINI.md). Read it before working.

## Design rule

Any UI work (screen, page, component, layout, styles, mobile or responsive
behavior):

1. Load the repo design skill first:
   [`.agent/skills/global-connect-design/SKILL.md`](.agent/skills/global-connect-design/SKILL.md).
   It overrides generic design skills.
2. Follow [`docs/design-system/`](docs/design-system/README.md), the single
   source of truth. Visual reference:
   [`docs/design-system/prototipos/servidores.html`](docs/design-system/prototipos/servidores.html).
3. No new visual styles. Use the canonical components
   ([`components.md`](docs/design-system/components.md)) and tokens
   ([`foundations.md`](docs/design-system/foundations.md)).
4. Check the area's status in
   [`docs/design-system/migration.md`](docs/design-system/migration.md) and
   update it when you migrate an area (plus `migratedToDesignSystem` in
   `eslint.config.mjs`).

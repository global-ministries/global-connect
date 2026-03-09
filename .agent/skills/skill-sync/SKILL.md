---
name: skill-sync
description: >
  Syncs skill metadata to GEMINI.md Auto-invoke sections.
  Trigger: When updating skill metadata (metadata.scope/metadata.auto_invoke), regenerating Auto-invoke tables, or running ./skills/skill-sync/assets/sync.sh (including --dry-run/--scope).
license: Apache-2.0
metadata:
  author: global-connect
  version: "1.0"
  scope: [root]
  auto_invoke:
    - "After creating/modifying a skill"
    - "Regenerate GEMINI.md Auto-invoke tables (sync.sh)"
    - "Troubleshoot why a skill is missing from GEMINI.md auto-invoke"
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

## Purpose

Keeps GEMINI.md Auto-invoke sections in sync with skill metadata. When you create or modify a skill, run the sync script to automatically update all affected GEMINI.md files.

## Required Skill Metadata

Each skill that should appear in Auto-invoke sections needs these fields in `metadata`.

`auto_invoke` can be either a single string **or** a list of actions:

```yaml
metadata:
  author: prowler-cloud
  version: "1.0"
  scope: [ui]                                    # Which GEMINI.md: ui, api, sdk, root

  # Option A: single action
  auto_invoke: "Creating/modifying components"

  # Option B: multiple actions
  # auto_invoke:
  #   - "Creating/modifying components"
  #   - "Refactoring component folder placement"
```

### Scope Values

| Scope | Updates |
|-------|---------|
| `root` | `GEMINI.md` (repo root) |

Skills can have multiple scopes if needed.

---

## Usage

### After Creating/Modifying a Skill

```bash
./skills/skill-sync/assets/sync.sh
```

### What It Does

1. Reads all `skills/*/SKILL.md` files
2. Extracts `metadata.scope` and `metadata.auto_invoke`
3. Generates Auto-invoke tables for each GEMINI.md
4. Updates the `### Auto-invoke Skills` section in each file

---

## Example

Given this skill metadata:

```yaml
# skills/kairos-crm/SKILL.md
metadata:
  author: kairos
  version: "1.0"
  scope: [root]
  auto_invoke: "Working with CRM or customer management"
```

The sync script generates in `GEMINI.md`:

```markdown
### Auto-invoke Skills

When performing these actions, ALWAYS invoke the corresponding skill FIRST:

| Action | Skill |
|--------|-------|
| Working with CRM or customer management | `kairos-crm` |
```

---

## Commands

```bash
# Sync all GEMINI.md files
./skills/skill-sync/assets/sync.sh

# Dry run (show what would change)
./skills/skill-sync/assets/sync.sh --dry-run

# Sync specific scope only
./skills/skill-sync/assets/sync.sh --scope ui
```

---

## Checklist After Modifying Skills

- [ ] Added `metadata.scope` to new/modified skill
- [ ] Added `metadata.auto_invoke` with action description
- [ ] Ran `./skills/skill-sync/assets/sync.sh`
- [ ] Verified GEMINI.md files updated correctly

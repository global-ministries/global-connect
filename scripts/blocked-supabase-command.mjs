#!/usr/bin/env node

const command = process.argv[2] || 'this command'

const guidance = {
  'gen:types': [
    'Use `npm run gen:types:staging` only after the staging schema baseline and support migration are applied.',
    'This keeps generated types tied to the known staging project ref ebwtdjtajclzciwipevw.',
  ],
  'db:push:staging': [
    'Use `npm run db:push:staging:dry-run` first.',
    'Apply migrations to staging only as a deliberate manual operation after reviewing docs/supabase-staging-baseline.md.',
  ],
  'db:reset:staging': [
    '`supabase db reset --project-ref` is destructive and must not be run against hosted staging from package scripts.',
    'Use a schema-only baseline workflow instead; do not copy production data.',
  ],
}

console.error(`Blocked Supabase command: ${command}`)
console.error('This package script is intentionally non-mutating by default.')

for (const line of guidance[command] || []) {
  console.error(`- ${line}`)
}

process.exit(1)

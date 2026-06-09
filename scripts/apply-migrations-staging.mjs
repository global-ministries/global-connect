#!/usr/bin/env node

console.error('Blocked: scripts/apply-migrations-staging.mjs previously executed raw SQL through rpc("exec").')
console.error('Use docs/supabase-staging-baseline.md for the manual staging-baseline workflow.')
console.error('Do not use this script to apply migrations or copy production data.')
process.exit(1)

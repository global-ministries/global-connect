#!/usr/bin/env node

import { mkdir } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const STAGING_PROJECT_REF = 'ebwtdjtajclzciwipevw'
const DEFAULT_OUTPUT_FILE = 'tmp/staging-baseline/staging-schema-baseline.review.sql'
const DEFAULT_SCHEMAS = ['public', 'storage']

export function parseSchemas(value) {
  if (!value) {
    return [...DEFAULT_SCHEMAS]
  }

  const schemas = value
    .split(',')
    .map((schema) => schema.trim())
    .filter(Boolean)

  if (schemas.length === 0) {
    throw new Error('BASELINE_SCHEMAS must include at least one schema name.')
  }

  for (const schema of schemas) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
      throw new Error(`Invalid schema name in BASELINE_SCHEMAS: ${schema}`)
    }
  }

  return schemas
}

export function validateSourceDatabaseUrl(sourceUrl) {
  if (!sourceUrl) {
    throw new Error('PRODUCTION_DATABASE_URL is required. Set it only in the controlled operator environment.')
  }

  const normalizedSourceUrl = sourceUrl.toLowerCase()

  if (normalizedSourceUrl.includes(STAGING_PROJECT_REF)) {
    throw new Error(`PRODUCTION_DATABASE_URL appears to target staging project ref ${STAGING_PROJECT_REF}. Refusing to continue.`)
  }

  if (/[<>{}]|\.\.\.|your_|placeholder|change-?me/.test(normalizedSourceUrl)) {
    throw new Error('PRODUCTION_DATABASE_URL appears to contain a placeholder value. Refusing to continue.')
  }

  let parsed
  try {
    parsed = new URL(sourceUrl)
  } catch (error) {
    throw new Error(`PRODUCTION_DATABASE_URL must be a valid Postgres connection URL: ${error.message}`)
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('PRODUCTION_DATABASE_URL must use the postgres:// or postgresql:// protocol.')
  }

  const hostname = parsed.hostname.toLowerCase()
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, '')).toLowerCase()

  if (!hostname || ['undefined', 'null'].includes(hostname)) {
    throw new Error('PRODUCTION_DATABASE_URL is missing a real database host. Refusing to continue.')
  }

  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('PRODUCTION_DATABASE_URL points to a local database. Refusing to create a staging baseline from localhost.')
  }

  if (/\b(test|example|localhost)\b/.test(hostname) || /\b(test|example|template)\b/.test(databaseName)) {
    throw new Error('PRODUCTION_DATABASE_URL appears to target a test/example database. Refusing to continue.')
  }
}

export function buildPgEnvironment(sourceUrl) {
  const parsed = new URL(sourceUrl)
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))

  return {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: databaseName || 'postgres',
  }
}

export function buildPgDumpArgs({ outputFile, schemas }) {
  return [
    '--schema-only',
    '--no-owner',
    '--no-comments',
    '--no-publications',
    '--no-subscriptions',
    ...schemas.flatMap((schema) => [`--schema=${schema}`]),
    `--file=${outputFile}`,
  ]
}

function assertPgDumpAvailable() {
  const result = spawnSync('pg_dump', ['--version'], { stdio: 'ignore' })

  if (result.error) {
    throw new Error([
      'pg_dump is required on PATH but was not found.',
      'Install PostgreSQL client tools in the controlled operator environment before running this generator.',
      'macOS examples: `brew install libpq` then add libpq/bin to PATH, or `brew install postgresql@16`.',
      'Do not run this script from the current restricted environment if pg_dump is unavailable.',
    ].join('\n'))
  }
}

function runPgDump({ args, sourceUrl }) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn('pg_dump', args, {
      env: {
        ...process.env,
        ...buildPgEnvironment(sourceUrl),
      },
      shell: false,
      stdio: ['ignore', 'inherit', 'inherit'],
    })

    child.on('error', rejectRun)
    child.on('close', (code) => {
      if (code === 0) {
        resolveRun()
        return
      }

      rejectRun(new Error(`pg_dump exited with status ${code}. Review the error output above.`))
    })
  })
}

async function main() {
  const sourceUrl = process.env.PRODUCTION_DATABASE_URL
  const outputFile = resolve(process.env.BASELINE_OUTPUT_FILE || DEFAULT_OUTPUT_FILE)
  const schemas = parseSchemas(process.env.BASELINE_SCHEMAS)

  console.error('WARNING: This generator exports schema metadata only and does not apply anything to staging.')
  console.error('WARNING: Review staging-schema-baseline.review.sql before any manual staging apply.')
  console.error(`WARNING: Refusing known staging project ref ${STAGING_PROJECT_REF} as a source.`)

  validateSourceDatabaseUrl(sourceUrl)
  assertPgDumpAvailable()
  await mkdir(dirname(outputFile), { recursive: true })

  await runPgDump({
    args: buildPgDumpArgs({ outputFile, schemas }),
    sourceUrl,
  })

  console.error(`Generated review artifact: ${outputFile}`)
  console.error('Next step: run the static review checklist in docs/supabase-staging-baseline.md before any staging apply.')
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''

if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

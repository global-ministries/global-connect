import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPgDumpArgs,
  buildPgEnvironment,
  parseSchemas,
  validateSourceDatabaseUrl,
} from './generate-staging-schema-baseline.mjs'

test('buildPgDumpArgs creates a schema-only pg_dump command argument list', () => {
  const args = buildPgDumpArgs({
    outputFile: '/tmp/staging-schema-baseline.review.sql',
    schemas: ['public', 'storage', 'private_schema'],
  })

  assert.deepEqual(args, [
    '--schema-only',
    '--no-owner',
    '--no-comments',
    '--no-publications',
    '--no-subscriptions',
    '--schema=public',
    '--schema=storage',
    '--schema=private_schema',
    '--file=/tmp/staging-schema-baseline.review.sql',
  ])
})

test('buildPgDumpArgs does not include the production database URL', () => {
  const productionDatabaseUrl = 'postgresql://operator:secret@db.production-ref.supabase.co:5432/postgres'

  const args = buildPgDumpArgs({
    outputFile: '/tmp/staging-schema-baseline.review.sql',
    schemas: ['public'],
    sourceUrl: productionDatabaseUrl,
  })

  assert.equal(args.some((arg) => arg.includes(productionDatabaseUrl)), false)
  assert.equal(args.some((arg) => arg.includes('postgresql://')), false)
})

test('buildPgEnvironment parses connection URL without using a local socket fallback', () => {
  const env = buildPgEnvironment('postgresql://postgres.user%40ref:s5k8%2A2p%29nm%25%3FF2x@db.production-ref.supabase.co:5432/postgres')

  assert.deepEqual(env, {
    PGHOST: 'db.production-ref.supabase.co',
    PGPORT: '5432',
    PGUSER: 'postgres.user@ref',
    PGPASSWORD: 's5k8*2p)nm%?F2x',
    PGDATABASE: 'postgres',
  })
})

test('validateSourceDatabaseUrl rejects missing production database URLs', () => {
  assert.throws(() => validateSourceDatabaseUrl(''), /PRODUCTION_DATABASE_URL is required/)
})

test('validateSourceDatabaseUrl rejects the known staging ref', () => {
  assert.throws(
    () => validateSourceDatabaseUrl('postgresql://operator:secret@db.ebwtdjtajclzciwipevw.supabase.co:5432/postgres'),
    /staging project ref/
  )
})

test('validateSourceDatabaseUrl rejects localhost sources', () => {
  assert.throws(
    () => validateSourceDatabaseUrl('postgresql://postgres:postgres@localhost:5432/postgres'),
    /local database/
  )
})

test('validateSourceDatabaseUrl rejects missing or undefined hosts', () => {
  assert.throws(
    () => validateSourceDatabaseUrl('postgresql://postgres:postgres@undefined:5432/postgres'),
    /missing a real database host/
  )
})

test('validateSourceDatabaseUrl rejects placeholder values', () => {
  assert.throws(
    () => validateSourceDatabaseUrl('postgresql://operator:secret@db.<your-production-ref>.supabase.co:5432/postgres'),
    /placeholder value/
  )
  assert.throws(
    () => validateSourceDatabaseUrl('postgres://...'),
    /placeholder value/
  )
})

test('validateSourceDatabaseUrl rejects non-Postgres protocols', () => {
  assert.throws(
    () => validateSourceDatabaseUrl('https://operator:secret@db.production-ref.supabase.co:5432/postgres'),
    /postgres:\/\/ or postgresql:\/\//
  )
})

test('validateSourceDatabaseUrl rejects test and example targets', () => {
  assert.throws(
    () => validateSourceDatabaseUrl('postgresql://operator:secret@test.supabase.co:5432/postgres'),
    /test\/example database/
  )
  assert.throws(
    () => validateSourceDatabaseUrl('postgresql://operator:secret@db.production-ref.supabase.co:5432/example'),
    /test\/example database/
  )
})

test('parseSchemas defaults to public and storage', () => {
  assert.deepEqual(parseSchemas(''), ['public', 'storage'])
})

test('parseSchemas rejects invalid schema names', () => {
  assert.throws(() => parseSchemas('public, bad-schema'), /Invalid schema name/)
})

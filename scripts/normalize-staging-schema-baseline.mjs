#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_INPUT_FILE = 'tmp/staging-baseline/staging-schema-baseline.review.sql'
const DEFAULT_OUTPUT_FILE = 'tmp/staging-baseline/staging-schema-baseline.normalized.sql'
const DEFAULT_PLATFORM_ACL_FILE = 'tmp/staging-baseline/staging-schema-baseline.platform-acls.review.sql'

const NORMALIZED_HEADER = `-- Derived schema-only staging baseline for Global Connect.
-- Source: tmp/staging-baseline/staging-schema-baseline.review.sql.
-- This artifact intentionally excludes Supabase-managed storage internals and platform ACL/default privilege replay.
-- Review this file manually before any staging apply. Do not execute it without explicit approval.

`

const PLATFORM_ACL_HEADER = `-- Platform ACL/default privilege statements isolated from the normalized staging baseline.
-- Review manually if staging requires explicit privilege reconciliation.
-- Do not blindly replay these statements.

`

function splitDumpSections(sql) {
  const lines = sql.split(/(?<=\n)/)
  const sections = []
  let current = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const nextLine = lines[index + 1] ?? ''

    if (line === '--\n' && nextLine.startsWith('-- Name: ') && current.length > 0) {
      sections.push(current.join(''))
      current = [line]
      continue
    }

    current.push(line)
  }

  if (current.length > 0) {
    sections.push(current.join(''))
  }

  return sections
}

function getSectionHeader(section) {
  return section.match(/^-- Name: (?<name>.*); Type: (?<type>.*); Schema: (?<schema>.*); Owner: -$/m)?.groups ?? null
}

function isPublicSchemaCreation(section) {
  const header = getSectionHeader(section)

  return header?.name === 'public' && header.type === 'SCHEMA' && /\nCREATE SCHEMA public;\n/.test(section)
}

function isStorageManagedSection(section) {
  const header = getSectionHeader(section)

  if (!header) {
    return false
  }

  if (header.schema === 'storage') {
    return true
  }

  return header.type === 'SCHEMA' && header.name === 'storage'
}

function isAclSection(section) {
  const header = getSectionHeader(section)

  return header?.type === 'ACL' || header?.type === 'DEFAULT ACL'
}

function isFunctionSection(section) {
  return getSectionHeader(section)?.type === 'FUNCTION'
}

function stripPsqlMetaCommands(section) {
  if (isFunctionSection(section)) {
    return { normalized: section, removedCount: 0 }
  }

  const lines = section.split(/(?<=\n)/)
  const retainedLines = []
  let removedCount = 0

  for (const line of lines) {
    if (/^\\\S+/.test(line)) {
      removedCount += 1
      continue
    }

    retainedLines.push(line)
  }

  return { normalized: retainedLines.join(''), removedCount }
}

function stripUnsupportedPgDumpSettings(section) {
  if (isFunctionSection(section)) {
    return section
  }

  return section
    .split(/(?<=\n)/)
    .filter((line) => !/^SET transaction_timeout = 0;\n?$/.test(line))
    .join('')
}

function startsTopLevelAclStatement(line) {
  return /^\s*(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES)\b/.test(line)
}

function hasTopLevelAclStatement(section) {
  return section.split('\n').some((line) => startsTopLevelAclStatement(line))
}

function splitStatements(section) {
  const lines = section.split(/(?<=\n)/)
  const headerLines = []
  const statements = []
  let statement = []
  let insideStatements = false

  for (const line of lines) {
    if (!insideStatements && startsTopLevelAclStatement(line)) {
      insideStatements = true
    }

    if (!insideStatements) {
      headerLines.push(line)
      continue
    }

    statement.push(line)

    if (/;\s*$/.test(line)) {
      statements.push(statement.join(''))
      statement = []
    }
  }

  if (statement.length > 0) {
    statements.push(statement.join(''))
  }

  return { header: headerLines.join(''), statements }
}

function normalizeAclSection(section) {
  if (isFunctionSection(section) || (!isAclSection(section) && !hasTopLevelAclStatement(section))) {
    return { normalized: section, isolated: '' }
  }

  const { header, statements } = splitStatements(section)
  const isolated = []

  for (const statement of statements) {
    isolated.push(statement)
  }

  return {
    normalized: isAclSection(section) ? '' : header,
    isolated: isolated.length > 0 ? `${header}${isolated.join('')}` : '',
  }
}

export function normalizeBaseline(sql) {
  const normalizedSections = []
  const isolatedAclSections = []
  const summary = {
    removedPublicSchemaSections: 0,
    removedStorageSections: 0,
    isolatedPlatformAclSections: 0,
    removedPsqlMetaCommands: 0,
  }

  for (const rawSection of splitDumpSections(sql)) {
    const metaCommandResult = stripPsqlMetaCommands(rawSection)
    const section = stripUnsupportedPgDumpSettings(metaCommandResult.normalized)

    summary.removedPsqlMetaCommands += metaCommandResult.removedCount

    if (isPublicSchemaCreation(section)) {
      summary.removedPublicSchemaSections += 1
      continue
    }

    if (isStorageManagedSection(section)) {
      summary.removedStorageSections += 1
      continue
    }

    const aclResult = normalizeAclSection(section)

    if (aclResult.isolated) {
      summary.isolatedPlatformAclSections += 1
      isolatedAclSections.push(aclResult.isolated)
    }

    if (aclResult.normalized) {
      normalizedSections.push(aclResult.normalized)
    }
  }

  return {
    normalizedSql: NORMALIZED_HEADER + normalizedSections.join(''),
    platformAclSql: PLATFORM_ACL_HEADER + isolatedAclSections.join(''),
    summary,
  }
}

async function main() {
  const inputFile = resolve(process.env.BASELINE_REVIEW_FILE || DEFAULT_INPUT_FILE)
  const outputFile = resolve(process.env.BASELINE_NORMALIZED_FILE || DEFAULT_OUTPUT_FILE)
  const platformAclFile = resolve(process.env.BASELINE_PLATFORM_ACL_FILE || DEFAULT_PLATFORM_ACL_FILE)

  const reviewSql = await readFile(inputFile, 'utf8')
  const { normalizedSql, platformAclSql, summary } = normalizeBaseline(reviewSql)

  await mkdir(dirname(outputFile), { recursive: true })
  await writeFile(outputFile, normalizedSql)
  await writeFile(platformAclFile, platformAclSql)

  console.error(`Normalized schema baseline written to ${outputFile}`)
  console.error(`Platform ACL review file written to ${platformAclFile}`)
  console.error(JSON.stringify(summary))
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''

if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

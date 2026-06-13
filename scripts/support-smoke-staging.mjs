#!/usr/bin/env node

import { createHash, createHmac, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_FILE = '.env.staging.local'
const SUPPORT_R2_BUCKET = 'global-connect-support'
const SMOKE_PREFIX = 'support-smoke'
const DEFAULT_TIMEOUT_MS = 30_000
const VERCEL_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass'
const EXTERNAL_INBOUND_ACTIONS = ['public_reply', 'internal_note']

const CHECKS = new Set(['inngest', 'external', 'r2', 'resend'])
const PRODUCTION_HOST_PATTERNS = [
  /^connect\.yosoyglobal\.org$/i,
  /^yosoyglobal\.org$/i,
  /^globalconnect\.org$/i,
]

export function parseArgs(argv = process.argv.slice(2)) {
  const selected = new Set()
  let envFile = ENV_FILE

  for (const arg of argv) {
    if (arg === '--all') {
      for (const check of CHECKS) selected.add(check)
      continue
    }

    if (arg.startsWith('--only=')) {
      selected.clear()
      for (const value of arg.slice('--only='.length).split(',')) {
        const check = value.trim()
        if (!CHECKS.has(check)) throw new Error(`Unknown smoke check: ${check}`)
        selected.add(check)
      }
      continue
    }

    if (arg.startsWith('--env-file=')) {
      envFile = arg.slice('--env-file='.length)
      continue
    }

    if (arg === '--help' || arg === '-h') {
      return { help: true, checks: [], envFile }
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return { help: false, checks: [...(selected.size ? selected : CHECKS)], envFile }
}

export function loadEnvFile(filePath = ENV_FILE) {
  const absolutePath = resolve(process.cwd(), filePath)
  if (!existsSync(absolutePath)) return []

  const loaded = []
  for (const line of readFileSync(absolutePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim())
    if (key && process.env[key] === undefined) {
      process.env[key] = value
      loaded.push(key)
    }
  }
  return loaded
}

export function assertStagingEnvironment(env = process.env) {
  if (env.RLS_ENV !== 'staging') {
    throw new Error('Refusing smoke run: RLS_ENV must be exactly "staging".')
  }

  assertNoPublicSecrets(env)
}

export function assertSafeBaseUrl(value) {
  if (!value) throw new Error('SUPPORT_SMOKE_BASE_URL is required for route smoke checks.')

  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('SUPPORT_SMOKE_BASE_URL must use http or https.')
  }

  if (isObviousProductionHost(url.hostname)) {
    throw new Error(`Refusing production-looking smoke base URL: ${url.hostname}`)
  }

  return url.origin
}

export function isObviousProductionHost(hostname) {
  return PRODUCTION_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

export function redact(value) {
  if (!value) return '[missing]'
  if (value.length <= 8) return '[redacted]'
  return `${value.slice(0, 4)}...[redacted]...${value.slice(-4)}`
}

export function withRouteProtectionBypass(url, headers = {}, env = process.env) {
  const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (!secret || !env.SUPPORT_SMOKE_BASE_URL) return headers

  const routeOrigin = new URL(assertSafeBaseUrl(env.SUPPORT_SMOKE_BASE_URL)).origin
  const requestOrigin = new URL(url).origin
  if (requestOrigin !== routeOrigin) return headers

  return { ...headers, [VERCEL_PROTECTION_BYPASS_HEADER]: secret }
}

async function main() {
  const args = parseArgs()
  if (args.help) {
    printHelp()
    return
  }

  const loadedKeys = loadEnvFile(args.envFile)
  assertStagingEnvironment()

  const smokeId = `smoke-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${randomUUID()}`
  const logger = createLogger(smokeId)
  logger.info(`Loaded env keys from ${args.envFile}: ${loadedKeys.length}`)
  logger.info(`Running checks: ${args.checks.join(', ')}`)

  const results = []
  for (const check of args.checks) {
    results.push(await runCheck(check, smokeId, logger))
  }

  logger.info('Smoke summary')
  for (const result of results) {
    logger.info(`${result.name}: ${result.ok ? 'PASS' : 'FAIL'}${result.detail ? ` (${result.detail})` : ''}`)
  }

  if (results.some((result) => !result.ok)) process.exitCode = 1
}

async function runCheck(check, smokeId, logger) {
  try {
    if (check === 'inngest') await smokeInngest(smokeId, logger)
    if (check === 'external') await smokeExternalBridge(smokeId, logger)
    if (check === 'r2') await smokeR2(smokeId, logger)
    if (check === 'resend') await smokeResend(smokeId, logger)
    return { name: check, ok: true }
  } catch (error) {
    return { name: check, ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

async function smokeInngest(smokeId, logger) {
  const baseUrl = assertSafeBaseUrl(process.env.SUPPORT_SMOKE_BASE_URL)
  const secret = requireEnv('SUPPORT_INNGEST_WEBHOOK_SECRET')
  const endpoint = new URL('/api/inngest', baseUrl)
  const payload = {
    name: 'support/ticket.created',
    id: `${SMOKE_PREFIX}:inngest:${smokeId}`,
    data: {
      eventId: `${SMOKE_PREFIX}:inngest:${smokeId}`,
      ticketId: '00000000-0000-0000-0000-000000000000',
    },
  }

  const missingAuth = await postJson(endpoint, payload)
  assertStatus('Inngest missing auth', missingAuth, [401])

  const invalidAuth = await postJson(endpoint, payload, { authorization: 'Bearer invalid-smoke-token' })
  assertStatus('Inngest invalid auth', invalidAuth, [401])

  const validAuth = await postJson(endpoint, payload, { authorization: `Bearer ${secret}` })
  assertStatus('Inngest signed auth', validAuth, [202])
  assertResponseField(validAuth.body, 'accepted', true, 'Inngest accepted flag')

  logger.info(`Inngest endpoint accepted signed ID-only event and rejected missing/invalid auth at ${endpoint.origin}`)
}

async function smokeExternalBridge(smokeId, logger) {
  const baseUrl = assertSafeBaseUrl(process.env.SUPPORT_SMOKE_BASE_URL)
  const token = requireEnv('SUPPORT_EXTERNAL_BRIDGE_TOKEN')
  const ticketId = requireEnv('SUPPORT_SMOKE_TICKET_ID')
  assertUuid(ticketId, 'SUPPORT_SMOKE_TICKET_ID')

  const endpoint = new URL('/api/support/external/inbound', baseUrl)
  const invalidAuthPayload = buildExternalBridgePayload({ action: 'public_reply', ticketId, smokeId })
  const invalidAuth = await postJson(endpoint, invalidAuthPayload, { authorization: 'Bearer invalid-smoke-token' })
  assertStatus('External bridge invalid auth', invalidAuth, [401])

  for (const action of EXTERNAL_INBOUND_ACTIONS) {
    const payload = buildExternalBridgePayload({ action, ticketId, smokeId })
    const first = await postJson(endpoint, payload, { authorization: `Bearer ${token}` })
    assertStatus(`External bridge first ${action} delivery`, first, [200])
    assertResponseField(first.body, 'success', true, `External bridge ${action} first success flag`)
    assertResponseField(first.body, 'duplicate', false, `External bridge ${action} first duplicate flag`)

    const duplicate = await postJson(endpoint, payload, { authorization: `Bearer ${token}` })
    assertStatus(`External bridge duplicate ${action} delivery`, duplicate, [200])
    assertResponseField(duplicate.body, 'success', true, `External bridge ${action} duplicate success flag`)
    assertResponseField(duplicate.body, 'duplicate', true, `External bridge ${action} duplicate flag`)

    logger.info(`External bridge accepted staging ticket ${redact(ticketId)} for action ${action} and enforced idempotency key ${redact(payload.idempotencyKey)}`)
  }
}

export function buildExternalBridgePayload({ action, ticketId, smokeId }) {
  return {
    ticketId,
    idempotencyKey: `${SMOKE_PREFIX}:external:${action}:${smokeId}`,
    action,
    message: `Staging smoke bridge ${action} for ${smokeId}. No user evidence, attachments, diagnostics, secrets, or PII included.`,
  }
}

async function smokeR2(smokeId, logger) {
  const config = getR2Config()
  const objectKey = `${SMOKE_PREFIX}/${smokeId}/attachment.png`
  const objectBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
  const contentType = 'image/png'

  const putUrl = createR2SignedUrl({ method: 'PUT', key: objectKey, expiresInSeconds: 60, config })
  const getUrl = createR2SignedUrl({ method: 'GET', key: objectKey, expiresInSeconds: 60, config })
  const deleteUrl = createR2SignedUrl({ method: 'DELETE', key: objectKey, expiresInSeconds: 60, config })

  try {
    const put = await fetchWithTimeout(putUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: objectBytes })
    assertHttpOk('R2 PUT', put, [200, 201])

    const get = await fetchWithTimeout(getUrl)
    assertHttpOk('R2 GET', get, [200])
    const downloaded = Buffer.from(await get.arrayBuffer())
    if (!downloaded.equals(objectBytes)) throw new Error('R2 GET content mismatch')
  } finally {
    const cleanup = await fetchWithTimeout(deleteUrl, { method: 'DELETE' })
    assertHttpOk('R2 DELETE cleanup', cleanup, [200, 204])
  }

  logger.info(`R2 put/get/delete passed in bucket ${SUPPORT_R2_BUCKET} with key prefix ${SMOKE_PREFIX}/[redacted]`)
}

async function smokeResend(smokeId, logger) {
  const apiKey = requireEnv('RESEND_API_KEY')
  const to = requireEnv('SUPPORT_SMOKE_EMAIL_TO')
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'team@connect.yosoyglobal.org'
  const fromName = process.env.RESEND_FROM_NAME || 'GlobalConnect'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ? assertSafeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL) : assertSafeBaseUrl(process.env.SUPPORT_SMOKE_BASE_URL)
  const idempotencyKey = `${SMOKE_PREFIX}:resend:${smokeId}`

  const response = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject: `[Staging smoke] Support notification ${smokeId}`,
      html: renderSmokeEmail({ smokeId, siteUrl }),
      text: `Staging smoke support notification ${smokeId}. Contains no evidence, attachments, diagnostics, secrets, or user PII.`,
    }),
  })

  assertHttpOk('Resend delivery', response, [200])
  logger.info(`Resend accepted staging-safe email to ${redact(to)} with idempotency key ${redact(idempotencyKey)}`)
}

function renderSmokeEmail({ smokeId, siteUrl }) {
  return `<!doctype html><html><body><h1>GlobalConnect support staging smoke</h1><p>Smoke ID: ${escapeHtml(smokeId)}</p><p>This staging-only message verifies delivery wiring and intentionally excludes evidence, attachments, diagnostics, secrets, object keys, and user PII.</p><p>Support link shape: <a href="${escapeHtml(siteUrl)}/ayuda/tickets/smoke">authenticated support ticket link</a></p></body></html>`
}

function assertNoPublicSecrets(env) {
  const publicSecretKeys = Object.keys(env).filter((key) => key.startsWith('NEXT_PUBLIC_') && /(SECRET|SERVICE|TOKEN|PRIVATE|PASSWORD)/i.test(key))
  if (publicSecretKeys.length) {
    throw new Error(`Refusing smoke run: public secret-looking env keys detected: ${publicSecretKeys.join(', ')}`)
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function getR2Config() {
  const accountId = requireEnv('R2_ACCOUNT_ID')
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY')
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: SUPPORT_R2_BUCKET,
  }
}

function createR2SignedUrl({ method, key, expiresInSeconds, config }) {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const amzDate = `${date}T${now.toISOString().slice(11, 19).replace(/:/g, '')}Z`
  const host = `${config.bucket}.${config.accountId}.r2.cloudflarestorage.com`
  const credential = `${config.accessKeyId}/${date}/auto/s3/aws4_request`
  const signedHeaders = 'host'
  const path = `/${encodeURIComponent(key).replace(/%2F/g, '/')}`
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  })
  const canonicalRequest = [method, path, params.toString(), `host:${host}\n`, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, `${date}/auto/s3/aws4_request`, sha256(canonicalRequest)].join('\n')
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, date), 'auto'), 's3'), 'aws4_request')
  params.set('X-Amz-Signature', hmac(signingKey, stringToSign).toString('hex'))
  return `https://${host}${path}?${params.toString()}`
}

async function postJson(url, body, headers = {}) {
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: withRouteProtectionBypass(url, { 'content-type': 'application/json', ...headers }),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await readResponseBody(response) }
}

async function readResponseBody(response) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return null
  return response.json()
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function assertStatus(name, response, allowedStatuses) {
  if (!allowedStatuses.includes(response.status)) {
    throw new Error(`${name} expected ${allowedStatuses.join('/')} but got ${response.status}`)
  }
}

function assertHttpOk(name, response, allowedStatuses) {
  if (!allowedStatuses.includes(response.status)) {
    throw new Error(`${name} expected ${allowedStatuses.join('/')} but got ${response.status}`)
  }
}

function assertResponseField(body, key, expected, name) {
  if (!body || body[key] !== expected) {
    throw new Error(`${name} expected ${String(expected)}`)
  }
}

function assertUuid(value, name) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be a UUID from staging support data.`)
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest()
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
}

function createLogger(smokeId) {
  return {
    info(message) {
      console.log(`[support-smoke:${smokeId}] ${message}`)
    },
  }
}

function printHelp() {
  console.log(`Usage: pnpm support:smoke:staging [--all|--only=inngest,external,r2,resend] [--env-file=.env.staging.local]

Required guard:
  RLS_ENV=staging

Route checks require:
  SUPPORT_SMOKE_BASE_URL=<staging or localhost origin>

External bridge requires:
  SUPPORT_SMOKE_TICKET_ID=<safe staging support ticket UUID>

Resend requires:
  SUPPORT_SMOKE_EMAIL_TO=<safe staging recipient>
`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

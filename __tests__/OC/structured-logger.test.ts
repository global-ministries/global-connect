/**
 * S19 — Structured logger tests.
 *
 * Verifies:
 *   - Each log function emits the correct event name
 *   - Output is valid JSON with timestamp, level, event
 *   - No third-party SDKs are used (pure console.log)
 */

import { logClaim, logRelease, logRetry, logTerminal, logSend, logRead, logExpire } from '@/lib/platform/operating-core/notifications/structured-logger'

// Capture console.log calls
let consoleLogCalls: unknown[][] = []
const originalConsoleLog = console.log

beforeEach(() => {
  consoleLogCalls = []
  console.log = (...args: unknown[]) => {
    consoleLogCalls.push(args)
  }
})

afterEach(() => {
  console.log = originalConsoleLog
})

function parseLogCall(index: number): Record<string, unknown> | null {
  const args = consoleLogCalls[index]
  if (!args || args.length === 0) return null
  try {
    return JSON.parse(args[0] as string) as Record<string, unknown>
  } catch {
    return null
  }
}

// ─── logClaim ────────────────────────────────────────────────────────────────

describe('logClaim', () => {
  it('should emit event=claim, level=info', () => {
    logClaim({ outbox_id: 'outbox-1', attempt: 1 })
    const entry = parseLogCall(0)
    expect(entry).not.toBeNull()
    expect(entry!['event']).toBe('claim')
    expect(entry!['level']).toBe('info')
    expect(entry!['timestamp']).toBeTruthy()
    expect(entry!['outbox_id']).toBe('outbox-1')
    expect(entry!['attempt']).toBe(1)
  })

  it('should include arbitrary extra fields', () => {
    logClaim({ outbox_id: 'outbox-1', status: 'processing', extraData: 'test' })
    const entry = parseLogCall(0)
    expect(entry!['extraData']).toBe('test')
  })
})

// ─── logRelease ──────────────────────────────────────────────────────────────

describe('logRelease', () => {
  it('should emit event=release, level=info', () => {
    logRelease({ outbox_id: 'outbox-1' })
    const entry = parseLogCall(0)
    expect(entry).not.toBeNull()
    expect(entry!['event']).toBe('release')
    expect(entry!['level']).toBe('info')
    expect(entry!['timestamp']).toBeTruthy()
  })
})

// ─── logRetry ────────────────────────────────────────────────────────────────

describe('logRetry', () => {
  it('should emit event=retry, level=warn', () => {
    logRetry({ outbox_id: 'outbox-1', attempt: 2, error: 'timeout' })
    const entry = parseLogCall(0)
    expect(entry).not.toBeNull()
    expect(entry!['event']).toBe('retry')
    expect(entry!['level']).toBe('warn')
    expect(entry!['error']).toBe('timeout')
  })
})

// ─── logTerminal ─────────────────────────────────────────────────────────────

describe('logTerminal', () => {
  it('should emit event=terminal, level=error', () => {
    logTerminal({ outbox_id: 'outbox-1', status: 'failed' })
    const entry = parseLogCall(0)
    expect(entry).not.toBeNull()
    expect(entry!['event']).toBe('terminal')
    expect(entry!['level']).toBe('error')
    expect(entry!['status']).toBe('failed')
  })
})

// ─── logSend ─────────────────────────────────────────────────────────────────

describe('logSend', () => {
  it('should emit event=send, level=info', () => {
    logSend({ outbox_id: 'outbox-1' })
    const entry = parseLogCall(0)
    expect(entry).not.toBeNull()
    expect(entry!['event']).toBe('send')
    expect(entry!['level']).toBe('info')
  })
})

// ─── logRead ─────────────────────────────────────────────────────────────────

describe('logRead', () => {
  it('should emit event=read, level=info', () => {
    logRead({ system_notification_id: 'notif-1' })
    const entry = parseLogCall(0)
    expect(entry).not.toBeNull()
    expect(entry!['event']).toBe('read')
    expect(entry!['level']).toBe('info')
    expect(entry!['system_notification_id']).toBe('notif-1')
  })
})

// ─── logExpire ───────────────────────────────────────────────────────────────

describe('logExpire', () => {
  it('should emit event=expire, level=warn', () => {
    logExpire({ system_notification_id: 'notif-1' })
    const entry = parseLogCall(0)
    expect(entry).not.toBeNull()
    expect(entry!['event']).toBe('expire')
    expect(entry!['level']).toBe('warn')
  })
})

// ─── JSON format ──────────────────────────────────────────────────────────────

describe('JSON format', () => {
  it('should output exactly one JSON object per log call', () => {
    logClaim({ outbox_id: 'outbox-1' })
    expect(consoleLogCalls).toHaveLength(1)
    expect(consoleLogCalls[0]).toHaveLength(1)
    expect(typeof consoleLogCalls[0]![0]).toBe('string')
  })

  it('should include all required fields in every log entry', () => {
    logTerminal({ outbox_id: 'outbox-1' })
    const entry = parseLogCall(0)
    expect(entry).not.toBeNull()
    expect(entry!['timestamp']).toBeTruthy()
    expect(entry!['level']).toBeTruthy()
    expect(entry!['event']).toBeTruthy()
    // Verify timestamp is ISO format
    expect(new Date(entry!['timestamp'] as string).toISOString()).toBe(entry!['timestamp'])
  })
})

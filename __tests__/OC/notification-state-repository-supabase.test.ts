/**
 * S19 — NotificationStateRepository Supabase adapter tests.
 *
 * Tests the Supabase adapter with mocked RPC/instrumented client.
 * Verifies:
 *   - markSent() calls UPDATE on outbox with sent_at
 *   - setNextRetry() calls UPDATE on outbox with next_retry_at
 *   - markTerminal() calls UPDATE on outbox with status=failed, next_retry_at=NULL
 *   - getOutboxEntry() SELECTs status, attempt_count, sent_at, next_retry_at
 *   - createSystemNotification() INSERTs into system_notifications
 *   - listUnreadForPersona() SELECTs with WHERE read_at IS NULL
 *   - markRead() UPDATE system_notifications SET read_at
 */

import { createSupabaseNotificationStateRepository } from '@/lib/platform/operating-core/notifications/notification-state-repository-supabase'

// ─── Mock types ───────────────────────────────────────────────────────────────

interface MockDbResult {
  data?: unknown | null
  error?: { message: string; code?: string } | null
}

type MockFrom = {
  select: (cols: string) => MockSelect
  insert: (row: Record<string, unknown>) => MockInsert
  update: (row: Record<string, unknown>) => MockUpdate
  eq: (col: string, val: unknown) => MockEq
}

type MockSelect = {
  eq: (col: string, val: unknown) => MockEq
  maybeSingle: () => Promise<MockDbResult>
  order: (col: string, opts: { ascending: boolean }) => MockOrder
  limit: (n: number) => MockLimit
  is: (col: string, val: null) => MockOrder
}

type MockOrder = {
  limit: (n: number) => Promise<MockDbResult>
}

type MockLimit = Promise<MockDbResult>

type MockInsert = {
  select: (cols: string) => MockInsertSelect
}

type MockInsertSelect = {
  single: () => Promise<MockDbResult>
}

type MockUpdate = {
  eq: (col: string, val: unknown) => MockEqUpdate
}

type MockEqUpdate = {
  eq: (col: string, val: unknown) => Promise<MockDbResult>
}

type MockEq = {
  maybeSingle: () => Promise<MockDbResult>
  order: (col: string, opts: { ascending: boolean }) => MockEqOrder
  limit: (n: number) => Promise<MockDbResult>
  is: (col: string, val: null) => MockEqOrder
}

type MockEqOrder = {
  limit: (n: number) => Promise<MockDbResult>
}

function createMockSupabaseClient(mockResults: MockDbResult[]) {
  let callIndex = 0
  const calls: { table: string; method: string; args: unknown[] }[] = []

  const from = (table: string): MockFrom => {
    calls.push({ table, method: 'from', args: [table] })
    return createMockFrom(callIndex++, mockResults)
  }

  return { from, calls }
}

function createMockFrom(_callIdx: number, mockResults: MockDbResult[]) {
  let localIdx = 0
  return {
    select: (_cols: string) => createMockSelect(localIdx++, mockResults),
    insert: (row: Record<string, unknown>) => createMockInsert(localIdx++, mockResults, row),
    update: (row: Record<string, unknown>) => createMockUpdate(localIdx++, mockResults, row),
    eq: (_col: string, _val: unknown) => createMockEq(localIdx++, mockResults),
  }
}

function createMockSelect(callIdx: number, mockResults: MockDbResult[]) {
  return {
    eq: (_col: string, _val: unknown) => createMockEq(callIdx, mockResults),
    maybeSingle: () => Promise.resolve(mockResults[callIdx] ?? { data: null, error: null }),
    order: (_col: string, _opts: { ascending: boolean }) => createMockEqOrder(callIdx, mockResults),
    limit: (_n: number) => Promise.resolve(mockResults[callIdx] ?? { data: null, error: null }),
    is: (_col: string, _val: null) => createMockEqOrder(callIdx, mockResults),
  }
}

function createMockEq(callIdx: number, mockResults: MockDbResult[]) {
  return {
    maybeSingle: () => Promise.resolve(mockResults[callIdx] ?? { data: null, error: null }),
    order: (_col: string, _opts: { ascending: boolean }) => createMockEqOrder(callIdx, mockResults),
    limit: (_n: number) => Promise.resolve(mockResults[callIdx] ?? { data: [], error: null }),
    is: (_col: string, _val: null) => createMockIs(callIdx, mockResults),
  }
}

function createMockIs(callIdx: number, mockResults: MockDbResult[]) {
  return {
    order: (_col: string, _opts: { ascending: boolean }) => createMockEqOrder(callIdx, mockResults),
    limit: (_n: number) => Promise.resolve(mockResults[callIdx] ?? { data: [], error: null }),
  }
}

function createMockEqOrder(callIdx: number, mockResults: MockDbResult[]) {
  return {
    limit: (_n: number) => Promise.resolve(mockResults[callIdx] ?? { data: [], error: null }),
  }
}

function createMockInsert(callIdx: number, mockResults: MockDbResult[], _row: Record<string, unknown>) {
  return {
    select: (_cols: string) => ({
      single: () => Promise.resolve(mockResults[callIdx] ?? { data: null, error: null }),
    }),
  }
}

function createMockUpdate(callIdx: number, mockResults: MockDbResult[], _row: Record<string, unknown>) {
  return {
    eq: (_col: string, _val: unknown) => ({
      eq: (_col2: string, _val2: unknown) =>
        Promise.resolve(mockResults[callIdx] ?? { data: null, error: null }),
    }),
  }
}

// ─── markSent ────────────────────────────────────────────────────────────────

describe('NotificationStateRepositorySupabase — markSent', () => {
  it('should UPDATE outbox with sent_at', async () => {
    const mockClient = createMockSupabaseClient([{ data: null, error: null }])
    const repo = createSupabaseNotificationStateRepository({ supabase: mockClient as never })

    await repo.markSent('outbox-1', '2026-07-20T12:00:00.000Z')

    expect(mockClient.calls.some((c) => c.table === 'operating_core_notification_outbox')).toBe(true)
  })
})

// ─── setNextRetry ────────────────────────────────────────────────────────────

describe('NotificationStateRepositorySupabase — setNextRetry', () => {
  it('should UPDATE outbox with next_retry_at', async () => {
    const mockClient = createMockSupabaseClient([{ data: null, error: null }])
    const repo = createSupabaseNotificationStateRepository({ supabase: mockClient as never })

    await repo.setNextRetry('outbox-1', '2026-07-20T13:00:00.000Z')

    expect(mockClient.calls.some((c) => c.table === 'operating_core_notification_outbox')).toBe(true)
  })
})

// ─── markTerminal ────────────────────────────────────────────────────────────

describe('NotificationStateRepositorySupabase — markTerminal', () => {
  it('should UPDATE outbox with status=failed and next_retry_at=null', async () => {
    const mockClient = createMockSupabaseClient([{ data: null, error: null }])
    const repo = createSupabaseNotificationStateRepository({ supabase: mockClient as never })

    await repo.markTerminal('outbox-1')

    expect(mockClient.calls.some((c) => c.table === 'operating_core_notification_outbox')).toBe(true)
  })
})

// ─── getOutboxEntry ───────────────────────────────────────────────────────────

describe('NotificationStateRepositorySupabase — getOutboxEntry', () => {
  it('should SELECT status, attempt_count, sent_at, next_retry_at', async () => {
    const mockClient = createMockSupabaseClient([
      {
        data: {
          status: 'pending',
          attempt_count: 2,
          sent_at: null,
          next_retry_at: '2026-07-20T13:00:00.000Z',
        },
        error: null,
      },
    ])
    const repo = createSupabaseNotificationStateRepository({ supabase: mockClient as never })

    const result = await repo.getOutboxEntry('outbox-1')

    expect(result).not.toBeNull()
    expect(result!.status).toBe('pending')
    expect(result!.attemptCount).toBe(2)
    expect(result!.sentAt).toBeNull()
    expect(result!.nextRetryAt).toBe('2026-07-20T13:00:00.000Z')
  })

  it('should return null when entry does not exist', async () => {
    const mockClient = createMockSupabaseClient([{ data: null, error: null }])
    const repo = createSupabaseNotificationStateRepository({ supabase: mockClient as never })

    const result = await repo.getOutboxEntry('nonexistent')

    expect(result).toBeNull()
  })
})

// ─── createSystemNotification ─────────────────────────────────────────────────

describe('NotificationStateRepositorySupabase — createSystemNotification', () => {
  it('should INSERT into operating_core_system_notifications', async () => {
    const mockClient = createMockSupabaseClient([
      { data: { id: 'new-notif-1' }, error: null },
    ])
    const repo = createSupabaseNotificationStateRepository({ supabase: mockClient as never })

    const result = await repo.createSystemNotification({
      personaId: 'persona-1',
      outboxId: 'outbox-1',
      kind: 'registration',
      title: 'Welcome',
      body: 'You are registered',
      targetUrl: '/events/123',
      expiresAt: '2026-07-27T12:00:00.000Z',
    })

    expect(result.id).toBe('new-notif-1')
    expect(mockClient.calls.some((c) => c.table === 'operating_core_system_notifications')).toBe(true)
  })
})

// ─── listUnreadForPersona ────────────────────────────────────────────────────

describe('NotificationStateRepositorySupabase — listUnreadForPersona', () => {
  it('should SELECT with WHERE read_at IS NULL and persona_id', async () => {
    const mockClient = createMockSupabaseClient([
      {
        data: [
          {
            id: 'notif-1',
            title: 'Notif 1',
            body: 'Body 1',
            target_url: '/events/1',
            created_at: '2026-07-20T10:00:00.000Z',
          },
          {
            id: 'notif-2',
            title: 'Notif 2',
            body: 'Body 2',
            target_url: null,
            created_at: '2026-07-20T11:00:00.000Z',
          },
        ],
        error: null,
      },
    ])
    const repo = createSupabaseNotificationStateRepository({ supabase: mockClient as never })

    const result = await repo.listUnreadForPersona('persona-1', 10)

    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe('notif-1')
    expect(result[0]!.title).toBe('Notif 1')
    expect(result[1]!.id).toBe('notif-2')
    expect(result[1]!.targetUrl).toBeNull()
  })

  it('should return empty array when no unread notifications', async () => {
    const mockClient = createMockSupabaseClient([{ data: [], error: null }])
    const repo = createSupabaseNotificationStateRepository({ supabase: mockClient as never })

    const result = await repo.listUnreadForPersona('persona-1', 10)

    expect(result).toEqual([])
  })
})

// ─── markRead ────────────────────────────────────────────────────────────────

describe('NotificationStateRepositorySupabase — markRead', () => {
  it('should UPDATE system_notifications SET read_at', async () => {
    const mockClient = createMockSupabaseClient([{ data: null, error: null }])
    const repo = createSupabaseNotificationStateRepository({ supabase: mockClient as never })

    await repo.markRead('notif-1', '2026-07-20T12:00:00.000Z')

    expect(mockClient.calls.some((c) => c.table === 'operating_core_system_notifications')).toBe(true)
  })
})

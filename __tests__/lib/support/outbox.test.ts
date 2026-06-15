import { drainSupportEventOutbox, enqueueSupportEventOutbox } from '@/lib/support/outbox'

describe('support event outbox', () => {
  it('enqueues support events with event_key idempotency', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null })
    const supabase = { rpc: jest.fn(), from: jest.fn().mockReturnValue({ upsert }) }

    await expect(enqueueSupportEventOutbox(supabase, {
      ticketId: 'ticket-1',
      eventType: 'support/ticket.created',
      eventKey: 'support:event-1',
      payload: { eventId: 'event-1', ticketId: 'ticket-1' },
    })).resolves.toEqual({ success: true })

    expect(supabase.from).toHaveBeenCalledWith('support_event_outbox')
    expect(upsert).toHaveBeenCalledWith(
      {
        ticket_id: 'ticket-1',
        event_type: 'support/ticket.created',
        event_key: 'support:event-1',
        payload: { eventId: 'event-1', ticketId: 'ticket-1' },
      },
      { onConflict: 'event_key', ignoreDuplicates: true },
    )
  })

  it('treats duplicate event_key errors as idempotent success', async () => {
    const supabase = {
      rpc: jest.fn(),
      from: jest.fn().mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } }) }),
    }

    await expect(enqueueSupportEventOutbox(supabase, {
      ticketId: 'ticket-1',
      eventType: 'support/ticket.created',
      eventKey: 'support:event-1',
      payload: {},
    })).resolves.toEqual({ success: true })
  })

  it('drains claimed allowed events and marks successful dispatches', async () => {
    const update = jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) }))
    const supabase = {
      rpc: jest.fn().mockResolvedValue({
        data: [claimedRow({ event_type: 'support/ticket.created' })],
        error: null,
      }),
      from: jest.fn().mockReturnValue({ update }),
    }
    const dispatch = jest.fn().mockResolvedValue({ success: true })

    await expect(drainSupportEventOutbox(supabase, { dispatch })).resolves.toEqual({
      success: true,
      claimed: 1,
      dispatched: 1,
      failed: 0,
    })

    expect(supabase.rpc).toHaveBeenCalledWith('claim_support_event_outbox_batch', { p_limit: 10 })
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      id: 'support:event-1',
      name: 'support/ticket.created',
      data: expect.objectContaining({ eventId: 'event-1', ticketId: 'ticket-1' }),
    }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'dispatched', last_error: null, locked_at: null }))
  })

  it('increments attempts and schedules retry when dispatch fails', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null })
    const update = jest.fn(() => ({ eq }))
    const supabase = {
      rpc: jest.fn().mockResolvedValue({ data: [claimedRow({ attempts: 2 })], error: null }),
      from: jest.fn().mockReturnValue({ update }),
    }
    const now = new Date('2026-06-15T09:00:00.000Z')
    const dispatch = jest.fn().mockResolvedValue({ success: false, status: 503 })

    await expect(drainSupportEventOutbox(supabase, { now, dispatch })).resolves.toEqual({
      success: true,
      claimed: 1,
      dispatched: 0,
      failed: 1,
    })

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending',
      attempts: 3,
      last_error: 'Support event dispatch failed with status 503',
      available_at: '2026-06-15T09:00:08.000Z',
      locked_at: null,
    }))
    expect(eq).toHaveBeenCalledWith('id', 'outbox-1')
  })

  it('marks unsupported event types failed with a safe last_error', async () => {
    const update = jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) }))
    const supabase = {
      rpc: jest.fn().mockResolvedValue({ data: [claimedRow({ event_type: 'support/attachment.finalized' })], error: null }),
      from: jest.fn().mockReturnValue({ update }),
    }
    const dispatch = jest.fn()

    await expect(drainSupportEventOutbox(supabase, { now: new Date('2026-06-15T09:00:00.000Z'), dispatch })).resolves.toEqual({
      success: true,
      claimed: 1,
      dispatched: 0,
      failed: 1,
    })

    expect(dispatch).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      attempts: 1,
      last_error: 'Unsupported support outbox event type: support/attachment.finalized',
      locked_at: null,
    }))
    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({
      available_at: expect.any(String),
    }))
  })
})

function claimedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox-1',
    ticket_id: 'ticket-1',
    event_type: 'support/ticket.created',
    event_key: 'support:event-1',
    payload: { eventId: 'event-1', ticketId: 'ticket-1', actorUserId: 'user-1' },
    attempts: 0,
    ...overrides,
  }
}

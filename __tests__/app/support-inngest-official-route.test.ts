import { serve } from 'inngest/next'

import { GET, POST, PUT } from '@/app/api/inngest/official/route'
import { inngest } from '@/lib/support/inngest-client'
import { supportInngestFunctions } from '@/lib/support/inngest-functions'

jest.mock('inngest/next', () => ({
  serve: jest.fn(() => ({
    GET: jest.fn(),
    POST: jest.fn(),
    PUT: jest.fn(),
  })),
}))

describe('official support Inngest route', () => {
  it('wires the official Inngest route to the support function registry', () => {
    expect(serve).toHaveBeenCalledWith({ client: inngest, functions: supportInngestFunctions })
    expect(GET).toEqual(expect.any(Function))
    expect(POST).toEqual(expect.any(Function))
    expect(PUT).toEqual(expect.any(Function))
  })
})

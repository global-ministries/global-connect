/**
 * @jest-environment node
 *
 * /activar/[token] swaps the emailed token for an HttpOnly cookie and
 * redirects to the token-free /activar, so the token never stays in a URL
 * that analytics or error reporting record.
 */

import { NextRequest } from 'next/server'

import { GET } from '@/app/activar/[token]/route'

const TOKEN = 'Ab_-'.repeat(10) + 'xyz'

async function abrir(token: string) {
  const request = new NextRequest(`https://connect.example.org/activar/${token}`)
  return GET(request, { params: Promise.resolve({ token }) })
}

describe('GET /activar/[token]', () => {
  it('stores the token in a short-lived HttpOnly cookie and redirects without it', async () => {
    const response = await abrir(TOKEN)

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://connect.example.org/activar')
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`gc_activar=${TOKEN}`)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Path=\/activar/i)
    expect(cookie).toMatch(/Max-Age=1800/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('redirects a malformed token without setting a cookie', async () => {
    const response = await abrir('nope')
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://connect.example.org/activar')
    expect(response.headers.get('set-cookie') ?? '').not.toContain('gc_activar=nope')
  })
})

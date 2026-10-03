/**
 * @jest-environment node
 *
 * Public contract of GET /api/public/verificar-certificado/[codigo]:
 * same validation, same non-sensitive projection, and the same uniform 404
 * for malformed, unknown, revoked, or failed lookups (no enumeration oracle).
 */

import type { NextRequest } from 'next/server'
import { GET } from '@/app/api/public/verificar-certificado/[codigo]/route'

const createClientMock = jest.fn()
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: () => Promise.resolve(body),
    }),
  },
}))

const VALID_CODE = 'abcdefghijkmnpqr'
const NOT_FOUND_BODY = { valid: false, reason: 'not-found' }

type QueryResult = { data: Record<string, unknown> | null; error: { message: string } | null }

function queueQuery(result: QueryResult) {
  const maybeSingle = jest.fn().mockResolvedValue(result)
  const eq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq }))
  createClientMock.mockReturnValue({ from: jest.fn(() => ({ select })) })
}

function callRoute(codigo: string) {
  return GET({} as NextRequest, { params: Promise.resolve({ codigo }) })
}

const ORIGINAL_ENV = process.env

beforeEach(() => {
  createClientMock.mockReset()
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  }
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('GET /api/public/verificar-certificado/[codigo]', () => {
  it('returns 200 with only the non-sensitive fields of a valid certificate', async () => {
    queueQuery({
      data: {
        id: 'cert-1',
        codigo_verificacion: VALID_CODE,
        taller_id: 'taller-1',
        persona_id: 'persona-1',
        nombre_taller_snapshot: 'Finanzas con Propósito',
        nombre_participante_snapshot: 'Ana Pérez',
        nombre_pareja_snapshot: 'Luis Gómez',
        fecha_completitud: '2026-05-01',
        firmantes_snapshot: ['Pastor Juan', 'Pastora María'],
      },
      error: null,
    })

    const response = await callRoute(VALID_CODE)

    expect(response.status).toBe(200)
    // T2c (odd/tasks/talleres-cierre-de-edicion.md) — same contract plus
    // partner_name (null on an individual certificate).
    await expect(response.json()).resolves.toEqual({
      valid: true,
      taller_title: 'Finanzas con Propósito',
      participant_name: 'Ana Pérez',
      partner_name: 'Luis Gómez',
      completion_date: '2026-05-01',
      signers: ['Pastor Juan', 'Pastora María'],
    })
  })

  it('returns the uniform 404 for a malformed code without querying', async () => {
    const response = await callRoute('not-a-code')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual(NOT_FOUND_BODY)
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('returns the uniform 404 for an unknown or revoked certificate', async () => {
    queueQuery({ data: null, error: null })

    const response = await callRoute(VALID_CODE)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual(NOT_FOUND_BODY)
  })

  it('returns the uniform 404 when the lookup fails', async () => {
    queueQuery({ data: null, error: { message: 'boom' } })

    const response = await callRoute(VALID_CODE)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual(NOT_FOUND_BODY)
  })
})

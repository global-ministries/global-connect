/**
 * @jest-environment node
 *
 * N6b (odd/tasks/ninos-v2.md, S10) — print queue helpers: the agent's
 * Bearer token, its sha256, the bodies of the agent and reprint routes, the
 * desk station of a check-in and the best-effort enqueue.
 */
import { createHash } from 'node:crypto'

import {
  ERRORES_IMPRESION,
  encolarEtiquetas,
  errorImpresion,
  estacionDeCheckin,
  hashToken,
  hashesIguales,
  maxTrabajos,
  parseReimpresion,
  parseReporte,
  respuestaAgente,
  tokenDeAutorizacion,
} from '@/lib/platform/ninos/impresion'

const TOKEN = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef'
const E1 = '11111111-1111-4111-8111-111111111111'
const T1 = '33333333-3333-4333-8333-333333333333'
const N1 = '44444444-4444-4444-8444-444444444444'
const J1 = '55555555-5555-4555-8555-555555555555'

describe('tokenDeAutorizacion', () => {
  it('reads a Bearer token of 64 hex chars', () => {
    expect(tokenDeAutorizacion(`Bearer ${TOKEN}`)).toBe(TOKEN)
    expect(tokenDeAutorizacion(`bearer   ${TOKEN}  `)).toBe(TOKEN)
  })

  it('is null for anything else', () => {
    expect(tokenDeAutorizacion(null)).toBeNull()
    expect(tokenDeAutorizacion('')).toBeNull()
    expect(tokenDeAutorizacion(TOKEN)).toBeNull()
    expect(tokenDeAutorizacion(`Basic ${TOKEN}`)).toBeNull()
    expect(tokenDeAutorizacion(`Bearer ${TOKEN.slice(1)}`)).toBeNull()
    expect(tokenDeAutorizacion(`Bearer ${TOKEN.toUpperCase()}`)).toBeNull()
    expect(tokenDeAutorizacion(`Bearer ${TOKEN}x`)).toBeNull()
  })
})

describe('hashToken', () => {
  it('is the sha256 hex of the token, as the database stores it', () => {
    expect(hashToken(TOKEN)).toBe(createHash('sha256').update(TOKEN, 'utf8').digest('hex'))
    expect(hashToken(TOKEN)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(TOKEN)).not.toBe(TOKEN)
  })
})

describe('hashesIguales', () => {
  it('compares two hex hashes', () => {
    const h = hashToken(TOKEN)
    expect(hashesIguales(h, h)).toBe(true)
    expect(hashesIguales(h, hashToken('b'.repeat(64)))).toBe(false)
  })

  it('is false for a different length or a non-string', () => {
    const h = hashToken(TOKEN)
    expect(hashesIguales(h, h.slice(2))).toBe(false)
    expect(hashesIguales(h, null)).toBe(false)
    expect(hashesIguales(h, 42)).toBe(false)
  })
})

describe('maxTrabajos', () => {
  it('defaults to 10 and stays within 1–20', () => {
    expect(maxTrabajos(null)).toBe(10)
    expect(maxTrabajos('x')).toBe(10)
    expect(maxTrabajos('5')).toBe(5)
    expect(maxTrabajos('0')).toBe(1)
    expect(maxTrabajos('500')).toBe(20)
  })
})

describe('parseReporte', () => {
  it('reads a printed or failed job', () => {
    expect(parseReporte({ id: J1, estado: 'impresa' })).toEqual({ id: J1, estado: 'impresa', error: null })
    expect(parseReporte({ id: J1, estado: 'error', error: '  sin papel ' })).toEqual({ id: J1, estado: 'error', error: 'sin papel' })
  })

  it('caps the error text at 300 characters', () => {
    expect(parseReporte({ id: J1, estado: 'error', error: 'x'.repeat(400) })?.error).toHaveLength(300)
  })

  it('is null for a malformed body', () => {
    expect(parseReporte(null)).toBeNull()
    expect(parseReporte({ id: 'nope', estado: 'impresa' })).toBeNull()
    expect(parseReporte({ id: J1, estado: 'pendiente' })).toBeNull()
    expect(parseReporte({ id: J1, estado: 'error', error: 5 })).toBeNull()
  })
})

describe('parseReimpresion', () => {
  const base = { estacionId: E1, turnoId: T1, fecha: '2026-11-08', codigo: '4821' }

  it('reads the three kinds', () => {
    expect(parseReimpresion({ ...base, tipo: 'todas' })).toEqual({ ...base, tipo: 'todas', ninoId: null })
    expect(parseReimpresion({ ...base, tipo: 'representante' })).toEqual({ ...base, tipo: 'representante', ninoId: null })
    expect(parseReimpresion({ ...base, tipo: 'nino', ninoId: N1 })).toEqual({ ...base, tipo: 'nino', ninoId: N1 })
  })

  it('a child reprint needs the child, the others do not take one', () => {
    expect(parseReimpresion({ ...base, tipo: 'nino' })).toBeNull()
    expect(parseReimpresion({ ...base, tipo: 'todas', ninoId: N1 })).toBeNull()
  })

  it('is null for a malformed body', () => {
    expect(parseReimpresion({ ...base, tipo: 'otra' })).toBeNull()
    expect(parseReimpresion({ ...base, tipo: 'todas', codigo: '12' })).toBeNull()
    expect(parseReimpresion({ ...base, tipo: 'todas', estacionId: 'x' })).toBeNull()
    expect(parseReimpresion({ ...base, tipo: 'todas', fecha: 'hoy' })).toBeNull()
    expect(parseReimpresion('x')).toBeNull()
  })
})

describe('estacionDeCheckin', () => {
  it('reads an optional station id from the check-in body', () => {
    expect(estacionDeCheckin({ estacionId: E1 })).toBe(E1)
    expect(estacionDeCheckin({})).toBeNull()
    expect(estacionDeCheckin({ estacionId: 'x' })).toBeNull()
    expect(estacionDeCheckin(null)).toBeNull()
  })
})

describe('respuestaAgente', () => {
  it('sends the label size and the jobs, never the token hash', () => {
    const estacion = { id: E1, campus_id: 'c', nombre: 'Mesa', ancho_mm: 50, alto_mm: 30, dpi: 203, activa: true, token_hash: 'f'.repeat(64) }
    const trabajos = [{ id: J1, tipo: 'nino', payload: { nombre: 'Sofía' }, intentos: 1, created_at: '2026-11-08T13:00:00Z' }]
    expect(respuestaAgente(estacion, trabajos)).toEqual({
      estacion: { id: E1, nombre: 'Mesa', ancho_mm: 50, alto_mm: 30, dpi: 203 },
      trabajos,
    })
    expect(JSON.stringify(respuestaAgente(estacion, null))).not.toContain('f'.repeat(64))
    expect(respuestaAgente(estacion, null).trabajos).toEqual([])
  })

  it('keeps an unknown label size as null', () => {
    const r = respuestaAgente({ id: E1, nombre: 'Mesa', ancho_mm: null, alto_mm: null, dpi: 203 }, [])
    expect(r.estacion).toEqual({ id: E1, nombre: 'Mesa', ancho_mm: null, alto_mm: null, dpi: 203 })
  })
})

describe('errorImpresion', () => {
  it('passes the fixed codes of the RPCs, never another message', () => {
    for (const m of ERRORES_IMPRESION) expect(errorImpresion({ code: '22023', message: m })).toEqual({ code: '22023', message: m })
    expect(errorImpresion({ code: '22023', message: 'room ZZ of Sofía' })).toEqual({ code: '22023' })
  })
})

describe('encolarEtiquetas', () => {
  const entrada = { estacionId: E1, turnoId: T1, fecha: '2026-11-08', ninoIds: [N1] }

  it('calls ninos_impresion_encolar with the service and the children', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { ninos: 1, representantes: 1 }, error: null })
    await encolarEtiquetas(rpc, entrada)
    expect(rpc).toHaveBeenCalledWith('ninos_impresion_encolar', {
      p_estacion_id: E1, p_turno_id: T1, p_fecha: '2026-11-08', p_nino_ids: [N1],
    })
  })

  it('never throws: an RPC error or a rejection is logged with the code only', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(encolarEtiquetas(jest.fn().mockResolvedValue({ data: null, error: { code: '22023', message: 'Sofía' } }), entrada)).resolves.toBeUndefined()
    await expect(encolarEtiquetas(jest.fn().mockRejectedValue(new Error('down Sofía')), entrada)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(log.mock.calls)).not.toContain('Sofía')
    expect(JSON.stringify(log.mock.calls)).toContain('22023')
    log.mockRestore()
  })
})

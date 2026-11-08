/**
 * T2e (odd/tasks/ninos-checkin-pco.md, S9.2): custody restrictions — the rows
 * of the RPCs, the alert text, one alert per person, the form checks and the
 * calls (20261108170000_ninos_custodia.sql).
 */
import {
  agruparPorNino,
  avisosPorPersona,
  cargarCustodiaDe,
  cargarCustodiaFicha,
  mensajeErrorCustodia,
  parseCustodiaDe,
  parseCustodiaFicha,
  rpcGuardarRestriccion,
  textoNoEntregar,
  validarRestriccion,
} from '@/lib/platform/ninos/custodia'

const N1 = '11111111-1111-4111-8111-111111111111'
const N2 = '22222222-2222-4222-8222-222222222222'
const R1 = '33333333-3333-4333-8333-333333333333'

const filaDe = (over: Record<string, unknown> = {}) => ({
  nino_id: N1, persona_nombre: 'Carlos Pérez', relacion: 'Papá', respaldo: 'orden judicial del 3/5/2026', notas: 'Llamar a coordinación.', ...over,
})

describe('parseCustodiaDe / agruparPorNino', () => {
  it('reads the rows and groups them by child', () => {
    const filas = parseCustodiaDe([filaDe(), filaDe({ nino_id: N2, relacion: null, notas: '' }), filaDe({ persona_nombre: 'Ana Gil' })])
    expect(filas[1]).toEqual({ ninoId: N2, persona: 'Carlos Pérez', relacion: null, respaldo: 'orden judicial del 3/5/2026', notas: null })
    const por = agruparPorNino(filas)
    expect(por[N1].map((r) => r.persona)).toEqual(['Carlos Pérez', 'Ana Gil'])
    expect(por[N2]).toHaveLength(1)
  })

  it('skips malformed rows and non-arrays', () => {
    expect(parseCustodiaDe(null)).toEqual([])
    expect(parseCustodiaDe({})).toEqual([])
    expect(parseCustodiaDe([null, 'x', filaDe({ persona_nombre: ' ' }), filaDe({ respaldo: null }), filaDe({ nino_id: 1 })])).toEqual([])
  })
})

describe('parseCustodiaFicha', () => {
  it('reads active and inactive restrictions', () => {
    expect(
      parseCustodiaFicha([
        { id: R1, persona_nombre: 'Carlos Pérez', relacion: null, respaldo: 'Orden', notas: null, activa: false, updated_at: '2026-11-08T12:00:00Z' },
      ]),
    ).toEqual([{ id: R1, persona: 'Carlos Pérez', relacion: null, respaldo: 'Orden', notas: null, activa: false, actualizadaAt: '2026-11-08T12:00:00Z' }])
    expect(parseCustodiaFicha([{ id: R1, persona_nombre: 'X', respaldo: 'Y' }])[0].activa).toBe(true)
    expect(parseCustodiaFicha([{ persona_nombre: 'X', respaldo: 'Y' }, 3])).toEqual([])
  })
})

describe('textoNoEntregar', () => {
  it('names the person and the backing', () => {
    expect(textoNoEntregar({ persona: 'Carlos Pérez', respaldo: 'orden judicial' })).toBe('No entregar a Carlos Pérez — orden judicial')
  })
})

describe('avisosPorPersona', () => {
  it('one alert per person (same name with other case or accents) listing the children it covers', () => {
    const por = agruparPorNino(parseCustodiaDe([filaDe(), filaDe({ nino_id: N2, persona_nombre: 'carlos  PEREZ' }), filaDe({ nino_id: N2, persona_nombre: 'Ana Gil' })]))
    const avisos = avisosPorPersona(por, [N1, N2])
    expect(avisos.map((a) => [a.persona, a.ninoIds])).toEqual([
      ['Carlos Pérez', [N1, N2]],
      ['Ana Gil', [N2]],
    ])
    expect(avisos[0].notas).toBe('Llamar a coordinación.')
  })

  it('only the children asked for', () => {
    const por = agruparPorNino(parseCustodiaDe([filaDe()]))
    expect(avisosPorPersona(por, [N2])).toEqual([])
  })
})

describe('validarRestriccion (the RPC sentences)', () => {
  const ok = { persona: 'Carlos Pérez', relacion: '', respaldo: 'Orden judicial', notas: '' }
  it('accepts a person and a backing', () => {
    expect(validarRestriccion(ok)).toBeNull()
  })
  it('names the first problem', () => {
    expect(validarRestriccion({ ...ok, persona: '  ' })).toBe('Escribe el nombre de la persona que no puede retirar (hasta 200 caracteres).')
    expect(validarRestriccion({ ...ok, persona: 'a'.repeat(201) })).toBe('Escribe el nombre de la persona que no puede retirar (hasta 200 caracteres).')
    expect(validarRestriccion({ ...ok, respaldo: '' })).toBe(
      'Indica el respaldo de la restricción (por ejemplo, la orden judicial), hasta 300 caracteres.',
    )
    expect(validarRestriccion({ ...ok, respaldo: 'a'.repeat(301) })).toBe(
      'Indica el respaldo de la restricción (por ejemplo, la orden judicial), hasta 300 caracteres.',
    )
    expect(validarRestriccion({ ...ok, relacion: 'a'.repeat(61) })).toBe('La relación admite hasta 60 caracteres.')
    expect(validarRestriccion({ ...ok, notas: 'a'.repeat(501) })).toBe('El protocolo admite hasta 500 caracteres.')
  })
})

describe('mensajeErrorCustodia', () => {
  it('the HINT as is, else a known code, else a generic sentence', () => {
    expect(mensajeErrorCustodia({ message: 'sin_autoridad', hint: 'Solo coordinación.' })).toBe('Solo coordinación.')
    expect(mensajeErrorCustodia({ message: 'restriccion_duplicada' })).toBe('Esta persona ya tiene una restricción activa para este niño.')
    expect(mensajeErrorCustodia({ message: 'x' })).toBe('No se pudo guardar la restricción. Intenta de nuevo.')
    expect(mensajeErrorCustodia(null)).toBe('No se pudo guardar la restricción. Intenta de nuevo.')
  })
})

describe('RPC calls', () => {
  const cliente = (respuesta: { data?: unknown; error?: unknown }) => {
    const rpc = jest.fn().mockResolvedValue({ data: respuesta.data ?? null, error: respuesta.error ?? null })
    return { rpc }
  }

  it('cargarCustodiaDe asks once per child and groups the rows', async () => {
    const c = cliente({ data: [filaDe()] })
    const por = await cargarCustodiaDe(c, [N1, N1, N2])
    expect(c.rpc).toHaveBeenCalledWith('ninos_custodia_de', { p_nino_ids: [N1, N2] })
    expect(por[N1][0].persona).toBe('Carlos Pérez')
  })

  it('cargarCustodiaDe without children or on error is empty (and asks nothing without children)', async () => {
    const vacio = cliente({ data: [] })
    expect(await cargarCustodiaDe(vacio, [])).toEqual({})
    expect(vacio.rpc).not.toHaveBeenCalled()
    expect(await cargarCustodiaDe(cliente({ error: { code: '42501', message: 'sin_autoridad' } }), [N1])).toEqual({})
  })

  it('cargarCustodiaFicha returns the rows or the HINT', async () => {
    const c = cliente({ data: [{ id: R1, persona_nombre: 'X', respaldo: 'Y', activa: true }] })
    expect(await cargarCustodiaFicha(c, N1)).toEqual({
      ok: true,
      data: [{ id: R1, persona: 'X', relacion: null, respaldo: 'Y', notas: null, activa: true, actualizadaAt: null }],
    })
    expect(c.rpc).toHaveBeenCalledWith('ninos_custodia_lista', { p_nino_id: N1 })
    expect(await cargarCustodiaFicha(cliente({ error: { code: '42501', message: 'sin_autoridad', hint: 'Solo coordinación.' } }), N1)).toEqual({
      ok: false,
      message: 'Solo coordinación.',
    })
  })

  it('rpcGuardarRestriccion sends every argument (empty relación and notas as null) and returns the id', async () => {
    const c = cliente({ data: R1 })
    const r = await rpcGuardarRestriccion(c, { id: null, ninoId: N1, persona: 'Carlos Pérez', relacion: ' ', respaldo: 'Orden', notas: '', activa: true })
    expect(r).toEqual({ ok: true, data: R1 })
    expect(c.rpc).toHaveBeenCalledWith('ninos_custodia_guardar', {
      p_id: null, p_nino_id: N1, p_persona_nombre: 'Carlos Pérez', p_relacion: null, p_respaldo: 'Orden', p_notas: null, p_activa: true,
    })
  })

  it('rpcGuardarRestriccion returns the HINT of a refusal', async () => {
    const c = cliente({ error: { code: '23505', message: 'restriccion_duplicada', hint: 'Esta persona ya tiene una restricción activa para este niño.' } })
    expect(await rpcGuardarRestriccion(c, { id: R1, ninoId: N1, persona: 'X', relacion: '', respaldo: 'Y', notas: '', activa: false })).toEqual({
      ok: false,
      message: 'Esta persona ya tiene una restricción activa para este niño.',
    })
  })
})

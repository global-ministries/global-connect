/**
 * Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md P2) —
 * the client-safe contract of the three member RPCs behind Explorar:
 * typed parsers for their answers, the p_pareja builder, the server-side
 * validation of what the browser sends, and one neutral Spanish message
 * per code.
 */

import {
  CODIGOS_ELEVADOS,
  CODIGOS_INSCRIBIRME,
  MENSAJES_PAREJA,
  parejaParaRpc,
  parseBusquedaPareja,
  parseConyugeRegistrado,
  parseResultadoInscribirme,
  traducirErrorRpcPareja,
  validarPareja,
} from '@/lib/platform/talleres/inscripcion-pareja'

const VOSEO = /tenés|podés|vos\b|creá|elegí|revisá|pedile|probá|buscá/i

describe('parseResultadoInscribirme', () => {
  it('parses a success with its inscripcion id and pareja origen', () => {
    expect(
      parseResultadoInscribirme({
        ok: true,
        inscripcion_id: 'insc-1',
        estado: 'pendiente',
        pareja_origen: 'cedula',
      }),
    ).toEqual({ ok: true, inscripcionId: 'insc-1', parejaOrigen: 'cedula' })
  })

  it('parses an individual success (pareja_origen null)', () => {
    expect(
      parseResultadoInscribirme({ ok: true, inscripcion_id: 'insc-2', estado: 'pendiente', pareja_origen: null }),
    ).toEqual({ ok: true, inscripcionId: 'insc-2', parejaOrigen: null })
  })

  it.each(CODIGOS_INSCRIBIRME)('parses the returned failure %s', (codigo) => {
    expect(parseResultadoInscribirme({ ok: false, codigo })).toEqual({ ok: false, codigo })
  })

  it.each([
    ['a non-object', 'ok'],
    ['null', null],
    ['an unknown codigo', { ok: false, codigo: 'ALGO_NUEVO' }],
    ['a success without inscripcion_id', { ok: true, estado: 'pendiente' }],
    ['a success with an empty inscripcion_id', { ok: true, inscripcion_id: '' }],
    ['a missing ok flag', { inscripcion_id: 'insc-3' }],
  ])('returns null for %s', (_caso, raw) => {
    expect(parseResultadoInscribirme(raw)).toBeNull()
  })

  it('degrades an unknown pareja_origen to null instead of rejecting the success', () => {
    expect(
      parseResultadoInscribirme({ ok: true, inscripcion_id: 'insc-4', pareja_origen: 'ficha_nueva' }),
    ).toEqual({ ok: true, inscripcionId: 'insc-4', parejaOrigen: null })
  })
})

describe('parseBusquedaPareja', () => {
  it('parses a found partner with the masked name', () => {
    expect(parseBusquedaPareja({ ok: true, encontrada: true, nombre_mostrado: 'María G.' })).toEqual({
      ok: true,
      encontrada: true,
      nombreMostrado: 'María G.',
    })
  })

  it('parses a not-found result', () => {
    expect(parseBusquedaPareja({ ok: true, encontrada: false })).toEqual({ ok: true, encontrada: false })
  })

  it.each(['LIMITE_ALCANZADO', 'EDICION_NOT_FOUND'] as const)('parses the returned failure %s', (codigo) => {
    expect(parseBusquedaPareja({ ok: false, codigo })).toEqual({ ok: false, codigo })
  })

  it.each([
    ['a found partner without nombre_mostrado', { ok: true, encontrada: true }],
    ['a found partner with a blank nombre_mostrado', { ok: true, encontrada: true, nombre_mostrado: '  ' }],
    ['a missing encontrada flag', { ok: true }],
    ['an inscribirme-only codigo', { ok: false, codigo: 'CUPO_LLENO' }],
    ['a non-object', 42],
  ])('returns null for %s', (_caso, raw) => {
    expect(parseBusquedaPareja(raw)).toBeNull()
  })
})

describe('parseConyugeRegistrado', () => {
  it('parses exactly one row into nombre, apellido and foto', () => {
    expect(
      parseConyugeRegistrado([{ nombre: 'Ana', apellido: 'García', foto_perfil_url: 'https://x/ana.jpg' }]),
    ).toEqual({ nombre: 'Ana', apellido: 'García', fotoUrl: 'https://x/ana.jpg' })
  })

  it('turns a missing or blank photo into null', () => {
    expect(parseConyugeRegistrado([{ nombre: 'Ana', apellido: 'García', foto_perfil_url: null }])).toEqual({
      nombre: 'Ana',
      apellido: 'García',
      fotoUrl: null,
    })
    expect(parseConyugeRegistrado([{ nombre: 'Ana', apellido: 'García', foto_perfil_url: '' }])?.fotoUrl).toBeNull()
  })

  it.each([
    ['no rows', []],
    ['two rows (fail closed)', [
      { nombre: 'Ana', apellido: 'García', foto_perfil_url: null },
      { nombre: 'Eva', apellido: 'Pérez', foto_perfil_url: null },
    ]],
    ['a row without nombre', [{ apellido: 'García', foto_perfil_url: null }]],
    ['a non-array', { nombre: 'Ana', apellido: 'García' }],
    ['null', null],
  ])('returns null for %s', (_caso, raw) => {
    expect(parseConyugeRegistrado(raw)).toBeNull()
  })
})

describe('parejaParaRpc', () => {
  it('sends null for an individual edición', () => {
    expect(parejaParaRpc(null)).toBeNull()
  })

  it('builds the registered-spouse mode, with the vínculo only when the member chose it', () => {
    expect(parejaParaRpc({ modo: 'conyuge_registrado' })).toEqual({ modo: 'conyuge_registrado' })
    expect(parejaParaRpc({ modo: 'conyuge_registrado', vinculo: 'matrimonio' })).toEqual({
      modo: 'conyuge_registrado',
      vinculo: 'matrimonio',
    })
  })

  it('builds the cédula mode and flags a dismissed registered spouse', () => {
    expect(parejaParaRpc({ modo: 'cedula', cedula: '12345678' })).toEqual({ modo: 'cedula', cedula: '12345678' })
    expect(
      parejaParaRpc({ modo: 'cedula', cedula: '12345678', vinculo: 'novios', conyugeDescartado: true }),
    ).toEqual({ modo: 'cedula', cedula: '12345678', vinculo: 'novios', conyuge_descartado: true })
  })

  it('never sends conyuge_descartado: false', () => {
    expect(parejaParaRpc({ modo: 'cedula', cedula: '12345678', conyugeDescartado: false })).toEqual({
      modo: 'cedula',
      cedula: '12345678',
    })
  })
})

describe('validarPareja', () => {
  it('accepts a missing pareja as an individual enrollment', () => {
    expect(validarPareja(undefined)).toEqual({ ok: true, pareja: null })
    expect(validarPareja(null)).toEqual({ ok: true, pareja: null })
  })

  it('accepts the registered-spouse mode with an optional vínculo', () => {
    expect(validarPareja({ modo: 'conyuge_registrado', vinculo: 'matrimonio' })).toEqual({
      ok: true,
      pareja: { modo: 'conyuge_registrado', vinculo: 'matrimonio' },
    })
  })

  it('normalizes the cédula the member typed', () => {
    expect(validarPareja({ modo: 'cedula', cedula: ' V-12.345.678 ', conyugeDescartado: true })).toEqual({
      ok: true,
      pareja: { modo: 'cedula', cedula: '12345678', conyugeDescartado: true },
    })
  })

  it('rejects an unrecognizable cédula with CEDULA_INVALIDA before any RPC', () => {
    expect(validarPareja({ modo: 'cedula', cedula: '12-ab' })).toEqual({ ok: false, error: 'CEDULA_INVALIDA' })
    expect(validarPareja({ modo: 'cedula', cedula: '   ' })).toEqual({ ok: false, error: 'CEDULA_INVALIDA' })
  })

  it.each([
    ['an unknown modo', { modo: 'ficha_nueva', cedula: '12345678' }],
    ['a non-object', 'conyuge_registrado'],
    ['an invalid vínculo', { modo: 'conyuge_registrado', vinculo: 'amigos' }],
    ['a non-boolean conyugeDescartado', { modo: 'cedula', cedula: '12345678', conyugeDescartado: 'si' }],
  ])('rejects %s as invalid-input', (_caso, raw) => {
    expect(validarPareja(raw)).toEqual({ ok: false, error: 'invalid-input' })
  })
})

describe('traducirErrorRpcPareja', () => {
  it.each(CODIGOS_ELEVADOS)('maps the raised %s to its own message', (codigo) => {
    expect(traducirErrorRpcPareja({ code: '22023', message: codigo }, 'fallback')).toEqual({
      error: codigo,
      message: MENSAJES_PAREJA[codigo],
    })
  })

  it('maps 42501 SIN_FICHA to its own code, not a bare forbidden', () => {
    expect(traducirErrorRpcPareja({ code: '42501', message: 'SIN_FICHA' }, 'fallback').error).toBe('SIN_FICHA')
  })

  it('maps a bare 42501 (e.g. permission denied for function) to forbidden', () => {
    expect(
      traducirErrorRpcPareja({ code: '42501', message: 'permission denied for function talleres_inscribirme' }, 'x'),
    ).toEqual({ error: 'forbidden', message: expect.any(String) })
  })

  it('collapses anything else to internal with the given fallback, never the raw text', () => {
    expect(traducirErrorRpcPareja({ code: 'XX000', message: 'boom at line 42' }, 'No se pudo.')).toEqual({
      error: 'internal',
      message: 'No se pudo.',
    })
  })
})

describe('MENSAJES_PAREJA', () => {
  it('has a non-empty neutral-Spanish message for every returned and raised code', () => {
    for (const codigo of [...CODIGOS_INSCRIBIRME, ...CODIGOS_ELEVADOS]) {
      const mensaje = MENSAJES_PAREJA[codigo]
      expect(mensaje.length).toBeGreaterThan(0)
      expect(mensaje).not.toMatch(VOSEO)
    }
  })

  it('keeps the partner-not-confirmed and throttle replies neutral', () => {
    expect(MENSAJES_PAREJA.PAREJA_NO_CONFIRMADA).toBe(
      'No pudimos confirmar a tu pareja con esos datos. Revisa la cédula o pide ayuda a la coordinación del taller.',
    )
    expect(MENSAJES_PAREJA.LIMITE_ALCANZADO).toBe(
      'Hiciste demasiadas búsquedas hoy. Prueba mañana o pide ayuda a la coordinación.',
    )
  })

  it('says inscriptions are closed for EDICION_NO_ABIERTA', () => {
    expect(MENSAJES_PAREJA.EDICION_NO_ABIERTA).toMatch(/inscripciones.*cerradas/i)
  })
})

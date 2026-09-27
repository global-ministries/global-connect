/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — coverage for the
 * two additions traducirErrorTalleres needed for the taller-screen
 * mutations: a generic 42501 (RLS denial) fallback for tables written
 * directly through RLS (no RAISE text of their own, so no existing MAPA
 * key ever matched them before this), and the P0001
 * NO_ES_SERVIDOR_ACTIVO_DEL_TALLER trigger message (T1, migration
 * 20260926150000_talleres_plantillas_del_taller.sql).
 *
 * Every pre-existing branch (message-substring matches, the `!error`
 * case, the default 500) is exercised elsewhere already; this file only
 * adds the new branches.
 */

import { traducirErrorTalleres } from '@/lib/platform/talleres/errores-api'

describe('traducirErrorTalleres — new T3 branches', () => {
  it('maps a bare 42501 RLS denial (no matching RAISE text) to 403 forbidden', () => {
    const result = traducirErrorTalleres({
      code: '42501',
      message: 'new row violates row-level security policy for table "taller_plantilla_grupos"',
    })
    expect(result.status).toBe(403)
    expect(result.error).toBe('forbidden')
  })

  it('still prefers a specific message match over the generic 42501 fallback', () => {
    const result = traducirErrorTalleres({
      code: '42501',
      message: 'sin_permisos_para_este_grupo',
    })
    expect(result.message).toBe('No tenés permisos para este grupo.')
  })

  it('maps P0001 NO_ES_SERVIDOR_ACTIVO_DEL_TALLER to a friendly Spanish message', () => {
    const result = traducirErrorTalleres({
      code: 'P0001',
      message: 'NO_ES_SERVIDOR_ACTIVO_DEL_TALLER',
    })
    expect(result.status).toBe(409)
    expect(result.error).toBe('conflict')
    expect(result.message).toMatch(/servidor activo/i)
  })

  it('maps a 23505 unique violation to 409 conflict', () => {
    const result = traducirErrorTalleres({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "taller_plantilla_facilitadores_plantilla_grupo_id_persona_id_key"',
    })
    expect(result.status).toBe(409)
    expect(result.error).toBe('conflict')
  })
})

// T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
// talleres_crear_edicion's own P0001 codes, translated to neutral Spanish
// (no voseo).
describe('traducirErrorTalleres — talleres_crear_edicion branches', () => {
  it.each([
    ['TEMPORADA_REQUERIDA', 'invalid-input'],
    ['FECHA_REQUERIDA', 'invalid-input'],
    ['EDICION_YA_EXISTE', 'conflict'],
    ['ADELANTAR_MAXIMO_6', 'invalid-input'],
    ['SIN_INTERVALO', 'conflict'],
    ['TEMPORADA_NO_PERMITIDA', 'invalid-input'],
    ['ADELANTAR_INVALIDO', 'invalid-input'],
    ['TEMPORADA_NOT_FOUND', 'not-found'],
  ] as const)('maps P0001/P0002 %s to error %s with a neutral Spanish message', (code, expectedError) => {
    const result = traducirErrorTalleres({ code: 'P0001', message: code })
    expect(result.error).toBe(expectedError)
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.message).not.toMatch(/tenés|podés|vos\b|creá|elegí/i)
  })

  it('maps sin_permisos_para_este_taller (42501) to 403 forbidden, distinct from sin_permisos_para_este_grupo', () => {
    const result = traducirErrorTalleres({ code: '42501', message: 'sin_permisos_para_este_taller' })
    expect(result.status).toBe(403)
    expect(result.error).toBe('forbidden')
    expect(result.message).toMatch(/taller/i)
    expect(result.message).not.toMatch(/grupo/i)
  })
})

// T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — talleres_crear_
// temporada/talleres_agregar_taller_a_temporada/talleres_quitar_taller_de_
// temporada's own P0001/P0002 codes, all translated to neutral Spanish (no
// voseo) — the temporadas actions (actions.ts) route every RPC error
// through this same table instead of surfacing the raw RAISE text.
describe('traducirErrorTalleres — temporadas por dirección branches (T5)', () => {
  it.each([
    ['EQUIPO_NOT_FOUND', 'not-found'],
    ['EQUIPO_INACTIVE', 'conflict'],
    ['EQUIPO_WRONG_EXPERIENCE', 'invalid-input'],
    ['NOMBRE_REQUERIDO', 'invalid-input'],
    ['FECHAS_REQUERIDAS', 'invalid-input'],
    ['FECHA_CIERRE_ANTES_DE_APERTURA', 'invalid-input'],
    ['SLUG_TOO_SHORT', 'invalid-input'],
    ['TALLER_NOT_FOUND', 'not-found'],
    ['TALLER_NO_ES_POR_TEMPORADA', 'invalid-input'],
    ['TALLER_FUERA_DE_LA_DIRECCION', 'invalid-input'],
    ['EDICION_NOT_FOUND', 'not-found'],
    ['EDICION_CON_INSCRITOS', 'conflict'],
  ] as const)('maps P0001/P0002 %s to error %s with a neutral Spanish message', (code, expectedError) => {
    // A real RAISE carries the raw value appended for some of these
    // (e.g. "EQUIPO_NOT_FOUND: <uuid>") — the substring match must still
    // hit the right MAPA key regardless.
    const result = traducirErrorTalleres({ code: 'P0001', message: `${code}: 11111111-1111-1111-1111-111111111111` })
    expect(result.error).toBe(expectedError)
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.message).not.toMatch(/tenés|podés|vos\b|creá|elegí/i)
  })

  it('EDICION_CON_INSCRITOS carries the exact message the "Quitar" confirm dialog shows', () => {
    const result = traducirErrorTalleres({ code: 'P0001', message: 'EDICION_CON_INSCRITOS' })
    expect(result.message).toBe(
      'No se puede quitar: la edición ya tiene inscritos. Cancela la edición desde su pantalla.',
    )
  })

  it.each([
    ['sin_permisos_para_esta_direccion', /dirección/i],
    ['sin_permisos_para_esta_temporada', /temporada/i],
  ] as const)('maps %s (42501) to 403 forbidden with a neutral, specific message', (message, expected) => {
    const result = traducirErrorTalleres({ code: '42501', message })
    expect(result.status).toBe(403)
    expect(result.error).toBe('forbidden')
    expect(result.message).toMatch(expected)
    expect(result.message).not.toMatch(/tenés|podés|vos\b/i)
  })
})

// T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — cupo
// (migration 20260928130000_talleres_cupo.sql): CUPO_LLENO gets its OWN
// distinct `error` code ('cupo-lleno', not the generic 'conflict') so the
// edición page's "Inscribir persona" control can tell it apart from any
// other failure and only THEN offer the "Inscribir igual (sobre el cupo)"
// second step. YA_INSCRITO stays a plain 'conflict', same as every other
// duplicate-enrolment case.
describe('traducirErrorTalleres — cupo branches (T6)', () => {
  it('maps P0001 CUPO_LLENO to its own distinct error code, not the generic conflict', () => {
    const result = traducirErrorTalleres({ code: 'P0001', message: 'CUPO_LLENO' })
    expect(result.status).toBe(409)
    expect(result.error).toBe('cupo-lleno')
    expect(result.error).not.toBe('conflict')
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.message).not.toMatch(/tenés|podés|vos\b/i)
  })

  it('maps P0001 YA_INSCRITO to 409 conflict with a neutral Spanish message', () => {
    const result = traducirErrorTalleres({ code: 'P0001', message: 'YA_INSCRITO' })
    expect(result.status).toBe(409)
    expect(result.error).toBe('conflict')
    expect(result.message).toMatch(/ya está inscrita/i)
    expect(result.message).not.toMatch(/tenés|podés|vos\b/i)
  })

  it('talleres_inscribir_sobre_cupo reuses the existing sin_permisos_para_este_taller mapping', () => {
    // Same 42501 key talleres_crear_edicion already uses — no new entry
    // needed for this one (see errores-api.ts's own MAPA).
    const result = traducirErrorTalleres({ code: '42501', message: 'sin_permisos_para_este_taller' })
    expect(result.status).toBe(403)
    expect(result.error).toBe('forbidden')
  })
})

// T7 hardening (odd/tasks/talleres-temporadas-y-ediciones.md,
// 20260928140000_talleres_paso6_hardening.sql) — every RAISE code across
// the four paso-6 migrations (plus this hardening one) that had no MAPA
// entry of its own yet. Each must resolve to a non-fallback message: the
// generic 500 fallback (INTERNO) or a bare 42501-without-a-specific-match
// would mean the raw RAISE text or SQLSTATE leaked to the browser instead
// of a friendly, neutral-Spanish message.
describe('traducirErrorTalleres — T7 hardening: every remaining paso-6 code is mapped', () => {
  const CODIGOS_RESTANTES: ReadonlyArray<readonly [string, string, number]> = [
    ['FECHA_INICIO_REQUIRED', 'P0001', 400],
    ['TALLER_NOT_FOUND_OR_INACTIVE', 'P0002', 404],
    ['TALLER_MISSING_EQUIPO', 'P0002', 409],
    ['sin_permisos_para_esta_edicion', '42501', 403],
    ['UNAUTHENTICATED', '42501', 401],
    ['FORBIDDEN', '42501', 403],
    ['NOMBRE_EDICION_REQUIRED', '22023', 400],
    ['SESIONES_MUST_BE_POSITIVE', '22023', 400],
    ['SOBRE_CUPO_NO_AUTORIZADO', 'P0001', 403],
    ['TEMPORADA_NO_DISPONIBLE', 'P0001', 409],
    ['EDICION_NO_ABIERTA', 'P0001', 409],
    ['COMPANERO_REQUERIDO', 'P0001', 400],
    ['INVALID_REGIMEN', '22023', 400],
  ]

  it.each(CODIGOS_RESTANTES)('maps %s (%s) to a non-fallback message', (codigo, sqlstate, expectedStatus) => {
    const result = traducirErrorTalleres({ code: sqlstate, message: codigo })
    expect(result.status).toBe(expectedStatus)
    expect(result.status).not.toBe(500)
    expect(result.error).not.toBe('internal')
    expect(result.message.length).toBeGreaterThan(0)
    expect(result.message).not.toMatch(/tenés|podés|vos\b|creá|elegí/i)
  })
})

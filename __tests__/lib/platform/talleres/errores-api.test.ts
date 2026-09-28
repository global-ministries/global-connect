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

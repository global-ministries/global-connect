/**
 * «Cambiar rol» (odd/tasks/dream-team-cambiar-rol.md, T1, S1–S3): the pure
 * helpers of lib/platform/dream-team/cambiar-rol.ts — the body, the roles of
 * the dialog and the database codes in plain Spanish.
 */
import {
  MENSAJES_CAMBIO_ROL,
  NOTA_CAMBIO_ROL_MAX,
  mapCambioRolError,
  mapRolesCambiables,
  parseCambioRol,
} from '@/lib/platform/dream-team/cambiar-rol'

const ROL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('parseCambioRol', () => {
  it('accepts a rol and trims the nota (empty is null)', () => {
    expect(parseCambioRol({ rolId: ROL, nota: '  Ya lidera  ' })).toEqual({ datos: { rolId: ROL, nota: 'Ya lidera' } })
    expect(parseCambioRol({ rolId: ROL, nota: '   ' })).toEqual({ datos: { rolId: ROL, nota: null } })
    expect(parseCambioRol({ rolId: ROL })).toEqual({ datos: { rolId: ROL, nota: null } })
  })
  it('refuses a missing rol, a non-text nota and a nota too long', () => {
    expect(parseCambioRol({})).toEqual({ error: 'Elige el rol nuevo.' })
    expect(parseCambioRol(null)).toEqual({ error: 'Elige el rol nuevo.' })
    expect(parseCambioRol({ rolId: 'nope' })).toEqual({ error: 'Elige el rol nuevo.' })
    expect(parseCambioRol({ rolId: ROL, nota: 3 })).toEqual({ error: 'Nota inválida' })
    expect(parseCambioRol({ rolId: ROL, nota: 'x'.repeat(NOTA_CAMBIO_ROL_MAX + 1) })).toEqual({
      error: `La nota admite hasta ${NOTA_CAMBIO_ROL_MAX} caracteres.`,
    })
  })
})

describe('mapRolesCambiables', () => {
  it('maps the rows and drops malformed ones', () => {
    expect(
      mapRolesCambiables([
        { id: 'r-vol', label: 'Voluntario', nivel: 'voluntario', actual: true, asignable: false },
        { id: 'r-lid', label: 'Líder', nivel: 'lider', actual: false, asignable: true },
        { id: 'r-x', label: 'Raro', nivel: 'otro', actual: null, asignable: 'si' },
        { label: 'sin id' },
      ]),
    ).toEqual([
      { id: 'r-vol', label: 'Voluntario', nivel: 'voluntario', actual: true, asignable: false },
      { id: 'r-lid', label: 'Líder', nivel: 'lider', actual: false, asignable: true },
      { id: 'r-x', label: 'Raro', nivel: 'voluntario', actual: false, asignable: false },
    ])
    expect(mapRolesCambiables(null)).toEqual([])
  })
})

describe('mapCambioRolError', () => {
  it.each([
    ['42501', 'sin_autoridad', 403, 'No tienes permiso para cambiar roles en esta área.'],
    ['42501', 'rol_direccion', 403, 'Solo la dirección del área puede asignar un rol de dirección.'],
    ['42501', 'propio_servicio', 403, 'No puedes cambiar tu propio rol. Pídeselo a la dirección del área.'],
    ['22023', 'servicio_inexistente', 422, 'Este servicio ya no existe. Actualiza la página.'],
    ['22023', 'servicio_retirado', 422, 'Este servicio está retirado; no se le puede cambiar el rol.'],
    ['22023', 'rol_invalido', 422, 'Elige un rol activo de esta misma área.'],
    ['22023', 'mismo_rol', 422, 'Ese ya es su rol. Elige otro.'],
    ['22023', 'rol_duplicado', 422, 'Esta persona ya tiene ese rol en esta área.'],
  ])('%s %s → %i with plain Spanish', (code, message, status, error) => {
    expect(mapCambioRolError({ code, message })).toEqual({ status, error })
    expect(MENSAJES_CAMBIO_ROL[message as keyof typeof MENSAJES_CAMBIO_ROL]).toBe(error)
  })
  it('an unknown 42501 (e.g. no EXECUTE) is a refusal; an unknown 22023 a generic Spanish message', () => {
    expect(mapCambioRolError({ code: '42501', message: 'permission denied for function x' })).toEqual({
      status: 403,
      error: 'No tienes permiso para cambiar roles en esta área.',
    })
    expect(mapCambioRolError({ code: '22023', message: 'otra cosa' })).toEqual({
      status: 422,
      error: 'No se pudo cambiar el rol. Revisa los datos.',
    })
  })
  it('anything else is a 500 without detail', () => {
    expect(mapCambioRolError({ code: 'XX000', message: 'boom' })).toEqual({ status: 500, error: 'Error interno' })
  })
})

/**
 * @jest-environment node
 */

import { conEstadoAcceso } from '@/lib/platform/talleres/invitacion-acceso-estado'

function adminCon(resultado: { data: unknown; error: unknown }) {
  const builder: { in: jest.Mock; order: jest.Mock } = {
    in: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve(resultado)),
  }
  const from = jest.fn(() => ({ select: jest.fn(() => builder) }))
  return { admin: { from }, from, builder }
}

const FILAS = [
  { id: 'a', pareja_origen: 'ficha_nueva' },
  { id: 'b', pareja_origen: 'cedula' },
] as const

describe('conEstadoAcceso', () => {
  it('adds the latest invitation estado to the ficha_nueva rows only', async () => {
    const { admin, builder } = adminCon({
      data: [
        { inscripcion_id: 'a', estado: 'en_espera', ultimo_error: 'rate limited' },
        { inscripcion_id: 'a', estado: 'cancelada', ultimo_error: null },
      ],
      error: null,
    })
    const filas = await conEstadoAcceso(FILAS, () => admin)
    expect(builder.in).toHaveBeenCalledWith('inscripcion_id', ['a'])
    expect(filas).toEqual([
      { id: 'a', pareja_origen: 'ficha_nueva', acceso_estado: 'en_espera', acceso_ultimo_envio_fallido: true },
      { id: 'b', pareja_origen: 'cedula' },
    ])
  })

  it('does not query when no row created a ficha', async () => {
    const crear = jest.fn()
    const filas = await conEstadoAcceso([FILAS[1]], crear)
    expect(crear).not.toHaveBeenCalled()
    expect(filas).toEqual([FILAS[1]])
  })

  it('leaves the rows unchanged on any failure', async () => {
    const { admin } = adminCon({ data: null, error: { message: 'x' } })
    expect(await conEstadoAcceso(FILAS, () => admin)).toEqual(FILAS)
    expect(
      await conEstadoAcceso(FILAS, () => {
        throw new Error('missing env')
      }),
    ).toEqual(FILAS)
  })
})

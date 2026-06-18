import {
  obtenerPermisosCasaAnfitrionaUI,
  puedeMostrarRegistroCasa,
  puedeVerCasaAnfitrionaUI,
} from '@/lib/casas-anfitrionas/ui-permissions'

const authId = '11111111-1111-1111-1111-111111111111'
const casaId = '22222222-2222-2222-2222-222222222222'

describe('casas anfitrionas UI permission helpers', () => {
  it('uses backend permissions to decide whether create controls are visible on the list page', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        puede_ver: false,
        puede_crear_propia: true,
        puede_crear_para_otros: false,
        puede_aprobar: false,
        puede_editar: false,
        puede_cambiar_estado: false,
      },
      error: null,
    })

    const permissions = await obtenerPermisosCasaAnfitrionaUI({ rpc }, authId)

    expect(rpc).toHaveBeenCalledWith('obtener_permisos_casa_anfitriona', { p_auth_id: authId })
    expect(puedeMostrarRegistroCasa(permissions)).toBe(true)
  })

  it('hides create controls when the backend denies both self and delegated creation', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        puede_ver: false,
        puede_crear_propia: false,
        puede_crear_para_otros: false,
        puede_aprobar: false,
        puede_editar: false,
        puede_cambiar_estado: false,
      },
      error: null,
    })

    const permissions = await obtenerPermisosCasaAnfitrionaUI({ rpc }, authId)

    expect(puedeMostrarRegistroCasa(permissions)).toBe(false)
  })

  it('checks detail visibility with the granular visibility RPC before enriched reads', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null })

    const allowed = await puedeVerCasaAnfitrionaUI({ rpc }, authId, casaId)

    expect(rpc).toHaveBeenCalledWith('puede_ver_casa_anfitriona', { p_auth_id: authId, p_casa_id: casaId })
    expect(allowed).toBe(true)
  })

  it('normalizes detail permission flags from the backend for edit, approval, and active-state controls', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        puede_ver: true,
        puede_crear_propia: false,
        puede_crear_para_otros: false,
        puede_aprobar: true,
        puede_editar: false,
        puede_cambiar_estado: true,
      },
      error: null,
    })

    const permissions = await obtenerPermisosCasaAnfitrionaUI({ rpc }, authId, casaId)

    expect(rpc).toHaveBeenCalledWith('obtener_permisos_casa_anfitriona', { p_auth_id: authId, p_casa_id: casaId })
    expect(permissions).toMatchObject({
      puedeVer: true,
      puedeAprobar: true,
      puedeEditar: false,
      puedeCambiarEstado: true,
    })
  })

  it('denies every permission flag when the permissions RPC returns an error', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'permission lookup failed' } })

    const permissions = await obtenerPermisosCasaAnfitrionaUI({ rpc }, authId, casaId)

    expect(permissions).toEqual({
      puedeVer: false,
      puedeCrearPropia: false,
      puedeCrearParaOtros: false,
      puedeAprobar: false,
      puedeEditar: false,
      puedeCambiarEstado: false,
    })
  })

  it.each([null, [], 'invalid', true])('denies every permission flag for malformed payload %#', async (payload) => {
    const rpc = jest.fn().mockResolvedValue({ data: payload, error: null })

    const permissions = await obtenerPermisosCasaAnfitrionaUI({ rpc }, authId, casaId)

    expect(permissions).toEqual({
      puedeVer: false,
      puedeCrearPropia: false,
      puedeCrearParaOtros: false,
      puedeAprobar: false,
      puedeEditar: false,
      puedeCambiarEstado: false,
    })
  })

  it('treats non-boolean truthy permission values as denied by default', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        puede_ver: 'true',
        puede_crear_propia: 1,
        puede_crear_para_otros: 'yes',
        puede_aprobar: {},
        puede_editar: ['true'],
        puede_cambiar_estado: new Boolean(true),
      },
      error: null,
    })

    const permissions = await obtenerPermisosCasaAnfitrionaUI({ rpc }, authId, casaId)

    expect(permissions).toEqual({
      puedeVer: false,
      puedeCrearPropia: false,
      puedeCrearParaOtros: false,
      puedeAprobar: false,
      puedeEditar: false,
      puedeCambiarEstado: false,
    })
  })

  it('denies detail visibility when the visibility RPC errors or returns a non-boolean truthy value', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({ data: true, error: { message: 'visibility lookup failed' } })
      .mockResolvedValueOnce({ data: 'true', error: null })

    await expect(puedeVerCasaAnfitrionaUI({ rpc }, authId, casaId)).resolves.toBe(false)
    await expect(puedeVerCasaAnfitrionaUI({ rpc }, authId, casaId)).resolves.toBe(false)
  })
})

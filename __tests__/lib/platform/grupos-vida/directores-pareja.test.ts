import {
  asegurarEnlacesDirectorGrupo,
  idsDirectorConPareja,
  obtenerConyugeDirectorEtapa,
  quitarEnlacesDirectorGrupo,
} from '@/lib/platform/grupos-vida/directores-pareja'

const directorId = '11111111-1111-1111-1111-111111111111'
const conyugeId = '22222222-2222-2222-2222-222222222222'

function clienteRpc(respuesta: { data: unknown; error: { code?: string; message: string } | null }) {
  return { rpc: jest.fn(async () => respuesta) }
}

describe('obtenerConyugeDirectorEtapa', () => {
  it('returns the spouse id the RPC reports', async () => {
    const admin = clienteRpc({ data: conyugeId, error: null })

    await expect(obtenerConyugeDirectorEtapa(admin as never, directorId)).resolves.toBe(conyugeId)
    expect(admin.rpc).toHaveBeenCalledWith('conyuge_director_etapa_id', { p_segmento_lider_id: directorId })
  })

  it('returns null when the director has no spouse director', async () => {
    const admin = clienteRpc({ data: null, error: null })

    await expect(obtenerConyugeDirectorEtapa(admin as never, directorId)).resolves.toBeNull()
  })

  it.each(['PGRST202', '42883'])('returns null and warns once when the RPC is missing (%s)', async (code) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    await jest.isolateModulesAsync(async () => {
      const modulo = await import('@/lib/platform/grupos-vida/directores-pareja')
      const admin = clienteRpc({ data: null, error: { code, message: 'function not found' } })

      await expect(modulo.obtenerConyugeDirectorEtapa(admin as never, directorId)).resolves.toBeNull()
      await expect(modulo.obtenerConyugeDirectorEtapa(admin as never, directorId)).resolves.toBeNull()
    })
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('propagates any other error', async () => {
    const admin = clienteRpc({ data: null, error: { code: '42501', message: 'permission denied' } })

    await expect(obtenerConyugeDirectorEtapa(admin as never, directorId)).rejects.toThrow('permission denied')
  })
})

describe('idsDirectorConPareja', () => {
  it('returns only the director when there is no spouse', async () => {
    const admin = clienteRpc({ data: null, error: null })

    await expect(idsDirectorConPareja(admin as never, directorId)).resolves.toEqual([directorId])
  })

  it('returns the director and the spouse for a couple', async () => {
    const admin = clienteRpc({ data: conyugeId, error: null })

    await expect(idsDirectorConPareja(admin as never, directorId)).resolves.toEqual([directorId, conyugeId])
  })
})

/** Minimal chainable client for director_etapa_grupos. */
function clienteEnlaces() {
  const upsert = jest.fn(async (..._args: unknown[]) => ({ error: null as { code?: string; message: string } | null }))
  const deletes: Array<[string, unknown]> = []
  const borrado: Record<string, unknown> = {}
  borrado.in = jest.fn((col: string, valores: unknown) => {
    deletes.push([col, valores])
    return borrado
  })
  borrado.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
  return {
    upsert,
    deletes,
    client: {
      from: jest.fn(() => ({ upsert, delete: () => borrado })),
    },
  }
}

describe('asegurarEnlacesDirectorGrupo', () => {
  it('writes every director x group link in ONE atomic upsert that ignores duplicates', async () => {
    const db = clienteEnlaces()

    const error = await asegurarEnlacesDirectorGrupo(db.client as never, [directorId, conyugeId], ['g1', 'g2'])

    expect(error).toBeNull()
    expect(db.upsert).toHaveBeenCalledTimes(1)
    expect(db.upsert).toHaveBeenCalledWith(
      [
        { director_etapa_id: directorId, grupo_id: 'g1' },
        { director_etapa_id: directorId, grupo_id: 'g2' },
        { director_etapa_id: conyugeId, grupo_id: 'g1' },
        { director_etapa_id: conyugeId, grupo_id: 'g2' },
      ],
      { onConflict: 'director_etapa_id,grupo_id', ignoreDuplicates: true },
    )
  })

  it('writes a couple in a single call, never row by row', async () => {
    const db = clienteEnlaces()

    await asegurarEnlacesDirectorGrupo(db.client as never, [directorId, conyugeId], ['g1'])

    expect(db.upsert).toHaveBeenCalledTimes(1)
    expect((db.upsert.mock.calls[0][0] as unknown[]).length).toBe(2)
  })

  it('returns the upsert error as-is, without retrying', async () => {
    const db = clienteEnlaces()
    const fallo = { code: '42501', message: 'permission denied' }
    db.upsert.mockResolvedValueOnce({ error: fallo })

    const error = await asegurarEnlacesDirectorGrupo(db.client as never, [directorId], ['g1'])

    expect(error).toBe(fallo)
    expect(db.upsert).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there are no directors or no groups', async () => {
    const db = clienteEnlaces()

    await expect(asegurarEnlacesDirectorGrupo(db.client as never, [], ['g1'])).resolves.toBeNull()
    await expect(asegurarEnlacesDirectorGrupo(db.client as never, [directorId], [])).resolves.toBeNull()
    expect(db.upsert).not.toHaveBeenCalled()
  })
})

describe('quitarEnlacesDirectorGrupo', () => {
  it('deletes the links of the director and the spouse', async () => {
    const db = clienteEnlaces()

    const error = await quitarEnlacesDirectorGrupo(db.client as never, [directorId, conyugeId], ['g1'])

    expect(error).toBeNull()
    expect(db.deletes).toEqual([
      ['director_etapa_id', [directorId, conyugeId]],
      ['grupo_id', ['g1']],
    ])
  })
})

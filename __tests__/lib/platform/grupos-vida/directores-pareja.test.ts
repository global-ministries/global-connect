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
function clienteEnlaces(existentes: Array<{ director_etapa_id: string; grupo_id: string }>) {
  const insert = jest.fn(async () => ({ error: null }))
  const filtros: Array<[string, unknown]> = []
  const consulta: Record<string, unknown> = {}
  consulta.select = jest.fn(() => consulta)
  consulta.in = jest.fn((col: string, valores: unknown) => {
    filtros.push([col, valores])
    return consulta
  })
  consulta.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: existentes, error: null }).then(resolve)
  const deletes: Array<[string, unknown]> = []
  const borrado: Record<string, unknown> = {}
  borrado.in = jest.fn((col: string, valores: unknown) => {
    deletes.push([col, valores])
    return borrado
  })
  borrado.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
  return {
    insert,
    deletes,
    filtros,
    client: {
      from: jest.fn(() => ({ ...consulta, insert, delete: () => borrado })),
    },
  }
}

describe('asegurarEnlacesDirectorGrupo', () => {
  it('inserts only the links that do not exist yet', async () => {
    const db = clienteEnlaces([{ director_etapa_id: directorId, grupo_id: 'g1' }])

    const error = await asegurarEnlacesDirectorGrupo(db.client as never, [directorId, conyugeId], ['g1', 'g2'])

    expect(error).toBeNull()
    expect(db.insert).toHaveBeenCalledWith([
      { director_etapa_id: directorId, grupo_id: 'g2' },
      { director_etapa_id: conyugeId, grupo_id: 'g1' },
      { director_etapa_id: conyugeId, grupo_id: 'g2' },
    ])
  })

  it('does not insert anything when every link exists', async () => {
    const db = clienteEnlaces([{ director_etapa_id: directorId, grupo_id: 'g1' }])

    await asegurarEnlacesDirectorGrupo(db.client as never, [directorId], ['g1'])

    expect(db.insert).not.toHaveBeenCalled()
  })

  it('treats a unique violation (23505) as success and keeps the rows that were not created', async () => {
    const db = clienteEnlaces([])
    db.insert
      .mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } } as never)
      .mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } } as never)
      .mockResolvedValueOnce({ error: null } as never)

    const error = await asegurarEnlacesDirectorGrupo(db.client as never, [directorId, conyugeId], ['g1'])

    expect(error).toBeNull()
    expect(db.insert).toHaveBeenCalledTimes(3)
    expect(db.insert).toHaveBeenNthCalledWith(2, { director_etapa_id: directorId, grupo_id: 'g1' })
    expect(db.insert).toHaveBeenNthCalledWith(3, { director_etapa_id: conyugeId, grupo_id: 'g1' })
  })

  it('returns any other insert error', async () => {
    const db = clienteEnlaces([])
    const fallo = { code: '42501', message: 'permission denied' }
    db.insert.mockResolvedValueOnce({ error: fallo } as never)

    const error = await asegurarEnlacesDirectorGrupo(db.client as never, [directorId], ['g1'])

    expect(error).toBe(fallo)
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  it('returns a non-unique error raised while retrying row by row', async () => {
    const db = clienteEnlaces([])
    const fallo = { code: '23503', message: 'foreign key' }
    db.insert
      .mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } } as never)
      .mockResolvedValueOnce({ error: fallo } as never)

    const error = await asegurarEnlacesDirectorGrupo(db.client as never, [directorId, conyugeId], ['g1'])

    expect(error).toBe(fallo)
  })
})

describe('quitarEnlacesDirectorGrupo', () => {
  it('deletes the links of the director and the spouse', async () => {
    const db = clienteEnlaces([])

    const error = await quitarEnlacesDirectorGrupo(db.client as never, [directorId, conyugeId], ['g1'])

    expect(error).toBeNull()
    expect(db.deletes).toEqual([
      ['director_etapa_id', [directorId, conyugeId]],
      ['grupo_id', ['g1']],
    ])
  })
})

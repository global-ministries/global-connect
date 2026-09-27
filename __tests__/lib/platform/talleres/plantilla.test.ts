/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — loaders for the
 * taller's own plantilla: taller_plantilla_clases and
 * taller_plantilla_grupos (embedding taller_plantilla_facilitadores and
 * its usuarios nombre/apellido). Both tables are world-readable
 * (taller_plantilla_*_select, USING true) — these loaders return EVERY
 * row (active and inactive), never filtering `activo`, so the UI can
 * still show and reactivate a deactivated clase/grupo.
 *
 * Best-effort, same contract as loadCatalogoTalleres: a query error
 * degrades to an empty array rather than throwing.
 */

import {
  loadPlantillaClases,
  loadPlantillaGrupos,
  previewFacilitadoresOmitidos,
  type PlantillaClase,
  type PlantillaGrupo,
} from '@/lib/platform/talleres/plantilla'

function clasesClient(response: { data: unknown; error: unknown | null }) {
  const order = jest.fn().mockResolvedValue(response)
  const eq = jest.fn().mockReturnValue({ order })
  const select = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ select })
  // loadPlantillaClases never calls .rpc — present only to satisfy
  // PlantillaQueryClient's shape (shared with loadPlantillaGrupos).
  const rpc = jest.fn().mockResolvedValue({ data: [], error: null })
  return { from, select, eq, order, rpc }
}

describe('loadPlantillaClases', () => {
  it('maps every row, ordered by numero, active and inactive alike', async () => {
    const client = clasesClient({
      data: [
        { id: 'c-1', numero: 1, tema: 'Sígueme', activo: true },
        { id: 'c-2', numero: 2, tema: 'Intimidad con Dios', activo: true },
        { id: 'c-3', numero: 3, tema: 'Compañerismo', activo: false },
      ],
      error: null,
    })

    const result = await loadPlantillaClases(client, 't-1')

    expect(client.from).toHaveBeenCalledWith('taller_plantilla_clases')
    expect(client.eq).toHaveBeenCalledWith('taller_id', 't-1')
    expect(client.order).toHaveBeenCalledWith('numero', { ascending: true })
    expect(result).toEqual<readonly PlantillaClase[]>([
      { id: 'c-1', numero: 1, tema: 'Sígueme', activo: true },
      { id: 'c-2', numero: 2, tema: 'Intimidad con Dios', activo: true },
      { id: 'c-3', numero: 3, tema: 'Compañerismo', activo: false },
    ])
  })

  it('degrades to an empty array on a query error', async () => {
    const client = clasesClient({ data: null, error: { message: 'boom' } })
    const result = await loadPlantillaClases(client, 't-1')
    expect(result).toEqual([])
  })
})

function gruposClient(
  response: { data: unknown; error: unknown | null },
  rpcResponse: { data: unknown; error: unknown | null } = { data: [], error: null },
) {
  const order = jest.fn().mockResolvedValue(response)
  const eq = jest.fn().mockReturnValue({ order })
  const select = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ select })
  const rpc = jest.fn().mockResolvedValue(rpcResponse)
  return { from, select, eq, order, rpc }
}

// post-T7 fix (2026-09-27) — loadPlantillaGrupos no longer embeds
// `usuarios ( nombre, apellido )` on top of taller_plantilla_facilitadores
// (usuarios' own RLS, a Grupos de Vida concept, silently hid every
// facilitador's name from a talleres director — the real preview showed
// "Persona sin nombre" for all of them). Names now resolve through
// talleres_plantilla_facilitadores_personas(p_taller_id) and are merged
// in by (plantilla_grupo_id, persona_id).
describe('loadPlantillaGrupos', () => {
  it('maps grupos with facilitadores, resolving names via talleres_plantilla_facilitadores_personas', async () => {
    const client = gruposClient(
      {
        data: [
          {
            id: 'g-1',
            nombre: 'Grupo Alfa',
            orden: 1,
            capacidad: 12,
            activo: true,
            facilitadores: [
              { id: 'f-1', persona_id: 'p-1', rol: 'lider' },
              { id: 'f-2', persona_id: 'p-2', rol: 'voluntario' },
            ],
          },
        ],
        error: null,
      },
      {
        data: [{ plantilla_grupo_id: 'g-1', persona_id: 'p-1', rol: 'lider', nombre: 'Ana', apellido: 'Gómez' }],
        error: null,
      },
    )

    const result = await loadPlantillaGrupos(client, 't-1')

    expect(client.from).toHaveBeenCalledWith('taller_plantilla_grupos')
    expect(client.eq).toHaveBeenCalledWith('taller_id', 't-1')
    expect(client.order).toHaveBeenCalledWith('orden', { ascending: true })
    expect(client.rpc).toHaveBeenCalledWith('talleres_plantilla_facilitadores_personas', { p_taller_id: 't-1' })
    expect(result).toEqual<readonly PlantillaGrupo[]>([
      {
        id: 'g-1',
        nombre: 'Grupo Alfa',
        orden: 1,
        capacidad: 12,
        activo: true,
        facilitadores: [
          { id: 'f-1', personaId: 'p-1', rol: 'lider', nombre: 'Ana', apellido: 'Gómez' },
          // p-2 has no match in the RPC's result — the row is kept, never
          // dropped, with nombre/apellido null (the UI's own placeholder).
          { id: 'f-2', personaId: 'p-2', rol: 'voluntario', nombre: null, apellido: null },
        ],
      },
    ])
  })

  it('keeps every facilitador row, all names null, when the RPC call errors (mock embed returning null must still produce names on success, but a failed RPC never drops a row)', async () => {
    const client = gruposClient(
      {
        data: [
          {
            id: 'g-1',
            nombre: 'Grupo Alfa',
            orden: 1,
            capacidad: 12,
            activo: true,
            facilitadores: [{ id: 'f-1', persona_id: 'p-1', rol: 'lider' }],
          },
        ],
        error: null,
      },
      { data: null, error: { message: 'boom' } },
    )
    const result = await loadPlantillaGrupos(client, 't-1')
    expect(result[0]?.facilitadores).toEqual([
      { id: 'f-1', personaId: 'p-1', rol: 'lider', nombre: null, apellido: null },
    ])
  })

  it('degrades to an empty array on a query error', async () => {
    const client = gruposClient({ data: null, error: { message: 'boom' } })
    const result = await loadPlantillaGrupos(client, 't-1')
    expect(result).toEqual([])
  })

  it('defaults a missing facilitadores embed to an empty list', async () => {
    const client = gruposClient({
      data: [{ id: 'g-1', nombre: 'Grupo Alfa', orden: 1, capacidad: 12, activo: true }],
      error: null,
    })
    const result = await loadPlantillaGrupos(client, 't-1')
    expect(result[0]?.facilitadores).toEqual([])
  })
})

// T11 (odd/tasks/talleres-configuracion-del-taller.md) — the "Crear edición"
// preview shows, before the director confirms, which plantilla
// facilitadores would be OMITTED at instantiation (acceptance criterion 3):
// this mirrors open_edicion's own rule (migration
// 20260927100000_talleres_instanciar_edicion.sql) — a facilitador is
// omitted when their persona is not among the taller's current active
// servidores. The caller passes only ACTIVE plantilla grupos, since only
// those get instantiated.
describe('previewFacilitadoresOmitidos', () => {
  const grupos: readonly PlantillaGrupo[] = [
    {
      id: 'g-1',
      nombre: 'Grupo Alfa',
      orden: 1,
      capacidad: 12,
      activo: true,
      facilitadores: [
        { id: 'f-1', personaId: 'p-1', rol: 'lider', nombre: 'Ana', apellido: 'Gómez' },
        { id: 'f-2', personaId: 'p-2', rol: 'voluntario', nombre: 'Marta', apellido: 'Díaz' },
      ],
    },
    {
      id: 'g-2',
      nombre: 'Grupo Beta',
      orden: 2,
      capacidad: 12,
      activo: true,
      facilitadores: [{ id: 'f-3', personaId: 'p-3', rol: 'lider', nombre: null, apellido: null }],
    },
  ]

  it('lists a facilitador whose persona is not among the active servidores, across every grupo', () => {
    const result = previewFacilitadoresOmitidos(grupos, new Set(['p-1']))
    expect(result).toEqual([
      { personaId: 'p-2', nombre: 'Marta Díaz', plantillaGrupo: 'Grupo Alfa' },
      { personaId: 'p-3', nombre: 'Persona sin nombre', plantillaGrupo: 'Grupo Beta' },
    ])
  })

  it('returns an empty list when every facilitador is an active servidor', () => {
    const result = previewFacilitadoresOmitidos(grupos, new Set(['p-1', 'p-2', 'p-3']))
    expect(result).toEqual([])
  })

  it('returns an empty list for grupos with no facilitadores', () => {
    const result = previewFacilitadoresOmitidos(
      [{ id: 'g-3', nombre: 'Grupo Gamma', orden: 1, capacidad: 12, activo: true, facilitadores: [] }],
      new Set(),
    )
    expect(result).toEqual([])
  })
})

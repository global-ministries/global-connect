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
  type PlantillaClase,
  type PlantillaGrupo,
} from '@/lib/platform/talleres/plantilla'

function clasesClient(response: { data: unknown; error: unknown | null }) {
  const order = jest.fn().mockResolvedValue(response)
  const eq = jest.fn().mockReturnValue({ order })
  const select = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ select })
  return { from, select, eq, order }
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

function gruposClient(response: { data: unknown; error: unknown | null }) {
  const order = jest.fn().mockResolvedValue(response)
  const eq = jest.fn().mockReturnValue({ order })
  const select = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ select })
  return { from, select, eq, order }
}

describe('loadPlantillaGrupos', () => {
  it('maps grupos with their embedded facilitadores', async () => {
    const client = gruposClient({
      data: [
        {
          id: 'g-1',
          nombre: 'Grupo Alfa',
          orden: 1,
          capacidad: 12,
          activo: true,
          facilitadores: [
            { id: 'f-1', persona_id: 'p-1', rol: 'lider', usuarios: { nombre: 'Ana', apellido: 'Gómez' } },
            { id: 'f-2', persona_id: 'p-2', rol: 'voluntario', usuarios: null },
          ],
        },
      ],
      error: null,
    })

    const result = await loadPlantillaGrupos(client, 't-1')

    expect(client.from).toHaveBeenCalledWith('taller_plantilla_grupos')
    expect(client.eq).toHaveBeenCalledWith('taller_id', 't-1')
    expect(client.order).toHaveBeenCalledWith('orden', { ascending: true })
    expect(result).toEqual<readonly PlantillaGrupo[]>([
      {
        id: 'g-1',
        nombre: 'Grupo Alfa',
        orden: 1,
        capacidad: 12,
        activo: true,
        facilitadores: [
          { id: 'f-1', personaId: 'p-1', rol: 'lider', nombre: 'Ana', apellido: 'Gómez' },
          { id: 'f-2', personaId: 'p-2', rol: 'voluntario', nombre: null, apellido: null },
        ],
      },
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

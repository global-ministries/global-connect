/**
 * @jest-environment node
 *
 * R3b (odd/tasks/talleres-rediseno.md, S5) — loadPanelTemporadas: every
 * temporada the caller can read, with its ediciones (inscritos, aprobados and
 * the taller's own minimo_inscritos) and the régimen=temporada talleres of its
 * own dirección tree that still have no edición there, in one batch of
 * queries for the v2 list + drawer of /talleres/temporadas.
 */

import { edicionBajoMinimo, loadPanelTemporadas, type EdicionPanel } from '@/lib/platform/talleres/temporadas'

jest.mock('@/lib/platform/talleres/permisos', () => ({ cargarPermisos: jest.fn() }))

const temporadasDefault = [
  {
    id: 'temp-1',
    nombre: 'Temporada 2027-I',
    estado: 'abierto',
    fecha_apertura: '2027-01-11',
    fecha_cierre: '2027-03-27',
    dream_team_equipo_id: 'root-con',
  },
  {
    id: 'temp-2',
    nombre: 'Temporada 2026-II',
    estado: 'cerrado',
    fecha_apertura: '2026-06-01',
    fecha_cierre: '2026-08-29',
    dream_team_equipo_id: 'root-con',
  },
]

const equiposDefault = [
  { id: 'root-con', label: 'Dirección de Conexión', parent_equipo_id: null },
  { id: 'gcp', label: 'Grupos de Corto Plazo', parent_equipo_id: 'root-con' },
  { id: 'root-dps', label: 'DPS', parent_equipo_id: null },
]

const talleresDefault = [
  { id: 't-mujer', nombre: 'Mujer de Hoy', slug: 'mujer-de-hoy', dream_team_equipo_id: 'gcp' },
  { id: 't-parejas', nombre: 'Parejas', slug: 'parejas', dream_team_equipo_id: 'gcp' },
  { id: 't-dps', nombre: 'Otro DPS', slug: 'otro-dps', dream_team_equipo_id: 'root-dps' },
]

const edicionesDefault = [
  {
    id: 'ed-1',
    temporada_id: 'temp-1',
    nombre_snapshot: 'Edición ene 2027',
    estado: 'abierto',
    fecha_inicio: '2027-01-12',
    fecha_fin: '2027-02-16',
    taller_id: 't-mujer',
    taller: { id: 't-mujer', nombre: 'Mujer de Hoy', slug: 'mujer-de-hoy', minimo_inscritos: 10 },
    inscripciones: [
      { estado: 'aprobado' },
      { estado: 'aprobado' },
      { estado: 'pendiente' },
      { estado: 'no_aprobado' },
      { estado: 'retirado' },
    ],
  },
]

function buildClient(opts: {
  temporadas?: unknown[] | null
  temporadasError?: unknown
  ediciones?: unknown[] | null
  talleres?: unknown[] | null
} = {}) {
  const llamadas: string[] = []
  const client = {
    from: jest.fn((tabla: string) => {
      llamadas.push(tabla)
      if (tabla === 'talleres_temporadas') {
        return {
          select: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: opts.temporadas === undefined ? temporadasDefault : opts.temporadas,
                  error: opts.temporadasError ?? null,
                }),
            }),
          }),
        }
      }
      if (tabla === 'dream_team_equipos') {
        return { select: () => Promise.resolve({ data: equiposDefault, error: null }) }
      }
      if (tabla === 'taller_ediciones') {
        return {
          select: () => ({
            in: () => ({
              neq: () =>
                Promise.resolve({ data: opts.ediciones === undefined ? edicionesDefault : opts.ediciones, error: null }),
            }),
          }),
        }
      }
      if (tabla === 'talleres') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () =>
                    Promise.resolve({ data: opts.talleres === undefined ? talleresDefault : opts.talleres, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`tabla inesperada: ${tabla}`)
    }),
  }
  return { client, llamadas }
}

describe('loadPanelTemporadas', () => {
  it('returns [] without further queries when there are no temporadas', async () => {
    const { client, llamadas } = buildClient({ temporadas: [] })
    await expect(loadPanelTemporadas(client)).resolves.toEqual([])
    expect(llamadas).toEqual(['talleres_temporadas'])
  })

  it('returns [] when the temporadas query errors', async () => {
    const { client } = buildClient({ temporadas: null, temporadasError: { message: 'boom' } })
    await expect(loadPanelTemporadas(client)).resolves.toEqual([])
  })

  it('attaches the dirección label and each non-cancelled edición with inscritos, aprobados and minimo', async () => {
    const { client } = buildClient()
    const [primera, segunda] = await loadPanelTemporadas(client)

    expect(primera).toMatchObject({ id: 'temp-1', direccionLabel: 'Dirección de Conexión' })
    expect(primera!.ediciones).toEqual([
      {
        id: 'ed-1',
        tallerId: 't-mujer',
        tallerNombre: 'Mujer de Hoy',
        tallerSlug: 'mujer-de-hoy',
        nombre: 'Edición ene 2027',
        estado: 'abierto',
        fechaInicio: '2027-01-12',
        fechaFin: '2027-02-16',
        inscritos: 3,
        aprobados: 2,
        minimo: 10,
      },
    ])
    expect(segunda!.ediciones).toEqual([])
  })

  it("offers only régimen=temporada talleres of the temporada's own tree that have no edición there yet", async () => {
    const { client } = buildClient()
    const [primera, segunda] = await loadPanelTemporadas(client)

    expect(primera!.talleresDisponibles).toEqual([{ id: 't-parejas', nombre: 'Parejas', slug: 'parejas' }])
    expect(segunda!.talleresDisponibles.map((t) => t.id)).toEqual(['t-mujer', 't-parejas'])
  })

  it('falls back to the edición own snapshot and a null minimo when the taller join is missing', async () => {
    const { client } = buildClient({
      ediciones: [{ ...edicionesDefault[0], taller: null, inscripciones: null }],
    })
    const [primera] = await loadPanelTemporadas(client)
    expect(primera!.ediciones[0]).toMatchObject({
      tallerId: 't-mujer',
      tallerNombre: 'Edición ene 2027',
      tallerSlug: '',
      inscritos: 0,
      aprobados: 0,
      minimo: null,
    })
  })
})

describe('edicionBajoMinimo', () => {
  const base: EdicionPanel = {
    id: 'ed',
    tallerId: 't',
    tallerNombre: 'T',
    tallerSlug: 't',
    nombre: 'E',
    estado: 'abierto',
    fechaInicio: null,
    fechaFin: null,
    inscritos: 3,
    aprobados: 3,
    minimo: 8,
  }

  it('is true for an open edición whose approved count is below the minimum', () => {
    expect(edicionBajoMinimo(base)).toBe(true)
  })

  it('is false once the approved count reaches the minimum', () => {
    expect(edicionBajoMinimo({ ...base, aprobados: 8 })).toBe(false)
  })

  it('is false without a minimum', () => {
    expect(edicionBajoMinimo({ ...base, minimo: null })).toBe(false)
  })

  it('is false for an edición that is not receiving inscriptions', () => {
    for (const estado of ['borrador', 'en_curso', 'cerrado', 'cancelado'] as const) {
      expect(edicionBajoMinimo({ ...base, estado })).toBe(false)
    }
  })
})

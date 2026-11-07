/**
 * "Copiar los grupos de <origen>" (T8b of odd/tasks/planner-gdv.md; S18,
 * artboard 10 paso 4, A13): the planner_guardar_cambios changes that copy
 * the closing season's groups into the new one. Each group is a "crear" with
 * a "tmp:" key (name, segment, localidad, day, hour, capacity and only the
 * directors de etapa still eligible for its segment) followed by a "mover" of
 * its Líderes into that key; members and aprendices stay in the bank as
 * suggestions. Cancelled groups and segments the actor cannot edit are left
 * out with the reason; a leader of two groups goes only with the first. The
 * batches keep each group whole and carry at most 200 changes.
 */
import { lotesDeCopia, planCopia } from '@/lib/platform/grupos-vida/planner/copia'
import { MAXIMO_CAMBIOS, guardarCambios, type ClienteAcciones } from '@/lib/platform/grupos-vida/planner/acciones'
import { enGrupo, grupo } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { DirectorGrupo, SegmentoConDirectores } from '@/lib/platform/grupos-vida/planner'

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const director = (usuario: string, segmentoLider: string): DirectorGrupo => ({ segmento_lider_id: segmentoLider, usuario_id: usuario, nombre: 'Héctor', apellido: 'Linárez' })

const SEG_MAT = uuid(900)
const SEG_MUJ = uuid(901)
const SEGMENTOS: SegmentoConDirectores[] = [
  { id: SEG_MAT, nombre: 'Matrimonios', directores: [director(uuid(800), uuid(700)), director(uuid(801), uuid(701))] },
  { id: SEG_MUJ, nombre: 'Mujeres +36', directores: [] },
]

const escalona = grupo({
  grupo_id: uuid(1),
  nombre: '  Grupo #14   Los Escalona ',
  segmento_id: SEG_MAT,
  localidad_id: uuid(500),
  dia_reunion: 'Jueves',
  hora_reunion: '19:30:00',
  capacidad_maxima: 15,
  // uuid(802) is no longer a director de etapa of Matrimonios.
  directores: [director(uuid(800), uuid(700)), director(uuid(802), uuid(702))],
  lideres: [enGrupo(uuid(10)), enGrupo(uuid(11))],
  aprendices: [enGrupo(uuid(12))],
  miembros: [enGrupo(uuid(13))],
})

describe('planCopia', () => {
  it('copies each group as crear with a tmp key + mover of its Líderes only', () => {
    const plan = planCopia([escalona], SEGMENTOS)
    expect(plan.omitidos).toEqual([])
    expect(plan.grupos).toEqual([
      {
        origenId: uuid(1),
        nombre: 'Grupo #14 Los Escalona',
        cambios: [
          {
            tipo: 'crear',
            clave: 'tmp:g1',
            datos: {
              nombre: 'Grupo #14 Los Escalona',
              segmento_id: SEG_MAT,
              localidad_id: uuid(500),
              dia_reunion: 'Jueves',
              hora_reunion: '19:30:00',
              capacidad_maxima: 15,
              director_etapa_ids: [uuid(800)],
            },
          },
          { tipo: 'mover', usuarios: [uuid(10), uuid(11)], grupo: 'tmp:g1', rol: 'lider' },
        ],
      },
    ])
  })

  it('drops values the save would refuse and copies a group without leaders as crear only', () => {
    const raro = grupo({ grupo_id: uuid(2), nombre: '', segmento_id: SEG_MUJ, segmento_nombre: 'Mujeres +36', localidad_id: null, dia_reunion: 'Feriado', hora_reunion: 'tarde', capacidad_maxima: 0 })
    const [copia] = planCopia([raro], SEGMENTOS).grupos
    expect(copia.cambios).toEqual([
      {
        tipo: 'crear',
        clave: 'tmp:g1',
        datos: { nombre: 'Mujeres +36 sin nombre', segmento_id: SEG_MUJ, localidad_id: null, dia_reunion: null, hora_reunion: null, capacidad_maxima: null, director_etapa_ids: [] },
      },
    ])
  })

  it('leaves out cancelled groups and segments the actor cannot edit, with the reason', () => {
    const cancelado = grupo({ grupo_id: uuid(3), nombre: 'Viejo', segmento_id: SEG_MAT, estado_ciclo: 'cancelado' })
    const ajeno = grupo({ grupo_id: uuid(4), nombre: 'Jóvenes 1', segmento_id: uuid(999), segmento_nombre: 'Jóvenes' })
    const plan = planCopia([cancelado, escalona, ajeno], SEGMENTOS)
    expect(plan.grupos.map((g) => g.origenId)).toEqual([uuid(1)])
    expect(plan.omitidos).toEqual([
      { origenId: uuid(3), nombre: 'Viejo', motivo: 'Estaba cancelado' },
      { origenId: uuid(4), nombre: 'Jóvenes 1', motivo: 'No puedes editar el segmento Jóvenes' },
    ])
  })

  it('a leader of two groups goes only with the first; more than 20 leaders go in several movers', () => {
    const otro = grupo({ grupo_id: uuid(5), nombre: 'Otro', segmento_id: SEG_MAT, lideres: [enGrupo(uuid(11)), enGrupo(uuid(14))] })
    const grande = grupo({ grupo_id: uuid(6), nombre: 'Grande', segmento_id: SEG_MAT, lideres: Array.from({ length: 21 }, (_, i) => enGrupo(uuid(100 + i))) })
    const plan = planCopia([escalona, otro, grande], SEGMENTOS)
    expect(plan.grupos[1].cambios[1]).toEqual({ tipo: 'mover', usuarios: [uuid(14)], grupo: 'tmp:g2', rol: 'lider' })
    expect(plan.grupos[2].cambios.map((c) => (c.tipo === 'mover' ? c.usuarios.length : c.tipo))).toEqual(['crear', 20, 1])
  })

  it('every change passes the save validation (guardarCambios reaches the RPC)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { guardados: 2, pasos: [], grupos_creados: {} }, error: null })
    const cliente: ClienteAcciones = { rpc }
    const plan = planCopia([escalona], SEGMENTOS)
    const r = await guardarCambios(cliente, { temporadaId: uuid(77), cambios: plan.grupos.flatMap((g) => g.cambios) })
    expect(r.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('planner_guardar_cambios', expect.objectContaining({ p_temporada_id: uuid(77) }))
  })
})

describe('lotesDeCopia', () => {
  const muchos = Array.from({ length: 150 }, (_, i) =>
    grupo({ grupo_id: uuid(1000 + i), nombre: `Grupo ${i + 1}`, segmento_id: SEG_MAT, lideres: [enGrupo(uuid(2000 + i))] }),
  )

  it('cuts at 200 changes without splitting a group', () => {
    const lotes = lotesDeCopia(planCopia(muchos, SEGMENTOS).grupos)
    expect(lotes.map((l) => l.length)).toEqual([100, 50])
    lotes.forEach((l) => expect(l.flatMap((g) => g.cambios).length).toBeLessThanOrEqual(MAXIMO_CAMBIOS))
    // A group's crear and its mover stay in the same batch.
    expect(lotes[0].at(-1)?.cambios.map((c) => c.tipo)).toEqual(['crear', 'mover'])
  })

  it('one batch for a few groups, none for nothing', () => {
    expect(lotesDeCopia(planCopia(muchos.slice(0, 3), SEGMENTOS).grupos)).toHaveLength(1)
    expect(lotesDeCopia([])).toEqual([])
  })

  it('accepts a smaller limit', () => {
    expect(lotesDeCopia(planCopia(muchos.slice(0, 5), SEGMENTOS).grupos, 4).map((l) => l.length)).toEqual([2, 2, 1])
  })
})

/**
 * The pure pieces of the group panel and the actionable alerts (T6 of
 * odd/tasks/planner-gdv.md; S3, S5): where the members live, the hour of an
 * RPC time, the localidad suggestion on each "sin localidad" item and the
 * people of each warning.
 */
import { dondeViven, horaCorta, seccionesAvisos, seccionesBloqueos } from '@/components/grupos-vida/planner/modelo'
import { IRIBARREN, PALAVECINO, enGrupo, grupo, persona } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { Aviso, Bloqueo } from '@/lib/platform/grupos-vida/planner'

describe('dondeViven (S3, S5)', () => {
  it('counts the people by municipio, most first, marks the leaders and ends with "Sin dirección"', () => {
    const g = grupo({ lideres: [enGrupo('l1')], miembros: [enGrupo('m1'), enGrupo('m2'), enGrupo('m3'), enGrupo('m4')] })
    const fichas = new Map(
      [
        persona({ usuario_id: 'l1', municipio_id: IRIBARREN }),
        persona({ usuario_id: 'm1', municipio_id: PALAVECINO }),
        persona({ usuario_id: 'm2', municipio_id: PALAVECINO }),
        persona({ usuario_id: 'm3', municipio_id: null }),
      ].map((p) => [p.usuario_id, p]),
    )

    expect(dondeViven(g, fichas)).toEqual([
      { clave: PALAVECINO, etiqueta: 'Palavecino', cantidad: 2, conLideres: false },
      { clave: IRIBARREN, etiqueta: 'Iribarren', cantidad: 1, conLideres: true },
      { clave: 'sin-direccion', etiqueta: 'Sin dirección', cantidad: 1, conLideres: false },
    ])
  })
})

describe('horaCorta', () => {
  it.each([
    ['19:30:00', '19:30'],
    ['7:05', '07:05'],
    [null, ''],
    ['tarde', ''],
  ])('%s → %s', (hora, esperada) => expect(horaCorta(hora)).toBe(esperada))
})

describe('alert items for the actions (03)', () => {
  const bloqueo: Bloqueo = { tipo: 'sin_localidad', segmento_id: 'seg-mat', grupo_id: 'g1', grupo_nombre: 'Grupo Peraza', usuario_id: null, detalle: '' }

  it('carries the localidad suggestion of a group without localidad, or says to pick it by hand', () => {
    const sugerencia = { localidadId: 'loc-cab', nombre: 'Cabudare', motivo: '8 de 11 viven en Palavecino' }
    const [conSugerencia] = seccionesBloqueos([bloqueo], [grupo()], '2026-II', new Map([['g1', sugerencia]]))
    expect(conSugerencia.items[0]).toMatchObject({ sugerencia, detalle: 'Matrimonios · Sugerida: Cabudare · 8 de 11 viven en Palavecino' })

    const [aMano] = seccionesBloqueos([bloqueo], [grupo()], '2026-II', new Map([['g1', null]]))
    expect(aMano.items[0]).toMatchObject({ sugerencia: null, detalle: 'Matrimonios · Sin sugerencia: elige la localidad a mano' })

    const [sinMapa] = seccionesBloqueos([bloqueo], [grupo()], '2026-II')
    expect(sinMapa.items[0]).not.toHaveProperty('sugerencia')
  })

  it('names the people of a bank-only warning', () => {
    const aviso: Aviso = { tipo: 'sin_ubicar', grupoIds: [], personaIds: ['luis'], mensaje: 'Luis Gil estaba en Grupo Viejo y todavía no tiene grupo' }
    const fichas = new Map([['luis', persona({ usuario_id: 'luis', nombre: 'Luis', apellido: 'Gil' })]])

    expect(seccionesAvisos([aviso], [], '2025 - II', fichas)[0].items[0]).toMatchObject({ grupoId: null, personaIds: ['luis'], personas: 'Luis Gil' })
  })
})

/**
 * View model of the Segmentos list: per segment the stage directors, the active
 * and pending groups, the active groups without a stage director, and whether
 * the segment can be deleted. Pure: the rows go in, the labels come out.
 */
import {
  construirVistaSegmentos,
  mensajeNoSePuedeEliminar,
  type EntradaVistaSegmentos,
} from '@/lib/platform/grupos-vida/segmentos-vista'

const MAT = 'seg-mat'
const MUJ = 'seg-muj'
const VACIO = 'seg-vacio'

const grupo = (id: string, segmentoId: string | null, extra: Partial<EntradaVistaSegmentos['grupos'][number]> = {}) => ({
  id,
  segmentoId,
  activo: true,
  eliminado: false,
  estadoAprobacion: 'aprobado',
  ...extra,
})

function entrada(extra: Partial<EntradaVistaSegmentos> = {}): EntradaVistaSegmentos {
  return {
    segmentos: [
      { id: MUJ, nombre: 'Mujeres +36' },
      { id: MAT, nombre: 'Matrimonios' },
      { id: VACIO, nombre: 'Nuevo' },
    ],
    grupos: [
      grupo('g1', MAT),
      grupo('g2', MAT),
      grupo('g3', MAT, { activo: false, estadoAprobacion: 'pendiente' }),
      grupo('g4', MUJ),
    ],
    lideres: [
      { id: 'sl-1', segmentoId: MAT, tipoLider: 'director_etapa' },
      { id: 'sl-2', segmentoId: MAT, tipoLider: 'director_etapa' },
      { id: 'sl-3', segmentoId: MAT, tipoLider: 'lider' },
    ],
    enlaces: [{ directorId: 'sl-1', grupoId: 'g1' }],
    directoresGenerales: [],
    ...extra,
  }
}

const fila = (e: EntradaVistaSegmentos, id: string) => {
  const f = construirVistaSegmentos(e).filas.find((x) => x.id === id)
  if (!f) throw new Error(`no row ${id}`)
  return f
}

describe('construirVistaSegmentos — rows', () => {
  it('sorts the segments by name, ignoring accents and case', () => {
    const nombres = construirVistaSegmentos(entrada()).filas.map((f) => f.nombre)
    expect(nombres).toEqual(['Matrimonios', 'Mujeres +36', 'Nuevo'])
  })

  it('counts only the director_etapa leaders as stage directors', () => {
    const f = fila(entrada(), MAT)
    expect(f.directores).toBe(2)
    expect(f.textoDirectores).toBe('2 directores')
  })

  it('counts active approved groups and pending groups apart', () => {
    const f = fila(entrada(), MAT)
    expect(f.gruposActivos).toBe(2)
    expect(f.gruposPendientes).toBe(1)
    expect(f.textoGrupos).toBe('2 grupos activos')
    expect(f.textoPendientes).toBe('1 pendiente')
  })

  it('does not count inactive, unapproved or deleted groups as active', () => {
    const e = entrada({
      grupos: [
        grupo('a', MAT),
        grupo('b', MAT, { activo: false }),
        grupo('c', MAT, { estadoAprobacion: 'rechazado' }),
        grupo('d', MAT, { eliminado: true }),
        grupo('e', MAT, { estadoAprobacion: 'pendiente', eliminado: true }),
      ],
    })
    const f = fila(e, MAT)
    expect(f.gruposActivos).toBe(1)
    expect(f.gruposPendientes).toBe(0)
  })

  it('uses the singular for one', () => {
    const f = fila(entrada(), MUJ)
    expect(f.textoGrupos).toBe('1 grupo activo')
    expect(f.textoDirectores).toBe('0 directores')
    expect(f.textoPendientes).toBe('0 pendientes')
  })

  it('flags the active groups without a stage director of the segment', () => {
    const f = fila(entrada(), MAT)
    expect(f.sinDirector).toBe(1)
    expect(f.textoSinDirector).toBe('1 sin director')
  })

  it('omits the warning when every active group has a director', () => {
    const e = entrada({ enlaces: [{ directorId: 'sl-1', grupoId: 'g1' }, { directorId: 'sl-2', grupoId: 'g2' }] })
    const f = fila(e, MAT)
    expect(f.sinDirector).toBe(0)
    expect(f.textoSinDirector).toBeNull()
  })

  it('ignores a link to a director of another segment, and a pending group without director', () => {
    const e = entrada({
      lideres: [
        { id: 'sl-otro', segmentoId: MUJ, tipoLider: 'director_etapa' },
        { id: 'sl-1', segmentoId: MAT, tipoLider: 'director_etapa' },
      ],
      enlaces: [{ directorId: 'sl-otro', grupoId: 'g1' }],
    })
    expect(fila(e, MAT).sinDirector).toBe(2)
  })

  it('does not count a link to a non stage director leader as a director', () => {
    const e = entrada({ enlaces: [{ directorId: 'sl-3', grupoId: 'g1' }] })
    expect(fila(e, MAT).sinDirector).toBe(2)
  })

  it('ignores groups without a segment and unknown segments', () => {
    const e = entrada({ grupos: [grupo('x', null), grupo('y', 'desconocido')] })
    expect(construirVistaSegmentos(e).filas.every((f) => f.gruposActivos === 0)).toBe(true)
  })

})

describe('construirVistaSegmentos — deletion guard', () => {
  it('blocks a segment with active groups and says how many', () => {
    expect(fila(entrada(), MUJ).bloqueo).toBe('No se puede eliminar Mujeres +36: tiene 1 grupo activo.')
  })

  it('leaves a segment with nothing attached deletable', () => {
    expect(fila(entrada(), VACIO).bloqueo).toBeNull()
  })

  it.each([
    ['an inactive group', { grupos: [grupo('a', VACIO, { activo: false })] }],
    ['a pending group', { grupos: [grupo('a', VACIO, { activo: false, estadoAprobacion: 'pendiente' })] }],
    ['a soft-deleted group', { grupos: [grupo('a', VACIO, { eliminado: true })] }],
    ['a leader row', { lideres: [{ id: 'sl', segmentoId: VACIO, tipoLider: 'lider' }] }],
    ['a director de etapa row', { lideres: [{ id: 'sl', segmentoId: VACIO, tipoLider: 'director_etapa' }] }],
    ['a general director row', { directoresGenerales: [{ segmentoId: VACIO }] }],
  ] as const)('blocks a segment that only has %s', (_nombre, extra) => {
    const e = entrada({ grupos: [], lideres: [], enlaces: [], directoresGenerales: [], ...extra } as Partial<EntradaVistaSegmentos>)
    expect(fila(e, VACIO).bloqueo).toMatch(/^No se puede eliminar Nuevo: tiene /)
  })
})

describe('mensajeNoSePuedeEliminar', () => {
  const base = { gruposActivos: 0, gruposTotales: 0, lideres: 0, directoresGenerales: 0 }

  it('returns null when nothing is attached', () => {
    expect(mensajeNoSePuedeEliminar('Nuevo', base)).toBeNull()
  })

  it('names the active groups only when that is all there is', () => {
    expect(mensajeNoSePuedeEliminar('Matrimonios', { ...base, gruposActivos: 27, gruposTotales: 27 })).toBe(
      'No se puede eliminar Matrimonios: tiene 27 grupos activos.',
    )
  })

  it('adds the groups that are not active', () => {
    expect(mensajeNoSePuedeEliminar('Matrimonios', { ...base, gruposActivos: 27, gruposTotales: 45 })).toBe(
      'No se puede eliminar Matrimonios: tiene 27 grupos activos y 18 grupos más.',
    )
  })

  it('counts the groups without active ones as plain groups', () => {
    expect(mensajeNoSePuedeEliminar('X', { ...base, gruposTotales: 1 })).toBe('No se puede eliminar X: tiene 1 grupo.')
  })

  it('lists groups, leaders and general directors', () => {
    expect(
      mensajeNoSePuedeEliminar('X', { gruposActivos: 2, gruposTotales: 2, lideres: 3, directoresGenerales: 1 }),
    ).toBe('No se puede eliminar X: tiene 2 grupos activos, 3 líderes asignados y 1 director general asignado.')
  })

  it('joins two reasons with y', () => {
    expect(mensajeNoSePuedeEliminar('X', { ...base, lideres: 1, directoresGenerales: 2 })).toBe(
      'No se puede eliminar X: tiene 1 líder asignado y 2 directores generales asignados.',
    )
  })
})

describe('construirVistaSegmentos — footer', () => {
  it('sums the segments, stage directors and active groups of the rows', () => {
    expect(construirVistaSegmentos(entrada()).pie).toBe('3 segmentos · 2 directores de etapa · 3 grupos activos')
  })

  it('uses the singular', () => {
    const e = entrada({
      segmentos: [{ id: MUJ, nombre: 'Mujeres +36' }],
      lideres: [{ id: 'sl', segmentoId: MUJ, tipoLider: 'director_etapa' }],
    })
    expect(construirVistaSegmentos(e).pie).toBe('1 segmento · 1 director de etapa · 1 grupo activo')
  })

  it('is computed for the visible rows only', () => {
    const e = entrada({ segmentos: [{ id: MAT, nombre: 'Matrimonios' }] })
    expect(construirVistaSegmentos(e).pie).toBe('1 segmento · 2 directores de etapa · 2 grupos activos')
  })
})

/**
 * Grupos de Vida — pure view model of /grupos-vida/directores.
 *
 * Covers the three lists the page needs: the general directors (with the scope
 * of each segment and the number of groups it makes visible), the stage
 * directors (with who they answer to) and the "Por ordenar" strip. Rows are
 * plain data, so nothing here touches the database.
 */
import {
  construirVistaDirectores,
  filtrarDirectoresEtapa,
  type EntradaVistaDirectores,
} from '@/lib/platform/grupos-vida/directores-vista'

const SEG_H = 'seg-hombres'
const SEG_M = 'seg-matrimonios'
const SEG_W = 'seg-mujeres'

const DE_CARLOS = 'de-carlos'
const DE_JOEL = 'de-joel'
const DE_ANA = 'de-ana'
const DE_BEA = 'de-bea'

const DG_MARIA = 'dg-maria'
const DG_EDUARDO = 'dg-eduardo'

function grupo(id: string, segmentoId: string, extra: Partial<EntradaVistaDirectores['grupos'][number]> = {}) {
  return { id, segmentoId, activo: true, eliminado: false, estadoAprobacion: 'aprobado', ...extra }
}

function entrada(overrides: Partial<EntradaVistaDirectores> = {}): EntradaVistaDirectores {
  return {
    segmentos: [
      { id: SEG_H, nombre: 'Hombre +36' },
      { id: SEG_M, nombre: 'Matrimonios' },
      { id: SEG_W, nombre: 'Mujeres +36' },
    ],
    grupos: [
      grupo('g1', SEG_H),
      grupo('g2', SEG_M),
      grupo('g3', SEG_M),
      grupo('g4', SEG_M),
      grupo('g5', SEG_W),
    ],
    directoresEtapa: [
      { id: DE_CARLOS, usuarioId: 'u-carlos', segmentoId: SEG_H, nombre: 'Carlos Caballero', ciudad: 'Barquisimeto', tieneCuenta: true },
      { id: DE_JOEL, usuarioId: 'u-joel', segmentoId: SEG_M, nombre: 'Joel González', ciudad: 'Cabudare', tieneCuenta: false },
      { id: DE_ANA, usuarioId: 'u-ana', segmentoId: SEG_M, nombre: 'Ana Álvarez', ciudad: null, tieneCuenta: true },
      { id: DE_BEA, usuarioId: 'u-bea', segmentoId: SEG_W, nombre: 'Bea Medina', ciudad: 'Barquisimeto', tieneCuenta: true },
    ],
    enlaces: [
      { directorId: DE_CARLOS, grupoId: 'g1' },
      { directorId: DE_JOEL, grupoId: 'g2' },
      { directorId: DE_JOEL, grupoId: 'g3' },
      // g3 has two directors: it must be counted once
      { directorId: DE_ANA, grupoId: 'g3' },
      { directorId: DE_ANA, grupoId: 'g4' },
      { directorId: DE_BEA, grupoId: 'g5' },
    ],
    generales: [
      { usuarioId: DG_MARIA, nombre: 'María Eugenia Pacheco', roles: ['director-general'] },
      { usuarioId: DG_EDUARDO, nombre: 'Eduardo Durán', roles: ['admin', 'director-general'] },
    ],
    alcances: [
      { usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'segmento' },
      { usuarioId: DG_MARIA, segmentoId: SEG_W, alcance: 'directores' },
      { usuarioId: DG_EDUARDO, segmentoId: SEG_H, alcance: 'segmento' },
      { usuarioId: DG_EDUARDO, segmentoId: SEG_M, alcance: 'segmento' },
      { usuarioId: DG_EDUARDO, segmentoId: SEG_W, alcance: 'segmento' },
    ],
    marcas: [{ usuarioId: DG_MARIA, directorId: DE_BEA }],
    personasConRolDirectorEtapa: [],
    usuariosConSegmentoLider: ['u-carlos', 'u-joel', 'u-ana', 'u-bea'],
    soloLectura: false,
    ...overrides,
  }
}

const tarjeta = (vista: ReturnType<typeof construirVistaDirectores>, usuarioId: string) => {
  const found = vista.generales.find((g) => g.usuarioId === usuarioId)
  if (!found) throw new Error(`no card for ${usuarioId}`)
  return found
}

describe('construirVistaDirectores — general directors', () => {
  it('lists the general directors by name with their other role badge and initials', () => {
    const vista = construirVistaDirectores(entrada())

    expect(vista.generales.map((g) => g.nombre)).toEqual(['Eduardo Durán', 'María Eugenia Pacheco'])
    expect(tarjeta(vista, DG_EDUARDO)).toMatchObject({ otroRol: 'Administrador', iniciales: 'ED' })
    expect(tarjeta(vista, DG_MARIA)).toMatchObject({ otroRol: null, iniciales: 'MP' })
    expect(vista.totales.generales).toBe(2)
  })

  it('shows Pastor when the person is a pastor and not an admin', () => {
    const vista = construirVistaDirectores(
      entrada({ generales: [{ usuarioId: DG_MARIA, nombre: 'María Pacheco', roles: ['pastor', 'director-general'] }] }),
    )
    expect(tarjeta(vista, DG_MARIA).otroRol).toBe('Pastor')
  })

  it('marks "Todos los segmentos" only when every segment is held with scope segmento', () => {
    const vista = construirVistaDirectores(entrada())
    expect(tarjeta(vista, DG_EDUARDO).todos).toBe(true)
    expect(tarjeta(vista, DG_EDUARDO).resumen).toBe('3 segmentos · 4 directores de etapa · 5 grupos')
    expect(tarjeta(vista, DG_MARIA).todos).toBe(false)

    const conUnoPorDirectores = construirVistaDirectores(
      entrada({
        alcances: [
          { usuarioId: DG_EDUARDO, segmentoId: SEG_H, alcance: 'segmento' },
          { usuarioId: DG_EDUARDO, segmentoId: SEG_M, alcance: 'segmento' },
          { usuarioId: DG_EDUARDO, segmentoId: SEG_W, alcance: 'directores' },
        ],
      }),
    )
    expect(tarjeta(conUnoPorDirectores, DG_EDUARDO).todos).toBe(false)
  })

  it('is not "todos" when the platform has no segments at all', () => {
    const vista = construirVistaDirectores(entrada({ segmentos: [], grupos: [], directoresEtapa: [], enlaces: [], alcances: [], marcas: [] }))
    expect(tarjeta(vista, DG_EDUARDO).todos).toBe(false)
    expect(tarjeta(vista, DG_EDUARDO).resumen).toBe('Sin segmentos asignados')
  })

  it('with scope segmento, visible groups are all the active groups of the segment, including those without director', () => {
    const vista = construirVistaDirectores(
      entrada({ grupos: [...entrada().grupos, grupo('g6', SEG_M)] }), // g6 has no director de etapa
    )
    const seg = tarjeta(vista, DG_MARIA).segmentos.find((s) => s.segmentoId === SEG_M)
    expect(seg).toMatchObject({ alcance: 'segmento', gruposActivos: 4, gruposVisibles: 4, directoresDeEtapa: 2 })
    expect(seg?.conteo).toBe('2 directores de etapa · 4 grupos activos')
    expect(seg?.visibles).toBe('4 grupos visibles')
  })

  it('with scope directores, visible groups are the real union of the marked directors, counting a shared group once', () => {
    const vista = construirVistaDirectores(
      entrada({
        alcances: [{ usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'directores' }],
        marcas: [
          { usuarioId: DG_MARIA, directorId: DE_JOEL }, // g2, g3
          { usuarioId: DG_MARIA, directorId: DE_ANA }, // g3 again, g4
        ],
      }),
    )
    const seg = tarjeta(vista, DG_MARIA).segmentos[0]
    expect(seg.gruposVisibles).toBe(3)
    expect(seg.visibles).toBe('3 grupos visibles')
    expect(seg.directores.map((d) => [d.nombre, d.marcado])).toEqual([
      ['Ana Álvarez', true],
      ['Joel González', true],
    ])
  })

  it('with scope directores and no mark, nothing is visible', () => {
    const vista = construirVistaDirectores(
      entrada({ alcances: [{ usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'directores' }], marcas: [] }),
    )
    const seg = tarjeta(vista, DG_MARIA).segmentos[0]
    expect(seg.gruposVisibles).toBe(0)
    expect(seg.visibles).toBe('0 grupos visibles')
  })

  it('keeps the marks when the scope is segmento but ignores them for the count', () => {
    const vista = construirVistaDirectores(
      entrada({
        alcances: [{ usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'segmento' }],
        marcas: [{ usuarioId: DG_MARIA, directorId: DE_JOEL }],
      }),
    )
    const seg = tarjeta(vista, DG_MARIA).segmentos[0]
    expect(seg.gruposVisibles).toBe(3)
    expect(seg.directores.find((d) => d.segmentoLiderId === DE_JOEL)?.marcado).toBe(true)
  })

  it('does not count marks of a director that belongs to another segment', () => {
    const vista = construirVistaDirectores(
      entrada({
        alcances: [{ usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'directores' }],
        marcas: [{ usuarioId: DG_MARIA, directorId: DE_BEA }], // Bea belongs to Mujeres, not Matrimonios
      }),
    )
    expect(tarjeta(vista, DG_MARIA).segmentos[0].gruposVisibles).toBe(0)
  })

  it('does not count inactive, deleted or pending groups, nor a group linked to a director of another segment', () => {
    const vista = construirVistaDirectores(
      entrada({
        grupos: [
          grupo('g2', SEG_M),
          grupo('g3', SEG_M, { activo: false }),
          grupo('g4', SEG_M, { eliminado: true }),
          grupo('g7', SEG_M, { estadoAprobacion: 'pendiente' }),
          grupo('g8', SEG_M), // linked below only to a director of another segment
        ],
        enlaces: [
          { directorId: DE_JOEL, grupoId: 'g2' },
          { directorId: DE_JOEL, grupoId: 'g3' },
          { directorId: DE_BEA, grupoId: 'g8' },
        ],
        alcances: [{ usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'directores' }],
        marcas: [
          { usuarioId: DG_MARIA, directorId: DE_JOEL },
          { usuarioId: DG_MARIA, directorId: DE_ANA },
        ],
      }),
    )
    const seg = tarjeta(vista, DG_MARIA).segmentos[0]
    expect(seg.gruposActivos).toBe(2) // g2 and g8
    expect(seg.gruposVisibles).toBe(1) // only g2
    expect(seg.directores.find((d) => d.segmentoLiderId === DE_JOEL)?.grupos).toBe(1)
  })

  it('offers only the segments the person does not hold yet', () => {
    const vista = construirVistaDirectores(entrada())
    expect(tarjeta(vista, DG_MARIA).segmentosDisponibles).toEqual([{ id: SEG_H, nombre: 'Hombre +36' }])
    expect(tarjeta(vista, DG_EDUARDO).segmentosDisponibles).toEqual([])
  })

  it('describes each stage director of the segment with city and group count', () => {
    const vista = construirVistaDirectores(entrada())
    const seg = tarjeta(vista, DG_MARIA).segmentos.find((s) => s.segmentoId === SEG_M)
    expect(seg?.directores.map((d) => [d.nombre, d.detalle])).toEqual([
      ['Ana Álvarez', 'Sin ciudad · 2 grupos'],
      ['Joel González', 'Cabudare · 2 grupos'],
    ])
  })

  it('flags every card as read-only in read-only mode', () => {
    const vista = construirVistaDirectores(entrada({ soloLectura: true }))
    expect(vista.soloLectura).toBe(true)
    expect(vista.generales.every((g) => g.editable === false)).toBe(true)
    expect(construirVistaDirectores(entrada()).generales.every((g) => g.editable)).toBe(true)
  })

  it('offers no segment to add in read-only mode', () => {
    const vista = construirVistaDirectores(entrada({ soloLectura: true }))
    expect(tarjeta(vista, DG_MARIA).segmentosDisponibles).toEqual([])
  })
})

describe('construirVistaDirectores — stage directors', () => {
  it('lists them by segment and name with active groups, city, account and the groups link', () => {
    const { etapa, totales } = construirVistaDirectores(entrada())

    expect(totales.etapa).toBe(4)
    expect(etapa.map((f) => f.nombre)).toEqual(['Carlos Caballero', 'Ana Álvarez', 'Joel González', 'Bea Medina'])
    const joel = etapa.find((f) => f.segmentoLiderId === DE_JOEL)
    expect(joel).toMatchObject({
      segmentoNombre: 'Matrimonios',
      ciudad: 'Cabudare',
      gruposActivos: 2,
      sinGrupos: false,
      tieneCuenta: false,
      hrefGrupos: `/grupos-vida/segmentos/${SEG_M}/directores`,
    })
    expect(etapa.find((f) => f.segmentoLiderId === DE_ANA)).toMatchObject({ ciudad: null, gruposActivos: 2 })
  })

  it('flags a director without active groups', () => {
    const vista = construirVistaDirectores(entrada({ enlaces: [] }))
    expect(vista.etapa.every((f) => f.sinGrupos && f.gruposActivos === 0)).toBe(true)
  })

  it('answers to the general directors whose scope reaches the director: segmento scope, or marked', () => {
    const { etapa } = construirVistaDirectores(entrada())
    const respondeA = (id: string) => etapa.find((f) => f.segmentoLiderId === id)?.respondeA.map((r) => r.nombre)

    // Matrimonios: both hold it with scope segmento
    expect(respondeA(DE_JOEL)).toEqual(['Eduardo Durán', 'María Eugenia Pacheco'])
    // Hombres: only Eduardo
    expect(respondeA(DE_CARLOS)).toEqual(['Eduardo Durán'])
    // Mujeres: Eduardo (segmento) and María Eugenia (directores, Bea marked)
    expect(respondeA(DE_BEA)).toEqual(['Eduardo Durán', 'María Eugenia Pacheco'])
  })

  it('does not answer to a general director whose scope is directores and has not marked the director', () => {
    const { etapa } = construirVistaDirectores(entrada({ marcas: [] }))
    expect(etapa.find((f) => f.segmentoLiderId === DE_BEA)?.respondeA.map((r) => r.nombre)).toEqual(['Eduardo Durán'])
  })

  it('does not count a mark as reaching a director when the person has no row for that segment', () => {
    const { etapa } = construirVistaDirectores(
      entrada({
        alcances: [{ usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'segmento' }],
        marcas: [{ usuarioId: DG_MARIA, directorId: DE_BEA }],
      }),
    )
    expect(etapa.find((f) => f.segmentoLiderId === DE_BEA)?.respondeA.map((r) => r.nombre)).toEqual([])
  })
})

describe('filtrarDirectoresEtapa', () => {
  const vista = construirVistaDirectores(entrada())

  it('searches by name ignoring accents and case', () => {
    const res = filtrarDirectoresEtapa(vista.etapa, vista.segmentos, { q: 'GONZALEZ', segmentoId: null })
    expect(res.filas.map((f) => f.nombre)).toEqual(['Joel González'])
    expect(filtrarDirectoresEtapa(vista.etapa, vista.segmentos, { q: 'alvarez', segmentoId: null }).filas).toHaveLength(1)
    expect(filtrarDirectoresEtapa(vista.etapa, vista.segmentos, { q: '  ', segmentoId: null }).filas).toHaveLength(4)
  })

  it('filters by segment and counts the chips over the search', () => {
    const todos = filtrarDirectoresEtapa(vista.etapa, vista.segmentos, { q: '', segmentoId: null })
    expect(todos.chips.map((c) => [c.label, c.cantidad, c.activo])).toEqual([
      ['Todos', 4, true],
      ['Hombre +36', 1, false],
      ['Matrimonios', 2, false],
      ['Mujeres +36', 1, false],
    ])
    expect(todos.pie).toBe('Mostrando 4 de 4 directores de etapa')

    const matrimonios = filtrarDirectoresEtapa(vista.etapa, vista.segmentos, { q: '', segmentoId: SEG_M })
    expect(matrimonios.filas.map((f) => f.nombre)).toEqual(['Ana Álvarez', 'Joel González'])
    expect(matrimonios.chips.find((c) => c.id === SEG_M)?.activo).toBe(true)
    expect(matrimonios.pie).toBe('Mostrando 2 de 4 directores de etapa')

    const conBusqueda = filtrarDirectoresEtapa(vista.etapa, vista.segmentos, { q: 'bea', segmentoId: null })
    expect(conBusqueda.chips.map((c) => c.cantidad)).toEqual([1, 0, 0, 1])
  })

  it('returns no rows when nothing matches', () => {
    const res = filtrarDirectoresEtapa(vista.etapa, vista.segmentos, { q: 'zzz', segmentoId: null })
    expect(res.filas).toEqual([])
    expect(res.pie).toBe('Mostrando 0 de 4 directores de etapa')
  })
})

describe('construirVistaDirectores — Por ordenar', () => {
  it('is empty when there is nothing to sort out', () => {
    expect(construirVistaDirectores(entrada()).porOrdenar).toEqual([])
  })

  it('reports active approved groups without a stage director, by segment', () => {
    const vista = construirVistaDirectores(
      entrada({
        grupos: [
          ...entrada().grupos,
          grupo('n1', SEG_H),
          grupo('n2', SEG_H),
          grupo('n3', SEG_M),
          grupo('n4', SEG_M, { activo: false }), // inactive: not counted
        ],
      }),
    )
    expect(vista.porOrdenar).toHaveLength(1)
    expect(vista.porOrdenar[0]).toMatchObject({
      tipo: 'grupos-activos-sin-director',
      cantidad: 3,
      titulo: '3 grupos activos sin director de etapa',
      detalle: '2 en Hombre +36 · 1 en Matrimonios',
      accion: 'Asignar director',
      href: '/grupos-vida/segmentos',
    })
  })

  it('links to the directors screen of the segment when they are all in one', () => {
    const vista = construirVistaDirectores(entrada({ grupos: [...entrada().grupos, grupo('n1', SEG_H)] }))
    expect(vista.porOrdenar[0]).toMatchObject({
      titulo: '1 grupo activo sin director de etapa',
      detalle: 'Todos en Hombre +36',
      href: `/grupos-vida/segmentos/${SEG_H}/directores`,
    })
  })

  it('reports groups pending approval without a stage director', () => {
    const vista = construirVistaDirectores(
      entrada({
        grupos: [
          ...entrada().grupos,
          grupo('p1', SEG_M, { activo: false, estadoAprobacion: 'pendiente' }),
          grupo('p2', SEG_M, { activo: false, estadoAprobacion: 'pendiente' }),
          grupo('p3', SEG_W, { activo: false, estadoAprobacion: 'pendiente' }),
          grupo('p4', SEG_W, { activo: false, estadoAprobacion: 'pendiente', eliminado: true }),
        ],
        enlaces: [...entrada().enlaces, { directorId: DE_BEA, grupoId: 'p3' }], // p3 already has a director
      }),
    )
    expect(vista.porOrdenar).toEqual([
      expect.objectContaining({
        tipo: 'grupos-pendientes-sin-director',
        cantidad: 2,
        titulo: '2 grupos pendientes de aprobación sin director de etapa',
        detalle: 'Todos en Matrimonios',
        accion: 'Revisar solicitudes',
        href: '/grupos-vida/solicitudes',
      }),
    ])
  })

  it('reports people with the director de etapa role and no segmento_lideres row', () => {
    const vista = construirVistaDirectores(
      entrada({
        personasConRolDirectorEtapa: [
          { id: 'u-carlos', nombre: 'Carlos Caballero' }, // has a row
          { id: 'u-ingrid', nombre: 'Ingrid Díaz de Caballero' },
        ],
      }),
    )
    expect(vista.porOrdenar).toEqual([
      expect.objectContaining({
        tipo: 'personas-sin-segmento',
        cantidad: 1,
        titulo: '1 persona con rol de director de etapa y sin segmento',
        detalle: 'Ingrid Díaz de Caballero',
        accion: 'Asignar segmento',
        href: '/grupos-vida/segmentos',
      }),
    ])
  })

  it('lists at most three names and counts the rest', () => {
    const personas = ['Ana', 'Beto', 'Carla', 'Dario', 'Eva'].map((nombre) => ({ id: `u-${nombre}`, nombre }))
    const vista = construirVistaDirectores(entrada({ personasConRolDirectorEtapa: personas }))
    expect(vista.porOrdenar[0]).toMatchObject({
      titulo: '5 personas con rol de director de etapa y sin segmento',
      detalle: 'Ana, Beto, Carla y 2 más',
    })
  })

  it('keeps the three items in order and omits the ones at zero', () => {
    const vista = construirVistaDirectores(
      entrada({
        grupos: [...entrada().grupos, grupo('n1', SEG_H), grupo('p1', SEG_H, { activo: false, estadoAprobacion: 'pendiente' })],
        personasConRolDirectorEtapa: [{ id: 'u-x', nombre: 'Xavier' }],
      }),
    )
    expect(vista.porOrdenar.map((i) => i.tipo)).toEqual([
      'grupos-activos-sin-director',
      'grupos-pendientes-sin-director',
      'personas-sin-segmento',
    ])
  })

  it('is never shown to a read-only viewer', () => {
    const vista = construirVistaDirectores(entrada({ soloLectura: true, grupos: [...entrada().grupos, grupo('n1', SEG_H)] }))
    expect(vista.porOrdenar).toEqual([])
  })
})

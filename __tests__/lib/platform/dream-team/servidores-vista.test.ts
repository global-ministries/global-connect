/**
 * `servidores-vista` — the pure view model behind /admin/dream-team/servidores.
 *
 * Fixture: tests/helpers/servidores-conexion.ts (Conexión-shaped: 38 servicios,
 * 36 personas, 31 without an account, Jose Jimenez and Antholy Ludovic with two
 * servicios each) plus a second dirección (Alabanza) with two servicios.
 * Acceptance criteria covered: 1, 2, 3, 4, 5, 7 and 8 of
 * odd/tasks/dream-team-servidores-rediseno.md.
 */
import {
  FILTROS_INICIALES,
  calcularVistaServidores,
  escribirFiltrosEnUrl,
  indexarArbol,
  leerFiltrosDeUrl,
  parcheElegirDireccion,
  parcheElegirEquipo,
  type FiltrosServidores,
  type ItemLista,
} from '@/lib/platform/dream-team/servidores-vista'
import {
  HOY,
  ID_ALABANZA,
  ID_CONEXION,
  ID_CORO,
  ID_DHAH,
  ID_PAREJAS,
  ID_PDP,
  arbolServidores,
  fila,
  filasConexion,
  todasLasFilas,
} from '../../../../tests/helpers/servidores-conexion'

function vista(filtros: Partial<FiltrosServidores> = {}, filas = todasLasFilas) {
  return calcularVistaServidores({ filas, arbol: arbolServidores, filtros: { ...FILTROS_INICIALES, ...filtros }, hoy: HOY })
}

const nombres = (items: readonly ItemLista[]) => items.flatMap((item) => (item.tipo === 'fila' ? [item.fila.nombre] : []))

describe('totals and counters', () => {
  it('counts servicios and distinct personas', () => {
    expect(vista({}, filasConexion).total).toEqual({ servicios: 38, personas: 36 })
    expect(vista().total).toEqual({ servicios: 40, personas: 38 })
  })

  it('counts every etapa, with "todas" as the sum', () => {
    const { contadoresEtapa } = vista({}, filasConexion)
    expect(contadoresEtapa.todas).toBe(38)
    expect(contadoresEtapa.porEtapa).toEqual({
      postulado: 0,
      en_orientacion: 2,
      activo: 35,
      en_pausa: 1,
      inactivo: 0,
      retirado: 0,
    })
  })

  // Criterion 1: the counter changes when a team is chosen.
  it('etapa counters react to the equipo filter', () => {
    const { contadoresEtapa } = vista({ equipo: ID_PDP })
    expect(contadoresEtapa.todas).toBe(14)
    expect(contadoresEtapa.porEtapa.activo).toBe(13)
    expect(contadoresEtapa.porEtapa.en_orientacion).toBe(1)
    expect(contadoresEtapa.porEtapa.en_pausa).toBe(0)
  })

  it('etapa counters do NOT depend on the etapa filter itself, but the rows do', () => {
    const sin = vista({}, filasConexion)
    const con = vista({ etapa: 'activo' }, filasConexion)
    expect(con.contadoresEtapa).toEqual(sin.contadoresEtapa)
    expect(con.visibles).toHaveLength(35)
    expect(con.visibles.every((f) => f.estado === 'activo')).toBe(true)
  })

  it('etapa counters react to the other filters (search, rol, cuenta, inicio)', () => {
    expect(vista({ rol: 'Coordinador' }, filasConexion).contadoresEtapa.todas).toBe(4)
    expect(vista({ sinCuenta: true }, filasConexion).contadoresEtapa.todas).toBe(31)
    expect(vista({ q: 'rojas' }, filasConexion).contadoresEtapa.todas).toBe(2)
    expect(vista({ inicio: 'mes' }, filasConexion).contadoresEtapa.todas).toBe(35)
  })
})

describe('quick filters', () => {
  // Criterion 3
  it('"sin cuenta" leaves only people without a user: 31 of 38 servicios in Conexión', () => {
    const v = vista({ sinCuenta: true }, filasConexion)
    expect(v.visibles).toHaveLength(31)
    expect(v.visibles.every((f) => f.tieneCuenta === false)).toBe(true)
    expect(v.rapidos.sinCuenta).toEqual({ cantidad: 31, activo: true })
  })

  it('a row whose account status is unknown is never "sin cuenta"', () => {
    const filas = [fila('x', 'Persona Ajena', ID_CORO, 'Facilitador', { tieneCuenta: null })]
    expect(vista({ sinCuenta: true }, filas).visibles).toHaveLength(0)
    expect(vista({}, filas).rapidos.sinCuenta.cantidad).toBe(0)
  })

  it('a Grupos de Vida leader without account is classified like any other row', () => {
    const filas = [fila('g', 'Marta Ruiz', ID_CORO, 'Líder de grupo', { origen: 'grupos_vida', tieneCuenta: false, editable: false })]
    expect(vista({ sinCuenta: true }, filas).visibles).toHaveLength(1)
    expect(vista({}, filas).rapidos.sinCuenta.cantidad).toBe(1)
  })

  it('"en varios equipos" means two or more non-retired servicios of the same persona', () => {
    const v = vista({ varios: true }, filasConexion)
    expect(nombres(v.items).sort()).toEqual(['Antholy Ludovic Gómez', 'Antholy Ludovic Gómez', 'Jose Jimenez', 'Jose Jimenez'])
    expect(v.visibles.every((f) => f.equiposDeLaPersona === 2)).toBe(true)
    expect(v.rapidos.varios.cantidad).toBe(4)
  })

  it('a retired servicio does not make someone "en varios equipos"', () => {
    const filas = [
      fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador'),
      fila('2', 'Ana Ruiz', ID_PAREJAS, 'Facilitador', { estado: 'retirado' }),
    ]
    expect(vista({ varios: true }, filas).visibles).toHaveLength(0)
  })

  it('"varios" belongs to the person, not to the filtered subset', () => {
    const v = vista({ equipo: ID_DHAH, varios: true }, filasConexion)
    expect(nombres(v.items)).toEqual(['Jose Jimenez'])
    expect(v.visibles[0].equiposDeLaPersona).toBe(2)
  })

  it('each quick count reacts to the OTHER filters', () => {
    expect(vista({ equipo: ID_DHAH }, filasConexion).rapidos.sinCuenta.cantidad).toBe(6)
    expect(vista({ equipo: ID_DHAH }, filasConexion).rapidos.varios.cantidad).toBe(1)
    // sin cuenta ∧ varios: only Antholy and Jose have an account among the repeated, so 0 remain.
    expect(vista({ sinCuenta: true }, filasConexion).rapidos.varios.cantidad).toBe(0)
    expect(vista({ varios: true }, filasConexion).rapidos.sinCuenta.cantidad).toBe(0)
  })
})

describe('dirección → equipo cascade', () => {
  // Criterion 2
  it('offers only directions that have servicios', () => {
    expect(vista().opciones.direcciones).toEqual([
      { id: ID_ALABANZA, label: 'Dirección de Alabanza' },
      { id: ID_CONEXION, label: 'Dirección de Conexión' },
    ])
  })

  it('choosing a dirección narrows the equipo options to its own', () => {
    const todos = vista().opciones.equipos.map((e) => e.id)
    expect(todos).toContain(ID_CORO)
    const conexion = vista({ direccion: ID_CONEXION }).opciones.equipos.map((e) => e.label)
    expect(conexion).toEqual(['De Hombre a Hombre', 'Dirección de Conexión', 'Mujer de Hoy', 'Parejas', 'Punto de Partida'])
    expect(vista({ direccion: ID_ALABANZA }).opciones.equipos.map((e) => e.id)).toEqual([ID_CORO])
  })

  it('choosing an equipo fixes its dirección', () => {
    const v = vista({ equipo: ID_CORO })
    expect(v.filtros.direccion).toBe(ID_ALABANZA)
    expect(v.visibles.map((f) => f.nombre).sort()).toEqual(['Sara Ponce', 'Tomás Rey'])
  })

  it('the patches keep the cascade consistent', () => {
    expect(parcheElegirDireccion(ID_CONEXION)).toEqual({ direccion: ID_CONEXION, equipo: null })
    const opciones = vista().opciones.equipos
    expect(parcheElegirEquipo(ID_CORO, opciones)).toEqual({ equipo: ID_CORO, direccion: ID_ALABANZA })
    expect(parcheElegirEquipo(null, opciones)).toEqual({ equipo: null })
  })

  it('a dirección filter shows only its servicios', () => {
    expect(vista({ direccion: ID_CONEXION }).visibles).toHaveLength(38)
    expect(vista({ direccion: ID_ALABANZA }).visibles).toHaveLength(2)
  })

  it('lists the roles present, hierarchy first', () => {
    expect(vista().opciones.roles.map((r) => r.label)).toEqual(['Director', 'Coordinador', 'Facilitador'])
  })

  it('keeps an equipo from a link even when it has no servicios', () => {
    const v = vista({ equipo: ID_CONEXION + '-desconocido' })
    expect(v.visibles).toHaveLength(0)
    expect(v.opciones.equipos.some((e) => e.id === ID_CONEXION + '-desconocido')).toBe(true)
  })

  it('indexes the tree: ruta and dirección of every node', () => {
    const indice = indexarArbol(arbolServidores)
    expect(indice.get(ID_PDP)).toEqual({
      label: 'Punto de Partida',
      direccionId: ID_CONEXION,
      direccionLabel: 'Dirección de Conexión',
      ruta: 'Dirección de Conexión · Talleres',
    })
    expect(indice.get(ID_CONEXION)?.ruta).toBe('')
  })
})

describe('search', () => {
  it('matches the name without caring about accents or case', () => {
    expect(vista({ q: 'jose' }, filasConexion).visibles.map((f) => f.nombre).sort()).toEqual([
      'Jose Jimenez',
      'Jose Jimenez',
      'Jose Salcedo',
      'José Parra',
    ])
    expect(vista({ q: 'JOSÉ' }, filasConexion).visibles).toHaveLength(4)
    expect(vista({ q: 'perez' }, filasConexion).visibles.map((f) => f.nombre)).toEqual(['Edith Pérez'])
  })

  it('matches phone digits, however the number is typed', () => {
    expect(vista({ q: '5070815' }, filasConexion).visibles.map((f) => f.nombre)).toEqual(['Edmir Muñoz'])
    expect(vista({ q: '0414 507' }, filasConexion).visibles.map((f) => f.nombre)).toEqual(['Edmir Muñoz'])
    expect(vista({ q: '+58 414-507' }, filasConexion).visibles.map((f) => f.nombre)).toEqual(['Edmir Muñoz'])
  })

  it('does not match a name fragment that contains digits against phones', () => {
    expect(vista({ q: 'edmir 0' }, filasConexion).visibles).toHaveLength(0)
  })
})

describe('inicio', () => {
  it('"mes" keeps the current calendar month', () => {
    // 3 of 38 started before September 2026.
    expect(vista({ inicio: 'mes' }, filasConexion).visibles).toHaveLength(35)
  })

  it('"trimestre" keeps the last 90 days', () => {
    // Excludes 2026-06-15 and 2025-11-01; keeps 2026-08-20.
    const v = vista({ inicio: 'trimestre' }, filasConexion)
    expect(v.visibles).toHaveLength(36)
    expect(v.visibles.some((f) => f.fechaInicio?.startsWith('2026-08-20'))).toBe(true)
  })

  it('"cualquiera" keeps everything', () => {
    expect(vista({ inicio: 'cualquiera' }, filasConexion).visibles).toHaveLength(38)
  })
})

describe('sorting', () => {
  it('sorts by persona ascending by default, locale es', () => {
    const v = vista({}, filasConexion)
    expect(v.visibles[0].nombre).toBe('Anderson Oviedo')
    const solo = v.visibles.map((f) => f.nombre)
    expect(solo).toEqual([...solo].sort((a, b) => a.localeCompare(b, 'es')))
  })

  // Criterion 5
  it('by equipo, then reversed; the footer says so', () => {
    const asc = vista({ orden: { columna: 'equipo', sentido: 'asc' } }, filasConexion)
    const desc = vista({ orden: { columna: 'equipo', sentido: 'desc' } }, filasConexion)
    expect(asc.visibles[0].equipoLabel).toBe('De Hombre a Hombre')
    expect(desc.visibles[0].equipoLabel).toBe('Punto de Partida')
    expect(asc.pie.orden).toBe('Orden: equipo, ascendente')
    expect(desc.pie.orden).toBe('Orden: equipo, descendente')
  })

  it('ties break by name', () => {
    const v = vista({ orden: { columna: 'equipo', sentido: 'asc' } }, filasConexion)
    const dhah = v.visibles.filter((f) => f.equipoId === ID_DHAH).map((f) => f.nombre)
    expect(dhah).toEqual([...dhah].sort((a, b) => a.localeCompare(b, 'es')))
  })

  it('sorts roles by hierarchy, not alphabetically', () => {
    const v = vista({ orden: { columna: 'rol', sentido: 'asc' } }, filasConexion)
    expect(v.visibles[0].rolLabel).toBe('Director')
    expect(v.visibles[1].rolLabel).toBe('Coordinador')
    expect(v.visibles[v.visibles.length - 1].rolLabel).toBe('Facilitador')
  })

  it('sorts etapa by lifecycle and inicio by date', () => {
    const etapa = vista({ orden: { columna: 'etapa', sentido: 'asc' } }, filasConexion)
    expect(etapa.visibles[0].estado).toBe('en_orientacion')
    expect(etapa.visibles[etapa.visibles.length - 1].estado).toBe('en_pausa')
    const inicio = vista({ orden: { columna: 'inicio', sentido: 'asc' } }, filasConexion)
    expect(inicio.visibles[0].fechaInicio).toBe('2025-11-01T10:00:00Z')
  })
})

describe('grouping', () => {
  it('without grouping the list is flat', () => {
    expect(vista({}, filasConexion).items.every((i) => i.tipo === 'fila')).toBe(true)
  })

  // Criterion 4
  it('by persona puts Jose Jimenez with both servicios under one header', () => {
    const items = vista({ agrupar: 'persona' }, filasConexion).items
    const indice = items.findIndex((i) => i.tipo === 'grupo' && i.titulo === 'Jose Jimenez')
    expect(indice).toBeGreaterThanOrEqual(0)
    expect(items[indice]).toMatchObject({ detalle: '2 servicios', cantidad: 2 })
    expect(items[indice + 1]).toMatchObject({ tipo: 'fila' })
    expect(items[indice + 2]).toMatchObject({ tipo: 'fila' })
    expect(items[indice + 3]).toMatchObject({ tipo: 'grupo' })
    const propias = [items[indice + 1], items[indice + 2]].map((i) => (i.tipo === 'fila' ? i.fila.equipoLabel : ''))
    expect(propias.sort()).toEqual(['De Hombre a Hombre', 'Punto de Partida'])
  })

  it('by equipo has a header per team with its size, teams alphabetically', () => {
    const grupos = vista({ agrupar: 'equipo' }, filasConexion).items.filter((i) => i.tipo === 'grupo')
    expect(grupos.map((g) => (g.tipo === 'grupo' ? g.titulo : ''))).toEqual([
      'De Hombre a Hombre',
      'Dirección de Conexión',
      'Mujer de Hoy',
      'Parejas',
      'Punto de Partida',
    ])
    expect(grupos[1]).toMatchObject({ detalle: '1 persona' })
    expect(grupos[4]).toMatchObject({ detalle: '14 personas' })
  })

  it('grouped rows respect the sort inside each group', () => {
    const items = vista({ agrupar: 'equipo', orden: { columna: 'persona', sentido: 'desc' } }, filasConexion).items
    const primero = items.findIndex((i) => i.tipo === 'grupo' && i.titulo === 'De Hombre a Hombre')
    const filas = items.slice(primero + 1, primero + 10).map((i) => (i.tipo === 'fila' ? i.fila.nombre : ''))
    expect(filas).toEqual([...filas].sort((a, b) => b.localeCompare(a, 'es')))
  })
})

describe('pills', () => {
  it('has none without filters', () => {
    expect(vista().pastillas).toEqual([])
  })

  it('lists every active filter with the patch that removes it', () => {
    const v = vista({
      etapa: 'activo',
      equipo: ID_CORO,
      rol: 'Coordinador',
      inicio: 'trimestre',
      sinCuenta: true,
      varios: true,
      q: ' sara ',
    })
    expect(v.pastillas.map((p) => p.etiqueta)).toEqual([
      'Etapa: Activo',
      'Dirección de Alabanza',
      'Equipo: Coro',
      'Rol: Coordinador',
      'Inicio: últimos 3 meses',
      'Sin cuenta',
      'En varios equipos',
      '«sara»',
    ])
    expect(v.pastillas[0].quitarEtiqueta).toBe('Quitar el filtro Etapa: Activo')
    expect(v.pastillas[0].parche).toEqual({ etapa: null })
    // Removing the dirección pill also drops the equipo that depends on it.
    expect(v.pastillas[1].parche).toEqual({ direccion: null, equipo: null })
    expect(v.pastillas[6].parche).toEqual({ varios: false })
  })

  it('applying a pill patch removes exactly that filter', () => {
    const filtros: FiltrosServidores = { ...FILTROS_INICIALES, etapa: 'activo', rol: 'Director' }
    const rol = vista(filtros).pastillas.find((p) => p.clave === 'rol')
    expect(vista({ ...filtros, ...rol?.parche }).pastillas.map((p) => p.clave)).toEqual(['etapa'])
  })

  it('counts the filters that live in the phone sheet', () => {
    expect(vista({ etapa: 'activo', q: 'x' }).filtrosEnHoja).toBe(0)
    expect(vista({ equipo: ID_CORO, rol: 'Director', sinCuenta: true, varios: true }).filtrosEnHoja).toBe(4)
  })
})

describe('footer', () => {
  it('says how many servicios and personas are visible', () => {
    expect(vista({}, filasConexion).pie.resumen).toBe('38 servicios · 36 personas')
    expect(vista({ equipo: ID_DHAH }, filasConexion).pie.resumen).toBe('9 servicios · 9 personas')
    expect(vista({ q: 'perez' }, filasConexion).pie.resumen).toBe('1 servicio · 1 persona')
    expect(vista({ varios: true }, filasConexion).pie.resumen).toBe('4 servicios · 2 personas')
  })

  it('is empty-safe', () => {
    expect(vista({}, []).pie.resumen).toBe('0 servicios · 0 personas')
  })
})

describe('URL codec', () => {
  // Criterion 7
  it('round-trips every filter', () => {
    const filtros: FiltrosServidores = {
      etapa: 'en_pausa',
      direccion: ID_CONEXION,
      equipo: ID_PDP,
      rol: 'Coordinador',
      inicio: 'mes',
      sinCuenta: true,
      varios: true,
      q: 'jose',
      agrupar: 'persona',
      orden: { columna: 'inicio', sentido: 'desc' },
    }
    const query = escribirFiltrosEnUrl(filtros)
    expect(query).toBe(
      'etapa=en_pausa&direccion=dir-conexion&equipo=eq-pdp&rol=Coordinador&inicio=mes&sin_cuenta=1&varios=1&q=jose&agrupar=persona&orden=inicio%3Adesc',
    )
    expect(leerFiltrosDeUrl(new URLSearchParams(query))).toEqual(filtros)
  })

  it('leaves defaults out and reads an empty URL as the initial filters', () => {
    expect(escribirFiltrosEnUrl(FILTROS_INICIALES)).toBe('')
    expect(leerFiltrosDeUrl(new URLSearchParams(''))).toEqual(FILTROS_INICIALES)
  })

  it('writes an ascending order as the bare column', () => {
    expect(escribirFiltrosEnUrl({ ...FILTROS_INICIALES, orden: { columna: 'equipo', sentido: 'asc' } })).toBe('orden=equipo')
  })

  // Criterion 8
  it('accepts the legacy ?equipo= and ?estado= params', () => {
    const filtros = leerFiltrosDeUrl(new URLSearchParams('equipo=eq-pdp&estado=activo'))
    expect(filtros).toMatchObject({ equipo: 'eq-pdp', etapa: 'activo' })
    // ...and ?equipo= preselects the team and its dirección in the view.
    const v = vista(filtros)
    expect(v.filtros.direccion).toBe(ID_CONEXION)
    expect(v.visibles.every((f) => f.equipoId === ID_PDP && f.estado === 'activo')).toBe(true)
  })

  it('prefers ?etapa= over the legacy ?estado=', () => {
    expect(leerFiltrosDeUrl(new URLSearchParams('etapa=activo&estado=en_pausa')).etapa).toBe('activo')
  })

  it('drops invalid values instead of failing', () => {
    expect(leerFiltrosDeUrl(new URLSearchParams('etapa=nada&inicio=ayer&agrupar=raro&orden=color:desc&sin_cuenta=quiza'))).toEqual(
      FILTROS_INICIALES,
    )
  })

  it('reads the plain record a page receives, taking the first of a repeated param', () => {
    expect(leerFiltrosDeUrl({ equipo: ['eq-a', 'eq-b'], estado: 'activo', q: undefined })).toMatchObject({
      equipo: 'eq-a',
      etapa: 'activo',
      q: '',
    })
  })
})

describe('Grupos de Vida directors', () => {
  // A director de etapa has no start date (segmento_lideres keeps none).
  const gdv = { origen: 'grupos_vida', editable: false } as const
  const directorGeneral = fila('dg', 'Zoe General', ID_CONEXION, 'Director general', { ...gdv, fechaInicio: '2026-09-10T10:00:00Z' })
  const directorEtapa = fila('de', 'Yara Etapa', ID_CONEXION, 'Director de etapa', { ...gdv, fechaInicio: null })
  const lider = fila('l', 'Xena Lider', ID_CORO, 'Líder de grupo', { ...gdv, fechaInicio: '2026-09-11T10:00:00Z' })
  const aprendiz = fila('a', 'Wanda Aprendiz', ID_CORO, 'Aprendiz de grupo', { ...gdv, fechaInicio: '2026-09-12T10:00:00Z' })
  const otroRol = fila('o', 'Vera Acompañante', ID_CORO, 'Acompañante')
  const filas = [otroRol, aprendiz, lider, directorEtapa, directorGeneral]

  it('lists the roles director general, director de etapa, líder, aprendiz, then the rest', () => {
    expect(vista({}, filas).opciones.roles.map((r) => r.label)).toEqual([
      'Director general',
      'Director de etapa',
      'Líder de grupo',
      'Aprendiz de grupo',
      'Acompañante',
    ])
  })

  it('sorts rows by role in that same order, in both directions', () => {
    const asc = vista({ orden: { columna: 'rol', sentido: 'asc' } }, filas).visibles.map((f) => f.rolLabel)
    expect(asc).toEqual(['Director general', 'Director de etapa', 'Líder de grupo', 'Aprendiz de grupo', 'Acompañante'])
    const desc = vista({ orden: { columna: 'rol', sentido: 'desc' } }, filas).visibles.map((f) => f.rolLabel)
    expect(desc).toEqual([...asc].reverse())
  })

  it('keeps the Dream Team Director above the director de etapa and the Coordinador below it', () => {
    const director = fila('d', 'Ana Director', ID_CONEXION, 'Director')
    const coordinador = fila('c', 'Bea Coordinadora', ID_DHAH, 'Coordinador')
    const roles = vista({}, [lider, coordinador, directorEtapa, director]).opciones.roles.map((r) => r.label)
    expect(roles).toEqual(['Director', 'Director de etapa', 'Coordinador', 'Líder de grupo'])
  })

  it('filters by the exact director role label', () => {
    expect(vista({ rol: 'Director de etapa' }, filas).visibles.map((f) => f.nombre)).toEqual(['Yara Etapa'])
    expect(vista({ rol: 'Director general' }, filas).visibles.map((f) => f.nombre)).toEqual(['Zoe General'])
  })

  it('counts a director in the team of their row, and one person per director', () => {
    const v = vista({ equipo: ID_CONEXION }, filas)
    expect(v.visibles.map((f) => f.nombre).sort()).toEqual(['Yara Etapa', 'Zoe General'])
    expect(v.pie.resumen).toBe('2 servicios · 2 personas')
  })

  it('finds a director by name and by phone like any other row', () => {
    const conTelefono = fila('dg', 'Zoe General', ID_CONEXION, 'Director general', { ...gdv, fechaInicio: null, telefono: '04245551111' })
    expect(vista({ q: 'zoe' }, [conTelefono, lider]).visibles.map((f) => f.nombre)).toEqual(['Zoe General'])
    expect(vista({ q: '555 1111' }, [conTelefono, lider]).visibles.map((f) => f.nombre)).toEqual(['Zoe General'])
  })

  it('a row without a start date never matches an inicio filter, and the other rows still do', () => {
    expect(vista({ inicio: 'mes' }, filas).visibles.map((f) => f.nombre).sort()).toEqual([
      'Vera Acompañante',
      'Wanda Aprendiz',
      'Xena Lider',
      'Zoe General',
    ])
    expect(vista({ inicio: 'trimestre' }, filas).visibles.map((f) => f.nombre)).not.toContain('Yara Etapa')
    expect(vista({ inicio: 'cualquiera' }, filas).visibles.map((f) => f.nombre)).toContain('Yara Etapa')
  })

  it('sorts a row without a start date as the oldest, without breaking the order of the others', () => {
    const asc = vista({ orden: { columna: 'inicio', sentido: 'asc' } }, filas).visibles.map((f) => f.nombre)
    expect(asc[0]).toBe('Yara Etapa')
    expect(asc.slice(1)).toEqual(['Zoe General', 'Xena Lider', 'Wanda Aprendiz', 'Vera Acompañante'])
    const desc = vista({ orden: { columna: 'inicio', sentido: 'desc' } }, filas).visibles.map((f) => f.nombre)
    expect(desc[desc.length - 1]).toBe('Yara Etapa')
  })
})

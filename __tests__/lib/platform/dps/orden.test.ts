/**
 * The order of the service (odd/tasks/dps-asistencia-pco.md, T13, S10;
 * artboard docs/design-system/prototipos/planificacion-dps/02-plan-domingo-orden.html,
 * the PDF of L9): reading dps_orden_leer, the duration as m:ss, the times of
 * every row for every horario of the plan (pre servicio from the llegada and
 * only once, the service repeated at each start, post servicio after each
 * one), the end of each service, the warnings when parts overlap, the
 * Horarios list of the sidebar and the optimistic add / move / edit / remove.
 */
import {
  calcularOrden,
  cronogramaPlan,
  duracionLarga,
  formatearDuracion,
  insertarFila,
  leerOrden,
  moverFila,
  parsearDuracion,
  posicionNueva,
  quitarFila,
  reemplazarFila,
  textoPosicion,
  type FilaOrden,
} from '@/lib/platform/dps/orden'

let n = 0
const enc = (titulo: string, fase: 'pre' | 'servicio' | 'post' = 'servicio'): FilaOrden => ({
  id: `e${n++}`,
  posicion: 0,
  tipo: 'encabezado',
  titulo,
  duracionSeg: 0,
  notas: null,
  responsable: null,
  fase,
})
const it_ = (titulo: string, min: number, seg = 0): FilaOrden => ({
  id: `i${n++}`,
  posicion: 0,
  tipo: 'item',
  titulo,
  duracionSeg: min * 60 + seg,
  notas: null,
  responsable: null,
  fase: null,
})
const numerar = (filas: FilaOrden[]): FilaOrden[] => filas.map((f, i) => ({ ...f, posicion: i }))

/** The order of the PDF of the 8-nov plan (L9), with fictitious items. */
const pdf = () =>
  numerar([
    enc('Pre servicio', 'pre'),
    it_('Montaje', 45),
    it_('Reunión general y oración', 15),
    enc('Ensayo general', 'pre'),
    it_('Ensayo general', 60),
    enc('Ambiente'),
    it_('Cuenta regresiva', 3),
    enc('Opener'),
    it_('Video opener', 2),
    enc('Bienvenida'),
    it_('Bienvenida y anuncios', 4),
    enc('Banda'),
    it_('Hogar (Sol)', 6),
    it_('Ancla del alma (Re)', 5),
    it_('Tu nombre es fiel (La)', 5),
    enc('Dar'),
    it_('Momento de dar', 4),
    enc('Mensaje'),
    it_('Versintro', 1),
    it_('Mensaje', 35),
    it_('Recap y oración final', 3),
    enc('Post servicio', 'post'),
    it_('Salida y música de cierre', 5),
  ])

const horas = (filas: FilaOrden[], horarios: string[], llegada: string) =>
  calcularOrden(filas, horarios, llegada).filas.map((f) => `${f.fila.titulo}=${f.horas.map((h) => h ?? '—').join('/')}`)

describe('leerOrden', () => {
  it('reads dps_orden_leer by posicion, with null notas and fase for items', () => {
    const orden = leerOrden({
      plan_id: 'p1',
      puede_editar: true,
      items: [
        { id: 'b', posicion: 1, tipo: 'item', titulo: 'Montaje', duracion_seg: 2700, notas: 'Escenario', responsable: 'Stage', fase: null },
        { id: 'a', posicion: 0, tipo: 'encabezado', titulo: 'Pre servicio', duracion_seg: 0, notas: null, responsable: null, fase: 'pre' },
        { id: 'c', posicion: 2, tipo: 'raro', titulo: 'X' },
        { posicion: 3, tipo: 'item', titulo: 'Sin id' },
      ],
    })
    expect(orden).toEqual({
      planId: 'p1',
      puedeEditar: true,
      filas: [
        { id: 'a', posicion: 0, tipo: 'encabezado', titulo: 'Pre servicio', duracionSeg: 0, notas: null, responsable: null, fase: 'pre' },
        { id: 'b', posicion: 1, tipo: 'item', titulo: 'Montaje', duracionSeg: 2700, notas: 'Escenario', responsable: 'Stage', fase: null },
        { id: 'c', posicion: 2, tipo: 'item', titulo: 'X', duracionSeg: 0, notas: null, responsable: null, fase: null },
      ],
    })
  })

  it('reads anything else as an empty, read-only order', () => {
    expect(leerOrden(null)).toEqual({ planId: '', puedeEditar: false, filas: [] })
    // A header without a known fase is part of the service.
    expect(leerOrden({ items: [{ id: 'h', tipo: 'encabezado', titulo: 'H', fase: 'luego' }] }).filas[0]?.fase).toBe('servicio')
  })
})

describe('duración', () => {
  it.each([
    ['4:30', 270],
    ['4', 240],
    ['45', 2700],
    ['0', 0],
    ['0:05', 5],
    ['240', 14400],
    ['  6:00 ', 360],
  ])('parses %p as %i seconds', (texto, segundos) => {
    expect(parsearDuracion(texto)).toBe(segundos)
  })

  it.each(['', '4:60', '4:5', 'cuatro', '-3', '241', '1:00:00', '4.5'])('refuses %p', (texto) => {
    expect(parsearDuracion(texto)).toBeNull()
  })

  it.each([
    [270, '4:30'],
    [2700, '45:00'],
    [5, '0:05'],
    [3600, '60:00'],
  ])('formats %i as %s', (segundos, texto) => {
    expect(formatearDuracion(segundos)).toBe(texto)
  })

  it.each([
    [0, '0 min'],
    [2700, '45 min'],
    [4020, '1 h 07 min'],
    [7200, '2 h'],
    [90, '2 min'],
  ])('reads %i seconds as %s in the summary', (segundos, texto) => {
    expect(duracionLarga(segundos)).toBe(texto)
  })
})

describe('calcularOrden', () => {
  it('times the PDF order for 9:15 and 11:15 with llegada 7:00 (Montaje 7:00, Reunión 7:45, Ensayo 8:00)', () => {
    expect(horas(pdf(), ['09:15', '11:15'], '07:00')).toEqual([
      'Pre servicio=7:00/—',
      'Montaje=7:00/—',
      'Reunión general y oración=7:45/—',
      'Ensayo general=8:00/—',
      'Ensayo general=8:00/—',
      'Ambiente=9:15/11:15',
      'Cuenta regresiva=9:15/11:15',
      'Opener=9:18/11:18',
      'Video opener=9:18/11:18',
      'Bienvenida=9:20/11:20',
      'Bienvenida y anuncios=9:20/11:20',
      'Banda=9:24/11:24',
      'Hogar (Sol)=9:24/11:24',
      'Ancla del alma (Re)=9:30/11:30',
      'Tu nombre es fiel (La)=9:35/11:35',
      'Dar=9:40/11:40',
      'Momento de dar=9:40/11:40',
      'Mensaje=9:44/11:44',
      'Versintro=9:44/11:44',
      'Mensaje=9:45/11:45',
      'Recap y oración final=10:20/12:20',
      'Post servicio=10:23/12:23',
      'Salida y música de cierre=10:23/12:23',
    ])
  })

  it('gives the service length, each end, the section totals and no warning when it fits', () => {
    const c = calcularOrden(pdf(), ['09:15', '11:15'], '07:00')
    expect(c.servicioSeg).toBe(68 * 60)
    expect(c.comienzos).toEqual(['9:15', '11:15'])
    expect(c.fines).toEqual(['10:23', '12:23'])
    expect(c.avisos).toEqual([])
    const banda = c.filas.find((f) => f.fila.titulo === 'Banda')!
    expect(banda.totalSeg).toBe(16 * 60)
    expect(c.filas.find((f) => f.fila.titulo === 'Pre servicio')!.totalSeg).toBe(60 * 60)
    expect(banda.fase).toBe('servicio')
    expect(c.filas.find((f) => f.fila.titulo === 'Montaje')!.fase).toBe('pre')
    expect(c.filas.find((f) => f.fila.titulo === 'Salida y música de cierre')!.fase).toBe('post')
  })

  it('times one evening service (Cena del Señor at 19:00, llegada 18:00) in one column', () => {
    const filas = numerar([enc('Pre servicio', 'pre'), it_('Montaje', 30), it_('Oración', 15), enc('Servicio'), it_('Alabanza', 20), it_('Santa Cena', 25), it_('Mensaje', 30)])
    expect(horas(filas, ['19:00'], '18:00')).toEqual([
      'Pre servicio=18:00',
      'Montaje=18:00',
      'Oración=18:30',
      'Servicio=19:00',
      'Alabanza=19:00',
      'Santa Cena=19:20',
      'Mensaje=19:45',
    ])
    expect(calcularOrden(filas, ['19:00'], '18:00').fines).toEqual(['20:15'])
  })

  it('repeats the service at each of four starts', () => {
    const filas = numerar([it_('Alabanza', 20), it_('Mensaje', 40)])
    const c = calcularOrden(filas, ['08:00', '10:00', '12:00', '18:30'], '07:00')
    expect(c.filas.map((f) => f.horas)).toEqual([
      ['8:00', '10:00', '12:00', '18:30'],
      ['8:20', '10:20', '12:20', '18:50'],
    ])
    expect(c.fines).toEqual(['9:00', '11:00', '13:00', '19:30'])
  })

  it('treats items before any header as part of the service', () => {
    const c = calcularOrden(numerar([it_('Bienvenida', 5), enc('Pre', 'pre'), it_('Montaje', 30)]), ['10:00'], '09:00')
    expect(c.filas.map((f) => `${f.fila.titulo}:${f.fase}:${f.horas[0]}`)).toEqual(['Bienvenida:servicio:10:00', 'Pre:pre:9:00', 'Montaje:pre:9:00'])
  })

  it('runs post servicio after each service and keeps seconds until the minute shown', () => {
    const filas = numerar([it_('Canción', 4, 30), it_('Canción', 4, 30), enc('Post servicio', 'post'), it_('Salida', 5)])
    const c = calcularOrden(filas, ['09:15', '11:15'], '07:00')
    expect(c.filas.map((f) => f.horas.join('/'))).toEqual(['9:15/11:15', '9:19/11:19', '9:24/11:24', '9:24/11:24'])
    expect(c.servicioSeg).toBe(540)
    expect(c.fines).toEqual(['9:24', '11:24'])
  })

  it('warns when the pre servicio runs into the first service', () => {
    const filas = numerar([enc('Pre servicio', 'pre'), it_('Montaje', 90), it_('Ensayo', 45)])
    // Ending exactly at the start is fine.
    expect(calcularOrden(filas, ['09:15'], '07:00').avisos).toEqual([])
    const largo = numerar([enc('Pre servicio', 'pre'), it_('Montaje', 90), it_('Ensayo', 60)])
    expect(calcularOrden(largo, ['09:15'], '07:00').avisos).toEqual(['El pre servicio termina a las 9:30, después del comienzo del servicio (9:15).'])
  })

  it('warns when a service runs into the next one', () => {
    const filas = numerar([it_('Alabanza', 30), it_('Mensaje', 95)])
    expect(calcularOrden(filas, ['09:15', '11:15'], '07:00').avisos).toEqual([
      'El servicio de las 9:15 termina a las 11:20, después del comienzo del de las 11:15.',
    ])
  })

  it('has no times without horarios and an empty order has no rows', () => {
    expect(calcularOrden(numerar([it_('Alabanza', 30)]), [], '07:00').filas[0]?.horas).toEqual([])
    expect(calcularOrden([], ['09:15'], '07:00')).toEqual({ filas: [], servicioSeg: 0, comienzos: ['9:15'], fines: ['9:15'], avisos: [] })
  })
})

describe('cronogramaPlan', () => {
  it('lists the llegada, the later pre servicio sections and each service with its end', () => {
    expect(cronogramaPlan(calcularOrden(pdf(), ['09:15', '11:15'], '07:00'), '07:00')).toEqual([
      { etiqueta: 'Llegada del equipo', hora: '7:00' },
      { etiqueta: 'Ensayo general', hora: '8:00' },
      { etiqueta: 'Servicio', hora: '9:15', fin: '10:23' },
      { etiqueta: 'Servicio', hora: '11:15', fin: '12:23' },
    ])
  })

  it('leaves the end out while the order is empty', () => {
    expect(cronogramaPlan(calcularOrden([], ['19:00'], '18:00'), '18:00')).toEqual([
      { etiqueta: 'Llegada del equipo', hora: '18:00' },
      { etiqueta: 'Servicio', hora: '19:00' },
    ])
  })
})

describe('optimistic changes', () => {
  const base = () => numerar([enc('Pre servicio', 'pre'), it_('Montaje', 45), enc('Mensaje'), it_('Mensaje', 35), enc('Post servicio', 'post'), it_('Salida', 5)])

  it('moves a row down, up and clamps at the ends, renumbering', () => {
    const filas = base()
    const montaje = filas[1]!.id
    expect(moverFila(filas, montaje, 3).map((f) => `${f.posicion}:${f.titulo}`)).toEqual([
      '0:Pre servicio',
      '1:Mensaje',
      '2:Mensaje',
      '3:Montaje',
      '4:Post servicio',
      '5:Salida',
    ])
    expect(moverFila(filas, montaje, -4).map((f) => f.titulo)).toEqual(['Montaje', 'Pre servicio', 'Mensaje', 'Mensaje', 'Post servicio', 'Salida'])
    expect(moverFila(filas, montaje, 99).map((f) => f.titulo).at(-1)).toBe('Montaje')
    expect(moverFila(filas, 'nadie', 0)).toBe(filas)
  })

  it('inserts, replaces and removes rows, keeping posiciones 0..n-1', () => {
    const filas = base()
    const nueva = { ...it_('Anuncios', 4), id: 'nuevo' }
    const con = insertarFila(filas, nueva, 4)
    expect(con.map((f) => `${f.posicion}:${f.titulo}`)).toEqual(['0:Pre servicio', '1:Montaje', '2:Mensaje', '3:Mensaje', '4:Anuncios', '5:Post servicio', '6:Salida'])
    expect(reemplazarFila(con, { ...nueva, titulo: 'Anuncios y bautizos', posicion: 4 })[4]?.titulo).toBe('Anuncios y bautizos')
    expect(quitarFila(con, 'nuevo').map((f) => `${f.posicion}:${f.titulo}`)).toEqual(base().map((f) => `${f.posicion}:${f.titulo}`))
  })

  it('places new rows before Post servicio, else at the end', () => {
    expect(posicionNueva(base())).toBe(4)
    expect(posicionNueva(numerar([it_('Mensaje', 35)]))).toBe(1)
    expect(posicionNueva([])).toBe(0)
  })

  it('says where a moved row is, within its section', () => {
    const filas = base()
    expect(textoPosicion(filas, filas[1]!.id)).toBe('Montaje: posición 1 de 1 en Pre servicio')
    const movida = moverFila(filas, filas[1]!.id, 3)
    expect(textoPosicion(movida, filas[1]!.id)).toBe('Montaje: posición 2 de 2 en Mensaje')
    expect(textoPosicion(movida, movida[1]!.id)).toBe('Mensaje: encabezado, posición 2 de 6')
    expect(textoPosicion(numerar([it_('Suelto', 1)]), 'x')).toBe('')
  })
})

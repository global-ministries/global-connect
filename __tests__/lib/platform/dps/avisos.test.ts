/**
 * Service notices in the app panel (odd/tasks/dps-asistencia-pco.md, T15a;
 * S13.2-S13.4, S13.6): how the dps_avisos_* and servidor RPCs are read
 * (supabase/migrations/20261109210000_dps_avisos.sql) and the checks made
 * before calling them. Every name is fictitious.
 */
import {
  MAX_MOTIVO,
  MAX_NOTA_BLOQUEO,
  claveDeColumna,
  claveDePuesto,
  estadoDePersona,
  leerEnvioAvisos,
  leerEstadoAvisos,
  leerFechaBloqueada,
  leerFechasBloqueadas,
  leerMiServicio,
  leerMisServicios,
  leerPendientesAvisos,
  leerPersonasBloqueadas,
  validarFechaBloqueada,
  validarMotivo,
} from '@/lib/platform/dps/avisos'

const PLAN = '11111111-1111-4111-8111-111111111111'
const P1 = '22222222-2222-4222-8222-222222222222'
const P2 = '33333333-3333-4333-8333-333333333333'
const PUESTO = '44444444-4444-4444-8444-444444444444'
const BLOQUEO = '55555555-5555-4555-8555-555555555555'

const ROL_PUESTO = {
  origen: 'puesto',
  puesto_id: PUESTO,
  columna: null,
  nombre: 'Cámara 2',
  equipo: 'Video',
  direccion: 'Producción Técnica',
  automatico: false,
}
const ROL_HOST = { origen: 'columna', puesto_id: null, columna: 'host', nombre: 'Host', equipo: 'Producción Creativa', direccion: 'Producción Creativa', automatico: false }
const BASE = {
  plan_id: PLAN,
  fecha: '2026-11-15',
  tipo: 'domingo',
  titulo: null,
  serie: 'Tu casa tiene influencers',
  persona_id: P1,
  nombre: 'Irene Saavedra',
  iniciales: 'IS',
  tiene_cuenta: true,
}
const ROL_LEIDO = {
  origen: 'puesto',
  puestoId: PUESTO,
  columna: null,
  nombre: 'Cámara 2',
  equipo: 'Video',
  direccion: 'Producción Técnica',
  automatico: false,
}

describe('claves', () => {
  it('name a puesto and a column as the database does', () => {
    expect(claveDePuesto(PUESTO)).toBe(`p:${PUESTO}`)
    expect(claveDeColumna('comunicador')).toBe('c:comunicador')
  })
})

describe('leerPendientesAvisos', () => {
  it('reads the three groups and who gets nothing (02)', () => {
    const r = leerPendientesAvisos({
      total: 3,
      por_correo: 2,
      solo_panel: 1,
      remitente: { nombre: 'Elena Garrido', email: 'elena@example.test' },
      nuevas: [{ ...BASE, tiene_correo: true, roles: [ROL_PUESTO], automatico: false, reemplaza: ['Óscar Bermúdez'] }],
      cambios: [
        {
          ...BASE,
          persona_id: P2,
          nombre: 'Lorena Ibarra',
          iniciales: 'LI',
          roles: [ROL_HOST],
          reinicia: true,
          estado: 'confirmo',
          horarios: ['09:00', '11:30'],
          llegada: '07:30',
          roles_antes: [ROL_PUESTO],
          fecha_antes: null,
          horarios_antes: null,
          llegada_antes: null,
        },
      ],
      quitados: [{ ...BASE, persona_id: P2, roles: [ROL_PUESTO] }],
      no_reciben: {
        ya_respondieron: [{ ...BASE, roles: [ROL_PUESTO] }],
        sin_cuenta: [{ plan_id: PLAN, fecha: '2026-11-15', columna: 'host', nombre: 'Gabriela Nieves' }],
        sin_cambios: 23,
      },
    })
    expect(r.total).toBe(3)
    // S14.1: the channel of the send and who sends it.
    expect([r.porCorreo, r.soloPanel, r.remitente]).toEqual([2, 1, { nombre: 'Elena Garrido', email: 'elena@example.test' }])
    expect(r.cambios[0].tieneCorreo).toBe(false)
    expect(r.nuevas).toEqual([
      {
        planId: PLAN,
        fecha: '2026-11-15',
        tipo: 'domingo',
        titulo: null,
        serie: 'Tu casa tiene influencers',
        personaId: P1,
        nombre: 'Irene Saavedra',
        iniciales: 'IS',
        tieneCuenta: true,
        tieneCorreo: true,
        roles: [ROL_LEIDO],
        automatico: false,
        reemplaza: ['Óscar Bermúdez'],
      },
    ])
    expect(r.cambios[0]).toMatchObject({
      personaId: P2,
      reinicia: true,
      estado: 'confirmo',
      horarios: ['09:00', '11:30'],
      llegada: '07:30',
      roles: [{ origen: 'columna', puestoId: null, columna: 'host', nombre: 'Host' }],
      rolesAntes: [ROL_LEIDO],
      fechaAntes: null,
      horariosAntes: null,
      llegadaAntes: null,
    })
    expect(r.quitados.map((q) => [q.personaId, q.roles.length])).toEqual([[P2, 1]])
    expect(r.noReciben).toEqual({
      yaRespondieron: [expect.objectContaining({ personaId: P1, roles: [ROL_LEIDO] })],
      sinCuenta: [{ planId: PLAN, fecha: '2026-11-15', columna: 'host', nombre: 'Gabriela Nieves' }],
      sinCambios: 23,
    })
  })

  it('drops rows without a valid person or plan and reads a bad answer as nothing pending', () => {
    const r = leerPendientesAvisos({ total: 1, nuevas: [{ ...BASE, persona_id: 'x', roles: [] }, null], cambios: 'no' })
    expect(r).toEqual({
      total: 1,
      porCorreo: 0,
      soloPanel: 0,
      remitente: null,
      nuevas: [],
      cambios: [],
      quitados: [],
      noReciben: { yaRespondieron: [], sinCuenta: [], sinCambios: 0 },
    })
    expect(leerPendientesAvisos(null).total).toBe(0)
  })

  it('keeps an unknown role origin as a puesto and an unknown column as none', () => {
    const r = leerPendientesAvisos({ nuevas: [{ ...BASE, roles: [{ origen: 'otro', columna: 'bajista', nombre: 'X' }] }] })
    expect(r.nuevas[0].roles).toEqual([{ origen: 'puesto', puestoId: null, columna: null, nombre: 'X', equipo: '', direccion: '', automatico: false }])
  })
})

describe('leerEnvioAvisos', () => {
  it('reads the counts of a send', () => {
    expect(leerEnvioAvisos({ enviados: 5, nuevas: 3, cambios: 1, quitados: 1, cerrados: 1, por_correo: 4, solo_panel: 1 })).toEqual({
      enviados: 5,
      nuevas: 3,
      cambios: 1,
      quitados: 1,
      cerrados: 1,
      porCorreo: 4,
      soloPanel: 1,
    })
    expect(leerEnvioAvisos(null)).toEqual({ enviados: 0, nuevas: 0, cambios: 0, quitados: 0, cerrados: 0, porCorreo: 0, soloPanel: 0 })
  })
})

describe('leerEstadoAvisos and estadoDePersona', () => {
  const ESTADO = {
    por_enviar: 2,
    planes: [
      {
        plan_id: PLAN,
        fecha: '2026-11-15',
        pasado: false,
        por_enviar: 2,
        resumen: { sin_avisar: 1, pendiente: 1, confirmo: 23, no_puede: 1, quitado: 1, sin_cuenta: 1 },
        personas: [
          {
            persona_id: P1,
            nombre: 'Óscar Bermúdez',
            iniciales: 'ÓB',
            tiene_cuenta: true,
            estado: 'no_puede',
            por_enviar: null,
            claves: [`p:${PUESTO}`],
            roles_antes: null,
            estado_aviso: 'no_puede',
            motivo: 'Estoy de viaje en Carora ese fin de semana.',
            respondido_at: '2026-11-07T15:00:00+00:00',
            enviado_at: '2026-11-02T15:00:00+00:00',
          },
          {
            persona_id: P2,
            nombre: 'Lorena Ibarra',
            iniciales: 'LI',
            tiene_cuenta: true,
            estado: 'sin_avisar',
            por_enviar: 'cambio',
            claves: ['c:host'],
            roles_antes: [ROL_PUESTO],
            estado_aviso: 'confirmo',
            motivo: null,
            respondido_at: null,
            enviado_at: '2026-11-02T15:00:00+00:00',
          },
          { persona_id: 'x', estado: 'confirmo' },
        ],
      },
    ],
  }

  it('reads the state of each plan and person (01, 03)', () => {
    const r = leerEstadoAvisos(ESTADO)
    expect(r.porEnviar).toBe(2)
    expect(r.planes[0]).toMatchObject({
      planId: PLAN,
      fecha: '2026-11-15',
      pasado: false,
      porEnviar: 2,
      resumen: { sinAvisar: 1, pendiente: 1, confirmo: 23, noPuede: 1, quitado: 1, sinCuenta: 1 },
    })
    expect(r.planes[0].personas).toEqual([
      {
        personaId: P1,
        nombre: 'Óscar Bermúdez',
        iniciales: 'ÓB',
        tieneCuenta: true,
        estado: 'no_puede',
        porEnviar: null,
        claves: [`p:${PUESTO}`],
        rolesAntes: null,
        estadoAviso: 'no_puede',
        motivo: 'Estoy de viaje en Carora ese fin de semana.',
        respondidoAt: '2026-11-07T15:00:00+00:00',
        enviadoAt: '2026-11-02T15:00:00+00:00',
      },
      expect.objectContaining({ personaId: P2, estado: 'sin_avisar', porEnviar: 'cambio', rolesAntes: [ROL_LEIDO], estadoAviso: 'confirmo' }),
    ])
  })

  it('finds a person of a plan, or null', () => {
    const r = leerEstadoAvisos(ESTADO)
    expect(estadoDePersona(r, PLAN, P2)?.estado).toBe('sin_avisar')
    expect(estadoDePersona(r, PLAN, PUESTO)).toBeNull()
    expect(estadoDePersona(r, P1, P2)).toBeNull()
  })

  it('reads an unknown estado as sin_avisar and a bad answer as empty', () => {
    const r = leerEstadoAvisos({ planes: [{ plan_id: PLAN, personas: [{ persona_id: P1, estado: 'raro', por_enviar: 'otro' }] }] })
    expect(r.planes[0].personas[0]).toMatchObject({ estado: 'sin_avisar', porEnviar: null, claves: [] })
    expect(r.planes[0].resumen).toEqual({ sinAvisar: 0, pendiente: 0, confirmo: 0, noPuede: 0, quitado: 0, sinCuenta: 0 })
    expect(leerEstadoAvisos('x')).toEqual({ porEnviar: 0, planes: [] })
  })
})

const SERVICIO = {
  plan_id: PLAN,
  fecha: '2026-11-15',
  tipo: 'domingo',
  titulo: null,
  semana: 4,
  serie: { nombre: 'Tu casa tiene influencers', color: 'chart-2', imagen_path: 'series/tci.webp' },
  roles: [ROL_HOST],
  horarios: ['09:00', '11:30'],
  llegada: '07:30',
  estado: 'confirmo',
  motivo: null,
  respondido_at: '2026-11-09T12:00:00+00:00',
  cambio: true,
  quitado: false,
  visto_at: null,
  antes: { roles: null, fecha: null, horarios: ['09:00'], llegada: '07:00' },
  enviado_at: '2026-11-09T10:00:00+00:00',
  enviado_por: 'Andrés Valero',
}
const SERVICIO_LEIDO = {
  planId: PLAN,
  fecha: '2026-11-15',
  tipo: 'domingo',
  titulo: null,
  semana: 4,
  serie: { nombre: 'Tu casa tiene influencers', color: 'chart-2', imagenPath: 'series/tci.webp' },
  roles: [{ origen: 'columna', puestoId: null, columna: 'host', nombre: 'Host', equipo: 'Producción Creativa', direccion: 'Producción Creativa', automatico: false }],
  horarios: ['09:00', '11:30'],
  llegada: '07:30',
  estado: 'confirmo',
  motivo: null,
  respondidoAt: '2026-11-09T12:00:00+00:00',
  cambio: true,
  quitado: false,
  vistoAt: null,
  antes: { roles: null, fecha: null, horarios: ['09:00'], llegada: '07:00' },
  enviadoAt: '2026-11-09T10:00:00+00:00',
  enviadoPor: 'Andrés Valero',
}

describe('leerMisServicios', () => {
  it('reads the services, the unseen notices and the counts (04, 07)', () => {
    expect(leerMisServicios({ servicios: [SERVICIO], avisos: [{ ...SERVICIO, quitado: true }], por_responder: 1, fechas_bloqueadas: 3 })).toEqual({
      servicios: [SERVICIO_LEIDO],
      avisos: [{ ...SERVICIO_LEIDO, quitado: true }],
      porResponder: 1,
      fechasBloqueadas: 3,
    })
  })

  it('drops a service without a plan; an unknown estado reads pendiente; a bad answer is empty', () => {
    const r = leerMisServicios({ servicios: [{ ...SERVICIO, plan_id: null }, { ...SERVICIO, estado: 'quizas', serie: null, antes: null }] })
    expect(r.servicios).toHaveLength(1)
    expect(r.servicios[0]).toMatchObject({ estado: 'pendiente', serie: null, antes: { roles: null, fecha: null, horarios: null, llegada: null } })
    expect(leerMisServicios(undefined)).toEqual({ servicios: [], avisos: [], porResponder: 0, fechasBloqueadas: 0 })
  })
})

describe('leerMiServicio', () => {
  it('reads the service, the companions (confirmó or not) and the order (05)', () => {
    const r = leerMiServicio({
      servicio: SERVICIO,
      pasado: false,
      personas: 22,
      confirmaron: 15,
      companeros: [
        { persona_id: P1, nombre: 'Valentina Duarte', iniciales: 'VD', yo: true, roles: [ROL_HOST], confirmo: false },
        { persona_id: P2, nombre: 'Ximena Rangel', iniciales: 'XR', yo: false, roles: [ROL_PUESTO], confirmo: true },
      ],
      orden: [{ id: 'o1', posicion: 0, tipo: 'item', titulo: 'Bienvenida', duracion_seg: 180, notas: null, responsable: 'Host', fase: null }],
    })
    expect(r).toEqual({
      servicio: SERVICIO_LEIDO,
      pasado: false,
      personas: 22,
      confirmaron: 15,
      companeros: [
        { personaId: P1, nombre: 'Valentina Duarte', iniciales: 'VD', yo: true, roles: [SERVICIO_LEIDO.roles[0]], confirmo: false },
        { personaId: P2, nombre: 'Ximena Rangel', iniciales: 'XR', yo: false, roles: [ROL_LEIDO], confirmo: true },
      ],
      orden: [{ id: 'o1', posicion: 0, tipo: 'item', titulo: 'Bienvenida', duracionSeg: 180, notas: null, responsable: 'Host', fase: null }],
    })
  })

  it('is null without a service', () => {
    expect(leerMiServicio({ servicio: null })).toBeNull()
    expect(leerMiServicio(null)).toBeNull()
  })
})

describe('fechas bloqueadas', () => {
  const FILA = { id: BLOQUEO, desde: '2026-12-20', hasta: '2027-01-03', nota: 'Vacaciones en familia', conflictos: [SERVICIO] }

  it('reads one range with its conflicts and the list (06)', () => {
    expect(leerFechaBloqueada(FILA)).toEqual({ id: BLOQUEO, desde: '2026-12-20', hasta: '2027-01-03', nota: 'Vacaciones en familia', conflictos: [SERVICIO_LEIDO] })
    expect(leerFechasBloqueadas([FILA, { id: 'x' }, null])).toHaveLength(1)
    expect(leerFechaBloqueada({ id: BLOQUEO, desde: '2026-12-20' })).toBeNull()
    expect(leerFechasBloqueadas('x')).toEqual([])
  })

  it('reads who blocked a plan’s date', () => {
    expect(leerPersonasBloqueadas([{ persona_id: P1, nota: 'Graduación de mi hermana' }, { persona_id: P2, nota: null }, { persona_id: 'x' }])).toEqual([
      { personaId: P1, nota: 'Graduación de mi hermana' },
      { personaId: P2, nota: null },
    ])
  })

  it('checks a range before asking: dates, order, up to 366 days, nota up to 200', () => {
    expect(validarFechaBloqueada('2026-12-20', '2027-01-03', '  Vacaciones  ')).toEqual({ ok: true, desde: '2026-12-20', hasta: '2027-01-03', nota: 'Vacaciones' })
    expect(validarFechaBloqueada('2026-12-20', '2026-12-20', '   ')).toEqual({ ok: true, desde: '2026-12-20', hasta: '2026-12-20', nota: null })
    expect(validarFechaBloqueada('2096-01-01', '2097-01-01', null)).toMatchObject({ ok: true })
    expect(validarFechaBloqueada('2096-01-01', '2097-01-02', null)).toEqual({
      ok: false,
      codigo: 'rango_invalido',
      mensaje: 'Revisa las fechas: «Hasta» no puede ser antes de «Desde» y el rango es de hasta un año.',
    })
    expect(validarFechaBloqueada('2026-12-21', '2026-12-20', null)).toMatchObject({ ok: false, codigo: 'rango_invalido' })
    expect(validarFechaBloqueada('2026-02-30', '2026-03-01', null)).toEqual({ ok: false, codigo: 'fecha_invalida', mensaje: 'Elige las fechas «Desde» y «Hasta».' })
    expect(validarFechaBloqueada('', '2026-03-01', null)).toMatchObject({ ok: false, codigo: 'fecha_invalida' })
    expect(validarFechaBloqueada('2026-12-20', '2026-12-20', 'x'.repeat(MAX_NOTA_BLOQUEO + 1))).toEqual({
      ok: false,
      codigo: 'nota_invalida',
      mensaje: 'La nota va hasta 200 caracteres.',
    })
  })
})

describe('validarMotivo', () => {
  it('trims, keeps an empty one as null and refuses more than 300', () => {
    expect(validarMotivo('  Viaje a Carora ')).toEqual({ ok: true, motivo: 'Viaje a Carora' })
    expect(validarMotivo('   ')).toEqual({ ok: true, motivo: null })
    expect(validarMotivo(undefined)).toEqual({ ok: true, motivo: null })
    expect(validarMotivo('x'.repeat(MAX_MOTIVO))).toMatchObject({ ok: true })
    expect(validarMotivo('x'.repeat(MAX_MOTIVO + 1))).toEqual({ ok: false, mensaje: 'El motivo va hasta 300 caracteres.' })
  })
})

/**
 * Niños › Eventos (odd/tasks/ninos-checkin-pco.md, T1c, S5, S8): reading
 * ninos_eventos_admin, the form and window checks, the texts of the screen and
 * the server actions (input checks, RPC arguments, the RPC HINT shown as is).
 */
const rpc = jest.fn()
const getUser = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))

import {
  agregarHorario,
  archivarEvento,
  guardarEvento,
  guardarVentanaHorario,
  quitarHorario,
} from '@/lib/actions/ninos-eventos.actions'
import {
  estadoEvento,
  leerEventosAdmin,
  mensajeErrorEventos,
  proximaApertura,
  proximaFecha,
  textoFrecuencia,
  textoHorarioQuitado,
  textoVentana,
  turnosDisponibles,
  validarEvento,
  validarHora,
  validarVentana,
  type EventoAdmin,
} from '@/lib/platform/ninos/eventos'

const CAMPUS = '11111111-1111-4111-8111-111111111111'
const EVENTO = '22222222-2222-4222-8222-222222222222'
const HORARIO = '33333333-3333-4333-8333-333333333333'
const TURNO = '44444444-4444-4444-8444-444444444444'

const filaRpc = {
  id: EVENTO,
  campus_id: CAMPUS,
  nombre: 'Domingo semanal',
  tipo: 'semanal',
  dia_semana: 0,
  fecha_inicio: null,
  fecha_fin: null,
  precheck_app: true,
  avisos_push: true,
  visitante_una_vez: false,
  integracion_dream_team: true,
  anuncio_mesa: 'Hoy Preadolescentes está cerrado.',
  activo: true,
  orden: 1,
  horarios: [
    {
      id: HORARIO,
      turno_id: TURNO,
      nombre: 'Primer servicio',
      hora: '09:00',
      dia_semana: 0,
      turno_tipo: 'semanal',
      turno_activo: true,
      fechas: [],
      abre_min_antes: 45,
      cierra_min_despues: 105,
      turno_creado: false,
      orden: 1,
      activo: true,
    },
  ],
  sesiones: [
    { fecha: '2026-11-01', ninos: 89 },
    { fecha: '2026-10-25', ninos: 84 },
  ],
}

function evento(parcial: Partial<EventoAdmin> = {}): EventoAdmin {
  return { ...leerEventosAdmin([filaRpc])[0], ...parcial }
}

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  revalidatePath.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('leerEventosAdmin', () => {
  it('reads the events with their horarios and sessions', () => {
    expect(leerEventosAdmin([filaRpc])).toEqual([
      {
        id: EVENTO,
        campusId: CAMPUS,
        nombre: 'Domingo semanal',
        tipo: 'semanal',
        diaSemana: 0,
        fechaInicio: null,
        fechaFin: null,
        precheckApp: true,
        avisosPush: true,
        visitanteUnaVez: false,
        integracionDreamTeam: true,
        anuncioMesa: 'Hoy Preadolescentes está cerrado.',
        activo: true,
        horarios: [
          {
            id: HORARIO,
            turnoId: TURNO,
            nombre: 'Primer servicio',
            hora: '09:00',
            turnoTipo: 'semanal',
            turnoActivo: true,
            fechas: [],
            abreMinAntes: 45,
            cierraMinDespues: 105,
            turnoCreado: false,
            activo: true,
          },
        ],
        sesiones: [
          { fecha: '2026-11-01', ninos: 89 },
          { fecha: '2026-10-25', ninos: 84 },
        ],
      },
    ])
  })

  it('drops rows it cannot trust and reads a non-array as no events', () => {
    expect(leerEventosAdmin(null)).toEqual([])
    expect(leerEventosAdmin({ id: EVENTO })).toEqual([])
    const sinTipo = { ...filaRpc, tipo: 'mensual' }
    const sinId = { ...filaRpc, id: 7 }
    const horarioMalo = { ...filaRpc, horarios: [{ id: HORARIO }, filaRpc.horarios[0]], sesiones: [{ fecha: 3 }] }
    const leidos = leerEventosAdmin([sinTipo, sinId, horarioMalo, 'x'])
    expect(leidos).toHaveLength(1)
    expect(leidos[0].horarios).toHaveLength(1)
    expect(leidos[0].sesiones).toEqual([])
  })

  it('keeps the dates of a dated horario and an empty notice as none', () => {
    const [e] = leerEventosAdmin([
      {
        ...filaRpc,
        tipo: 'diario',
        dia_semana: null,
        fecha_inicio: '2027-01-06',
        fecha_fin: '2027-01-10',
        anuncio_mesa: null,
        horarios: [{ ...filaRpc.horarios[0], turno_tipo: 'fechas', fechas: ['2027-01-06', '2027-01-07'] }],
      },
    ])
    expect(e).toMatchObject({ tipo: 'diario', diaSemana: null, fechaInicio: '2027-01-06', fechaFin: '2027-01-10', anuncioMesa: null })
    expect(e.horarios[0]).toMatchObject({ turnoTipo: 'fechas', fechas: ['2027-01-06', '2027-01-07'] })
  })
})

describe('mensajeErrorEventos', () => {
  it('shows the HINT of the RPC as is', () => {
    expect(
      mensajeErrorEventos({
        code: '42501',
        message: 'sin_autoridad',
        hint: 'Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.',
      }),
    ).toBe('Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.')
  })

  it('falls back to a Spanish sentence without a HINT', () => {
    expect(mensajeErrorEventos({ code: '42501', message: 'sin_autoridad' })).toBe(
      'No tienes permiso para cambiar los eventos de Niños de este campus.',
    )
    expect(mensajeErrorEventos({ message: 'fetch failed' })).toBe('No se pudo guardar. Inténtalo de nuevo.')
    expect(mensajeErrorEventos(null)).toBe('No se pudo guardar. Inténtalo de nuevo.')
  })
})

describe('validarEvento', () => {
  const semanal = { nombre: 'Domingo semanal', tipo: 'semanal', diaSemana: 0, fechaInicio: null, fechaFin: null, anuncioMesa: null } as const

  it('accepts each tipo with its date fields', () => {
    expect(validarEvento(semanal)).toBeNull()
    expect(validarEvento({ ...semanal, tipo: 'diario', diaSemana: null, fechaInicio: '2027-01-06', fechaFin: '2027-02-05' })).toBeNull()
    expect(validarEvento({ ...semanal, tipo: 'unico', diaSemana: null, fechaInicio: '2026-11-20' })).toBeNull()
  })

  it('says what is missing with the RPC sentences', () => {
    expect(validarEvento({ ...semanal, nombre: '   ' })).toBe('El evento necesita un nombre de hasta 80 caracteres.')
    expect(validarEvento({ ...semanal, nombre: 'x'.repeat(81) })).toBe('El evento necesita un nombre de hasta 80 caracteres.')
    expect(validarEvento({ ...semanal, tipo: 'mensual' as never })).toBe('El evento es semanal, diario o de un solo día.')
    expect(validarEvento({ ...semanal, diaSemana: null })).toBe('Un evento semanal necesita el día de la semana.')
    expect(validarEvento({ ...semanal, diaSemana: 7 })).toBe('Un evento semanal necesita el día de la semana.')
    const diario = { ...semanal, tipo: 'diario', diaSemana: null } as const
    expect(validarEvento({ ...diario, fechaInicio: '2027-01-06' })).toBe('Un evento diario necesita fecha de inicio y de fin, de 1 a 31 días.')
    expect(validarEvento({ ...diario, fechaInicio: '2027-01-10', fechaFin: '2027-01-06' })).toBe(
      'Un evento diario necesita fecha de inicio y de fin, de 1 a 31 días.',
    )
    expect(validarEvento({ ...diario, fechaInicio: '2027-01-06', fechaFin: '2027-02-06' })).toBe(
      'Un evento diario necesita fecha de inicio y de fin, de 1 a 31 días.',
    )
    expect(validarEvento({ ...semanal, tipo: 'unico', diaSemana: null, fechaInicio: '20/11/2026' })).toBe(
      'Un evento de un solo día necesita su fecha.',
    )
    expect(validarEvento({ ...semanal, anuncioMesa: 'a'.repeat(141) })).toBe('El anuncio de la mesa admite hasta 140 caracteres.')
    expect(validarEvento({ ...semanal, anuncioMesa: 'a'.repeat(140) })).toBeNull()
  })
})

describe('validarVentana and validarHora', () => {
  it('takes whole minutes from 0 to 240', () => {
    expect(validarVentana(0, 240)).toBeNull()
    expect(validarVentana(45, 105)).toBeNull()
    expect(validarVentana(-1, 10)).toBe('La apertura y el cierre van de 0 a 240 minutos.')
    expect(validarVentana(10, 241)).toBe('La apertura y el cierre van de 0 a 240 minutos.')
    expect(validarVentana(10.5, 10)).toBe('La apertura y el cierre van de 0 a 240 minutos.')
    expect(validarVentana(Number.NaN, 10)).toBe('La apertura y el cierre van de 0 a 240 minutos.')
  })

  it('takes the hour as 9:00 or 18:30', () => {
    expect(validarHora('9:00')).toBeNull()
    expect(validarHora('18:30')).toBeNull()
    expect(validarHora('24:00')).toBe('Escribe la hora como 9:00 o 18:30.')
    expect(validarHora('9')).toBe('Escribe la hora como 9:00 o 18:30.')
    expect(validarHora('')).toBe('Indica la hora del servicio.')
  })
})

describe('texts of the screen', () => {
  it('says when an event happens', () => {
    expect(textoFrecuencia(evento())).toBe('Todos los domingos')
    expect(textoFrecuencia(evento({ diaSemana: 3 }))).toBe('Todos los miércoles')
    expect(textoFrecuencia(evento({ tipo: 'diario', diaSemana: null, fechaInicio: '2027-01-06', fechaFin: '2027-01-10' }))).toBe(
      'Del mié 6 al dom 10 ene 2027',
    )
    expect(textoFrecuencia(evento({ tipo: 'diario', diaSemana: null, fechaInicio: '2026-12-28', fechaFin: '2027-01-03' }))).toBe(
      'Del lun 28 dic 2026 al dom 3 ene 2027',
    )
    expect(textoFrecuencia(evento({ tipo: 'diario', diaSemana: null, fechaInicio: '2026-11-28', fechaFin: '2026-12-02' }))).toBe(
      'Del sáb 28 nov al mié 2 dic 2026',
    )
    expect(textoFrecuencia(evento({ tipo: 'unico', diaSemana: null, fechaInicio: '2026-11-20' }))).toBe('Vie 20 nov 2026')
  })

  it('says the check-in window with the times it gives', () => {
    const [h] = evento().horarios
    expect(textoVentana(h)).toBe('Abre a las 8:15 · el retiro cierra a las 10:45')
    expect(textoVentana({ ...h, abreMinAntes: 0, cierraMinDespues: 0 })).toBe('Abre a las 9:00 · el retiro cierra a las 9:00')
  })

  it('tells the state of each event', () => {
    const hoy = '2026-11-07'
    expect(estadoEvento(evento(), hoy)).toEqual({ etiqueta: 'Activo', tono: 'success' })
    expect(estadoEvento(evento({ activo: false }), hoy)).toEqual({ etiqueta: 'Archivado', tono: 'muted' })
    const unico = evento({ tipo: 'unico', diaSemana: null, fechaInicio: '2026-11-20' })
    expect(estadoEvento(unico, hoy)).toEqual({ etiqueta: 'Programado', tono: 'info' })
    expect(estadoEvento({ ...unico, fechaInicio: hoy }, hoy)).toEqual({ etiqueta: 'Hoy', tono: 'success' })
    expect(estadoEvento({ ...unico, fechaInicio: '2026-11-01' }, hoy)).toEqual({ etiqueta: 'Terminado', tono: 'muted' })
    const diario = evento({ tipo: 'diario', diaSemana: null, fechaInicio: '2026-11-05', fechaFin: '2026-11-09' })
    expect(estadoEvento(diario, hoy)).toEqual({ etiqueta: 'En curso', tono: 'success' })
  })

  it('finds the next date and the next check-in opening', () => {
    const hoy = '2026-11-07' // sábado
    expect(proximaFecha(evento(), hoy)).toBe('2026-11-08')
    expect(proximaFecha(evento(), '2026-11-08')).toBe('2026-11-08')
    expect(proximaFecha(evento({ tipo: 'unico', diaSemana: null, fechaInicio: '2026-11-01' }), hoy)).toBeNull()
    expect(proximaFecha(evento({ tipo: 'diario', diaSemana: null, fechaInicio: '2026-11-05', fechaFin: '2026-11-09' }), hoy)).toBe(hoy)
    expect(proximaFecha(evento({ activo: false }), hoy)).toBeNull()

    const noche = evento({ id: 'n', tipo: 'unico', diaSemana: null, fechaInicio: '2026-11-20' })
    expect(proximaApertura([noche, evento()], hoy)).toEqual({ fecha: '2026-11-08', hora: '8:15', texto: 'el dom 8 nov a las 8:15' })
    expect(proximaApertura([evento({ horarios: [] })], hoy)).toBeNull()
  })

  it('offers the weekly turnos of the weekday that no horario links yet', () => {
    const turnos = [
      { id: TURNO, nombre: 'Primer servicio', hora: '09:00:00', dia_semana: 0 },
      { id: 't2', nombre: 'Segundo servicio', hora: '11:00:00', dia_semana: 0 },
      { id: 't3', nombre: 'Miércoles', hora: '19:00:00', dia_semana: 3 },
    ]
    expect(turnosDisponibles(turnos, [evento()], 0)).toEqual([{ id: 't2', nombre: 'Segundo servicio', hora: '11:00' }])
  })

  it('says what happened to the turno of a removed horario', () => {
    expect(textoHorarioQuitado('Jornada', true)).toBe(
      'Quitaste el horario Jornada. Su turno de Dream Team no tenía voluntarios ni asistencias, así que también se borró.',
    )
    expect(textoHorarioQuitado('Primer servicio', false)).toBe(
      'Quitaste el horario Primer servicio. El turno sigue en Dream Team con sus voluntarios y asistencias.',
    )
  })
})

describe('guardarEvento', () => {
  const input = {
    campusId: CAMPUS,
    eventoId: null,
    nombre: ' Noche de padres ',
    tipo: 'unico',
    diaSemana: null,
    fechaInicio: '2026-11-20',
    fechaFin: null,
    precheckApp: false,
    avisosPush: true,
    visitanteUnaVez: true,
    integracionDreamTeam: false,
    anuncioMesa: '',
  } as const

  it('creates an event with every field and revalidates the screen', async () => {
    rpc.mockResolvedValueOnce({ data: EVENTO, error: null })
    expect(await guardarEvento(input)).toEqual({ ok: true, data: { id: EVENTO } })
    expect(rpc).toHaveBeenCalledWith('ninos_evento_guardar', {
      p_campus_id: CAMPUS,
      p_evento_id: null,
      p_nombre: 'Noche de padres',
      p_tipo: 'unico',
      p_dia_semana: null,
      p_fecha_inicio: '2026-11-20',
      p_fecha_fin: null,
      p_precheck_app: false,
      p_avisos_push: true,
      p_visitante_una_vez: true,
      p_integracion_dream_team: false,
      p_anuncio_mesa: '',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/ninos/eventos')
  })

  it('shows the HINT when the RPC refuses', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'nombre_duplicado', hint: 'Ya hay un evento activo con ese nombre en este campus.' },
    })
    expect(await guardarEvento({ ...input, eventoId: EVENTO })).toEqual({
      ok: false,
      message: 'Ya hay un evento activo con ese nombre en este campus.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('checks the form before calling', async () => {
    expect(await guardarEvento({ ...input, fechaInicio: null })).toEqual({ ok: false, message: 'Un evento de un solo día necesita su fecha.' })
    expect(await guardarEvento({ ...input, campusId: 'x' })).toEqual({ ok: false, message: 'Revisa los datos e inténtalo de nuevo.' })
    expect(await guardarEvento({ ...input, precheckApp: 'si' as never })).toEqual({ ok: false, message: 'Revisa los datos e inténtalo de nuevo.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('asks to sign in again without a session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await guardarEvento(input)).toEqual({ ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('archivarEvento', () => {
  it('archives or restores', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(await archivarEvento({ eventoId: EVENTO, activo: false })).toEqual({ ok: true, data: { activo: false } })
    expect(rpc).toHaveBeenCalledWith('ninos_evento_archivar', { p_evento_id: EVENTO, p_activo: false })
    expect(revalidatePath).toHaveBeenCalledWith('/ninos/eventos')
  })

  it('shows the HINT and refuses a bad id', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'nombre_duplicado', hint: 'Ya hay un evento activo con ese nombre en este campus.' },
    })
    expect(await archivarEvento({ eventoId: EVENTO, activo: true })).toEqual({
      ok: false,
      message: 'Ya hay un evento activo con ese nombre en este campus.',
    })
    expect(await archivarEvento({ eventoId: 'x', activo: true })).toEqual({ ok: false, message: 'Revisa los datos e inténtalo de nuevo.' })
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('agregarHorario', () => {
  it('links an existing weekly turno', async () => {
    rpc.mockResolvedValueOnce({ data: HORARIO, error: null })
    expect(await agregarHorario({ eventoId: EVENTO, turnoId: TURNO, abreMinAntes: 45, cierraMinDespues: 105 })).toEqual({
      ok: true,
      data: { id: HORARIO },
    })
    expect(rpc).toHaveBeenCalledWith('ninos_horario_agregar', {
      p_evento_id: EVENTO,
      p_turno_id: TURNO,
      p_nombre: null,
      p_hora: null,
      p_abre_min_antes: 45,
      p_cierra_min_despues: 105,
    })
  })

  it('creates a new turno with a name and an hour', async () => {
    rpc.mockResolvedValueOnce({ data: HORARIO, error: null })
    await agregarHorario({ eventoId: EVENTO, nombre: ' Jornada ', hora: '8:30', abreMinAntes: 45, cierraMinDespues: 240 })
    expect(rpc).toHaveBeenCalledWith('ninos_horario_agregar', {
      p_evento_id: EVENTO,
      p_turno_id: null,
      p_nombre: 'Jornada',
      p_hora: '08:30',
      p_abre_min_antes: 45,
      p_cierra_min_despues: 240,
    })
  })

  it('checks the hour and the window before calling, and shows the HINT', async () => {
    expect(await agregarHorario({ eventoId: EVENTO, nombre: 'Jornada', hora: '8', abreMinAntes: 45, cierraMinDespues: 60 })).toEqual({
      ok: false,
      message: 'Escribe la hora como 9:00 o 18:30.',
    })
    expect(await agregarHorario({ eventoId: EVENTO, turnoId: TURNO, abreMinAntes: 300, cierraMinDespues: 60 })).toEqual({
      ok: false,
      message: 'La apertura y el cierre van de 0 a 240 minutos.',
    })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'turno_duplicado', hint: 'Ya hay un turno de Dream Team con ese nombre en el campus.' },
    })
    expect(await agregarHorario({ eventoId: EVENTO, nombre: 'Jornada', hora: '8:30', abreMinAntes: 45, cierraMinDespues: 60 })).toEqual({
      ok: false,
      message: 'Ya hay un turno de Dream Team con ese nombre en el campus.',
    })
  })
})

describe('guardarVentanaHorario', () => {
  it('saves when the check-in opens and the pickup closes', async () => {
    rpc.mockResolvedValueOnce({ data: HORARIO, error: null })
    expect(await guardarVentanaHorario({ horarioId: HORARIO, abreMinAntes: 30, cierraMinDespues: 90 })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('ninos_horario_ventana_guardar', {
      p_horario_id: HORARIO,
      p_abre_min_antes: 30,
      p_cierra_min_despues: 90,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/ninos/eventos')
  })

  it('refuses minutes out of range before calling', async () => {
    expect(await guardarVentanaHorario({ horarioId: HORARIO, abreMinAntes: 30, cierraMinDespues: 241 })).toEqual({
      ok: false,
      message: 'La apertura y el cierre van de 0 a 240 minutos.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('quitarHorario', () => {
  it('returns whether the turno was deleted too', async () => {
    rpc.mockResolvedValueOnce({ data: { turno_borrado: true }, error: null })
    expect(await quitarHorario({ horarioId: HORARIO })).toEqual({ ok: true, data: { turnoBorrado: true } })
    expect(rpc).toHaveBeenCalledWith('ninos_horario_quitar', { p_horario_id: HORARIO })
    rpc.mockResolvedValueOnce({ data: { turno_borrado: false }, error: null })
    expect(await quitarHorario({ horarioId: HORARIO })).toEqual({ ok: true, data: { turnoBorrado: false } })
  })

  it('shows the HINT of the RPC', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42501',
        message: 'sin_autoridad',
        hint: 'Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.',
      },
    })
    expect(await quitarHorario({ horarioId: HORARIO })).toEqual({
      ok: false,
      message: 'Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.',
    })
  })
})

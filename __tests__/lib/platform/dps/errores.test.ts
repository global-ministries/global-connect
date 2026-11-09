/**
 * The dps_* RPCs raise their code as the message
 * (supabase/migrations/20261108201000_dps_planificacion_rpcs.sql and
 * 20261108202000_dps_planificacion_convocados.sql); the screens show these
 * Spanish sentences instead (odd/tasks/dps-asistencia-pco.md, T9).
 */
import { codigoErrorDps, mensajeErrorDps } from '@/lib/platform/dps/errores'

const error = (message: string, code = '22023') => ({ code, message })

describe('codigoErrorDps', () => {
  it('reads the code of the RPC error', () => {
    expect(codigoErrorDps(error('sin_autoridad', '42501'))).toBe('sin_autoridad')
    expect(codigoErrorDps(error('fecha_invalida'))).toBe('fecha_invalida')
    expect(codigoErrorDps(error('algo raro'))).toBeNull()
    expect(codigoErrorDps(null)).toBeNull()
  })
})

describe('mensajeErrorDps', () => {
  it.each([
    ['sin_autoridad', 'asistencia', 'No tienes permiso para pasar asistencia en este equipo.'],
    ['sin_autoridad', 'configuracion', 'Solo la dirección de DPS, un pastor o un administrador puede cambiar la configuración.'],
    ['fecha_invalida', 'asistencia', 'Solo se puede pasar asistencia el día del plan o hasta 14 días después.'],
    ['persona_invalida', 'asistencia', 'Esa persona ya no está en este plan ni sirve en DPS. Actualiza la página.'],
    ['persona_invalida', 'configuracion', 'Esa persona ya no existe. Busca de nuevo.'],
    ['demasiados', 'asistencia', 'Son demasiadas personas a la vez (máximo 300).'],
    ['plan_invalido', 'asistencia', 'Ese plan ya no existe. Actualiza la página.'],
    ['equipo_invalido', 'asistencia', 'Ese equipo ya no está en DPS. Actualiza la página.'],
    ['estado_invalido', 'asistencia', 'No se pudo guardar la asistencia. Intenta de nuevo.'],
    ['rango_invalido', 'asistencia', 'Revisa las fechas e inténtalo de nuevo.'],
    ['horarios_invalidos', 'configuracion', 'Revisa los horarios: de 1 a 4, con el formato 09:15.'],
    ['llegada_invalida', 'configuracion', 'Revisa la llegada: con el formato 07:00 y no después del primer horario.'],
  ] as const)('%s (%s)', (codigo, contexto, mensaje) => {
    expect(mensajeErrorDps(error(codigo, codigo === 'sin_autoridad' ? '42501' : '22023'), contexto)).toBe(mensaje)
  })

  it('falls back to a generic sentence per screen', () => {
    expect(mensajeErrorDps(error('XX000'), 'asistencia')).toBe('No se pudo guardar la asistencia. Intenta de nuevo.')
    expect(mensajeErrorDps(null, 'configuracion')).toBe('No se pudo guardar la configuración. Intenta de nuevo.')
    expect(mensajeErrorDps(error('XX000'), 'planilla')).toBe('No se pudo cargar la asistencia. Actualiza la página.')
  })

  // T10: the plan del domingo (read, convocados, copy, cover).
  it.each([
    ['sin_autoridad', 'plan', 'No tienes acceso a los planes de DPS.'],
    ['sin_autoridad', 'equipos', 'Solo quienes arman el plan pueden cambiar los convocados.'],
    ['sin_autoridad', 'portada', 'Solo quienes arman el plan pueden cambiar la portada.'],
    ['plan_invalido', 'equipos', 'Ese plan ya no existe. Actualiza la página.'],
    ['servicio_invalido', 'equipos', 'Esa persona ya no sirve en este equipo. Busca de nuevo.'],
    ['puesto_invalido', 'equipos', 'Ese puesto ya no está activo. Actualiza la página.'],
    ['destino_con_convocados', 'equipos', 'Este plan ya tiene convocados. Elige si quieres reemplazarlos.'],
    ['busqueda_invalida', 'equipos', 'La búsqueda es muy larga (máximo 100 caracteres).'],
    ['imagen_invalida', 'portada', 'La imagen debe ser JPG, PNG o WebP de hasta 5 MB.'],
    ['serie_invalida', 'portada', 'Esa serie ya no existe. Actualiza la página.'],
    // S8: the director of a dirección is not removed by hand.
    ['convocado_automatico', 'equipos', 'Este director se asigna solo desde su dirección; cámbialo en Dream Team'],
  ] as const)('%s (%s)', (codigo, contexto, mensaje) => {
    expect(mensajeErrorDps(error(codigo, codigo === 'sin_autoridad' ? '42501' : '22023'), contexto)).toBe(mensaje)
    expect(codigoErrorDps(error(codigo))).toBe(codigo)
  })

  it('falls back to a generic sentence on the plan screens', () => {
    expect(mensajeErrorDps(error('XX000'), 'plan')).toBe('No se pudo cargar el plan. Actualiza la página.')
    expect(mensajeErrorDps(error('XX000'), 'equipos')).toBe('No se pudo guardar el cambio. Intenta de nuevo.')
    expect(mensajeErrorDps(error('XX000'), 'portada')).toBe('No se pudo cambiar la portada. Intenta de nuevo.')
  })

  // T13 + S10: the order of the service and each plan's horarios.
  it.each([
    ['sin_autoridad', 'orden', 'Solo quienes arman el plan pueden cambiar el orden del servicio.'],
    ['sin_autoridad', 'horarios', 'Solo quienes arman el plan pueden cambiar los horarios.'],
    ['plan_invalido', 'orden', 'Ese plan ya no existe. Actualiza la página.'],
    ['item_invalido', 'orden', 'Ese elemento ya no está en el orden. Actualiza la página.'],
    ['titulo_invalido', 'orden', 'Escribe el título (máximo 120 caracteres).'],
    ['duracion_invalida', 'orden', 'Escribe la duración como minutos:segundos, por ejemplo 4:30 (máximo 240 minutos).'],
    ['valor_invalido', 'orden', 'Las notas van hasta 500 caracteres y el responsable hasta 80.'],
    ['fase_invalida', 'orden', 'Elige antes, en o después del servicio.'],
    ['posicion_invalida', 'orden', 'No se pudo mover el elemento. Actualiza la página.'],
    ['orden_lleno', 'orden', 'El orden llegó al máximo de 150 filas.'],
    ['destino_con_orden', 'orden', 'Este plan ya tiene orden. Elige si quieres reemplazarlo.'],
    ['horarios_invalidos', 'horarios', 'Revisa los servicios: de 1 a 4, cada uno después del anterior, con el formato 09:15.'],
    ['llegada_invalida', 'horarios', 'La llegada del equipo tiene que ser antes del primer servicio.'],
  ] as const)('%s (%s)', (codigo, contexto, mensaje) => {
    expect(mensajeErrorDps(error(codigo, codigo === 'sin_autoridad' ? '42501' : '22023'), contexto)).toBe(mensaje)
    expect(codigoErrorDps(error(codigo))).toBe(codigo)
  })

  it('keeps the configuration texts of horarios and llegada', () => {
    expect(mensajeErrorDps(error('horarios_invalidos'), 'configuracion')).toBe('Revisa los horarios: de 1 a 4, con el formato 09:15.')
    expect(mensajeErrorDps(error('titulo_invalido'), 'evento')).toBe('Escribe el título del evento (máximo 120 caracteres).')
    expect(mensajeErrorDps(error('XX000'), 'orden')).toBe('No se pudo guardar el orden. Intenta de nuevo.')
    expect(mensajeErrorDps(error('XX000'), 'horarios')).toBe('No se pudieron guardar los horarios. Intenta de nuevo.')
  })

  // S12: the lists by position (Configuración › Listas) and the cells of several people.
  it.each([
    ['sin_autoridad', 'listas', 'No tienes permiso para cambiar esta lista.'],
    ['lista_invalida', 'listas', 'Los productores y los cantantes se gestionan en Dream Team.'],
    ['persona_invalida', 'listas', 'Esa persona ya no existe. Busca de nuevo.'],
    ['busqueda_invalida', 'listas', 'La búsqueda es muy larga (máximo 100 caracteres).'],
    ['persona_fuera_de_lista', 'programacion', 'Esa persona no está en la lista de esta columna. Revisa Configuración › Listas o escribe su nombre sin cuenta.'],
    ['demasiadas_personas', 'programacion', 'Son demasiadas personas para esta celda: hasta 3, y hasta 8 en Cantantes.'],
  ] as const)('%s (%s)', (codigo, contexto, mensaje) => {
    expect(mensajeErrorDps(error(codigo, codigo === 'sin_autoridad' ? '42501' : '22023'), contexto)).toBe(mensaje)
    expect(codigoErrorDps(error(codigo))).toBe(codigo)
    expect(mensajeErrorDps(error('XX000'), 'listas')).toBe('No se pudo guardar la lista. Intenta de nuevo.')
  })

  // S13: service notices (planner and person) and the dates a person cannot serve.
  it.each([
    ['sin_autoridad', 'avisos', 'Solo quienes arman el plan pueden ver y enviar los avisos.'],
    ['demasiados', 'avisos', 'Son demasiadas fechas a la vez. Elige un rango más corto.'],
    ['plan_invalido', 'avisos', 'Ese plan ya no existe. Actualiza la página.'],
    ['sin_autoridad', 'mis_servicios', 'Ya no estás programado en este servicio. Actualiza la página.'],
    ['plan_pasado', 'mis_servicios', 'Este servicio ya pasó: ya no puedes responder.'],
    ['respuesta_invalida', 'mis_servicios', 'Elige Confirmar o No puedo.'],
    ['motivo_invalido', 'mis_servicios', 'El motivo va hasta 300 caracteres.'],
    ['sin_autoridad', 'fechas_bloqueadas', 'No pudimos identificarte. Vuelve a iniciar sesión.'],
    ['fecha_invalida', 'fechas_bloqueadas', 'Elige las fechas «Desde» y «Hasta».'],
    ['rango_invalido', 'fechas_bloqueadas', 'Revisa las fechas: «Hasta» no puede ser antes de «Desde» y el rango es de hasta un año.'],
    ['fecha_pasada', 'fechas_bloqueadas', 'Esas fechas ya pasaron. Elige fechas de hoy en adelante.'],
    ['nota_invalida', 'fechas_bloqueadas', 'La nota va hasta 200 caracteres.'],
    ['bloqueo_invalido', 'fechas_bloqueadas', 'Esa fecha ya no está en tu lista. Actualiza la página.'],
    ['demasiados', 'fechas_bloqueadas', 'Tienes demasiadas fechas bloqueadas (máximo 100). Quita alguna antes de agregar otra.'],
  ] as const)('%s (%s)', (codigo, contexto, mensaje) => {
    expect(mensajeErrorDps(error(codigo, codigo === 'sin_autoridad' ? '42501' : '22023'), contexto)).toBe(mensaje)
    expect(codigoErrorDps(error(codigo))).toBe(codigo)
  })

  it('falls back to a generic sentence on the notice screens and keeps the other texts', () => {
    expect(mensajeErrorDps(error('XX000'), 'avisos')).toBe('No se pudieron enviar los avisos. Intenta de nuevo.')
    expect(mensajeErrorDps(error('XX000'), 'mis_servicios')).toBe('No se pudo guardar tu respuesta. Intenta de nuevo.')
    expect(mensajeErrorDps(error('XX000'), 'fechas_bloqueadas')).toBe('No se pudo guardar la fecha. Intenta de nuevo.')
    expect(mensajeErrorDps(error('demasiados'), 'asistencia')).toBe('Son demasiadas personas a la vez (máximo 300).')
    expect(mensajeErrorDps(error('plan_pasado'), 'evento')).toBe('Este día ya pasó: no se puede mover.')
    expect(mensajeErrorDps(error('fecha_pasada'), 'evento')).toBe('Elige una fecha de hoy en adelante.')
    expect(mensajeErrorDps(error('rango_invalido'), 'asistencia')).toBe('Revisa las fechas e inténtalo de nuevo.')
  })

  it('explains a missing sheet authority as "no teams"', () => {
    expect(mensajeErrorDps(error('sin_autoridad', '42501'), 'planilla')).toBe('No tienes equipos para pasar asistencia en este plan.')
  })
})

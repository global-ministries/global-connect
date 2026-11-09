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
    ['horarios_invalidos', 'configuracion', 'Revisa los horarios: de 1 a 6, con el formato 09:15.'],
    ['llegada_invalida', 'configuracion', 'Revisa la hora de llegada, con el formato 07:00.'],
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

  it('explains a missing sheet authority as "no teams"', () => {
    expect(mensajeErrorDps(error('sin_autoridad', '42501'), 'planilla')).toBe('No tienes equipos para pasar asistencia en este plan.')
  })
})

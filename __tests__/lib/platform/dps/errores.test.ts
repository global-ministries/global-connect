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

  it('explains a missing sheet authority as "no teams"', () => {
    expect(mensajeErrorDps(error('sin_autoridad', '42501'), 'planilla')).toBe('No tienes equipos para pasar asistencia en este plan.')
  })
})

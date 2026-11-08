/**
 * DPS planning — Spanish messages for the dps_* RPC errors
 * (odd/tasks/dps-asistencia-pco.md, T9; T10 adds the plan del domingo:
 * convocados, copy and the series cover; S8 the automatic directors). The
 * RPCs raise their code as the message ('sin_autoridad' 42501, the rest
 * 22023; see the headers of
 * supabase/migrations/20261108201000_dps_planificacion_rpcs.sql,
 * 20261108202000_dps_planificacion_convocados.sql and
 * 20261108204000_dps_directores_automaticos.sql). Pure: safe on the client.
 */

export interface ErrorRpc {
  readonly code?: string | null
  readonly message?: string | null
}

/** Where the error happened: the same code reads differently per screen. */
export type ContextoErrorDps = 'planilla' | 'asistencia' | 'configuracion' | 'plan' | 'equipos' | 'portada'

const CODIGOS = [
  'sin_autoridad',
  'fecha_invalida',
  'persona_invalida',
  'demasiados',
  'plan_invalido',
  'equipo_invalido',
  'estado_invalido',
  'rango_invalido',
  'horarios_invalidos',
  'llegada_invalida',
  'servicio_invalido',
  'puesto_invalido',
  'destino_con_convocados',
  'busqueda_invalida',
  'imagen_invalida',
  'serie_invalida',
  'convocado_automatico',
] as const

export type CodigoErrorDps = (typeof CODIGOS)[number]

export function codigoErrorDps(error: ErrorRpc | null | undefined): CodigoErrorDps | null {
  const mensaje = error?.message ?? ''
  return CODIGOS.find((codigo) => mensaje.includes(codigo)) ?? null
}

const GENERICO: Record<ContextoErrorDps, string> = {
  planilla: 'No se pudo cargar la asistencia. Actualiza la página.',
  asistencia: 'No se pudo guardar la asistencia. Intenta de nuevo.',
  configuracion: 'No se pudo guardar la configuración. Intenta de nuevo.',
  plan: 'No se pudo cargar el plan. Actualiza la página.',
  equipos: 'No se pudo guardar el cambio. Intenta de nuevo.',
  portada: 'No se pudo cambiar la portada. Intenta de nuevo.',
}

export const MENSAJE_HORARIOS = 'Revisa los horarios: de 1 a 6, con el formato 09:15.'
export const MENSAJE_LLEGADA = 'Revisa la hora de llegada, con el formato 07:00.'
/** The dps-series bucket: jpeg, png or webp up to 5 MB (also checked by the server action before uploading). */
export const MENSAJE_IMAGEN = 'La imagen debe ser JPG, PNG o WebP de hasta 5 MB.'

export function mensajeErrorDps(error: ErrorRpc | null | undefined, contexto: ContextoErrorDps): string {
  switch (codigoErrorDps(error)) {
    case 'sin_autoridad':
      if (contexto === 'planilla') return 'No tienes equipos para pasar asistencia en este plan.'
      if (contexto === 'configuracion') return 'Solo la dirección de DPS, un pastor o un administrador puede cambiar la configuración.'
      if (contexto === 'plan') return 'No tienes acceso a los planes de DPS.'
      if (contexto === 'equipos') return 'Solo quienes arman el plan pueden cambiar los convocados.'
      if (contexto === 'portada') return 'Solo quienes arman el plan pueden cambiar la portada.'
      return 'No tienes permiso para pasar asistencia en este equipo.'
    case 'fecha_invalida':
      return 'Solo se puede pasar asistencia el día del plan o hasta 14 días después.'
    case 'persona_invalida':
      return contexto === 'configuracion'
        ? 'Esa persona ya no existe. Busca de nuevo.'
        : 'Esa persona ya no está en este plan ni sirve en DPS. Actualiza la página.'
    case 'demasiados':
      return 'Son demasiadas personas a la vez (máximo 300).'
    case 'plan_invalido':
      return 'Ese plan ya no existe. Actualiza la página.'
    case 'equipo_invalido':
      return 'Ese equipo ya no está en DPS. Actualiza la página.'
    case 'rango_invalido':
      return 'Revisa las fechas e inténtalo de nuevo.'
    case 'horarios_invalidos':
      return MENSAJE_HORARIOS
    case 'llegada_invalida':
      return MENSAJE_LLEGADA
    case 'servicio_invalido':
      return 'Esa persona ya no sirve en este equipo. Busca de nuevo.'
    case 'puesto_invalido':
      return 'Ese puesto ya no está activo. Actualiza la página.'
    case 'destino_con_convocados':
      return 'Este plan ya tiene convocados. Elige si quieres reemplazarlos.'
    case 'busqueda_invalida':
      return 'La búsqueda es muy larga (máximo 100 caracteres).'
    case 'imagen_invalida':
      return MENSAJE_IMAGEN
    case 'serie_invalida':
      return 'Esa serie ya no existe. Actualiza la página.'
    case 'convocado_automatico':
      return 'Este director se asigna solo desde su dirección; cámbialo en Dream Team'
    default:
      return GENERICO[contexto]
  }
}

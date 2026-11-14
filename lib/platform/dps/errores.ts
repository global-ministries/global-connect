/**
 * DPS planning — Spanish messages for the dps_* RPC errors
 * (odd/tasks/dps-asistencia-pco.md, T9; T10 adds the plan del domingo:
 * convocados, copy and the series cover; S8 the automatic directors; T11
 * the annual programming sheet and "Nueva serie"; S9 "Nuevo evento",
 * "Mover fecha" and "Eliminar evento"; T13 the order of the service and
 * each plan's horarios, S10; S12 the lists by position and the cells of
 * several people, 20261109200000_dps_listas_posicion.sql). The
 * RPCs raise their code as the message ('sin_autoridad' 42501, the rest
 * 22023; see the headers of
 * supabase/migrations/20261108201000_dps_planificacion_rpcs.sql,
 * 20261108202000_dps_planificacion_convocados.sql and
 * 20261108204000_dps_directores_automaticos.sql; T11b the special events,
 * moving and deleting a plan: 20261108206000_dps_eventos_especiales.sql;
 * T13 the order and the horarios: 20261108208000_dps_orden_servicio.sql;
 * T15a the service notices, the answers and the blocked dates, S13:
 * 20261109210000_dps_avisos.sql).
 * Pure: safe on the client.
 */

export interface ErrorRpc {
  readonly code?: string | null
  readonly message?: string | null
  /** The RAISE's DETAIL (domingo_ocupado carries the Sunday). */
  readonly details?: string | null
}

/** Where the error happened: the same code reads differently per screen. */
export type ContextoErrorDps =
  | 'planilla'
  | 'asistencia'
  | 'configuracion'
  | 'plan'
  | 'equipos'
  | 'portada'
  | 'programacion'
  | 'evento'
  | 'orden'
  | 'horarios'
  | 'listas'
  /** The planner's notices: review, send and states (S13.3). */
  | 'avisos'
  /** The person's services: detail, answer and dismiss (S13.5). */
  | 'mis_servicios'
  /** «Fechas que no puedo servir» (S13.6). */
  | 'fechas_bloqueadas'

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
  'domingo_ocupado',
  'nombre_invalido',
  'semanas_invalidas',
  'color_invalido',
  'valor_invalido',
  'persona_o_texto',
  'campo_invalido',
  'titulo_invalido',
  'plan_duplicado',
  'tipo_invalido',
  'plan_domingo',
  'plan_pasado',
  'fecha_pasada',
  'plan_con_asistencia',
  'item_invalido',
  'duracion_invalida',
  'fase_invalida',
  'posicion_invalida',
  'orden_lleno',
  'destino_con_orden',
  'lista_invalida',
  'persona_fuera_de_lista',
  'demasiadas_personas',
  'respuesta_invalida',
  'motivo_invalido',
  'nota_invalida',
  'bloqueo_invalido',
  // T16c: dps_recordatorio_guardar (20261114110000_dps_avisos_recordatorio.sql).
  'dias_invalidos',
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
  programacion: 'No se pudo guardar la programación. Intenta de nuevo.',
  evento: 'No se pudo guardar el evento. Intenta de nuevo.',
  orden: 'No se pudo guardar el orden. Intenta de nuevo.',
  horarios: 'No se pudieron guardar los horarios. Intenta de nuevo.',
  listas: 'No se pudo guardar la lista. Intenta de nuevo.',
  avisos: 'No se pudieron enviar los avisos. Intenta de nuevo.',
  mis_servicios: 'No se pudo guardar tu respuesta. Intenta de nuevo.',
  fechas_bloqueadas: 'No se pudo guardar la fecha. Intenta de nuevo.',
}

/** The default horarios of Configuración: 1 to 4, as a plan's own (T13c). */
export const MENSAJE_HORARIOS = 'Revisa los horarios: de 1 a 4, con el formato 09:15.'
export const MENSAJE_LLEGADA = 'Revisa la hora de llegada, con el formato 07:00.'
export const MENSAJE_LLEGADA_PRIMERO = 'La llegada no puede ser después del primer horario.'
/** A plan's own horarios (dps_plan_horarios_guardar, S10): 1 to 4, ascending, llegada first. */
export const MENSAJE_HORARIOS_PLAN = 'Revisa los servicios: de 1 a 4, cada uno después del anterior, con el formato 09:15.'
export const MENSAJE_LLEGADA_PLAN = 'La llegada del equipo tiene que ser antes del primer servicio.'
/** The dps-series bucket: jpeg, png or webp up to 5 MB (also checked by the server action before uploading). */
export const MENSAJE_IMAGEN = 'La imagen debe ser JPG, PNG o WebP de hasta 5 MB.'
/** dps_responder: the motivo of «No puedo» (also checked before calling). */
export const MENSAJE_MOTIVO = 'El motivo va hasta 300 caracteres.'
/** dps_fecha_bloqueada_agregar (also checked before calling, lib/platform/dps/avisos.ts). */
export const MENSAJE_FECHAS_BLOQUEO = 'Elige las fechas «Desde» y «Hasta».'
export const MENSAJE_RANGO_BLOQUEO = 'Revisa las fechas: «Hasta» no puede ser antes de «Desde» y el rango es de hasta un año.'
export const MENSAJE_NOTA_BLOQUEO = 'La nota va hasta 200 caracteres.'
/** The public «Confirmar» page of the e-mail could not confirm (T16b, S14.2): the button stays. */
export const MENSAJE_CONFIRMAR_ENLACE = 'No pudimos confirmar. Intenta de nuevo en un momento.'
/** The page could not read the link (a failure, not a bad link): «Confirmar» still tries. */
export const MENSAJE_LEER_ENLACE = 'No pudimos abrir tu servicio. Toca «Confirmar» para intentarlo de nuevo.'
/** The reminder by e-mail (T16c, S14.3): 1 to 7 days before (also checked before calling). */
export const MENSAJE_DIAS_RECORDATORIO = 'Elige entre 1 y 7 días antes.'
/** More plans than dps_avisos_* take at once (400). */
export const MENSAJE_DEMASIADOS_PLANES = 'Son demasiadas fechas a la vez. Elige un rango más corto.'

export function mensajeErrorDps(error: ErrorRpc | null | undefined, contexto: ContextoErrorDps): string {
  switch (codigoErrorDps(error)) {
    case 'sin_autoridad':
      if (contexto === 'planilla') return 'No tienes equipos para pasar asistencia en este plan.'
      if (contexto === 'configuracion') return 'Solo la dirección de DPS, un pastor o un administrador puede cambiar la configuración.'
      if (contexto === 'plan') return 'No tienes acceso a los planes de DPS.'
      if (contexto === 'equipos') return 'Solo quienes arman el plan pueden cambiar los convocados.'
      if (contexto === 'portada') return 'Solo quienes arman el plan pueden cambiar la portada.'
      if (contexto === 'programacion') return 'Solo quienes arman el plan pueden cambiar la programación.'
      if (contexto === 'evento') return 'Solo quienes arman el plan pueden crear, mover o eliminar eventos.'
      if (contexto === 'orden') return 'Solo quienes arman el plan pueden cambiar el orden del servicio.'
      if (contexto === 'horarios') return 'Solo quienes arman el plan pueden cambiar los horarios.'
      if (contexto === 'listas') return 'No tienes permiso para cambiar esta lista.'
      if (contexto === 'avisos') return 'Solo quienes arman el plan pueden ver y enviar los avisos.'
      if (contexto === 'mis_servicios') return 'Ya no estás programado en este servicio. Actualiza la página.'
      if (contexto === 'fechas_bloqueadas') return 'No pudimos identificarte. Vuelve a iniciar sesión.'
      return 'No tienes permiso para pasar asistencia en este equipo.'
    case 'fecha_invalida':
      if (contexto === 'programacion') return 'El primer domingo tiene que caer en domingo.'
      if (contexto === 'evento') return 'Elige la fecha del evento.'
      if (contexto === 'fechas_bloqueadas') return MENSAJE_FECHAS_BLOQUEO
      return 'Solo se puede pasar asistencia el día del plan o hasta 14 días después.'
    case 'persona_invalida':
      return contexto === 'configuracion' || contexto === 'listas'
        ? 'Esa persona ya no existe. Busca de nuevo.'
        : 'Esa persona ya no está en este plan ni sirve en DPS. Actualiza la página.'
    case 'demasiados':
      if (contexto === 'avisos') return MENSAJE_DEMASIADOS_PLANES
      if (contexto === 'fechas_bloqueadas') return 'Tienes demasiadas fechas bloqueadas (máximo 100). Quita alguna antes de agregar otra.'
      return 'Son demasiadas personas a la vez (máximo 300).'
    case 'plan_invalido':
      return 'Ese plan ya no existe. Actualiza la página.'
    case 'equipo_invalido':
      return 'Ese equipo ya no está en DPS. Actualiza la página.'
    case 'rango_invalido':
      if (contexto === 'fechas_bloqueadas') return MENSAJE_RANGO_BLOQUEO
      return contexto === 'evento' ? 'Un evento dura de 1 a 14 días. Revisa las fechas.' : 'Revisa las fechas e inténtalo de nuevo.'
    case 'horarios_invalidos':
      return contexto === 'horarios' ? MENSAJE_HORARIOS_PLAN : MENSAJE_HORARIOS
    case 'llegada_invalida':
      if (contexto === 'horarios') return MENSAJE_LLEGADA_PLAN
      return contexto === 'configuracion' ? 'Revisa la llegada: con el formato 07:00 y no después del primer horario.' : MENSAJE_LLEGADA
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
    case 'domingo_ocupado':
      return 'Uno de esos domingos ya es de otra serie. Elige otro primer domingo o menos semanas.'
    case 'nombre_invalido':
      return 'Escribe el nombre de la serie (máximo 120 caracteres).'
    case 'semanas_invalidas':
      return 'Las semanas van de 1 a 52.'
    case 'titulo_invalido':
      if (contexto === 'evento') return 'Escribe el título del evento (máximo 120 caracteres).'
      if (contexto === 'orden') return 'Escribe el título (máximo 120 caracteres).'
      return 'Ese valor es muy largo o no es válido.'
    case 'valor_invalido':
      if (contexto === 'orden') return 'Las notas van hasta 500 caracteres y el responsable hasta 80.'
      return 'Ese valor es muy largo o no es válido.'
    case 'persona_o_texto':
      return 'Ese valor es muy largo o no es válido.'
    case 'plan_duplicado':
      if (contexto === 'evento') return 'Ya hay un evento de ese tipo con ese título en esa fecha.'
      return 'Otra persona creó ese plan al mismo tiempo. Actualiza la página.'
    case 'tipo_invalido':
      return 'Elige servicio especial, Cena del Señor o Noche de adoración.'
    case 'plan_domingo':
      return 'Los domingos de la programación no se mueven ni se eliminan.'
    case 'plan_pasado':
      if (contexto === 'mis_servicios') return 'Este servicio ya pasó: ya no puedes responder.'
      return 'Este día ya pasó: no se puede mover.'
    case 'fecha_pasada':
      if (contexto === 'fechas_bloqueadas') return 'Esas fechas ya pasaron. Elige fechas de hoy en adelante.'
      return 'Elige una fecha de hoy en adelante.'
    case 'plan_con_asistencia':
      return 'Ya tiene asistencia marcada: no se puede mover ni eliminar.'
    case 'item_invalido':
      return 'Ese elemento ya no está en el orden. Actualiza la página.'
    case 'duracion_invalida':
      return 'Escribe la duración como minutos:segundos, por ejemplo 4:30 (máximo 240 minutos).'
    case 'fase_invalida':
      return 'Elige antes, en o después del servicio.'
    case 'posicion_invalida':
      return 'No se pudo mover el elemento. Actualiza la página.'
    case 'orden_lleno':
      return 'El orden llegó al máximo de 150 filas.'
    case 'destino_con_orden':
      return 'Este plan ya tiene orden. Elige si quieres reemplazarlo.'
    case 'lista_invalida':
      return 'Los productores y los cantantes se gestionan en Dream Team.'
    case 'persona_fuera_de_lista':
      return 'Esa persona no está en la lista de esta columna. Revisa Configuración › Listas o escribe su nombre sin cuenta.'
    case 'demasiadas_personas':
      return 'Son demasiadas personas para esta celda: hasta 3, y hasta 8 en Cantantes.'
    case 'respuesta_invalida':
      return 'Elige Confirmar o No puedo.'
    case 'motivo_invalido':
      return MENSAJE_MOTIVO
    case 'nota_invalida':
      return MENSAJE_NOTA_BLOQUEO
    case 'bloqueo_invalido':
      return 'Esa fecha ya no está en tu lista. Actualiza la página.'
    case 'dias_invalidos':
      return MENSAJE_DIAS_RECORDATORIO
    default:
      return GENERICO[contexto]
  }
}

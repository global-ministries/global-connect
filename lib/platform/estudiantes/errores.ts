/**
 * Estudiantes — Spanish (tuteo) messages for the errors of the group
 * management, leader list, visitor and live view RPCs. Each function raises its code as the exception message
 * (`raise exception 'nombre_duplicado' using errcode = '23505'`), so the
 * message is the key; the SQLSTATE is the fallback for anything else.
 */

type ErrorRpc = { readonly code?: string; readonly message?: string } | null | undefined

export const MENSAJES_ERROR_GRUPOS = {
  sin_autoridad: 'No tienes permiso para gestionar este grupo.',
  grupo_invalido: 'Este grupo ya no existe o está desactivado. Recarga la página.',
  nombre_invalido: 'Escribe un nombre de hasta 80 caracteres.',
  nombre_duplicado: 'Ya hay un grupo con ese nombre en esta sub-área. Elige otro.',
  anio_invalido: 'Elige un año escolar de este ámbito.',
  horario_invalido: 'Revisa el día y la hora: la hora necesita un día.',
  texto_muy_largo: 'La zona admite hasta 120 caracteres.',
  servicio_invalido: 'Uno de los líderes ya no sirve en esta sub-área. Recarga la página y vuelve a elegir.',
  servicios_invalidos: 'Uno de los líderes ya no sirve en esta sub-área. Recarga la página y vuelve a elegir.',
  persona_invalida: 'Esta persona ya no está en el grupo o no es de este campus. Recarga la página.',
  persona_en_otro_grupo: 'Ya está en otro grupo de este ámbito. Usa «Mover aquí» para traerla.',
  estado_invalido: 'Ese estado no es válido para un integrante.',
  campus_invalido: 'Ese campus no está activo.',
  subarea_invalida: 'Esa sub-área ya no admite grupos.',
  datos_invalidos: 'Revisa los datos e inténtalo de nuevo.',
  // Leader list and visitor registration (C3).
  fecha_invalida: 'Esa fecha no tiene reunión para marcar. Elige otra.',
  turno_invalido: 'Ese turno ya no sirve a este grupo. Recarga la página.',
  genero_requerido: 'Elige el sexo (Femenino o Masculino).',
  nombre_y_apellido_requeridos: 'Escribe el nombre y el apellido.',
  representante_incompleto: 'Completa el nombre y el teléfono del representante.',
  representante_no_aplica: 'The Living Room no lleva representante.',
  representante_no_encontrado: 'Ese representante ya no existe. Escribe sus datos de nuevo.',
  tipo_representante_invalido: 'Elige el parentesco del representante.',
  cedula_existente: 'Ya hay alguien con esa cédula. Búscalo en el paso anterior y agrégalo desde ahí.',
  posibles_duplicados: 'Encontramos personas parecidas. Revisa si es alguna de ellas.',
  // Live view (C4b).
  ambito_invalido: 'Ese ámbito ya no tiene vista en vivo. Recarga la página.',
} as const

export type CodigoErrorGrupos = keyof typeof MENSAJES_ERROR_GRUPOS

const esCodigo = (valor: string): valor is CodigoErrorGrupos => Object.prototype.hasOwnProperty.call(MENSAJES_ERROR_GRUPOS, valor)

/** The code of an RPC error (`sin_autoridad` for SQLSTATE 42501); `null` when unknown. */
export function codigoErrorGrupos(error: ErrorRpc): CodigoErrorGrupos | null {
  const mensaje = error?.message?.trim() ?? ''
  if (esCodigo(mensaje)) return mensaje
  if (error?.code === '42501') return 'sin_autoridad'
  return null
}

/** The message for an RPC error; `fallback` when the code is unknown. */
export function mensajeErrorGrupos(error: ErrorRpc, fallback = 'No se pudo guardar. Inténtalo de nuevo.'): string {
  const codigo = codigoErrorGrupos(error)
  return codigo ? MENSAJES_ERROR_GRUPOS[codigo] : fallback
}

const SIN_DATOS_VIVO = 'No se pudo actualizar la vista en vivo. Se reintenta sola.'

/** The live view (C4b): the same messages, with its own words for a missing authority and an unknown error. */
export function mensajeErrorVivo(error: ErrorRpc): string {
  if (codigoErrorGrupos(error) === 'sin_autoridad') return 'No tienes acceso a la vista en vivo de este ámbito.'
  return mensajeErrorGrupos(error, SIN_DATOS_VIVO)
}

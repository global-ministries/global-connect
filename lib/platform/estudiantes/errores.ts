/**
 * Estudiantes — Spanish (tuteo) messages for the errors of the group
 * management RPCs. Each function raises its code as the exception message
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
} as const

export type CodigoErrorGrupos = keyof typeof MENSAJES_ERROR_GRUPOS

const esCodigo = (valor: string): valor is CodigoErrorGrupos => Object.prototype.hasOwnProperty.call(MENSAJES_ERROR_GRUPOS, valor)

/** The message for an RPC error; `fallback` when the code is unknown. */
export function mensajeErrorGrupos(error: ErrorRpc, fallback = 'No se pudo guardar. Inténtalo de nuevo.'): string {
  const mensaje = error?.message?.trim() ?? ''
  if (esCodigo(mensaje)) return MENSAJES_ERROR_GRUPOS[mensaje]
  if (error?.code === '42501') return MENSAJES_ERROR_GRUPOS.sin_autoridad
  return fallback
}

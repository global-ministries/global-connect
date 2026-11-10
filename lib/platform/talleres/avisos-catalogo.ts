/**
 * The automatic notices of a taller, as the notices center lists them
 * (odd/tasks/talleres-reserva-publica.md T7, S6 S11 S13 S14;
 * design/talleres-reserva/15). Channels are always email + in-app (L6:
 * "correo y notificacion dentro de la app"); WhatsApp is never a channel,
 * only a manual button (S14).
 *
 * The texts are written by the database (20261110230000_talleres_avisos.sql);
 * `ejemplo` mirrors them with sample data for the preview. Editing the texts
 * is out of scope.
 */

export type TipoAvisoTaller =
  | 'inscripcion_recibida'
  | 'inscripcion_aprobada'
  | 'inscripcion_rechazada'
  | 'grupo_asignado'
  | 'recordatorio_clase'
  | 'taller_cambio_fecha'
  | 'certificado_listo'
  | 'lugar_disponible'

export interface AvisoCatalogo {
  readonly tipo: TipoAvisoTaller
  readonly nombre: string
  readonly cuando: string
  /** Always on (no switch): the answers of a date change depend on it. */
  readonly fijo: boolean
  readonly ejemplo: { readonly asunto: string; readonly titulo: string; readonly cuerpo: string }
}

export const AVISOS_TALLER: readonly AvisoCatalogo[] = [
  {
    tipo: 'inscripcion_recibida',
    nombre: 'Solicitud recibida',
    cuando: 'Al recibir una inscripción · desde la app o la página pública',
    fijo: false,
    ejemplo: {
      asunto: 'Recibimos tu solicitud para Mujer de Hoy',
      titulo: 'Recibimos tu solicitud',
      cuerpo: 'Recibimos tu inscripción en Mujer de Hoy. La coordinación revisa cada inscripción y te avisa en unos días.',
    },
  },
  {
    tipo: 'inscripcion_aprobada',
    nombre: 'Aprobada',
    cuando: 'Al aprobar',
    fijo: false,
    ejemplo: {
      asunto: 'Aprobamos tu inscripción en Mujer de Hoy',
      titulo: 'Aprobamos tu inscripción',
      cuerpo: 'Tienes tu lugar en Mujer de Hoy. Empieza el jueves 8 de octubre. Pronto te avisamos tu grupo y quién lo facilita.',
    },
  },
  {
    tipo: 'inscripcion_rechazada',
    nombre: 'No aprobada',
    cuando: 'Al rechazar · incluye el motivo que escribes',
    fijo: false,
    ejemplo: {
      asunto: 'Tu inscripción en Mujer de Hoy no fue aprobada',
      titulo: 'Tu inscripción no fue aprobada',
      cuerpo:
        'No pudimos aprobar tu inscripción en Mujer de Hoy. Motivo: El cupo de esta edición es para mujeres casadas. Si tienes dudas, habla con la coordinación del taller.',
    },
  },
  {
    tipo: 'grupo_asignado',
    nombre: 'Grupo asignado',
    cuando: 'Al asignar grupo · grupo, quién lo facilita, primera clase y lugar',
    fijo: false,
    ejemplo: {
      asunto: 'Tu grupo de Mujer de Hoy: Jueves noche',
      titulo: 'Tu grupo y quién lo facilita',
      cuerpo: 'Ya tienes grupo en Mujer de Hoy: Jueves noche. Facilita Yusmary. Empieza el jueves 8 de octubre · 7:00 p. m. · Salón 2.',
    },
  },
  {
    tipo: 'recordatorio_clase',
    nombre: 'Recordatorio de clase',
    cuando: '1 día antes de cada clase · 6:00 p. m.',
    fijo: false,
    ejemplo: {
      asunto: 'Mañana es tu clase de Mujer de Hoy',
      titulo: 'Mañana es tu clase',
      cuerpo: 'Clase 3: Mujer de propósito de Mujer de Hoy · martes 8 de diciembre · 7:00 p. m. · Salón 3. Facilita Yelitza.',
    },
  },
  {
    tipo: 'taller_cambio_fecha',
    nombre: 'Cambio de fecha',
    cuando: 'Al suspender y mover la fecha · pide «Mantener mi lugar / Ya no puedo»; quien no confirme antes del nuevo cierre sale',
    fijo: true,
    ejemplo: {
      asunto: 'Mujer de Hoy cambió de fecha',
      titulo: 'Tu taller cambió de fecha',
      cuerpo: 'No llegamos al mínimo para la fecha anunciada, así que movimos el inicio. Confirma antes del nuevo cierre para mantener tu lugar.',
    },
  },
  {
    tipo: 'certificado_listo',
    nombre: 'Certificado',
    cuando: 'Al cerrar la edición · solo a quien completó',
    fijo: false,
    ejemplo: {
      asunto: 'Completaste Mujer de Hoy: tu certificado está listo',
      titulo: 'Tu certificado está listo',
      cuerpo: 'Completaste Mujer de Hoy. Descarga tu certificado o guárdalo en la app.',
    },
  },
  {
    tipo: 'lugar_disponible',
    nombre: 'Se liberó un lugar',
    cuando: 'Cuando se libera un lugar en una edición llena · a todos los que pidieron «Avísame» a la vez',
    fijo: false,
    ejemplo: {
      asunto: 'Se liberó un lugar en Mujer de Hoy',
      titulo: 'Se liberó un lugar',
      cuerpo:
        'Se liberó un lugar en Mujer de Hoy (empieza el jueves 8 de octubre). Avisamos a todas las personas que esperaban: quien reserve primero se queda con el lugar.',
    },
  },
]

/** The switch of one notice: on unless the taller's avisos_config says false. */
export function avisoActivo(config: Readonly<Record<string, unknown>>, tipo: TipoAvisoTaller): boolean {
  return config[tipo] !== false
}

export function nombreAviso(tipo: string): string {
  return AVISOS_TALLER.find((aviso) => aviso.tipo === tipo)?.nombre ?? 'Aviso'
}

export function esTipoConfigurable(tipo: string): tipo is TipoAvisoTaller {
  return AVISOS_TALLER.some((aviso) => aviso.tipo === tipo && !aviso.fijo)
}

/**
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S15 S16) — the minimum of
 * inscritos of an edición: what the edición page and the member's
 * Mi Recorrido read (talleres_minimo_panel / talleres_mis_cambios_de_fecha,
 * migration 20261110200000_talleres_minimo_suspension.sql), parsed into
 * camelCase, plus the small rules the screens share (dates, the manual
 * WhatsApp text). The DB decides who may do what; these only shape data.
 *
 * Loaders are best effort, same contract as cargarPermisos: never throw, a
 * failed or unauthorized call resolves to null / [] and the page just
 * hides the block.
 */

export interface ClaseAMover {
  readonly numero: number
  /** YYYY-MM-DD */
  readonly fecha: string
}

export interface PersonaSinResponder {
  readonly inscripcionId: string
  readonly nombre: string
  readonly telefono: string | null
  readonly companeroNombre: string | null
  readonly companeroTelefono: string | null
  readonly limite: string
}

export interface ConteoConfirmaciones {
  readonly confirmadas: number
  readonly porTelefono: number
  readonly noPuede: number
  readonly sinResponder: number
  readonly salieronSinResponder: number
  readonly aprobados: number
  readonly pendientes: number
  /** YYYY-MM-DD; null when nobody was ever asked. */
  readonly limite: string | null
}

export interface SuspensionEdicion {
  readonly en: string
  readonly motivo: string | null
  readonly mensaje: string | null
  readonly fechaAnterior: string | null
  readonly por: string | null
}

export interface AbiertaIgual {
  readonly en: string
  readonly motivo: string | null
  readonly por: string | null
}

export interface PanelMinimo {
  /** null: the taller has no minimum. */
  readonly minimo: number | null
  readonly unidad: 'personas' | 'parejas'
  readonly bajoMinimo: boolean
  readonly fechaInicio: string | null
  readonly cierreInscripcion: string | null
  readonly conteo: ConteoConfirmaciones
  readonly clases: readonly ClaseAMover[]
  readonly suspension: SuspensionEdicion | null
  readonly abiertaIgual: AbiertaIgual | null
  readonly puedeSuspender: boolean
  readonly puedeAbrirIgual: boolean
  readonly puedeConfirmar: boolean
  readonly sinResponder: readonly PersonaSinResponder[]
}

export interface CambioDeFecha {
  readonly inscripcionId: string
  readonly tallerNombre: string
  readonly edicionNombre: string | null
  readonly fechaInicio: string
  readonly fechaAnterior: string | null
  readonly lugar: string | null
  readonly mensaje: string | null
  readonly limite: string
}

type Fila = Record<string, unknown>

function esFila(valor: unknown): valor is Fila {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0
}

function fecha(valor: unknown): string | null {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor) ? valor.slice(0, 10) : null
}

/** talleres_minimo_panel's jsonb, or null when it does not have the expected shape. */
export function parsePanelMinimo(data: unknown): PanelMinimo | null {
  if (!esFila(data)) return null
  const conteo = esFila(data.conteo) ? data.conteo : {}
  const suspension = esFila(data.suspension) ? data.suspension : null
  const abierta = esFila(data.abierta_igual) ? data.abierta_igual : null
  const clases = Array.isArray(data.clases) ? data.clases.filter(esFila) : []
  const lista = Array.isArray(data.sin_responder) ? data.sin_responder.filter(esFila) : []

  return {
    minimo: typeof data.minimo === 'number' ? data.minimo : null,
    unidad: data.unidad === 'parejas' ? 'parejas' : 'personas',
    bajoMinimo: data.bajo_minimo === true,
    fechaInicio: fecha(data.fecha_inicio),
    cierreInscripcion: fecha(data.cierre_inscripcion),
    conteo: {
      confirmadas: numero(conteo.confirmadas),
      porTelefono: numero(conteo.por_telefono),
      noPuede: numero(conteo.no_puede),
      sinResponder: numero(conteo.sin_responder),
      salieronSinResponder: numero(conteo.salieron_sin_responder),
      aprobados: numero(conteo.aprobados),
      pendientes: numero(conteo.pendientes),
      limite: fecha(conteo.limite),
    },
    clases: clases.flatMap((c) => {
      const f = fecha(c.fecha)
      return typeof c.numero === 'number' && f ? [{ numero: c.numero, fecha: f }] : []
    }),
    suspension:
      suspension && typeof suspension.en === 'string'
        ? {
            en: suspension.en,
            motivo: texto(suspension.motivo),
            mensaje: texto(suspension.mensaje),
            fechaAnterior: fecha(suspension.fecha_anterior),
            por: texto(suspension.por),
          }
        : null,
    abiertaIgual:
      abierta && typeof abierta.en === 'string'
        ? { en: abierta.en, motivo: texto(abierta.motivo), por: texto(abierta.por) }
        : null,
    puedeSuspender: data.puede_suspender === true,
    puedeAbrirIgual: data.puede_abrir_igual === true,
    puedeConfirmar: data.puede_confirmar === true,
    sinResponder: lista.flatMap((p) => {
      const limite = fecha(p.limite)
      return typeof p.inscripcion_id === 'string' && limite
        ? [
            {
              inscripcionId: p.inscripcion_id,
              nombre: texto(p.nombre) ?? '—',
              telefono: texto(p.telefono),
              companeroNombre: texto(p.companero_nombre),
              companeroTelefono: texto(p.companero_telefono),
              limite,
            },
          ]
        : []
    }),
  }
}

/** talleres_mis_cambios_de_fecha's jsonb array; malformed rows are dropped. */
export function parseCambiosDeFecha(data: unknown): CambioDeFecha[] {
  if (!Array.isArray(data)) return []
  return data.filter(esFila).flatMap((c) => {
    const fechaInicio = fecha(c.fecha_inicio)
    const limite = fecha(c.limite)
    if (typeof c.inscripcion_id !== 'string' || !fechaInicio || !limite) return []
    return [
      {
        inscripcionId: c.inscripcion_id,
        tallerNombre: texto(c.taller_nombre) ?? 'Tu taller',
        edicionNombre: texto(c.edicion_nombre),
        fechaInicio,
        fechaAnterior: fecha(c.fecha_anterior),
        lugar: texto(c.lugar),
        mensaje: texto(c.mensaje),
        limite,
      },
    ]
  })
}

interface RpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

/** The edición page's minimum block; null when it cannot be read. */
export async function loadPanelMinimo(client: RpcClient, edicionId: string): Promise<PanelMinimo | null> {
  try {
    const { data, error } = await client.rpc('talleres_minimo_panel', { p_edicion_id: edicionId })
    if (error) return null
    return parsePanelMinimo(data)
  } catch {
    return null
  }
}

/** The caller's pending date-change answers; [] when they cannot be read. */
export async function loadMisCambiosDeFecha(client: RpcClient): Promise<CambioDeFecha[]> {
  try {
    const { data, error } = await client.rpc('talleres_mis_cambios_de_fecha')
    if (error) return []
    return parseCambiosDeFecha(data)
  } catch {
    return []
  }
}

// ─── Fechas (DATE columns, never shifted by the viewer's time zone) ───────

function aFechaUtc(valor: string): Date {
  const [y, m, d] = valor.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

/** «lun 11 ene» */
export function fechaCorta(valor: string): string {
  return aFechaUtc(valor)
    .toLocaleDateString('es', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/,/g, '')
    .replace(/\./g, '')
}

/** «viernes 15 de enero» */
export function fechaLarga(valor: string): string {
  return aFechaUtc(valor)
    .toLocaleDateString('es', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/,/g, '')
}

/**
 * Text for the manual WhatsApp button (S14: never sent automatically; it
 * only opens the coordinator's own chat with this text ready).
 */
export function mensajeWhatsappCambioFecha(nombre: string, taller: string, fechaInicio: string, limite: string): string {
  const primerNombre = nombre.trim().split(/\s+/)[0] ?? ''
  const saludo = primerNombre && primerNombre !== '—' ? `Hola ${primerNombre}` : 'Hola'
  return `${saludo}, ${taller} ahora empieza el ${fechaLarga(fechaInicio)}. ¿Mantienes tu lugar? Confírmalo antes del ${fechaLarga(limite)}.`
}

/** wa.me link with the prefilled text, or null for a number WhatsApp cannot take. */
export function enlaceWhatsappConTexto(enlace: string | null, mensaje: string): string | null {
  if (!enlace) return null
  return `${enlace}?text=${encodeURIComponent(mensaje)}`
}

/** Today (YYYY-MM-DD) in the church's time zone, the same fallback talleres_hoy() uses. */
export function hoyIglesia(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
}

/**
 * The «Suspendida» block stays on the edición page while someone still has
 * to answer, or until the new first clase.
 */
export function mostrarEstadoSuspension(panel: PanelMinimo, hoy: string): boolean {
  if (!panel.suspension || panel.bajoMinimo) return false
  if (panel.conteo.sinResponder > 0) return true
  return panel.fechaInicio !== null && panel.fechaInicio >= hoy
}

export const MOTIVOS_SUSPENSION = [
  'No se alcanzó el mínimo de inscritos',
  'Falta de facilitadores',
  'Cambio en el calendario de la iglesia',
  'Otro',
] as const

export const MOTIVO_MAX = 300
export const MENSAJE_MAX = 600

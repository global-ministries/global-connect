/**
 * Niños print stations and reprints as the screens show them
 * (odd/tasks/ninos-checkin-pco.md, S10, S6; T3b; docs/ninos/impresion.md).
 * Pure helpers plus thin wrappers over the RPCs of
 * 20261109100000_ninos_impresion.sql and 20261109110000_ninos_impresion_vistas.sql
 * (run as the user, so the authority stays in SQL) and over
 * POST /api/ninos/impresion/reimprimir:
 * - the station list, its connection status (the agent's last call) and its
 *   label size (102 × 51 mm, 203 dpi while unset);
 * - the station form (name, size in mm, dpi);
 * - the desk station, remembered per device and per campus in localStorage,
 *   and the non-blocking notice when it is missing or offline;
 * - the reprint reason and note, the plan of reprint calls and the history.
 * These RPCs are not in database.types.ts yet: callers pass an untyped rpc.
 * Browser-safe: nothing here imports node modules (lib/platform/ninos/impresion.ts
 * re-exports the reasons from here).
 */
import { fechaCorta } from './eventos'
import { horaEnCaracas, hoyEnCaracas } from './fecha'

type Objeto = Record<string, unknown>
const esObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const numero = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export type Resultado<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string }

type Rpc = (nombre: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>

/** S10 reprint reasons: se trabó, se perdió, otro (otro needs a note). */
export const MOTIVOS_REIMPRESION = ['se_trabo', 'se_perdio', 'otro'] as const
export type MotivoReimpresion = (typeof MOTIVOS_REIMPRESION)[number]
export type TipoReimpresion = 'todas' | 'representante' | 'nino'

// ── stations ─────────────────────────────────────────────────────────

export type EstacionVista = {
  readonly id: string
  readonly campusId: string
  readonly nombre: string
  /** Label size in mm; both null until the roll is measured (102 × 51 mm). */
  readonly anchoMm: number | null
  readonly altoMm: number | null
  readonly dpi: number
  readonly activa: boolean
  /** The agent's last call (heartbeat). */
  readonly ultimaConexion: string | null
  /** Jobs waiting for the agent. */
  readonly pendientes: number
  /** The caller manages the stations of that campus. */
  readonly puedeAdministrar: boolean
}

/** Rows of ninos_impresion_estaciones(). */
export function leerEstaciones(data: unknown): EstacionVista[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((f): EstacionVista[] => {
    if (!esObjeto(f) || typeof f.id !== 'string' || typeof f.campus_id !== 'string' || typeof f.nombre !== 'string') return []
    return [
      {
        id: f.id,
        campusId: f.campus_id,
        nombre: f.nombre,
        anchoMm: numero(f.ancho_mm),
        altoMm: numero(f.alto_mm),
        dpi: numero(f.dpi) ?? 203,
        activa: f.activa !== false,
        ultimaConexion: texto(f.ultima_conexion),
        pendientes: numero(f.pendientes) ?? 0,
        puedeAdministrar: f.puede_administrar === true,
      },
    ]
  })
}

/** The agent polls every 2 s; a station seen in the last 2 minutes is connected. */
export const MINUTOS_CONECTADA = 2

export type Conexion = {
  readonly estado: 'conectada' | 'sin_conexion' | 'nunca'
  readonly texto: string
  readonly tono: 'success' | 'danger' | 'muted'
}

export function conexionEstacion(ultimaConexion: string | null, ahora: Date = new Date()): Conexion {
  if (!ultimaConexion) return { estado: 'nunca', texto: 'Nunca se conectó', tono: 'muted' }
  const visto = new Date(ultimaConexion)
  if (ahora.getTime() - visto.getTime() <= MINUTOS_CONECTADA * 60_000) return { estado: 'conectada', texto: 'Conectada', tono: 'success' }
  const dia = hoyEnCaracas(visto)
  const hora = horaEnCaracas(ultimaConexion)
  return {
    estado: 'sin_conexion',
    texto: dia === hoyEnCaracas(ahora) ? `Sin conexión desde ${hora}` : `Sin conexión desde el ${fechaCorta(dia)}, ${hora}`,
    tono: 'danger',
  }
}

/** The roll of the 4B-2054N: what the agent prints while a station has no size. */
export const MEDIDA_POR_DEFECTO = { anchoMm: 102, altoMm: 51, dpi: 203 } as const

const mm = (n: number) => String(n).replace('.', ',')

/** "76 × 51 mm · 203 dpi", or "102 × 51 mm · 203 dpi (por defecto)" while unset. */
export function textoMedida(e: Pick<EstacionVista, 'anchoMm' | 'altoMm' | 'dpi'>): string {
  if (e.anchoMm === null || e.altoMm === null) {
    return `${MEDIDA_POR_DEFECTO.anchoMm} × ${MEDIDA_POR_DEFECTO.altoMm} mm · ${e.dpi} dpi (por defecto)`
  }
  return `${mm(e.anchoMm)} × ${mm(e.altoMm)} mm · ${e.dpi} dpi`
}

export const MAX_NOMBRE_ESTACION = 60

export function validarNombreEstacion(nombre: string): string | null {
  const n = nombre.trim()
  if (!n) return 'Ponle un nombre a la estación.'
  if (n.length > MAX_NOMBRE_ESTACION) return `El nombre llega hasta ${MAX_NOMBRE_ESTACION} letras.`
  return null
}

export type MedidasForm = { readonly ancho: string; readonly alto: string; readonly dpi: string }
export type Medidas = { readonly anchoMm: number | null; readonly altoMm: number | null; readonly dpi: number }

/** Both empty = the default roll; else both within the printer range (the same as the database). */
export function validarMedidas(f: MedidasForm): ({ ok: true } & Medidas) | { ok: false; message: string } {
  const dpi = Number(f.dpi)
  if (dpi !== 203 && dpi !== 300) return { ok: false, message: 'Elige 203 o 300 dpi.' }
  const a = f.ancho.trim()
  const h = f.alto.trim()
  if (!a && !h) return { ok: true, anchoMm: null, altoMm: null, dpi }
  if (!a || !h) return { ok: false, message: 'Escribe el ancho y el alto, o deja los dos vacíos.' }
  const ancho = Number(a.replace(',', '.'))
  const alto = Number(h.replace(',', '.'))
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho < 20 || ancho > 120 || alto < 10 || alto > 300) {
    return { ok: false, message: 'El ancho va de 20 a 120 mm y el alto de 10 a 300 mm.' }
  }
  return { ok: true, anchoMm: ancho, altoMm: alto, dpi }
}

// ── errors ───────────────────────────────────────────────────────────

const ERROR_GENERICO = 'No se pudo completar. Revisa la conexión e intenta otra vez.'

const MENSAJES: Record<string, string> = {
  sin_autoridad: 'No tienes permiso para hacer esto en este campus.',
  datos_invalidos: 'Revisa los datos: alguno no es válido.',
  estacion_no_encontrada: 'No encontramos esa impresora. Elige otra en la mesa.',
  estacion_inactiva: 'Esa impresora está desactivada. Elige otra en la mesa.',
  checkin_no_encontrado: 'Ese código ya no está adentro: solo se reimprime antes del retiro.',
}

/** The fixed RPC codes (errorImpresion / the routes) in plain Spanish. */
export function mensajeErrorImpresion(error: { code?: string; message?: string } | null | undefined): string {
  const m = MENSAJES[error?.message ?? '']
  if (m) return m
  if (error?.code === '42501' || error?.code === '403') return MENSAJES.sin_autoridad
  if (error?.code === '22023' || error?.code === '400') return MENSAJES.datos_invalidos
  return ERROR_GENERICO
}

// ── RPC wrappers (stations) ──────────────────────────────────────────

async function llamar(rpc: Rpc, nombre: string, args: Record<string, unknown>): Promise<Resultado<unknown>> {
  try {
    const { data, error } = await rpc(nombre, args)
    return error ? { ok: false, message: mensajeErrorImpresion(error) } : { ok: true, data }
  } catch {
    return { ok: false, message: ERROR_GENERICO }
  }
}

/** What creating a station or rotating its token returns: the token, shown only once. */
export type TokenEstacion = { readonly estacionId: string; readonly nombre: string; readonly token: string }

const aToken = (data: unknown): Resultado<TokenEstacion> => {
  const e = esObjeto(data) && esObjeto(data.estacion) ? data.estacion : null
  if (!e || typeof data !== 'object' || typeof (data as Objeto).token !== 'string') return { ok: false, message: ERROR_GENERICO }
  return { ok: true, data: { estacionId: String(e.id), nombre: String(e.nombre), token: String((data as Objeto).token) } }
}

export async function crearEstacion(
  rpc: Rpc,
  e: { campusId: string; nombre: string } & Medidas,
): Promise<Resultado<TokenEstacion>> {
  const r = await llamar(rpc, 'ninos_impresion_estacion_crear', {
    p_campus_id: e.campusId,
    p_nombre: e.nombre.trim(),
    p_ancho_mm: e.anchoMm,
    p_alto_mm: e.altoMm,
    p_dpi: e.dpi,
  })
  return r.ok ? aToken(r.data) : r
}

export async function actualizarEstacion(
  rpc: Rpc,
  e: { estacionId: string; nombre: string; activa: boolean } & Medidas,
): Promise<Resultado<null>> {
  const r = await llamar(rpc, 'ninos_impresion_estacion_actualizar', {
    p_estacion_id: e.estacionId,
    p_nombre: e.nombre.trim(),
    p_ancho_mm: e.anchoMm,
    p_alto_mm: e.altoMm,
    p_dpi: e.dpi,
    p_activa: e.activa,
  })
  return r.ok ? { ok: true, data: null } : r
}

/** A new token; the agent with the old one stops at once. */
export async function rotarTokenEstacion(rpc: Rpc, estacionId: string): Promise<Resultado<TokenEstacion>> {
  const r = await llamar(rpc, 'ninos_impresion_estacion_rotar_token', { p_estacion_id: estacionId })
  return r.ok ? aToken(r.data) : r
}

// ── the desk station ─────────────────────────────────────────────────

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** One key per campus set of the desk, so a laptop remembers its printer in each campus. */
export function claveEstacionMesa(campusIds: readonly string[]): string {
  return `ninos-mesa-estacion:${[...new Set(campusIds)].sort().join(',')}`
}

export function leerEstacionMesa(almacen: Pick<Storage, 'getItem'> | null, clave: string): string | null {
  try {
    return almacen?.getItem(clave) ?? null
  } catch {
    return null
  }
}

export function guardarEstacionMesa(almacen: Almacen | null, clave: string, estacionId: string | null): void {
  try {
    if (estacionId) almacen?.setItem(clave, estacionId)
    else almacen?.removeItem(clave)
  } catch {
    // Private mode or a full storage: the desk asks again next time.
  }
}

/** The small notice of the desk; null when there is nothing to say (never blocks the check-in). */
export function avisoEstacionMesa(estaciones: readonly EstacionVista[], elegida: EstacionVista | null, ahora: Date = new Date()): string | null {
  if (estaciones.length === 0) return null
  if (!elegida) return 'Esta mesa no tiene impresora elegida: el código queda en pantalla'
  if (conexionEstacion(elegida.ultimaConexion, ahora).estado !== 'conectada') {
    return `La impresora "${elegida.nombre}" está sin conexión: el código queda en pantalla`
  }
  return null
}

// ── reprint ──────────────────────────────────────────────────────────

/** The reasons as the desk says them (S10). */
export const ETIQUETA_MOTIVO: Record<MotivoReimpresion, string> = { se_trabo: 'Se trabó', se_perdio: 'Se perdió', otro: 'Otro' }
export const OPCIONES_MOTIVO = MOTIVOS_REIMPRESION.map((valor) => ({ valor, etiqueta: ETIQUETA_MOTIVO[valor] }))
export const MAX_NOTA_REIMPRESION = 200

export function validarNota(motivo: MotivoReimpresion | '', nota: string): string | null {
  if (!motivo) return 'Elige el motivo.'
  const n = nota.trim()
  if (motivo === 'otro' && !n) return 'Escribe una nota: con «Otro» es obligatoria.'
  if (n.length > MAX_NOTA_REIMPRESION) return `La nota llega hasta ${MAX_NOTA_REIMPRESION} letras.`
  return null
}

export type PiezaReimpresion = { readonly tipo: TipoReimpresion; readonly ninoId: string | null }

/** Every child + the receipt is one «todas»; else one call per child label and one for the receipt. */
export function planReimpresion(s: { ninoIds: readonly string[]; todos: readonly string[]; recibo: boolean }): PiezaReimpresion[] {
  const elegidos = s.todos.filter((id) => s.ninoIds.includes(id))
  if (s.recibo && s.todos.length > 0 && elegidos.length === s.todos.length) return [{ tipo: 'todas', ninoId: null }]
  return [
    ...elegidos.map((ninoId) => ({ tipo: 'nino' as const, ninoId })),
    ...(s.recibo ? [{ tipo: 'representante' as const, ninoId: null }] : []),
  ]
}

export type ConteoReimpresion = { readonly ninos: number; readonly representantes: number }

const conteo = (c: ConteoReimpresion): string =>
  [
    c.ninos > 0 && `${c.ninos} ${c.ninos === 1 ? 'etiqueta' : 'etiquetas'}`,
    c.representantes > 0 && `${c.representantes} ${c.representantes === 1 ? 'recibo' : 'recibos'}`,
  ]
    .filter(Boolean)
    .join(' y ')

export function textoReimpresion(c: ConteoReimpresion, estacion: string, codigo: string): string {
  const verbo = c.ninos + c.representantes === 1 ? 'va' : 'van'
  return `Listo: ${conteo(c)} ${verbo} a «${estacion}». El código sigue siendo ${codigo}.`
}

/**
 * POSTs each planned piece to /api/ninos/impresion/reimprimir (the RPC runs
 * as the user and records who, when, reason and note). Stops at the first
 * refusal and says what was already queued.
 */
export async function reimprimirEtiquetas(
  enviar: typeof fetch,
  base: { estacionId: string; turnoId: string; fecha: string; codigo: string; motivo: MotivoReimpresion; nota: string },
  piezas: readonly PiezaReimpresion[],
): Promise<Resultado<ConteoReimpresion>> {
  const total = { ninos: 0, representantes: 0 }
  const nota = base.nota.trim() || null
  for (const p of piezas) {
    let fallo: string | null = null
    try {
      const res = await enviar('/api/ninos/impresion/reimprimir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...base, nota, tipo: p.tipo, ninoId: p.ninoId }),
      })
      const json = (await res.json().catch(() => null)) as (ConteoReimpresion & { error?: { code?: string; message?: string } }) | null
      if (!res.ok) fallo = mensajeErrorImpresion(json?.error)
      else {
        total.ninos += Number(json?.ninos ?? 0)
        total.representantes += Number(json?.representantes ?? 0)
      }
    } catch {
      fallo = ERROR_GENERICO
    }
    if (fallo) {
      const ya = conteo(total)
      return { ok: false, message: ya ? `${fallo} Ya se había enviado ${ya}.` : fallo }
    }
  }
  return { ok: true, data: total }
}

// ── reprint history ──────────────────────────────────────────────────

export type EstadoImpresion = 'pendiente' | 'impresa' | 'error'

export const ESTADOS_IMPRESION: Record<EstadoImpresion, { texto: string; tono: 'warning' | 'success' | 'danger' }> = {
  pendiente: { texto: 'Pendiente', tono: 'warning' },
  impresa: { texto: 'Impresa', tono: 'success' },
  error: { texto: 'Con error', tono: 'danger' },
}

export type Reimpresion = {
  readonly id: string
  readonly createdAt: string
  /** Who reprinted (null when that person was removed). */
  readonly quien: string | null
  readonly tipo: 'nino' | 'representante'
  /** The child of a child label. */
  readonly nino: string | null
  /** The first names on a receipt. */
  readonly ninos: string[]
  readonly codigo: string
  readonly motivo: MotivoReimpresion
  readonly nota: string | null
  readonly estacion: string
  readonly estado: EstadoImpresion
  readonly error: string | null
}

/** Rows of ninos_impresion_reimpresiones(campus, desde, hasta). */
export function leerReimpresiones(data: unknown): Reimpresion[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((f): Reimpresion[] => {
    if (!esObjeto(f) || typeof f.id !== 'string' || typeof f.created_at !== 'string') return []
    const motivo = (MOTIVOS_REIMPRESION as readonly unknown[]).includes(f.motivo) ? (f.motivo as MotivoReimpresion) : 'otro'
    const estado = f.estado === 'impresa' || f.estado === 'error' ? f.estado : 'pendiente'
    return [
      {
        id: f.id,
        createdAt: f.created_at,
        quien: texto(f.quien),
        tipo: f.tipo === 'representante' ? 'representante' : 'nino',
        nino: texto(f.nino),
        ninos: Array.isArray(f.ninos) ? f.ninos.filter((n): n is string => typeof n === 'string') : [],
        codigo: texto(f.codigo) ?? '',
        motivo,
        nota: texto(f.nota),
        estacion: texto(f.estacion) ?? '',
        estado,
        error: texto(f.error),
      },
    ]
  })
}

export const MAX_DIAS_HISTORIAL = 31

export function validarRango(desde: string, hasta: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return 'Elige las dos fechas.'
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000
  if (dias < 0) return 'La fecha «Desde» va antes de «Hasta».'
  if (dias + 1 > MAX_DIAS_HISTORIAL) return `Elige hasta ${MAX_DIAS_HISTORIAL} días.`
  return null
}

export async function cargarReimpresiones(
  rpc: Rpc,
  r: { campusId: string; desde: string; hasta: string },
): Promise<Resultado<Reimpresion[]>> {
  const x = await llamar(rpc, 'ninos_impresion_reimpresiones', { p_campus_id: r.campusId, p_desde: r.desde, p_hasta: r.hasta })
  return x.ok ? { ok: true, data: leerReimpresiones(x.data) } : x
}

/**
 * Familia in the Usuarios pending panel (S15 decision 10 of
 * odd/tasks/sistema-diseno-v2.md, T11b-2; prototype
 * docs/design-system/prototipos/usuarios/07-mi-familia-escritorio.html, pastor
 * panel). Pure pieces: the notice text that counts both kinds of requests, the
 * parser of familia_pendientes_listar
 * (supabase/migrations/20261101200000_mi_familia.sql), the request text with
 * the gendered relation, the approve label and the tuteo message of every
 * familia_resolver code, worded for the person who resolves.
 */
import { etiquetaRelacion, nombreCompleto, RELACIONES_FAMILIA, type GeneroFamilia, type TipoFamilia } from '@/lib/platform/usuarios/familia-vista'

// ── The notice ──

export interface ResumenAviso {
  readonly total: number
  readonly titulo: string
  readonly desglose: string
}

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

/** "3 vínculos pendientes" + "2 cuentas por cédula · 1 de familia"; a part with 0 is left out. */
export function resumenAviso(cuentas: number, familia: number): ResumenAviso | null {
  const total = cuentas + familia
  if (total === 0) return null
  const partes = [
    cuentas > 0 ? plural(cuentas, 'cuenta por cédula', 'cuentas por cédula') : '',
    familia > 0 ? `${familia} de familia` : '',
  ].filter(Boolean)
  return { total, titulo: total === 1 ? 'vínculo pendiente' : 'vínculos pendientes', desglose: partes.join(' · ') }
}

export function textoAvisoPendientes(cuentas: number, familia: number): string | null {
  const r = resumenAviso(cuentas, familia)
  return r ? `${r.total} ${r.titulo} · ${r.desglose}` : null
}

// ── familia_pendientes_listar ──

export interface PersonaPendiente {
  readonly id: string
  readonly nombre: string
  readonly apellido: string
}

export interface DestinoPendiente extends PersonaPendiente {
  readonly cuenta: boolean
  readonly genero: GeneroFamilia
}

/** The data typed for a relative without an account; already filtered by the RPC for this approver. */
export interface SinCuentaPendiente {
  readonly nombre: string
  readonly apellido: string
  readonly fechaNacimiento: string
  readonly genero: GeneroFamilia
  readonly cedula: string | null
  readonly telefono: string | null
}

export interface SolicitudFamiliaPendiente {
  readonly id: string
  /** What the destino is to the solicitante. */
  readonly tipo: TipoFamilia
  readonly creadoEn: string
  readonly solicitante: PersonaPendiente
  readonly destino: DestinoPendiente | null
  readonly sinCuenta: SinCuentaPendiente | null
  readonly creaFicha: boolean
}

type Fila = Record<string, unknown>
const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const opcional = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const TIPOS = new Set<string>(RELACIONES_FAMILIA.map((r) => r.valor))
const esTipo = (v: unknown): v is TipoFamilia => typeof v === 'string' && TIPOS.has(v)

function aPersona(v: unknown): PersonaPendiente | null {
  if (!esObjeto(v) || typeof v.id !== 'string') return null
  return { id: v.id, nombre: texto(v.nombre), apellido: texto(v.apellido) }
}

function aSinCuenta(v: unknown): SinCuentaPendiente | null {
  if (!esObjeto(v)) return null
  return {
    nombre: texto(v.nombre), apellido: texto(v.apellido), fechaNacimiento: texto(v.fecha_nacimiento),
    genero: opcional(v.genero), cedula: opcional(v.cedula), telefono: opcional(v.telefono),
  }
}

function aSolicitud(f: Fila): SolicitudFamiliaPendiente | null {
  const solicitante = aPersona(f.solicitante)
  if (typeof f.id !== 'string' || !esTipo(f.tipo_relacion) || !solicitante) return null
  const persona = aPersona(f.destino)
  const destino = persona && esObjeto(f.destino) ? { ...persona, cuenta: f.destino.cuenta === true, genero: opcional(f.destino.genero) } : null
  const sinCuenta = destino ? null : aSinCuenta(f.sin_cuenta)
  if (!destino && !sinCuenta) return null
  return { id: f.id, tipo: f.tipo_relacion, creadoEn: texto(f.creado_en), solicitante, destino, sinCuenta, creaFicha: f.crea_ficha === true }
}

/** The open requests the caller may resolve; null when the RPC answered an error. */
export function parseFamiliaPendientes(json: unknown): SolicitudFamiliaPendiente[] | null {
  if (!esObjeto(json) || json.ok !== true || !Array.isArray(json.solicitudes)) return null
  return json.solicitudes
    .filter(esObjeto)
    .map(aSolicitud)
    .filter((s): s is SolicitudFamiliaPendiente => s !== null)
}

// ── A request in the panel ──

/** The person added: the existing ficha, or the name typed for one without an account. */
export function nombreDestino(s: SolicitudFamiliaPendiente): string {
  return nombreCompleto(s.destino ?? s.sinCuenta ?? { nombre: '', apellido: '' })
}

/**
 * "María Colmenárez agregó a Rafael Colmenárez como su padre" (no ficha yet) or
 * "María Colmenárez dice que Luis Barrios es su hermano". The gender comes from
 * the existing ficha or the typed data; without one the label is neutral.
 */
export function textoSolicitudFamilia(s: SolicitudFamiliaPendiente): string {
  const relacion = etiquetaRelacion(s.tipo, s.destino?.genero ?? s.sinCuenta?.genero ?? null).toLowerCase()
  const quien = nombreCompleto(s.solicitante)
  return s.sinCuenta
    ? `${quien} agregó a ${nombreDestino(s)} como su ${relacion}`
    : `${quien} dice que ${nombreDestino(s)} es su ${relacion}`
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function fechaCorta(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  const mes = m ? MESES[Number(m[2]) - 1] : undefined
  return m && mes ? `${Number(m[3])} ${mes} ${m[1]}` : fecha
}

/** The second line: the typed data of a person without an account, or whether the ficha has one. */
export function detalleSolicitudFamilia(s: SolicitudFamiliaPendiente): string {
  if (s.sinCuenta) {
    const d = s.sinCuenta
    return [
      'Sin cuenta',
      d.fechaNacimiento ? `nació el ${fechaCorta(d.fechaNacimiento)}` : '',
      d.cedula ? `cédula ${d.cedula}` : 'sin cédula',
      d.telefono ? `teléfono ${d.telefono}` : '',
    ].filter(Boolean).join(' · ')
  }
  return s.destino?.cuenta ? 'Tiene cuenta. Debe confirmarlo o lo apruebas tú.' : 'Ficha sin cuenta.'
}

export function etiquetaAprobar(s: SolicitudFamiliaPendiente): string {
  return s.creaFicha ? 'Aprobar y crear ficha' : 'Aprobar'
}

// ── familia_resolver ──

export function resultadoFamilia(s: SolicitudFamiliaPendiente, codigo: 'APROBADA' | 'RECHAZADA', fichaCreada: boolean): string {
  const quien = nombreCompleto(s.solicitante)
  if (codigo === 'RECHAZADA') return `Rechazado: la solicitud de ${quien}.`
  return fichaCreada
    ? `Aprobado: se creó la ficha de ${nombreDestino(s)} y ya está en la familia de ${quien}.`
    : `Aprobado: ${nombreDestino(s)} ya está en la familia de ${quien}.`
}

export const MENSAJES_RESOLVER_FAMILIA = {
  NO_ENCONTRADO: 'No encontramos esta solicitud o ya no puedes resolverla. Recarga la página.',
  YA_RESUELTO: 'Esta solicitud ya se resolvió.',
  CEDULA_EXISTENTE: 'Ya existe una ficha con esa cédula, así que no se creó otra. Rechaza esta solicitud y revisa esa ficha.',
  YA_TIENE_CONYUGE: 'Quien lo pide ya tiene un cónyuge registrado. Cada persona puede tener uno solo.',
  YA_RELACIONADOS: 'Estas dos personas ya están relacionadas.',
  SIN_CAMPUS: 'Quien lo pide no tiene un campus principal. Asígnaselo antes de crear la ficha.',
  SIN_SESION: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  PARAMETROS_INVALIDOS: 'No se pudo leer la solicitud. Recarga la página e inténtalo de nuevo.',
} as const

export type CodigoResolverFamilia = keyof typeof MENSAJES_RESOLVER_FAMILIA
export const CODIGOS_RESOLVER_FAMILIA = Object.keys(MENSAJES_RESOLVER_FAMILIA) as CodigoResolverFamilia[]
const GENERICO = 'No se pudo resolver la solicitud. Inténtalo de nuevo.'

export function mensajeResolverFamilia(codigo: string | null | undefined): string {
  return codigo && codigo in MENSAJES_RESOLVER_FAMILIA ? MENSAJES_RESOLVER_FAMILIA[codigo as CodigoResolverFamilia] : GENERICO
}

/** The request is no longer open for this approver, so it leaves the list. */
export function quitaFilaFamilia(codigo: string | null | undefined): boolean {
  return codigo === 'YA_RESUELTO' || codigo === 'NO_ENCONTRADO'
}

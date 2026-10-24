/**
 * Check-out logic (odd/tasks/ninos-checkin.md, N5): the code typed at the
 * door, the rows of ninos_buscar_codigo grouped for the screen, who picks up
 * (ninos_retiro_opciones, or "Otra persona" with a reason — decision D1 of
 * odd/tasks/ninos-cobertura.md) and messages.
 */
import { horaEnCaracas } from './fecha'

export type Autorizado = { nombre: string; telefono: string | null; relacion: string | null }

export type FilaCodigo = {
  checkin_id: string
  nino_id: string
  nombre: string
  apellido: string
  salon_id: string
  salon: string
  entrada_at: string
  salida_at: string | null
  retirado_por_nombre: string | null
  autorizados: Autorizado[]
}

export const MENSAJE_CODIGO_INVALIDO = 'Escribe los 4 dígitos del código.'

export function validarCodigo(texto: string): { ok: true; codigo: string } | { ok: false; error: string } {
  const codigo = texto.trim()
  return /^\d{4}$/.test(codigo) ? { ok: true, codigo } : { ok: false, error: MENSAJE_CODIGO_INVALIDO }
}

export type Retiro = { adentro: FilaCodigo[]; retirados: FilaCodigo[]; autorizados: Autorizado[] }

/** Children still inside, children already out, and the pickup people (deduplicated). */
export function agruparRetiro(filas: readonly FilaCodigo[]): Retiro {
  const vistos = new Set<string>()
  const autorizados: Autorizado[] = []
  for (const f of filas) {
    if (f.salida_at) continue
    for (const a of Array.isArray(f.autorizados) ? f.autorizados : []) {
      const clave = `${a.nombre.trim().toLowerCase()}|${(a.telefono ?? '').replace(/\D/g, '')}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      autorizados.push(a)
    }
  }
  return {
    adentro: filas.filter((f) => !f.salida_at),
    retirados: filas.filter((f) => f.salida_at),
    autorizados,
  }
}

export function textoRetirado(f: Pick<FilaCodigo, 'salida_at' | 'retirado_por_nombre'>): string {
  return `Retirado a las ${horaEnCaracas(f.salida_at)} por ${f.retirado_por_nombre ?? '—'}`
}

/** Someone who may pick up every child still inside with the code. */
export type OpcionRetiro = { nombre: string; telefono: string | null; relacion: string | null; tipo: 'representante' | 'autorizado' }

const textoONulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export function parseOpcionesRetiro(data: unknown): OpcionRetiro[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((fila): OpcionRetiro[] => {
    if (typeof fila !== 'object' || fila === null) return []
    const f = fila as Record<string, unknown>
    const nombre = textoONulo(f.nombre)
    if (!nombre) return []
    return [{
      nombre,
      telefono: textoONulo(f.telefono),
      relacion: textoONulo(f.relacion),
      tipo: f.tipo === 'representante' ? 'representante' : 'autorizado',
    }]
  })
}

export const MAX_MOTIVO_RETIRO = 300

/** The anfitrión's choice: someone from the list, or another person with a reason. */
export type SeleccionRetiro = { tipo: 'lista'; nombre: string } | { tipo: 'otra'; nombre: string; motivo: string } | null

export function validarRetiro(
  sel: SeleccionRetiro,
): { ok: true; retiradoPor: string; motivoOtra: string | null } | { ok: false; error: string } {
  if (!sel) return { ok: false, error: 'Elige quién retira al niño.' }
  const nombre = sel.nombre.trim()
  if (sel.tipo === 'lista') return nombre ? { ok: true, retiradoPor: nombre, motivoOtra: null } : { ok: false, error: 'Elige quién retira al niño.' }
  if (!nombre) return { ok: false, error: 'Escribe el nombre de quien retira.' }
  const motivo = sel.motivo.trim()
  if (!motivo) return { ok: false, error: 'Escribe por qué retira una persona que no está en la lista.' }
  if (motivo.length > MAX_MOTIVO_RETIRO) return { ok: false, error: 'El motivo es muy largo (máximo 300 caracteres).' }
  return { ok: true, retiradoPor: nombre, motivoOtra: motivo }
}

export function mensajeDeErrorRetiro(error: { code?: string; message?: string } | null): string {
  if (error?.message === 'retiro_no_autorizado') {
    return 'Esa persona no está autorizada para retirar a todos los niños de este código. Elige «Otra persona» y escribe el motivo.'
  }
  if (error?.code === '42501') return 'No tienes permiso para retirar niños de ese salón.'
  if (error?.code === '22023') return 'Escribe quién retira al niño.'
  return 'No se pudo registrar el retiro. Intenta de nuevo.'
}

/**
 * Check-out logic (odd/tasks/ninos-checkin.md, N5): the code typed at the
 * door, the rows of ninos_buscar_codigo grouped for the screen, and messages.
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

export function mensajeDeErrorRetiro(error: { code?: string; message?: string } | null): string {
  if (error?.code === '42501') return 'No tienes permiso para retirar niños de ese salón.'
  if (error?.code === '22023') return 'Escribe quién retira al niño.'
  return 'No se pudo registrar el retiro. Intenta de nuevo.'
}

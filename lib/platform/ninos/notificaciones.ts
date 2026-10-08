/**
 * Parent emails after a check-in or check-out (odd/tasks/ninos-checkin.md, N9).
 *
 * The route handlers call ninos_checkin / ninos_checkout as the user, then
 * this module reads the parent emails through ninos_correos_visita (definer;
 * only the rows the caller just made) and sends one email per family visit
 * and address. Best effort: it never throws, and logs carry no personal data.
 */
import { horaEnCaracas } from './fecha'

export type Evento = 'ingreso' | 'retiro'

export type FilaCorreo = {
  visita_id: string
  padre_id: string
  email: string
  padre_nombre: string
  nino_nombre: string
  nino_genero: string | null
  salon: string
  codigo: string
  entrada_at: string
  salida_at: string | null
  retirado_por_nombre: string | null
}

export type Aviso = {
  to: string
  subject: string
  evento: Evento
  lineas: string[]
  codigo: string
  idempotencyKey: string
}

/** "09:05" → "9:05". */
function hora(instante: string | null): string {
  return horaEnCaracas(instante).replace(/^0(\d)/, '$1')
}

function linea(f: FilaCorreo, evento: Evento): string {
  if (evento === 'ingreso') return `${f.nino_nombre} ingresó a ${f.salon} a las ${hora(f.entrada_at)}.`
  const retirado = f.nino_genero === 'Femenino' ? 'retirada' : 'retirado'
  return `${f.nino_nombre} fue ${retirado} a las ${hora(f.salida_at)} por ${f.retirado_por_nombre ?? 'un adulto autorizado'}.`
}

function unir(nombres: readonly string[]): string {
  return nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/** One email per (visit, parent), in the order the rows came. */
export function armarAvisos(filas: readonly FilaCorreo[], evento: Evento): Aviso[] {
  const grupos = new Map<string, FilaCorreo[]>()
  for (const f of filas) {
    if (!f.email) continue
    const clave = `${f.visita_id}|${f.padre_id}`
    grupos.set(clave, [...(grupos.get(clave) ?? []), f])
  }
  return [...grupos.values()].map((g) => {
    const nombres = unir(g.map((f) => f.nino_nombre))
    return {
      to: g[0].email,
      subject: evento === 'ingreso' ? `Ingreso registrado: ${nombres}` : `Retiro registrado: ${nombres}`,
      evento,
      lineas: g.map((f) => linea(f, evento)),
      codigo: g[0].codigo,
      idempotencyKey: `ninos-${evento}-${g[0].visita_id}-${g[0].padre_id}`,
    }
  })
}

type RespuestaRpc = { data: unknown; error: { code?: string; message?: string } | null }

export type DependenciasAvisos = {
  /** RPC as the signed-in operator (ninos_correos_visita checks entrada_por / salida_por). */
  rpc: (nombre: string, args: Record<string, unknown>) => PromiseLike<RespuestaRpc>
  enviar: (aviso: Aviso) => Promise<{ success: boolean }>
}

export async function enviarAvisos(
  deps: DependenciasAvisos,
  args: { ninoIds: string[]; turnoId: string; fecha: string; evento: Evento },
): Promise<void> {
  try {
    const { data, error } = await deps.rpc('ninos_correos_visita', {
      p_nino_ids: args.ninoIds,
      p_turno_id: args.turnoId,
      p_fecha: args.fecha,
      p_evento: args.evento,
    })
    if (error) {
      console.error(`[ninos/avisos] ${args.evento}: lectura de correos falló:`, error.code ?? 'sin código')
      return
    }
    const avisos = armarAvisos(Array.isArray(data) ? (data as FilaCorreo[]) : [], args.evento)
    const resultados = await Promise.allSettled(avisos.map((a) => deps.enviar(a)))
    const fallidos = resultados.filter((r) => r.status === 'rejected' || !r.value.success).length
    if (fallidos > 0) console.error(`[ninos/avisos] ${args.evento}: ${fallidos} de ${avisos.length} correos fallaron`)
  } catch {
    console.error(`[ninos/avisos] ${args.evento}: error inesperado`)
  }
}

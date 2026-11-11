/**
 * The daily talleres job (odd/tasks/talleres-reserva-publica.md T7, S6 S15):
 * one Vercel cron call runs, in order,
 *   1. talleres_cerrar_confirmaciones_vencidas() — whoever did not confirm a
 *      date change leaves (T8a, S15; staging has no pg_cron, so this route
 *      is what runs it there). A place freed here notifies «Avísame» (S13).
 *   2. talleres_avisos_recordatorios_encolar() — «Mañana es tu clase» for
 *      tomorrow's programada sesiones (America/Caracas).
 *   3. the email outbox (enviarAvisosPendientes).
 *   4. talleres_avisos_limpiar() — expired code texts, rate-limit rows older
 *      than 7 days.
 * Each step runs even when an earlier one failed; the result says which
 * failed. Counts only, never personal data.
 */
import {
  enviarAvisosPendientes,
  type ClienteAdminAvisos,
  type OpcionesEnvioAvisos,
  type ResultadoEnvioAvisos,
} from '@/lib/platform/talleres/avisos-envio'

export interface ResultadoJobTalleres {
  readonly confirmacionesVencidas: number | null
  readonly recordatorios: number | null
  readonly correos: ResultadoEnvioAvisos | null
  readonly limpieza: { readonly codigos: number; readonly limites: number } | null
  /** Names of the steps that failed. */
  readonly fallos: readonly string[]
}

function entero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0
}

async function rpcNumero(client: ClienteAdminAvisos, nombre: string, args?: Record<string, unknown>): Promise<number> {
  const { data, error } = await client.rpc(nombre, args)
  if (error) throw new Error(error.message ?? nombre)
  return entero(data)
}

export async function ejecutarJobTalleres(
  client: ClienteAdminAvisos,
  { ahora, envio }: { ahora?: Date; envio?: OpcionesEnvioAvisos } = {},
): Promise<ResultadoJobTalleres> {
  const fallos: string[] = []
  async function paso<T>(nombre: string, accion: () => Promise<T>): Promise<T | null> {
    try {
      return await accion()
    } catch (error) {
      fallos.push(nombre)
      console.error('[talleres-cron] Paso fallido', { paso: nombre, error: error instanceof Error ? error.message : String(error) })
      return null
    }
  }

  const confirmacionesVencidas = await paso('confirmaciones', () => rpcNumero(client, 'talleres_cerrar_confirmaciones_vencidas'))
  const recordatorios = await paso('recordatorios', () =>
    rpcNumero(client, 'talleres_avisos_recordatorios_encolar', ahora ? { p_ahora: ahora.toISOString() } : {}),
  )
  const correos = await paso('correos', () => enviarAvisosPendientes(client, envio))
  const limpieza = await paso('limpieza', async () => {
    const { data, error } = await client.rpc('talleres_avisos_limpiar')
    if (error) throw new Error(error.message ?? 'talleres_avisos_limpiar')
    const fila = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
    return { codigos: entero(fila.codigos), limites: entero(fila.limites) }
  })

  return { confirmacionesVencidas, recordatorios, correos, limpieza, fallos }
}

/**
 * The notices center's data (odd/tasks/talleres-reserva-publica.md T7;
 * design/talleres-reserva/15): `talleres_avisos_panel(taller)` returns the
 * switches, whether the caller may change them, this month's count per
 * notice and the last 50 emails with their delivery state. The RPC refuses
 * anyone without coordinator/director read or write (or admin.manage) on
 * the taller's node.
 */

export type EstadoEnvio = 'pendiente' | 'enviado' | 'fallido' | 'sin_correo'

export interface EnvioHistorial {
  readonly id: string
  readonly tipo: string
  readonly persona: string
  readonly estado: EstadoEnvio
  readonly intentos: number
  readonly error: string | null
  readonly creadoEn: string
  readonly enviadoEn: string | null
  readonly leidoEn: string | null
  readonly enApp: boolean
  /** Only on rows nobody could email (sin_correo, fallido): the manual WhatsApp. */
  readonly telefono: string | null
  /** The notice's text, for the manual WhatsApp message. */
  readonly texto: string
}

export interface PanelAvisos {
  readonly config: Readonly<Record<string, unknown>>
  readonly puedeEditar: boolean
  readonly mes: Readonly<Record<string, number>>
  readonly resumen: { readonly enviadosMes: number; readonly sinEntregar: number; readonly sinCorreo: number }
  readonly historial: readonly EnvioHistorial[]
}

interface RespuestaRpc {
  readonly data: unknown
  readonly error: { readonly message?: string; readonly code?: string } | null
}

export interface ClientePanelAvisos {
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<RespuestaRpc>
}

const ESTADOS: readonly EstadoEnvio[] = ['pendiente', 'enviado', 'fallido', 'sin_correo']

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {}
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0
}

export function parsePanelAvisos(data: unknown): PanelAvisos {
  const raiz = objeto(data)
  const mes: Record<string, number> = {}
  for (const [tipo, n] of Object.entries(objeto(raiz.mes))) mes[tipo] = numero(n)
  const resumen = objeto(raiz.resumen)
  const historial: EnvioHistorial[] = []
  for (const bruto of Array.isArray(raiz.historial) ? raiz.historial : []) {
    const fila = objeto(bruto)
    const id = texto(fila.id)
    const creadoEn = texto(fila.creado_en)
    const estado = ESTADOS.find((e) => e === fila.estado)
    if (!id || !creadoEn || !estado) continue
    historial.push({
      id,
      tipo: texto(fila.tipo) ?? 'aviso',
      persona: texto(fila.persona) ?? 'Sin nombre',
      estado,
      intentos: numero(fila.intentos),
      error: texto(fila.error),
      creadoEn,
      enviadoEn: texto(fila.enviado_en),
      leidoEn: texto(fila.leido_en),
      enApp: fila.en_app === true,
      telefono: texto(fila.telefono),
      texto: texto(fila.texto) ?? '',
    })
  }
  return {
    config: objeto(raiz.config),
    puedeEditar: raiz.puede_editar === true,
    mes,
    resumen: {
      enviadosMes: numero(resumen.enviados_mes),
      sinEntregar: numero(resumen.sin_entregar),
      sinCorreo: numero(resumen.sin_correo),
    },
    historial,
  }
}

/** null when the caller may not see this taller's notices (42501) or the call failed. */
export async function cargarPanelAvisos(client: ClientePanelAvisos, tallerId: string): Promise<PanelAvisos | null> {
  const { data, error } = await client.rpc('talleres_avisos_panel', { p_taller_id: tallerId })
  if (error) return null
  return parsePanelAvisos(data)
}

/**
 * @jest-environment node
 *
 * T7 (odd/tasks/talleres-reserva-publica.md, S6 S15) — the daily job runs
 * the confirmation expiry, tomorrow's reminders, the outbox and the cleanup
 * in that order; a failed step is reported and the others still run.
 */
import { ejecutarJobTalleres } from '@/lib/platform/talleres/avisos-cron'
import type { ClienteAdminAvisos } from '@/lib/platform/talleres/avisos-envio'

type Respuesta = { data: unknown; error: { message: string } | null }

function cliente(respuestas: Record<string, Respuesta>) {
  const llamadas: string[] = []
  const rpc = jest.fn((nombre: string) => {
    llamadas.push(nombre)
    return Promise.resolve(respuestas[nombre] ?? { data: null, error: null })
  })
  return { client: { rpc } as unknown as ClienteAdminAvisos, rpc, llamadas }
}

describe('ejecutarJobTalleres', () => {
  it('runs every step in order and returns counts only', async () => {
    const { client, rpc, llamadas } = cliente({
      talleres_cerrar_confirmaciones_vencidas: { data: 2, error: null },
      talleres_avisos_recordatorios_encolar: { data: 5, error: null },
      talleres_avisos_envios_reclamar: { data: [], error: null },
      talleres_avisos_limpiar: { data: { codigos: 1, limites: 40 }, error: null },
    })
    const ahora = new Date('2026-11-10T22:00:00Z')

    const resultado = await ejecutarJobTalleres(client, { ahora, envio: { enviarCorreo: jest.fn() } })

    expect(llamadas).toEqual([
      'talleres_cerrar_confirmaciones_vencidas',
      'talleres_avisos_recordatorios_encolar',
      'talleres_avisos_envios_reclamar',
      'talleres_avisos_limpiar',
    ])
    expect(rpc).toHaveBeenCalledWith('talleres_avisos_recordatorios_encolar', { p_ahora: '2026-11-10T22:00:00.000Z' })
    expect(resultado).toEqual({
      confirmacionesVencidas: 2,
      recordatorios: 5,
      correos: { reclamados: 0, enviados: 0, fallidos: 0 },
      limpieza: { codigos: 1, limites: 40 },
      fallos: [],
    })
  })

  it('a failed step is named and the next ones still run', async () => {
    const { client, llamadas } = cliente({
      talleres_cerrar_confirmaciones_vencidas: { data: null, error: { message: 'function does not exist' } },
      talleres_avisos_recordatorios_encolar: { data: 3, error: null },
      talleres_avisos_envios_reclamar: { data: null, error: { message: 'denied' } },
      talleres_avisos_limpiar: { data: { codigos: 0, limites: 0 }, error: null },
    })
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    const resultado = await ejecutarJobTalleres(client, { envio: { enviarCorreo: jest.fn() } })

    expect(llamadas).toHaveLength(4)
    expect(resultado.fallos).toEqual(['confirmaciones', 'correos'])
    expect(resultado.confirmacionesVencidas).toBeNull()
    expect(resultado.recordatorios).toBe(3)
    expect(resultado.correos).toBeNull()
    consola.mockRestore()
  })
})

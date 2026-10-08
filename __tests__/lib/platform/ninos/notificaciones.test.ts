/**
 * @jest-environment node
 *
 * N9 — parent emails after a check-in or check-out: one email per family
 * visit and address, idempotent per visit, failures never surface.
 */
import { armarAvisos, enviarAvisos, type FilaCorreo } from '@/lib/platform/ninos/notificaciones'

const base: FilaCorreo = {
  visita_id: 'v1', padre_id: 'p1', email: 'ana@example.test', padre_nombre: 'Ana',
  nino_nombre: 'Sofía', nino_genero: 'Femenino', salon: 'Preescolar II', codigo: '4821',
  entrada_at: '2026-10-11T13:05:00Z', salida_at: '2026-10-11T14:42:00Z', retirado_por_nombre: 'Ana',
}

describe('armarAvisos', () => {
  it('check-in: one email per visit and parent, one line per child, the code once', () => {
    const filas = [base, { ...base, nino_nombre: 'Luis', nino_genero: 'Masculino', salon: 'Maternal' }]
    expect(armarAvisos(filas, 'ingreso')).toEqual([
      {
        to: 'ana@example.test',
        subject: 'Ingreso registrado: Sofía y Luis',
        evento: 'ingreso',
        lineas: ['Sofía ingresó a Preescolar II a las 9:05.', 'Luis ingresó a Maternal a las 9:05.'],
        codigo: '4821',
        idempotencyKey: 'ninos-ingreso-v1-p1',
      },
    ])
  })

  it('check-out: gendered sentence with who picked up', () => {
    const [aviso] = armarAvisos([base, { ...base, nino_nombre: 'Luis', nino_genero: 'Masculino' }], 'retiro')
    expect(aviso.lineas).toEqual(['Sofía fue retirada a las 10:42 por Ana.', 'Luis fue retirado a las 10:42 por Ana.'])
    expect(aviso.idempotencyKey).toBe('ninos-retiro-v1-p1')
  })

  it('two parents get one email each; two visits stay apart', () => {
    const filas = [base, { ...base, padre_id: 'p2', email: 'luis@example.test' }, { ...base, visita_id: 'v2' }]
    expect(armarAvisos(filas, 'ingreso').map((a) => a.idempotencyKey)).toEqual([
      'ninos-ingreso-v1-p1', 'ninos-ingreso-v1-p2', 'ninos-ingreso-v2-p1',
    ])
  })
})

describe('enviarAvisos', () => {
  const args = { ninoIds: ['n1'], turnoId: 't1', fecha: '2026-10-11', evento: 'ingreso' as const }

  it('reads the emails as the caller and sends each one', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [base], error: null })
    const enviar = jest.fn().mockResolvedValue({ success: true })
    await enviarAvisos({ rpc, enviar }, args)
    expect(rpc).toHaveBeenCalledWith('ninos_correos_visita', {
      p_nino_ids: ['n1'], p_turno_id: 't1', p_fecha: '2026-10-11', p_evento: 'ingreso',
    })
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@example.test', idempotencyKey: 'ninos-ingreso-v1-p1' }))
  })

  it('never throws and logs without personal data', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      enviarAvisos({ rpc: jest.fn().mockResolvedValue({ data: [base], error: null }), enviar: jest.fn().mockRejectedValue(new Error('ana@example.test')) }, args),
    ).resolves.toBeUndefined()
    await expect(
      enviarAvisos({ rpc: jest.fn().mockResolvedValue({ data: null, error: { code: 'XX', message: 'Sofía' } }), enviar: jest.fn() }, args),
    ).resolves.toBeUndefined()
    await expect(enviarAvisos({ rpc: jest.fn().mockRejectedValue(new Error('x')), enviar: jest.fn() }, args)).resolves.toBeUndefined()
    const texto = JSON.stringify(log.mock.calls)
    expect(texto).not.toContain('ana@example.test')
    expect(texto).not.toContain('Sofía')
    log.mockRestore()
  })
})

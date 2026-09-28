/**
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — loader for the
 * talleres_servidores_del_taller(p_taller_id) RPC (T1, migration
 * 20260926150000_talleres_plantillas_del_taller.sql): every active
 * servidor of the taller's node or a descendant. Backs BOTH the read-only
 * "Equipo" section of /talleres/[taller] and the bounded facilitador
 * picker in the Grupos (plantilla) section — one loader, two consumers.
 *
 * Best-effort, same contract as cargarPermisos: never throws. Any RPC
 * error (including 42501 for a viewer with no visibility) degrades to an
 * empty array rather than crashing the page.
 */

import {
  loadServidoresDelTaller,
  nombreCompletoServidor,
  type ServidorDelTaller,
} from '@/lib/platform/talleres/servidores-del-taller'

describe('loadServidoresDelTaller', () => {
  it('maps the RPC rows to camelCase', async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: [
          {
            persona_id: 'p-1',
            nombre: 'Ana',
            apellido: 'Gómez',
            rol_servicio: 'Líder',
            equipo_label: 'Próximo Paso',
          },
        ],
        error: null,
      }),
    }

    const result = await loadServidoresDelTaller(client, 't-1')

    expect(client.rpc).toHaveBeenCalledWith('talleres_servidores_del_taller', { p_taller_id: 't-1' })
    expect(result).toEqual([
      {
        personaId: 'p-1',
        nombre: 'Ana',
        apellido: 'Gómez',
        rolServicio: 'Líder',
        equipoLabel: 'Próximo Paso',
      },
    ])
  })

  it('degrades to an empty array on an RPC error (e.g. 42501 for a viewer with no visibility)', async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'sin_permisos_para_este_taller', code: '42501' },
      }),
    }

    const result = await loadServidoresDelTaller(client, 't-1')
    expect(result).toEqual([])
  })

  it('degrades to an empty array when the client throws', async () => {
    const client = { rpc: jest.fn().mockRejectedValue(new Error('network')) }
    const result = await loadServidoresDelTaller(client, 't-1')
    expect(result).toEqual([])
  })

  it('degrades to an empty array when data is not an array', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) }
    const result = await loadServidoresDelTaller(client, 't-1')
    expect(result).toEqual([])
  })
})

describe('nombreCompletoServidor', () => {
  it('joins nombre and apellido', () => {
    const servidor: ServidorDelTaller = {
      personaId: 'p-1',
      nombre: 'Ana',
      apellido: 'Gómez',
      rolServicio: 'Líder',
      equipoLabel: null,
    }
    expect(nombreCompletoServidor(servidor)).toBe('Ana Gómez')
  })

  it('falls back to a placeholder when both are missing', () => {
    const servidor: ServidorDelTaller = {
      personaId: 'p-1',
      nombre: null,
      apellido: null,
      rolServicio: null,
      equipoLabel: null,
    }
    expect(nombreCompletoServidor(servidor)).toBe('Persona sin nombre')
  })
})

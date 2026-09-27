/**
 * @jest-environment node
 *
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
 * refrescarEstadosEdiciones: the shared best-effort call to
 * talleres_refrescar_estados the taller and edición page loaders make
 * before reading taller_ediciones.
 */

import { refrescarEstadosEdiciones } from '@/lib/platform/talleres/refrescar-estados'

describe('refrescarEstadosEdiciones', () => {
  it('calls talleres_refrescar_estados with p_taller_id: null by default', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 0, error: null })
    await refrescarEstadosEdiciones({ rpc })
    expect(rpc).toHaveBeenCalledWith('talleres_refrescar_estados', { p_taller_id: null })
  })

  it('scopes the call to the given taller id', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 1, error: null })
    await refrescarEstadosEdiciones({ rpc }, 't-1')
    expect(rpc).toHaveBeenCalledWith('talleres_refrescar_estados', { p_taller_id: 't-1' })
  })

  it('never throws when the RPC returns an error (best effort)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(refrescarEstadosEdiciones({ rpc })).resolves.toBeUndefined()
  })

  it('never throws when the client itself rejects or has no rpc method', async () => {
    const rejecting = { rpc: jest.fn().mockRejectedValue(new Error('network down')) }
    await expect(refrescarEstadosEdiciones(rejecting)).resolves.toBeUndefined()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed client
    const noRpc = {} as any
    await expect(refrescarEstadosEdiciones(noRpc)).resolves.toBeUndefined()
  })
})

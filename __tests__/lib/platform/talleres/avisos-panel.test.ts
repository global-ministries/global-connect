/**
 * @jest-environment node
 *
 * T7 (odd/tasks/talleres-reserva-publica.md, S6 S14) — the notices center:
 * the panel RPC's reply, the catalog's switches (Cambio de fecha is fixed)
 * and the switch action (input checked here, authority in the RPC).
 */
import { guardarAvisoTallerAction } from '@/lib/platform/talleres/avisos-actions'
import { AVISOS_TALLER, avisoActivo, esTipoConfigurable, nombreAviso } from '@/lib/platform/talleres/avisos-catalogo'
import { cargarPanelAvisos, parsePanelAvisos, type ClientePanelAvisos } from '@/lib/platform/talleres/avisos-panel'

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: jest.fn(() => true) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))

const TALLER = '6f1d2c3b-1111-4222-8333-444455556666'
const servidor = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const revalidar = jest.requireMock('next/cache').revalidatePath as jest.Mock

describe('parsePanelAvisos', () => {
  it('reads config, authority, counts and the history', () => {
    const panel = parsePanelAvisos({
      config: { recordatorio_clase: false },
      puede_editar: true,
      mes: { inscripcion_recibida: 31, recordatorio_clase: 'x' },
      resumen: { enviados_mes: 146, sin_entregar: 3, sin_correo: 2 },
      historial: [
        {
          id: 'e1', tipo: 'grupo_asignado', persona: 'Coromoto Linárez', estado: 'sin_correo', intentos: 0,
          error: null, creado_en: '2026-11-10T13:00:00Z', enviado_en: null, leido_en: null, en_app: true,
          telefono: '04141234567', texto: 'Tu grupo y quién lo facilita',
        },
        { id: 'e2', estado: 'raro', creado_en: '2026-11-10T13:00:00Z' },
      ],
    })

    expect(panel.config).toEqual({ recordatorio_clase: false })
    expect(panel.puedeEditar).toBe(true)
    expect(panel.mes).toEqual({ inscripcion_recibida: 31, recordatorio_clase: 0 })
    expect(panel.resumen).toEqual({ enviadosMes: 146, sinEntregar: 3, sinCorreo: 2 })
    expect(panel.historial).toEqual([
      {
        id: 'e1', tipo: 'grupo_asignado', persona: 'Coromoto Linárez', estado: 'sin_correo', intentos: 0, error: null,
        creadoEn: '2026-11-10T13:00:00Z', enviadoEn: null, leidoEn: null, enApp: true, telefono: '04141234567',
        texto: 'Tu grupo y quién lo facilita',
      },
    ])
  })

  it('a refused or failed RPC is null (the page shows its notice)', async () => {
    const client = { rpc: jest.fn(() => Promise.resolve({ data: null, error: { code: '42501', message: 'sin_permisos' } })) }
    await expect(cargarPanelAvisos(client as unknown as ClientePanelAvisos, TALLER)).resolves.toBeNull()
    expect(client.rpc).toHaveBeenCalledWith('talleres_avisos_panel', { p_taller_id: TALLER })
  })
})

describe('avisos catalog', () => {
  it('lists the notices of artboard 15 with email and in-app only', () => {
    expect(AVISOS_TALLER.map((a) => a.nombre)).toEqual([
      'Solicitud recibida', 'Aprobada', 'No aprobada', 'Grupo asignado', 'Recordatorio de clase',
      'Cambio de fecha', 'Certificado', 'Se liberó un lugar',
    ])
    expect(AVISOS_TALLER.some((a) => /whatsapp/i.test(JSON.stringify(a)))).toBe(false)
  })

  it('a missing key is on, false is off; Cambio de fecha cannot be switched', () => {
    expect(avisoActivo({}, 'recordatorio_clase')).toBe(true)
    expect(avisoActivo({ recordatorio_clase: false }, 'recordatorio_clase')).toBe(false)
    expect(esTipoConfigurable('taller_cambio_fecha')).toBe(false)
    expect(esTipoConfigurable('lugar_disponible')).toBe(true)
    expect(esTipoConfigurable('cualquiera')).toBe(false)
    expect(nombreAviso('certificado_listo')).toBe('Certificado')
  })
})

describe('guardarAvisoTallerAction', () => {
  function conRpc(respuesta: { data: unknown; error: { code?: string; message?: string } | null }) {
    const rpc = jest.fn(() => Promise.resolve(respuesta))
    servidor.mockResolvedValue({ rpc })
    return rpc
  }

  beforeEach(() => {
    servidor.mockReset()
    revalidar.mockReset()
  })

  it('switches one notice through the RPC and revalidates the page', async () => {
    const rpc = conRpc({ data: { recordatorio_clase: false }, error: null })

    await expect(guardarAvisoTallerAction({ tallerId: TALLER, tipo: 'recordatorio_clase', activo: false })).resolves.toEqual({
      ok: true,
      mensaje: 'Aviso apagado.',
    })
    expect(rpc).toHaveBeenCalledWith('talleres_avisos_config_guardar', {
      p_taller_id: TALLER,
      p_tipo: 'recordatorio_clase',
      p_activo: false,
    })
    expect(revalidar).toHaveBeenCalledWith('/talleres/[taller]/avisos', 'page')
  })

  it('refuses a fixed or unknown notice and a bad id without calling the database', async () => {
    const rpc = conRpc({ data: null, error: null })
    for (const input of [
      { tallerId: TALLER, tipo: 'taller_cambio_fecha', activo: false },
      { tallerId: TALLER, tipo: 'whatsapp', activo: true },
      { tallerId: 'no-es-uuid', tipo: 'recordatorio_clase', activo: true },
    ]) {
      await expect(guardarAvisoTallerAction(input)).resolves.toEqual({ ok: false, mensaje: 'Ese aviso no se puede cambiar.' })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps the RPC refusal (42501) to a plain message', async () => {
    conRpc({ data: null, error: { code: '42501', message: 'sin_permisos_para_este_taller' } })
    await expect(guardarAvisoTallerAction({ tallerId: TALLER, tipo: 'grupo_asignado', activo: true })).resolves.toEqual({
      ok: false,
      mensaje: 'Solo la coordinación o la dirección del taller puede cambiar sus avisos.',
    })
    expect(revalidar).not.toHaveBeenCalled()
  })
})

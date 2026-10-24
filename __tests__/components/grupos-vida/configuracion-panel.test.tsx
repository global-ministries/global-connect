/**
 * The Grupos de Vida settings panel uses the full page width
 * (docs/design-system.md, "Sections and fields"): each settings group is its
 * own card inside SeccionesSistema, so wide screens show several groups side by
 * side, and the save action sits in the action footer after the grid.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const actualizarConfiguracionGrupos = jest.fn()

jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))
jest.mock('@/lib/actions/configuracion-grupos-vida.actions', () => ({
  obtenerConfiguracionGrupos: jest.fn(),
  actualizarConfiguracionGrupos: (...args: unknown[]) => actualizarConfiguracionGrupos(...args),
}))
jest.mock('@/lib/actions/geocodificar.actions', () => ({
  geocodificarDireccionesMasivo: jest.fn(),
  obtenerEstadisticasGeocoding: async () => ({ success: true, total: 10, conCoordenadas: 7, sinCoordenadas: 3, porcentaje: 70 }),
}))

import { ConfiguracionPanel } from '@/components/grupos-vida/configuracion-panel'
import type { ConfiguracionGruposVida } from '@/lib/types/configuracion-grupos-vida.types'

const config: ConfiguracionGruposVida = {
  id: 'cfg-1',
  campus_id: null,
  dias_expiracion_solicitud: 7,
  max_miembros_por_grupo: null,
  permitir_lider_en_otro_grupo: true,
  requiere_aprobacion_grupo_planificacion: false,
  notificar_lider_ingreso: true,
  creacion_grupos_habilitada: true,
  modo_cierre_asistencia: 'semanal',
  dia_cierre_semanal: 0,
  hora_cierre: '23:59',
  visitantes_habilitados: false,
  puntos_oracion_compartidos: false,
  umbral_atencion: 2,
  umbral_riesgo: 4,
  umbral_critico: 6,
  correo_semanal_habilitado: false,
  dia_envio_correo: 1,
  hora_envio_correo: '08:00',
  rol_minimo_eliminar_miembro: 'director-etapa',
  creado_en: '2026-01-01T00:00:00Z',
  actualizado_en: '2026-01-01T00:00:00Z',
}

const SECCIONES = [
  'Configuración de Grupos de Vida',
  'Permisos de gestión de miembros',
  'Asistencia Avanzada',
  'Funciones opcionales',
  'Umbrales de riesgo',
  'Correo semanal',
  'Geocodificación masiva',
]

describe('ConfiguracionPanel layout', () => {
  beforeEach(() => {
    actualizarConfiguracionGrupos.mockReset()
    actualizarConfiguracionGrupos.mockResolvedValue({ success: true })
  })

  it('puts each settings group in its own card inside the sections grid', async () => {
    render(<ConfiguracionPanel configInicial={config} />)
    expect(await screen.findByText('Direcciones')).toBeInTheDocument()

    const secciones = screen.getByRole('heading', { name: SECCIONES[0] }).closest('[data-slot="secciones"]') as HTMLElement
    expect(secciones).not.toBeNull()
    const tarjetas = SECCIONES.map((titulo) => {
      const encabezado = within(secciones).getByRole('heading', { name: titulo })
      return Array.from(secciones.children).find((hijo) => hijo.contains(encabezado))
    })
    expect(new Set(tarjetas).size).toBe(SECCIONES.length)
    expect(tarjetas.every(Boolean)).toBe(true)
  })

  it('keeps the save action in the action footer after the grid and saves the same settings', async () => {
    render(<ConfiguracionPanel configInicial={config} />)
    const guardar = await screen.findByRole('button', { name: 'Guardar cambios' })
    expect(guardar.closest('[data-slot="pie-acciones"]')).not.toBeNull()
    expect(guardar.closest('[data-slot="secciones"]')).toBeNull()

    fireEvent.click(guardar)
    await waitFor(() => expect(actualizarConfiguracionGrupos).toHaveBeenCalledTimes(1))
    expect(actualizarConfiguracionGrupos).toHaveBeenCalledWith('cfg-1', expect.objectContaining({
      dias_expiracion_solicitud: 7,
      max_miembros_por_grupo: null,
      creacion_grupos_habilitada: true,
      modo_cierre_asistencia: 'semanal',
      umbral_critico: 6,
      rol_minimo_eliminar_miembro: 'director-etapa',
    }))
  })
})

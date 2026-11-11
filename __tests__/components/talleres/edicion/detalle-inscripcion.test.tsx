/**
 * @jest-environment jsdom
 *
 * R3f (odd/tasks/talleres-rediseno.md, S2, S4) — DetalleInscripcion: what
 * the drawer shows for the data the legacy table showed (pareja, sobre el
 * cupo, resultado, ficha nueva with «Reenviar acceso»), so nothing the old
 * table offered is lost.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const reenviarMock = jest.fn()

jest.mock('@/lib/platform/talleres/inscripciones-actions', () => ({
  approveInscripcionAction: jest.fn(),
  rejectInscripcionAction: jest.fn(),
  reenviarAccesoAction: (...a: unknown[]) => reenviarMock(...a),
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))

import { DetalleInscripcion, mensajeErrorInscripcion } from '@/components/talleres/edicion/detalle-inscripcion'
import type { InscritaEdicion } from '@/components/talleres/edicion/modelo'

const BASE: InscritaEdicion = {
  id: 'i-1',
  nombre: 'Ana Pérez',
  correo: null,
  companero: 'Luis Pérez',
  vinculo: 'matrimonio',
  estado: 'aprobado',
  origen: 'admin',
  porVerificar: false,
  grupoId: 'g-1',
  grupoNombre: 'Grupo 1',
  solicito: '2026-11-04T14:00:00Z',
  sobreCupo: true,
  sobreCupoPor: 'Neida Castillo',
  sobreCupoEn: '2026-11-05T14:00:00Z',
  resultado: 'completado',
  fichaNueva: true,
  accesoEstado: 'enviada',
  accesoFallido: false,
}

function abrir(o: Partial<InscritaEdicion> = {}, extra: Partial<Parameters<typeof DetalleInscripcion>[0]> = {}) {
  render(
    <DetalleInscripcion
      inscrita={{ ...BASE, ...o }}
      abierto
      onCambioAbierto={jest.fn()}
      onResuelto={jest.fn()}
      puedeAprobar
      puedeAsignar={false}
      grupos={[]}
      mostrarResultado
      {...extra}
    />,
  )
  return screen.getByRole('dialog')
}

describe('DetalleInscripcion — data', () => {
  it('shows pareja, origen, grupo, sobre el cupo and resultado', () => {
    const panel = abrir()
    expect(panel).toHaveTextContent('En pareja conLuis Pérez · matrimonio')
    expect(panel).toHaveTextContent('OrigenCoordinación')
    expect(panel).toHaveTextContent('GrupoGrupo 1')
    expect(panel).toHaveTextContent('Sobre el cupoInscrita por Neida Castillo el jue 5 nov')
    expect(panel).toHaveTextContent('ResultadoCompletado')
    expect(within(panel).getByText('Aprobada')).toBeInTheDocument()
  })

  it('offers «Reenviar acceso» for a partner ficha created by the member, with aprobarInscripciones only', async () => {
    reenviarMock.mockResolvedValue({ ok: true, message: 'Acceso reenviado.' })
    const panel = abrir()
    expect(panel).toHaveTextContent('Acceso enviado')
    fireEvent.click(within(panel).getByRole('button', { name: 'Reenviar acceso' }))
    await waitFor(() => expect(reenviarMock).toHaveBeenCalledWith('i-1'))
  })

  it('hides «Reenviar acceso» without aprobarInscripciones', () => {
    const panel = abrir({}, { puedeAprobar: false })
    expect(within(panel).queryByRole('button', { name: 'Reenviar acceso' })).toBeNull()
  })

  it('has only «Cerrar» for an aprobada when grupos cannot be managed', () => {
    const panel = abrir({}, { puedeAsignar: false })
    expect(within(panel).queryByRole('combobox')).toBeNull()
    expect(within(panel).getAllByRole('button', { name: 'Cerrar' }).length).toBeGreaterThan(0)
  })
})

describe('mensajeErrorInscripcion', () => {
  it.each([
    ['FORBIDDEN', 'No tienes permiso para decidir esta inscripción.'],
    ['NOT_FOUND_OR_NOT_PENDIENTE', 'Esta inscripción ya no está pendiente. Actualiza la página.'],
    ['INVALID_MOTIVO', 'Escribe el motivo interno.'],
    ['INVALID_MENSAJE', 'El mensaje puede tener hasta 600 caracteres.'],
    ['NO_SESSION', 'Tu sesión terminó. Vuelve a iniciar sesión.'],
    ['UPDATE_FAILED', 'No se pudo guardar. Inténtalo de nuevo.'],
  ] as const)('%s → %s', (error, texto) => {
    expect(mensajeErrorInscripcion({ ok: false, error })).toBe(texto)
  })
})

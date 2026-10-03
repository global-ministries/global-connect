/**
 * @jest-environment jsdom
 *
 * Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) — the
 * "Cerrar edición" trigger and its preview/confirm dialog. Real DOM
 * interaction (jsdom): the dialog loads the preview from
 * previsualizarCierreEdicion on open, shows the warnings and one row per
 * inscrito, and only closes the edición on an explicit confirm.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const previsualizarMock = jest.fn()
const cerrarMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/[edicion]/actions', () => ({
  previsualizarCierreEdicion: (...args: unknown[]) => previsualizarMock(...args),
  cerrarEdicion: (...args: unknown[]) => cerrarMock(...args),
}))

import { CerrarEdicionButton } from '@/components/talleres/cerrar-edicion-dialog'
import type { ResumenCierre, VistaPreviaCierre } from '@/lib/platform/talleres/cierre-edicion'

const VISTA_PREVIA: VistaPreviaCierre = {
  clasesSinDictar: 2,
  reportesSinEnviar: 1,
  clasesMinimas: 6,
  filas: [
    {
      inscripcionId: 'i-1',
      personaNombre: 'Ana Gómez',
      companeroNombre: 'Luis Pérez',
      grupoNombre: 'Grupo Alfa',
      clasesPresente: 6,
      clasesTotal: 8,
      minimo: 6,
      resultado: 'completado',
    },
    {
      inscripcionId: 'i-2',
      personaNombre: 'Marta Ruiz',
      companeroNombre: null,
      grupoNombre: null,
      clasesPresente: 0,
      clasesTotal: 8,
      minimo: 6,
      resultado: 'abandono',
    },
  ],
}

const RESUMEN: ResumenCierre = {
  completados: 5,
  noCompletados: 2,
  abandonos: 1,
  certificadosEmitidos: 5,
  clasesCerradas: 6,
  clasesCanceladas: 2,
  gruposCompletados: 2,
  reportesCerrados: 1,
  reportesSinEnviar: 1,
}

function renderBoton(puedeCerrar = true) {
  return render(<CerrarEdicionButton tallerSlug="proximo-paso" edicionId="e-1" puedeCerrar={puedeCerrar} />)
}

async function abrirConVistaPrevia(vistaPrevia: VistaPreviaCierre = VISTA_PREVIA) {
  previsualizarMock.mockResolvedValue({ ok: true, vistaPrevia })
  const utils = renderBoton()
  fireEvent.click(screen.getByRole('button', { name: /cerrar edición/i }))
  await screen.findByRole('button', { name: /confirmar cierre/i })
  return utils
}

beforeEach(() => {
  previsualizarMock.mockReset()
  cerrarMock.mockReset()
})

describe('CerrarEdicionButton — trigger', () => {
  it('renders the trigger and no dialog on first render, without loading anything', () => {
    renderBoton()
    expect(screen.getByRole('button', { name: /cerrar edición/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(previsualizarMock).not.toHaveBeenCalled()
  })

  it('renders no trigger when puedeCerrar is false', () => {
    renderBoton(false)
    expect(screen.queryByRole('button', { name: /cerrar edición/i })).not.toBeInTheDocument()
  })
})

describe('CerrarEdicionButton — preview', () => {
  it('loads the preview for this edición when the dialog opens', async () => {
    previsualizarMock.mockReturnValue(new Promise(() => {}))
    renderBoton()
    fireEvent.click(screen.getByRole('button', { name: /cerrar edición/i }))
    expect(previsualizarMock).toHaveBeenCalledWith('e-1')
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(/cargando/i)
  })

  it('warns about clases sin dictar and reportes sin enviar', async () => {
    await abrirConVistaPrevia()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('2 clases sin dictar se cancelarán.')).toBeInTheDocument()
    expect(within(dialog).getByText('1 reporte sin enviar queda abierto.')).toBeInTheDocument()
  })

  it('shows no warnings when nothing is pending', async () => {
    await abrirConVistaPrevia({ ...VISTA_PREVIA, clasesSinDictar: 0, reportesSinEnviar: 0 })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(/sin dictar/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/sin enviar/i)).not.toBeInTheDocument()
  })

  it('shows the configured minimum, or "todas las clases dictadas" when there is none', async () => {
    const { unmount } = await abrirConVistaPrevia()
    expect(screen.getByText(/mínimo para completar: 6 clases/i)).toBeInTheDocument()
    unmount()
    await abrirConVistaPrevia({ ...VISTA_PREVIA, clasesMinimas: null })
    expect(screen.getByText(/mínimo para completar: todas las clases dictadas/i)).toBeInTheDocument()
  })

  it('shows the counts by resultado', async () => {
    await abrirConVistaPrevia()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('1 completado')).toBeInTheDocument()
    expect(within(dialog).getByText('0 no completados')).toBeInTheDocument()
    expect(within(dialog).getByText('1 abandono')).toBeInTheDocument()
  })

  it('renders one row per inscrito: persona (+ pareja), grupo, "X de N" with the mínimo, and the resultado badge', async () => {
    await abrirConVistaPrevia()
    const filas = within(screen.getByRole('dialog')).getAllByRole('row')
    // header + two inscritos
    expect(filas).toHaveLength(3)
    const ana = filas[1]
    expect(ana).toHaveTextContent('Ana Gómez')
    expect(ana).toHaveTextContent('+ Luis Pérez')
    expect(ana).toHaveTextContent('Grupo Alfa')
    expect(ana).toHaveTextContent('6 de 8')
    expect(ana).toHaveTextContent('mín. 6')
    expect(ana).toHaveTextContent('Completado')
    const marta = filas[2]
    expect(marta).toHaveTextContent('Marta Ruiz')
    expect(marta).toHaveTextContent('—')
    expect(marta).toHaveTextContent('0 de 8')
    expect(marta).toHaveTextContent('Abandonó')
  })

  it('says so when there is nobody to evaluate, and still allows closing', async () => {
    await abrirConVistaPrevia({ ...VISTA_PREVIA, filas: [] })
    expect(screen.getByText(/no hay inscritos para evaluar/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirmar cierre/i })).not.toBeDisabled()
  })

  it('shows the translated error and no confirm button when the preview fails', async () => {
    previsualizarMock.mockResolvedValue({ ok: false, error: 'conflict', message: 'Esta edición ya está cerrada.' })
    renderBoton()
    fireEvent.click(screen.getByRole('button', { name: /cerrar edición/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta edición ya está cerrada.')
    expect(screen.queryByRole('button', { name: /confirmar cierre/i })).not.toBeInTheDocument()
  })

  it('shows a generic error when the preview request itself throws', async () => {
    previsualizarMock.mockRejectedValue(new Error('network'))
    renderBoton()
    fireEvent.click(screen.getByRole('button', { name: /cerrar edición/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo cargar la vista previa/i)
  })
})

describe('CerrarEdicionButton — confirm', () => {
  it('closes nothing until confirmed: "Volver" dismisses without calling cerrarEdicion', async () => {
    await abrirConVistaPrevia()
    fireEvent.click(screen.getByRole('button', { name: /volver/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(cerrarMock).not.toHaveBeenCalled()
  })

  it('calls cerrarEdicion with tallerSlug/edicionId and shows the summary', async () => {
    cerrarMock.mockResolvedValue({ ok: true, resumen: RESUMEN })
    await abrirConVistaPrevia()
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre/i }))
    await waitFor(() => expect(cerrarMock).toHaveBeenCalledWith({ tallerSlug: 'proximo-paso', edicionId: 'e-1' }))
    const dialog = await screen.findByRole('dialog', { name: /edición cerrada/i })
    expect(within(dialog).getByText('5 completados')).toBeInTheDocument()
    expect(within(dialog).getByText('2 no completados')).toBeInTheDocument()
    expect(within(dialog).getByText('1 abandono')).toBeInTheDocument()
    const certificados = within(dialog).getByText('Certificados emitidos').parentElement
    expect(certificados).toHaveTextContent('5')
    expect(within(dialog).getByText('Clases canceladas').parentElement).toHaveTextContent('2')
    expect(within(dialog).getByText('Reportes sin enviar').parentElement).toHaveTextContent('1')
  })

  it('keeps the summary on screen after the page re-renders without the trigger (revalidation)', async () => {
    cerrarMock.mockResolvedValue({ ok: true, resumen: RESUMEN })
    const { rerender } = await abrirConVistaPrevia()
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre/i }))
    await screen.findByRole('dialog', { name: /edición cerrada/i })
    rerender(<CerrarEdicionButton tallerSlug="proximo-paso" edicionId="e-1" puedeCerrar={false} />)
    expect(screen.getByRole('dialog', { name: /edición cerrada/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /listo/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cerrar edición/i })).not.toBeInTheDocument()
  })

  it('confirms the close even when the summary could not be read', async () => {
    cerrarMock.mockResolvedValue({ ok: true, resumen: null })
    await abrirConVistaPrevia()
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre/i }))
    expect(await screen.findByText(/la edición quedó cerrada/i)).toBeInTheDocument()
  })

  it('shows the translated error and keeps the preview reachable when closing fails', async () => {
    cerrarMock.mockResolvedValue({
      ok: false,
      error: 'conflict',
      message: 'Una edición en borrador o cancelada no se puede cerrar.',
    })
    await abrirConVistaPrevia()
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Una edición en borrador o cancelada no se puede cerrar.')
    // The error can paint while the transition is still pending (the button
    // reads "Cerrando…" until it settles), so wait for the label to return.
    expect(await screen.findByRole('button', { name: /confirmar cierre/i })).not.toBeDisabled()
  })

  it('shows a generic error and brings the confirm back when the close request itself fails in transit', async () => {
    cerrarMock.mockRejectedValue(new Error('network'))
    await abrirConVistaPrevia()
    fireEvent.click(screen.getByRole('button', { name: /confirmar cierre/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cerrar la edición.')
    expect(screen.getByRole('dialog', { name: /cerrar edición/i })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /confirmar cierre/i })).not.toBeDisabled()
  })
})

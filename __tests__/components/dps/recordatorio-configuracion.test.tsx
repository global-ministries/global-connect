/**
 * `<RecordatorioConfiguracion>` — «Recordatorio por correo» in Configuración
 * de DPS (odd/tasks/dps-asistencia-pco.md, T16c; S14.3; artboard
 * design/dps-avisos-correo 07): on/off, 1–7 days before, the fixed hour as
 * text, who receives it and the live preview «El próximo sale el … : N
 * personas» (from the database, read again after each save). Only the
 * configurator edits; everyone else reads. The server action is mocked.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { RecordatorioConfiguracion } from '@/components/dps/recordatorio-configuracion'
import * as acciones from '@/lib/actions/dps-configuracion.actions'
import { leerRecordatorio, type ConfigRecordatorio } from '@/lib/platform/dps/recordatorio'

jest.mock('@/lib/actions/dps-configuracion.actions', () => ({
  guardarRecordatorioDps: jest.fn(),
}))

const guardar = acciones.guardarRecordatorioDps as jest.MockedFunction<typeof acciones.guardarRecordatorioDps>

const RECORDATORIO: ConfigRecordatorio = leerRecordatorio({
  activo: true,
  dias: 2,
  hora: '10:00',
  puede_editar: true,
  proximo: { fecha: '2026-11-15', sale: '2026-11-13', personas: 31, con_botones: 7, no_pueden: 2, sin_correo: 1 },
  ultimo: { fecha: '2026-11-06', enviados: 29, total: 30 },
})!

const onEmpezar = jest.fn()
const onTerminar = jest.fn((r: { ok: boolean }) => r.ok)

const montar = (parche: Partial<ConfigRecordatorio> = {}, soloLectura = false) =>
  render(<RecordatorioConfiguracion recordatorio={{ ...RECORDATORIO, ...parche }} soloLectura={soloLectura} onEmpezar={onEmpezar} onTerminar={onTerminar} />)

const proximo = () => screen.getByRole('complementary', { name: 'Próximo recordatorio' })

beforeEach(() => {
  jest.clearAllMocks()
})

describe('RecordatorioConfiguracion', () => {
  it('shows the switch, the days, the fixed hour, who receives it and the preview', () => {
    montar()
    expect(screen.getByRole('heading', { level: 2, name: 'Recordatorio por correo' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Enviar recordatorio' })).getByRole('button', { name: 'Sí' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Cuántos días antes' })).toHaveValue('2')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['1 día antes', '2 días antes', '3 días antes', '4 días antes', '5 días antes', '6 días antes', '7 días antes'])
    expect(screen.getByTestId('recordatorio-hora')).toHaveTextContent('10:00 de la mañana, hora de Caracas')
    expect(screen.getByText('Quienes confirmaron o no han respondido; nunca quien dijo que no puede.')).toBeInTheDocument()
    expect(proximo()).toHaveTextContent('El próximo sale el viernes 13 a las 10:00 para el domingo 15: 31 personas')
    expect(proximo()).toHaveTextContent('Confirmaron24')
    expect(proximo()).toHaveTextContent('No han respondido · con botones7')
    expect(proximo()).toHaveTextContent('Dijeron que no pueden · no lo reciben2')
    expect(proximo()).toHaveTextContent('Sin correo en su ficha · no lo reciben1')
    expect(proximo()).toHaveTextContent('El último salió el viernes 6 a las 10:00: 29 correos.')
  })

  it('changes the days and shows the preview the database computed', async () => {
    guardar.mockResolvedValueOnce({
      ok: true,
      data: { ...RECORDATORIO, dias: 5, proximo: { fecha: '2026-11-22', sale: '2026-11-17', personas: 26, conBotones: 17, noPueden: 1, sinCorreo: 2 } },
    })
    montar()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cuántos días antes' }), '5')
    expect(guardar).toHaveBeenCalledWith({ activo: true, dias: 5 })
    expect(onEmpezar).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(proximo()).toHaveTextContent('El próximo sale el martes 17 a las 10:00 para el domingo 22: 26 personas'))
    expect(screen.getByRole('combobox', { name: 'Cuántos días antes' })).toHaveValue('5')
  })

  it('switches it off: no days to choose and the preview says it is off', async () => {
    guardar.mockResolvedValueOnce({ ok: true, data: { ...RECORDATORIO, activo: false, proximo: null } })
    montar()
    await userEvent.click(within(screen.getByRole('group', { name: 'Enviar recordatorio' })).getByRole('button', { name: 'No' }))
    expect(guardar).toHaveBeenCalledWith({ activo: false, dias: 2 })
    expect(within(screen.getByRole('group', { name: 'Enviar recordatorio' })).getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Cuántos días antes' })).toBeDisabled()
    await waitFor(() => expect(proximo()).toHaveTextContent('Apagado. No sale ningún recordatorio; los avisos siguen llegando cuando los envías.'))
  })

  it('rolls back a refused save', async () => {
    guardar.mockResolvedValueOnce({ ok: false, message: 'Elige entre 1 y 7 días antes.', codigo: 'dias_invalidos' })
    montar()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cuántos días antes' }), '7')
    await waitFor(() => expect(onTerminar).toHaveBeenCalledWith({ ok: false, message: 'Elige entre 1 y 7 días antes.', codigo: 'dias_invalidos' }))
    expect(screen.getByRole('combobox', { name: 'Cuántos días antes' })).toHaveValue('2')
    expect(proximo()).toHaveTextContent('31 personas')
  })

  it('is read-only for whoever does not configure, saying who changes it', () => {
    montar({ puedeEditar: false })
    expect(screen.queryByRole('group', { name: 'Enviar recordatorio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('Solo lo cambia la dirección de DPS, un pastor o un administrador.')).toBeInTheDocument()
    expect(screen.getByTestId('recordatorio-activo')).toHaveTextContent('Sí')
    expect(screen.getByTestId('recordatorio-dias')).toHaveTextContent('2 días antes')
    expect(proximo()).toHaveTextContent('31 personas')
  })

  it('is read-only too when the screen turned read-only', () => {
    montar({}, true)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('says when there is no plan ahead', () => {
    montar({ proximo: null })
    expect(proximo()).toHaveTextContent('No hay planes próximos para recordar.')
  })
})

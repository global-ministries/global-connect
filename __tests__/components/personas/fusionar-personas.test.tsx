/**
 * Personas — the «Fusionar personas» flow of /admin/personas/fusionar
 * (T5, S6c): pick two fichas, compare them side by side, the ficha with the
 * account stays by default (the other cannot be chosen; two accounts are
 * refused), the dry run is shown before the confirmation, the merge needs the
 * survivor's name typed, and the action errors are shown.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('@/lib/actions/personas-fusionar.actions', () => ({
  buscarPersonasParaFusion: jest.fn(),
  resumenFusion: jest.fn(),
  fusionarPersonas: jest.fn(),
}))

import { FusionarPersonas } from '@/components/personas/fusionar-personas'
import type { ResultadoFusion, ResumenPersonaFusion } from '@/lib/platform/personas/fusion'

const acciones = jest.requireMock('@/lib/actions/personas-fusionar.actions') as {
  buscarPersonasParaFusion: jest.Mock
  resumenFusion: jest.Mock
  fusionarPersonas: jest.Mock
}

const Q = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const S = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function resumen(p: Partial<ResumenPersonaFusion> & { id: string; nombre: string; apellido: string }): ResumenPersonaFusion {
  return {
    tieneCuenta: false, cedula: null, telefono: null, email: null, fechaRegistro: '2024-01-01T12:00:00Z',
    fechaNacimiento: null, campus: null, grupos: 0, servicios: 0, asistencias: 0, asistenciasDps: 0, ...p,
  }
}

const QUEDA = resumen({ id: Q, nombre: 'Kelly', apellido: 'Chaviel', tieneCuenta: true, email: 'kelly@x.test', fechaRegistro: '2026-10-01T12:00:00Z', grupos: 1 })
const SEVA = resumen({ id: S, nombre: 'Kelly Andreina', apellido: 'Chaviel', cedula: '12345678', telefono: '04141234567', fechaRegistro: '2021-03-01T12:00:00Z', grupos: 2, servicios: 3, asistencias: 40, campus: 'Valencia' })

const SIMULACION: ResultadoFusion = {
  simulado: true,
  quedaId: Q,
  seVaId: S,
  conteos: [
    { clave: 'asistencia.usuario_id', etiqueta: 'Asistencia a grupos', movidos: 40, descartados: 0, retirados: 0, conservados: 0 },
    { clave: 'grupo_miembros.usuario_id', etiqueta: 'Grupos de vida', movidos: 1, descartados: 1, retirados: 0, conservados: 0 },
  ],
  totalMovidos: 41,
  totalDescartados: 1,
  totalConservados: 0,
  camposCompletados: ['cedula', 'telefono', 'fecha_registro'],
}

beforeEach(() => {
  acciones.buscarPersonasParaFusion.mockReset().mockImplementation(async (q: string) => ({
    ok: true,
    data: q.includes('andreina')
      ? [{ id: S, nombre: 'Kelly Andreina', apellido: 'Chaviel', email: null, tieneCuenta: false }]
      : [{ id: Q, nombre: 'Kelly', apellido: 'Chaviel', email: 'kelly@x.test', tieneCuenta: true }],
  }))
  acciones.resumenFusion.mockReset().mockResolvedValue({ ok: true, data: [QUEDA, SEVA] })
  acciones.fusionarPersonas.mockReset().mockImplementation(async ({ simular }: { simular: boolean }) => ({
    ok: true,
    data: { ...SIMULACION, simulado: simular },
  }))
})

async function elegirAmbas() {
  render(<FusionarPersonas />)
  await userEvent.type(screen.getByLabelText('Primera ficha'), 'kelly chaviel')
  await userEvent.click(await screen.findByRole('button', { name: /^Kelly Chaviel/ }))
  await userEvent.type(screen.getByLabelText('Segunda ficha'), 'andreina')
  await userEvent.click(await screen.findByRole('button', { name: /^Kelly Andreina Chaviel/ }))
}

describe('FusionarPersonas', () => {
  it('compares both fichas side by side; the one with the account stays and the other cannot be chosen', async () => {
    await elegirAmbas()
    await waitFor(() => expect(acciones.resumenFusion).toHaveBeenCalledWith([Q, S]))
    const queda = await screen.findByRole('region', { name: 'Kelly Chaviel' })
    const seva = screen.getByRole('region', { name: 'Kelly Andreina Chaviel' })
    expect(within(queda).getByText('Con cuenta')).toBeInTheDocument()
    expect(within(seva).getByText('Sin cuenta')).toBeInTheDocument()
    expect(within(seva).getByText('12345678')).toBeInTheDocument()
    expect(within(seva).getByText('Valencia')).toBeInTheDocument()
    expect(within(seva).getByText('40')).toBeInTheDocument()
    expect(within(queda).getByRole('radio', { name: 'Queda esta ficha' })).toBeChecked()
    expect(within(seva).getByRole('radio', { name: 'Queda esta ficha' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Fusionar' })).not.toBeInTheDocument()
  })

  it('refuses two fichas with an account', async () => {
    acciones.resumenFusion.mockResolvedValue({ ok: true, data: [QUEDA, { ...SEVA, tieneCuenta: true }] })
    await elegirAmbas()
    expect(await screen.findByText('Las dos fichas tienen cuenta. No se pueden fusionar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver qué se mueve' })).not.toBeInTheDocument()
  })

  it('shows the dry run first, then merges after typing the survivor\'s name', async () => {
    await elegirAmbas()
    await userEvent.click(await screen.findByRole('button', { name: 'Ver qué se mueve' }))
    expect(acciones.fusionarPersonas).toHaveBeenCalledWith({ quedaId: Q, seVaId: S, simular: true })
    expect(await screen.findByText('Se moverán 41 registros a Kelly Chaviel y se descartarán 1 repetidos.')).toBeInTheDocument()
    const lista = screen.getByRole('list', { name: 'Qué se mueve' })
    expect(within(lista).getByText('Asistencia a grupos')).toBeInTheDocument()
    expect(within(lista).getByText('40 movidos')).toBeInTheDocument()
    expect(within(lista).getByText('1 movidos · 1 descartados')).toBeInTheDocument()
    expect(screen.getByText('Se completan en Kelly Chaviel: Cédula, Teléfono, Fecha de registro (la más antigua)')).toBeInTheDocument()
    expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Se conservan con la ficha anterior (historial que no se modifica)' })).not.toBeInTheDocument()

    const fusionar = screen.getByRole('button', { name: 'Fusionar' })
    expect(fusionar).toBeDisabled()
    const confirmar = screen.getByLabelText('Escribe «Kelly Chaviel» para confirmar')
    await userEvent.type(confirmar, 'Kelly')
    expect(fusionar).toBeDisabled()
    await userEvent.type(confirmar, ' chaviel')
    expect(fusionar).toBeEnabled()
    await userEvent.click(fusionar)

    expect(acciones.fusionarPersonas).toHaveBeenLastCalledWith({ quedaId: Q, seVaId: S, simular: false })
    expect(await screen.findByText('Listo. Kelly Chaviel quedó con todo el historial de Kelly Andreina Chaviel.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fusionar otras fichas' }))
    expect(screen.getByLabelText('Primera ficha')).toHaveValue('')
  })

  it('lists apart the append-only history that stays with the old ficha', async () => {
    acciones.fusionarPersonas.mockResolvedValueOnce({
      ok: true,
      data: {
        ...SIMULACION,
        conteos: [
          ...SIMULACION.conteos,
          {
            clave: 'operating_core_participation_eventos.subject_id',
            etiqueta: 'Historial de participación',
            movidos: 0,
            descartados: 0,
            retirados: 0,
            conservados: 3,
          },
        ],
        totalConservados: 3,
      },
    })
    await elegirAmbas()
    await userEvent.click(await screen.findByRole('button', { name: 'Ver qué se mueve' }))
    const mueve = await screen.findByRole('list', { name: 'Qué se mueve' })
    expect(within(mueve).queryByText('Historial de participación')).not.toBeInTheDocument()
    expect(screen.getByText('Se conservan con la ficha anterior (historial que no se modifica): 3 registros.')).toBeInTheDocument()
    const conservados = screen.getByRole('list', { name: 'Se conservan con la ficha anterior (historial que no se modifica)' })
    expect(within(conservados).getByText('Historial de participación')).toBeInTheDocument()
    expect(within(conservados).getByText('3 conservados')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fusionar' })).toBeInTheDocument()
  })

  it('shows the error of a refused merge and keeps the form', async () => {
    await elegirAmbas()
    await userEvent.click(await screen.findByRole('button', { name: 'Ver qué se mueve' }))
    await screen.findByText(/Se moverán 41 registros/)
    acciones.fusionarPersonas.mockResolvedValueOnce({ ok: false, error: 'La ficha con cuenta tiene que ser la que queda.' })
    await userEvent.type(screen.getByLabelText('Escribe «Kelly Chaviel» para confirmar'), 'Kelly Chaviel')
    await userEvent.click(screen.getByRole('button', { name: 'Fusionar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La ficha con cuenta tiene que ser la que queda.')
    expect(screen.queryByText(/^Listo\./)).not.toBeInTheDocument()
  })

  it('shows the error of a failed dry run and offers no confirmation', async () => {
    acciones.fusionarPersonas.mockResolvedValueOnce({ ok: false, error: 'No tienes permiso para fusionar personas.' })
    await elegirAmbas()
    await userEvent.click(await screen.findByRole('button', { name: 'Ver qué se mueve' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para fusionar personas.')
    expect(screen.queryByRole('button', { name: 'Fusionar' })).not.toBeInTheDocument()
  })

  it('without accounts lets the admin choose which ficha stays, and choosing again asks for a new dry run', async () => {
    acciones.resumenFusion.mockResolvedValue({ ok: true, data: [{ ...QUEDA, tieneCuenta: false }, SEVA] })
    await elegirAmbas()
    const seva = await screen.findByRole('region', { name: 'Kelly Andreina Chaviel' })
    // The older ficha stays by default.
    expect(within(seva).getByRole('radio', { name: 'Queda esta ficha' })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Ver qué se mueve' }))
    expect(acciones.fusionarPersonas).toHaveBeenLastCalledWith({ quedaId: S, seVaId: Q, simular: true })
    await screen.findByText(/Se moverán 41 registros/)
    const queda = screen.getByRole('region', { name: 'Kelly Chaviel' })
    await userEvent.click(within(queda).getByRole('radio', { name: 'Queda esta ficha' }))
    expect(screen.queryByText(/Se moverán 41 registros/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fusionar' })).not.toBeInTheDocument()
  })
})

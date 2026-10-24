import { fireEvent, render, screen, within } from '@testing-library/react'

import { MisHijos } from '@/components/perfil/mis-hijos'
import { parseMisHijos } from '@/lib/platform/ninos/mis-hijos'
import type { MisPrechecks } from '@/lib/platform/ninos/precheck'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))

beforeEach(() => rpc.mockReset())

const base = {
  apellido: 'Pérez', fecha_nacimiento: '2021-05-05', genero: 'Masculino', edad: 5, tiene_ficha: true, grado: null,
  alergias: null, necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
  autoriza_imagen: null, escolarizado: null, autorizados: [], otros_padres: [], puede_editar_identidad: true,
}
const hijos = parseMisHijos([
  { ...base, id: 'h1', nombre: 'Luis' },
  { ...base, id: 'h2', nombre: 'Eva' },
  { ...base, id: 'h3', nombre: 'Sin', tiene_ficha: false },
])

const servicio = { turnoId: 't1', nombre: 'Primer servicio', hora: '09:00:00', campus: 'Centro' }
const enVentana: MisPrechecks = { servicios: [servicio], avisos: [] }

describe('Voy en camino (Mis hijos)', () => {
  it('is hidden when no service is in its window', () => {
    render(<MisHijos hijos={hijos} prechecks={{ servicios: [], avisos: [] }} />)
    expect(screen.queryByRole('button', { name: 'Voy en camino' })).not.toBeInTheDocument()
  })

  it('notifies the table with every child preselected and shows the notice with cancel', async () => {
    rpc.mockResolvedValueOnce({ data: { avisados: ['h1', 'h2'] }, error: null })
    render(<MisHijos hijos={hijos} prechecks={enVentana} />)
    fireEvent.click(screen.getByRole('button', { name: 'Voy en camino' }))

    const panel = screen.getByRole('region', { name: 'Voy en camino' })
    expect(within(panel).getByText(/Primer servicio · 9:00/)).toBeInTheDocument()
    expect(within(panel).getByRole('checkbox', { name: 'Luis Pérez' })).toBeChecked()
    expect(within(panel).getByRole('checkbox', { name: 'Eva Pérez' })).toBeChecked()
    // A child without a Niños ficha cannot be notified.
    expect(within(panel).queryByRole('checkbox', { name: 'Sin Pérez' })).not.toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Eva Pérez' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Avisar a la mesa' }))

    expect(await screen.findByText('Avisado a la mesa')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_precheck_avisar', { p_turno_id: 't1', p_nino_ids: ['h1'] })
    expect(screen.getByRole('status', { name: 'Aviso a la mesa' })).toHaveTextContent('Luis')
    expect(screen.getByRole('status', { name: 'Aviso a la mesa' })).not.toHaveTextContent('Eva')
    expect(screen.getByRole('button', { name: 'Cancelar aviso' })).toBeInTheDocument()
  })

  it('needs at least one child', () => {
    render(<MisHijos hijos={hijos} prechecks={enVentana} />)
    fireEvent.click(screen.getByRole('button', { name: 'Voy en camino' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Luis Pérez' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Eva Pérez' }))
    expect(screen.getByRole('button', { name: 'Avisar a la mesa' })).toBeDisabled()
  })

  it('shows a pending notice from the server and cancels it', async () => {
    rpc.mockResolvedValueOnce({ data: { cancelados: 1 }, error: null })
    render(
      <MisHijos hijos={hijos} prechecks={{ servicios: [servicio], avisos: [{ ninoId: 'h2', turnoId: 't1', estado: 'pendiente' }] }} />,
    )
    expect(screen.getByRole('status', { name: 'Aviso a la mesa' })).toHaveTextContent('Eva')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar aviso' }))

    expect(await screen.findByRole('button', { name: 'Voy en camino' })).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_precheck_cancelar', { p_turno_id: 't1' })
    expect(screen.queryByText('Avisado a la mesa')).not.toBeInTheDocument()
  })

  it('shows the Spanish error and keeps the choice open', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'fuera_de_horario' } })
    render(<MisHijos hijos={hijos} prechecks={enVentana} />)
    fireEvent.click(screen.getByRole('button', { name: 'Voy en camino' }))
    fireEvent.click(screen.getByRole('button', { name: 'Avisar a la mesa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este servicio ya no recibe avisos.')
    expect(screen.getByRole('button', { name: 'Avisar a la mesa' })).toBeInTheDocument()
  })

  it('lets the parent pick the service when more than one is open, and skips children already checked in', () => {
    render(
      <MisHijos
        hijos={hijos}
        prechecks={{
          servicios: [servicio, { turnoId: 't2', nombre: 'Segundo servicio', hora: '11:00:00', campus: 'Centro' }],
          avisos: [{ ninoId: 'h1', turnoId: 't2', estado: 'ingresado' }],
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Voy en camino' }))
    expect(screen.getByRole('radio', { name: /Primer servicio/ })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /Segundo servicio/ }))
    expect(screen.queryByRole('checkbox', { name: 'Luis Pérez' })).not.toBeInTheDocument()
    expect(screen.getByText('Luis ya ingresó.')).toBeInTheDocument()
  })
})

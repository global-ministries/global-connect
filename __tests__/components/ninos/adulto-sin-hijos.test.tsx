import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { FamiliasClient } from '@/components/ninos/familias-client'
import { VincularHijoForm } from '@/components/ninos/vincular-hijo-form'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }))
jest.mock('@/components/ninos/preregistros-pendientes', () => ({ PreregistrosPendientes: () => null }))

beforeEach(() => rpc.mockReset())

const adulto = {
  id: 'a1', nombre: 'Adela', apellido: 'Ruiz', telefono: '•••0951', cedula: '•••0951', hijos: [],
  padres: [{ id: 'a1', nombre: 'Adela', apellido: 'Ruiz', telefono: '•••0951' }], sin_hijos: true,
}

async function buscarAdulto() {
  rpc.mockResolvedValueOnce({ data: [adulto], error: null })
  render(<FamiliasClient salones={[]} fechaServicio="2026-10-11" />)
  fireEvent.change(screen.getByLabelText('Buscar familia'), { target: { value: 'V-99990951' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  return screen.findByTestId('adulto-sin-hijos')
}

describe('Familias: an adult without children (N11)', () => {
  it('shows the masked card instead of "No se encontraron familias"', async () => {
    const tarjeta = await buscarAdulto()
    expect(within(tarjeta).getByText('Adela Ruiz')).toBeInTheDocument()
    expect(within(tarjeta).getByText(/•••0951/)).toBeInTheDocument()
    expect(within(tarjeta).getByText('Aún no tiene niños registrados')).toBeInTheDocument()
    expect(screen.queryByText('No se encontraron familias.')).not.toBeInTheDocument()
  })

  it('"Agregar niño" opens the add-child form with the person preselected', async () => {
    const tarjeta = await buscarAdulto()
    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Agregar niño' }))
    expect(screen.getByText('Adela Ruiz')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del representante')).not.toBeInTheDocument()
  })

  it('"Vincular hijo existente" opens the link panel', async () => {
    const tarjeta = await buscarAdulto()
    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Vincular hijo existente' }))
    expect(await screen.findByLabelText('Nombre o cédula del niño')).toBeInTheDocument()
  })
})

describe('VincularHijoForm', () => {
  it('finds a child (with or without family) and links it to the adult with ninos_vincular_padre', async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ id: 'h1', nombre: 'Cami', apellido: 'Ruiz', edad_anos: 8, cedula: '•••5504' }], error: null })
      .mockResolvedValueOnce({ data: { vinculados: 1 }, error: null })
    const onVinculado = jest.fn()
    render(<VincularHijoForm adulto={{ id: 'a1', nombre: 'Adela Ruiz' }} onVinculado={onVinculado} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Nombre o cédula del niño'), { target: { value: 'Cami Ruiz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar niño' }))
    expect(await screen.findByText('8 años · C.I. •••5504')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_buscar_hijos_vincular', { p_q: 'Cami Ruiz', p_padre_id: 'a1' })
    fireEvent.click(screen.getByRole('button', { name: 'Vincular a Cami Ruiz' }))
    await waitFor(() => expect(onVinculado).toHaveBeenCalled())
    expect(rpc).toHaveBeenLastCalledWith('ninos_vincular_padre', { p_nino_ids: ['h1'], p_padre_id: 'a1', p_padre_nuevo: null })
  })

  it('asks for at least three letters before searching', () => {
    render(<VincularHijoForm adulto={{ id: 'a1', nombre: 'Adela Ruiz' }} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Nombre o cédula del niño'), { target: { value: 'Ca' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar niño' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe al menos 3 letras del nombre o del apellido, o la cédula.')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('says so when no child is found', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    render(<VincularHijoForm adulto={{ id: 'a1', nombre: 'Adela Ruiz' }} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Nombre o cédula del niño'), { target: { value: 'Nadie' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar niño' }))
    expect(await screen.findByText('No se encontraron niños.')).toBeInTheDocument()
  })

  describe('fast search (N14)', () => {
    afterEach(() => jest.useRealTimers())

    it('searches a single first name as you type, after a short pause', async () => {
      jest.useFakeTimers()
      rpc.mockResolvedValue({ data: [{ id: 'h1', nombre: 'Camila', apellido: 'Ruiz', edad_anos: 8, cedula: null }], error: null })
      render(<VincularHijoForm adulto={{ id: 'a1', nombre: 'Adela Ruiz' }} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
      const input = screen.getByLabelText('Nombre o cédula del niño')
      fireEvent.change(input, { target: { value: 'ca' } })
      fireEvent.change(input, { target: { value: 'cam' } })
      fireEvent.change(input, { target: { value: 'camila' } })
      expect(rpc).not.toHaveBeenCalled()
      await act(async () => {
        jest.advanceTimersByTime(300)
      })
      expect(rpc).toHaveBeenCalledTimes(1)
      expect(rpc).toHaveBeenCalledWith('ninos_buscar_hijos_vincular', { p_q: 'camila', p_padre_id: 'a1' })
      expect(screen.getByText('Camila Ruiz')).toBeInTheDocument()
    })

    it('does not search as you type with fewer than three letters', async () => {
      jest.useFakeTimers()
      render(<VincularHijoForm adulto={{ id: 'a1', nombre: 'Adela Ruiz' }} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
      fireEvent.change(screen.getByLabelText('Nombre o cédula del niño'), { target: { value: 'ca' } })
      await act(async () => {
        jest.advanceTimersByTime(1000)
      })
      expect(rpc).not.toHaveBeenCalled()
    })

    it('Enter searches at once and cancels the pending typed search', async () => {
      jest.useFakeTimers()
      rpc.mockResolvedValue({ data: [], error: null })
      render(<VincularHijoForm adulto={{ id: 'a1', nombre: 'Adela Ruiz' }} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
      fireEvent.change(screen.getByLabelText('Nombre o cédula del niño'), { target: { value: 'camila' } })
      fireEvent.click(screen.getByRole('button', { name: 'Buscar niño' }))
      await act(async () => {
        jest.advanceTimersByTime(1000)
      })
      expect(rpc).toHaveBeenCalledTimes(1)
    })
  })

  describe('Revisar edad (N13)', () => {
    async function abrirRevisar(resultado: unknown[]) {
      rpc.mockResolvedValueOnce({ data: resultado, error: null })
      render(<VincularHijoForm adulto={{ id: 'a1', nombre: 'Adela Ruiz' }} onVinculado={onVinculado} onCancelar={jest.fn()} />)
      fireEvent.click(screen.getByRole('tab', { name: 'Revisar edad' }))
      fireEvent.change(screen.getByLabelText('Nombre o cédula del niño'), { target: { value: 'Teo Ruiz' } })
      fireEvent.click(screen.getByRole('button', { name: 'Buscar niño' }))
      await screen.findByText('Teo Ruiz')
    }
    const onVinculado = jest.fn()
    beforeEach(() => onVinculado.mockReset())

    it('searches people 13+ or without birth date with ninos_buscar_hijos_revisar_edad', async () => {
      await abrirRevisar([
        { id: 't1', nombre: 'Teo', apellido: 'Ruiz', edad_anos: 30, cedula: '•••5705' },
        { id: 'u1', nombre: 'Uma', apellido: 'Ruiz', edad_anos: null, cedula: null },
      ])
      expect(rpc).toHaveBeenCalledWith('ninos_buscar_hijos_revisar_edad', { p_q: 'Teo Ruiz', p_padre_id: 'a1' })
      expect(screen.getByText('30 años · C.I. •••5705')).toBeInTheDocument()
      expect(screen.getByText('Sin fecha de nacimiento')).toBeInTheDocument()
    })

    it('shows the current birth date (dd/mm/aaaa) so the host sees why it must be corrected (N15)', async () => {
      await abrirRevisar([
        { id: 't1', nombre: 'Teo', apellido: 'Ruiz', edad_anos: 13, cedula: '•••4332', fecha_nacimiento: '2013-03-08' },
        { id: 'u1', nombre: 'Uma', apellido: 'Ruiz', edad_anos: null, cedula: null, fecha_nacimiento: null },
      ])
      expect(screen.getByText('13 años · Nac. 08/03/2013 · C.I. •••4332')).toBeInTheDocument()
      expect(screen.getByText('Sin fecha de nacimiento')).toBeInTheDocument()
    })

    it('prefills the correction with the current birth date, or leaves it empty when unknown (N15)', async () => {
      await abrirRevisar([
        { id: 't1', nombre: 'Teo', apellido: 'Ruiz', edad_anos: 13, cedula: null, fecha_nacimiento: '2013-03-08' },
        { id: 'u1', nombre: 'Uma', apellido: 'Ruiz', edad_anos: null, cedula: null, fecha_nacimiento: null },
      ])
      fireEvent.click(screen.getByRole('button', { name: 'Corregir edad de Teo Ruiz' }))
      expect(screen.getByLabelText('Fecha de nacimiento corregida de Teo Ruiz')).toHaveValue('2013-03-08')
      fireEvent.click(screen.getByRole('button', { name: 'Corregir edad de Uma Ruiz' }))
      expect(screen.getByLabelText('Fecha de nacimiento corregida de Uma Ruiz')).toHaveValue('')
      expect(screen.getByRole('button', { name: 'Guardar fecha y vincular a Uma Ruiz' })).toBeDisabled()
    })

    it('does not show the birth date in "Menores de 13" (N15)', async () => {
      rpc.mockResolvedValueOnce({
        data: [{ id: 'h1', nombre: 'Teo', apellido: 'Ruiz', edad_anos: 8, cedula: null, fecha_nacimiento: '2018-03-08' }],
        error: null,
      })
      render(<VincularHijoForm adulto={{ id: 'a1', nombre: 'Adela Ruiz' }} onVinculado={onVinculado} onCancelar={jest.fn()} />)
      fireEvent.change(screen.getByLabelText('Nombre o cédula del niño'), { target: { value: 'Teo Ruiz' } })
      fireEvent.click(screen.getByRole('button', { name: 'Buscar niño' }))
      expect(await screen.findByText('8 años')).toBeInTheDocument()
      expect(screen.queryByText(/Nac\./)).not.toBeInTheDocument()
    })

    it('blocks a corrected birth date that is still 13 or older', async () => {
      await abrirRevisar([{ id: 't1', nombre: 'Teo', apellido: 'Ruiz', edad_anos: 30, cedula: null }])
      fireEvent.click(screen.getByRole('button', { name: 'Corregir edad de Teo Ruiz' }))
      fireEvent.change(screen.getByLabelText('Fecha de nacimiento corregida de Teo Ruiz'), { target: { value: '2000-01-01' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar fecha y vincular a Teo Ruiz' }))
      expect(screen.getByRole('alert')).toHaveTextContent('Con esa fecha tendría 13 años o más')
      expect(rpc).toHaveBeenCalledTimes(1)
    })

    it('saves the corrected date and links with ninos_vincular_revisando_edad', async () => {
      await abrirRevisar([{ id: 't1', nombre: 'Teo', apellido: 'Ruiz', edad_anos: 30, cedula: null }])
      rpc.mockResolvedValueOnce({ data: { vinculados: 1 }, error: null })
      const fecha = `${new Date().getFullYear() - 6}-01-15`
      fireEvent.click(screen.getByRole('button', { name: 'Corregir edad de Teo Ruiz' }))
      fireEvent.change(screen.getByLabelText('Fecha de nacimiento corregida de Teo Ruiz'), { target: { value: fecha } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar fecha y vincular a Teo Ruiz' }))
      await waitFor(() => expect(onVinculado).toHaveBeenCalled())
      expect(rpc).toHaveBeenLastCalledWith('ninos_vincular_revisando_edad', {
        p_nino_id: 't1', p_fecha_nacimiento: fecha, p_padre_id: 'a1', p_padre_nuevo: null,
      })
    })

    it('shows the server refusal for an out-of-range date', async () => {
      await abrirRevisar([{ id: 't1', nombre: 'Teo', apellido: 'Ruiz', edad_anos: 30, cedula: null }])
      rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'edad_fuera_de_rango' } })
      fireEvent.click(screen.getByRole('button', { name: 'Corregir edad de Teo Ruiz' }))
      fireEvent.change(screen.getByLabelText('Fecha de nacimiento corregida de Teo Ruiz'), {
        target: { value: `${new Date().getFullYear() - 6}-01-15` },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar fecha y vincular a Teo Ruiz' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Con esa fecha tendría 13 años o más')
      expect(onVinculado).not.toHaveBeenCalled()
    })
  })
})

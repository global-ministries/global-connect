import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'

import { CamposAutorizados, CamposNino } from '@/components/ninos/campos-nino'
import { hijoVacio, type AutorizadoForm, type HijoForm } from '@/lib/platform/ninos/familia'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'

jest.mock('@/lib/platform/ninos/fecha', () => ({
  ...jest.requireActual('@/lib/platform/ninos/fecha'),
  hoyEnCaracas: () => '2026-10-10',
}))

// A Waumba room the staff form would preselect for a baby; the parent form must never use it.
const SALONES: SalonNivel[] = [
  {
    id: 'mat', nombre: 'Maternal', area: 'waumba', edadMinMeses: 0, edadMaxMeses: 23, gradoMin: null, gradoMax: null,
    esNecesidadesEspeciales: false, activo: true, orden: 10,
  },
]

const cambios = jest.fn<void, [HijoForm]>()
beforeEach(() => cambios.mockReset())
const ultimo = () => cambios.mock.lastCall?.[0]

const conDatos: HijoForm = { ...hijoVacio(), nombre: 'Luis', apellido: 'Pérez', fechaNacimiento: '2021-05-05', genero: 'Masculino' }

function Campos({ inicial = conDatos, identidadEditable }: { inicial?: HijoForm; identidadEditable?: boolean }) {
  const [h, setH] = useState(inicial)
  const onChange = (x: HijoForm) => {
    cambios(x)
    setH(x)
  }
  return <CamposNino indice={0} hijo={h} onChange={onChange} salones={SALONES} modo="padre" identidadEditable={identidadEditable} />
}

describe('CamposNino — parent mode', () => {
  it('offers the school grade instead of the level (no rooms)', () => {
    render(<Campos />)
    expect(screen.queryByLabelText('Nivel')).not.toBeInTheDocument()
    const grado = screen.getByLabelText('Grado escolar del niño 1')
    expect(within(grado).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Sin indicar',
      'Preescolar (PreK)',
      '1º grado',
      '2º grado',
      '3º grado',
      '4º grado',
      '5º grado',
      '6º grado',
    ])
  })

  it('a grade never touches the room', () => {
    render(<Campos inicial={{ ...conDatos, salonPreferidoId: 'sala-1' }} />)
    fireEvent.change(screen.getByLabelText('Grado escolar del niño 1'), { target: { value: '2' } })
    expect(ultimo()).toMatchObject({ grado: '2', salonPreferidoId: 'sala-1' })
  })

  it('a new birth date does not preselect a room', () => {
    render(<Campos inicial={{ ...conDatos, fechaNacimiento: '' }} />)
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2025-10-01' } })
    expect(ultimo()).toMatchObject({ fechaNacimiento: '2025-10-01', grado: '', salonPreferidoId: '' })
    expect(screen.queryByText(/Sin salón sugerido/)).not.toBeInTheDocument()
  })

  it('shows the identity fields when they are editable', () => {
    render(<Campos />)
    expect(screen.getByLabelText('Nombre del niño 1')).toHaveValue('Luis')
    expect(screen.getByLabelText('Género del niño 1')).toHaveValue('Masculino')
  })

  it('hides the identity fields of a child with an own account', () => {
    render(<Campos identidadEditable={false} />)
    expect(screen.queryByLabelText('Nombre del niño 1')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Apellido del niño 1')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Fecha de nacimiento del niño 1')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Género del niño 1')).not.toBeInTheDocument()
    expect(screen.getByText(/Luis tiene su propia cuenta/)).toBeInTheDocument()
    expect(screen.getByLabelText('Alergias')).toBeInTheDocument()
  })

  it('limits the texts to 500 characters', () => {
    render(<Campos />)
    expect(screen.getByLabelText('Alergias')).toHaveAttribute('maxLength', '500')
    expect(screen.getByLabelText('Notas')).toHaveAttribute('maxLength', '500')
  })
})

describe('CamposAutorizados — maximum', () => {
  function Autorizados({ inicial }: { inicial: AutorizadoForm[] }) {
    const [a, setA] = useState(inicial)
    return <CamposAutorizados autorizados={a} onChange={setA} maximo={2} />
  }

  it('stops offering more people at the maximum', () => {
    render(<Autorizados inicial={[{ nombre: 'Abuela', telefono: '', relacion: '' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar persona autorizada' }))
    expect(screen.getByLabelText('Nombre del autorizado 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar persona autorizada' })).not.toBeInTheDocument()
    expect(screen.getByText('Máximo 2 personas.')).toBeInTheDocument()
  })
})

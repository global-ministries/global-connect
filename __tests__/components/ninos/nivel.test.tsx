import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'

import { CamposNino } from '@/components/ninos/campos-nino'
import { hijoVacio, type HijoForm } from '@/lib/platform/ninos/familia'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'

jest.mock('@/lib/platform/ninos/fecha', () => ({
  ...jest.requireActual('@/lib/platform/ninos/fecha'),
  hoyEnCaracas: () => '2026-10-08',
}))

const base = { edadMinMeses: null, edadMaxMeses: null, gradoMin: null, gradoMax: null, esNecesidadesEspeciales: false, activo: true }
const SALONES: SalonNivel[] = [
  { ...base, id: 'mat', nombre: 'Maternal', area: 'waumba', edadMinMeses: 0, edadMaxMeses: 23, orden: 10 },
  { ...base, id: 'pre1', nombre: 'Preescolar I', area: 'waumba', edadMinMeses: 24, edadMaxMeses: 35, orden: 20 },
  { ...base, id: 'plus', nombre: 'Waumba Land Plus', area: 'waumba', esNecesidadesEspeciales: true, orden: 50 },
  { ...base, id: 'g1', nombre: '1º grado', area: 'upstreet', gradoMin: 1, gradoMax: 1, orden: 110 },
]

const cambios = jest.fn<void, [HijoForm]>()
beforeEach(() => cambios.mockReset())
const ultimo = () => cambios.mock.lastCall?.[0]

function Campos({ inicial = hijoVacio(), publico }: { inicial?: HijoForm; publico?: boolean }) {
  const [h, setH] = useState(inicial)
  const onChange = (x: HijoForm) => {
    cambios(x)
    setH(x)
  }
  return <CamposNino indice={0} hijo={h} onChange={onChange} salones={SALONES} publico={publico} />
}

describe('CamposNino — Nivel', () => {
  it('groups the levels by area with "Sin indicar" first', () => {
    render(<Campos />)
    const select = screen.getByLabelText('Nivel')
    expect(within(select).getAllByRole('option')[0]).toHaveTextContent('Sin indicar')
    expect(within(select).getByRole('group', { name: 'Waumba Land' })).toHaveTextContent('MaternalPreescolar IWaumba Land Plus')
    expect(within(select).getByRole('group', { name: 'UpStreet' })).toHaveTextContent('PreK1º grado')
  })

  it('a Waumba option stores the room and an UpStreet option the grade', () => {
    render(<Campos />)
    fireEvent.change(screen.getByLabelText('Nivel'), { target: { value: 'salon:pre1' } })
    expect(ultimo()).toMatchObject({ salonPreferidoId: 'pre1', grado: '' })
    fireEvent.change(screen.getByLabelText('Nivel'), { target: { value: 'grado:3' } })
    expect(ultimo()).toMatchObject({ salonPreferidoId: '', grado: '3' })
  })

  it('shows the stored level when editing', () => {
    render(<Campos inicial={{ ...hijoVacio(), fechaNacimiento: '2024-01-01', necesidadesEspeciales: 'TEA', salonPreferidoId: 'plus' }} />)
    expect(screen.getByLabelText('Nivel')).toHaveValue('salon:plus')
  })

  // S9.5 (L34): the ficha only offers the salones that correspond to the child today.
  it('offers only the Waumba rooms of the child\'s age and needs; the grades stay', () => {
    render(<Campos inicial={{ ...hijoVacio(), fechaNacimiento: '2025-10-01' }} />)
    const select = screen.getByLabelText('Nivel')
    expect(within(select).getByRole('group', { name: 'Waumba Land' })).toHaveTextContent(/^Maternal$/)
    expect(within(select).getByRole('group', { name: 'UpStreet' })).toHaveTextContent('PreK1º grado')
  })

  it('a hand-picked room that no longer fits the new birth date gives way to the suggestion', () => {
    render(<Campos inicial={{ ...hijoVacio(), fechaNacimiento: '2025-10-01', salonPreferidoId: 'mat' }} />)
    expect(screen.getByLabelText('Nivel')).toHaveValue('salon:mat')
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2024-06-01' } })
    expect(screen.getByLabelText('Nivel')).toHaveValue('salon:pre1')
    expect(ultimo()).toMatchObject({ salonPreferidoId: 'pre1', grado: '' })
  })

  it('a hand-picked room that still fits is kept when the birth date changes', () => {
    render(<Campos inicial={{ ...hijoVacio(), fechaNacimiento: '2024-06-01', necesidadesEspeciales: 'TEA', salonPreferidoId: 'plus' }} />)
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2024-05-01' } })
    expect(screen.getByLabelText('Nivel')).toHaveValue('salon:plus')
    expect(ultimo()).toMatchObject({ salonPreferidoId: 'plus', fechaNacimiento: '2024-05-01' })
  })

  it('preselects the suggested level when the birth date is entered', () => {
    render(<Campos />)
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2025-10-01' } })
    expect(screen.getByLabelText('Nivel')).toHaveValue('salon:mat')
    expect(ultimo()).toMatchObject({ salonPreferidoId: 'mat', grado: '' })
  })

  it('does not override a level already chosen', () => {
    render(<Campos inicial={{ ...hijoVacio(), grado: '2' }} />)
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2025-10-01' } })
    expect(screen.getByLabelText('Nivel')).toHaveValue('grado:2')
  })

  it('keeps "Sin indicar" and asks for a manual assignment when no room fits (D4)', () => {
    render(<Campos />)
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2018-01-01' } })
    expect(screen.getByLabelText('Nivel')).toHaveValue('')
    expect(screen.getByText('Sin salón sugerido para esta edad: elige el nivel o asígnalo manualmente.')).toBeInTheDocument()
  })

  it('the public form labels the level as optional', () => {
    render(<Campos publico />)
    expect(screen.getByLabelText('Nivel (si lo sabes)')).toBeInTheDocument()
  })
})

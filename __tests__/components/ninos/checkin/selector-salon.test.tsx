/**
 * Desk «Cambiar salón» (odd/tasks/ninos-checkin-pco.md, T2f, S9.5, L34): the
 * panel only lists the salones that correspond to the child (age, grade,
 * special needs), marking closed and full ones; a child without age and
 * grade cannot be checked against the rules and sees every active salón.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { SelectorSalon } from '@/components/ninos/checkin/selector-salon'
import type { OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'

const waumba = { area: 'waumba' as const, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true }
const salones: SalonFila[] = [
  { ...waumba, id: 'mat', nombre: 'Maternal', edad_min_meses: 0, edad_max_meses: 23, orden: 10, capacidad: 12, abierto: true },
  { ...waumba, id: 'matb', nombre: 'Maternal B', edad_min_meses: 0, edad_max_meses: 23, orden: 11, capacidad: 12, abierto: false },
  { ...waumba, id: 'pre', nombre: 'Preescolar II', edad_min_meses: 36, edad_max_meses: 47, orden: 30, capacidad: 12, abierto: true },
  { ...waumba, id: 'viejo', nombre: 'Salón viejo', edad_min_meses: 0, edad_max_meses: 23, orden: 5, activo: false },
  { ...waumba, area: 'upstreet', id: 'g1', nombre: 'UpStreet 1º', edad_min_meses: null, edad_max_meses: null, grado_min: 1, grado_max: 1, orden: 110 },
]

function hijo(h: Partial<HijoEncontrado> = {}): HijoEncontrado {
  return {
    id: 'h1', nombre: 'Luis', apellido: 'Pérez', fecha_nacimiento: '2025-06-01', genero: 'Masculino', grado: null, alergias: null,
    necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null, autoriza_imagen: null,
    escolarizado: null, salon_preferido_id: null, es_vip_desde: null, tiene_ficha: true, autorizados: [], ...h,
  }
}

const ocupacion = new Map<string, OcupacionSalon>([
  ['mat', { salon_id: 'mat', nombre: 'Maternal', presentes: 12, capacidad: 12 }],
  ['pre', { salon_id: 'pre', nombre: 'Preescolar II', presentes: 3, capacidad: 12 }],
])

function pintar(h: HijoEncontrado, onElegir = jest.fn()) {
  render(<SelectorSalon hijo={h} fecha="2026-11-08" salones={salones} ocupacion={ocupacion} actualId="mat" sugeridoId="mat" onElegir={onElegir} />)
  const lista = screen.getByRole('list', { name: `Salones para ${h.nombre}` })
  return { lista, nombres: within(lista).getAllByRole('button').map((b) => b.querySelector('b')?.textContent) }
}

describe('SelectorSalon (S9.5)', () => {
  it('lists only the salones of the child\'s age, marking full and closed ones; never one of another age', () => {
    const onElegir = jest.fn()
    const { lista, nombres } = pintar(hijo(), onElegir)
    expect(nombres).toEqual(['Maternal', 'Maternal B'])
    expect(within(lista).getByRole('button', { name: /^Maternal 0/ })).toHaveTextContent('Lleno 12/12')
    expect(within(lista).getByRole('button', { name: /Maternal B/ })).toHaveTextContent('cerrado')
    expect(screen.queryByText('Sin edad ni grado: elige el salón a mano.')).not.toBeInTheDocument()
    // Full and closed still warn, never block.
    fireEvent.click(within(lista).getByRole('button', { name: /Maternal B/ }))
    expect(onElegir).toHaveBeenCalledWith('matb')
  })

  it('by grade: only the salones of that grade', () => {
    expect(pintar(hijo({ fecha_nacimiento: '2019-06-01', grado: 1 })).nombres).toEqual(['UpStreet 1º'])
  })

  it('without birth date and grade: every active salón and a short note', () => {
    const { nombres } = pintar(hijo({ fecha_nacimiento: null, grado: null }))
    expect(nombres).toEqual(['Maternal', 'Maternal B', 'Preescolar II', 'UpStreet 1º'])
    expect(screen.getByText('Sin edad ni grado: elige el salón a mano.')).toBeInTheDocument()
  })
})

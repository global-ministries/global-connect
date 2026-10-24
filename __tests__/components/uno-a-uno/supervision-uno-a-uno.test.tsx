/**
 * @jest-environment jsdom
 *
 * T7 (odd/tasks/uno-a-uno.md) — the "Supervisión" view: the leaders of the
 * chain (S7.4) and the recent 1:1s (S7.2), read-only and never with the
 * private note.
 */

import { render, screen, within } from '@testing-library/react'

import { SupervisionUnoAUno } from '@/components/uno-a-uno/supervision-uno-a-uno'
import type { LiderSupervisado, UnoAUnoSupervisado } from '@/lib/uno-a-uno/vista'

const ana = { id: 'l-1', nombre: 'Ana', apellido: 'Pérez' }
const luis = { id: 'd-1', nombre: 'Luis', apellido: 'Gómez' }
const maria = { id: 'd-2', nombre: 'María', apellido: 'Gómez' }

function lider(over: Partial<LiderSupervisado>): LiderSupervisado {
  return {
    usuarioId: 'l-1',
    nombre: 'Ana',
    apellido: 'Pérez',
    contextos: ['GDV: Norte'],
    dirigidos: 3,
    realizados: 2,
    agendados: 1,
    ultimoRealizado: '2026-10-20T19:30:00Z',
    ...over,
  }
}

function supervisado(over: Partial<UnoAUnoSupervisado>): UnoAUnoSupervisado {
  return {
    id: 's-1',
    estado: 'realizado',
    fechaHora: '2026-10-20T19:30:00Z',
    lugar: null,
    lideres: [ana],
    dirigidos: [luis, maria],
    resumen: null,
    celebracion: null,
    motivoCancelacion: null,
    ...over,
  }
}

describe('SupervisionUnoAUno — Líderes (S7.4)', () => {
  it('lists each leader with what they lead and their numbers', () => {
    render(<SupervisionUnoAUno lideres={[lider({ contextos: ['GDV: Norte', 'Dream Team: Sonido'] })]} recientes={[]} />)
    const fila = within(screen.getByRole('listitem', { name: 'Ana Pérez' }))
    expect(fila.getByText('GDV: Norte, Dream Team: Sonido')).toBeInTheDocument()
    expect(fila.getByText('Dirigidos').nextSibling).toHaveTextContent('3')
    expect(fila.getByText('Realizados (30 días)').nextSibling).toHaveTextContent('2')
    expect(fila.getByText('Agendados').nextSibling).toHaveTextContent('1')
    expect(fila.getByText('Último 1 a 1').nextSibling).toHaveTextContent('martes 20 de octubre de 2026, 15:30')
    expect(fila.queryByText('Sin 1 a 1 en 30 días')).not.toBeInTheDocument()
  })

  it('flags a leader without 1:1s in 30 days and says "Nunca" when there was none', () => {
    render(<SupervisionUnoAUno lideres={[lider({ realizados: 0, ultimoRealizado: null })]} recientes={[]} />)
    const fila = within(screen.getByRole('listitem', { name: 'Ana Pérez' }))
    expect(fila.getByText('Sin 1 a 1 en 30 días')).toBeInTheDocument()
    expect(fila.getByText('Último 1 a 1').nextSibling).toHaveTextContent('Nunca')
  })

  it('keeps the database order (longest without a 1:1 first)', () => {
    render(
      <SupervisionUnoAUno
        lideres={[
          lider({ usuarioId: 'l-2', nombre: 'Pedro', apellido: 'Ruiz', realizados: 0, ultimoRealizado: null }),
          lider({ usuarioId: 'l-1' }),
        ]}
        recientes={[]}
      />,
    )
    const lista = within(screen.getByRole('list', { name: 'Líderes' }))
    expect(lista.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Pedro Ruiz', 'Ana Pérez'])
  })

  it('says so when the chain has no leaders', () => {
    render(<SupervisionUnoAUno lideres={[]} recientes={[]} />)
    expect(screen.getByText('No hay líderes en tu cadena de supervisión.')).toBeInTheDocument()
  })
})

describe('SupervisionUnoAUno — 1 a 1 recientes (S7.2)', () => {
  it('shows who with whom, date, estado, place, resumen and celebración', () => {
    render(
      <SupervisionUnoAUno
        lideres={[]}
        recientes={[supervisado({ lugar: 'Café Centro', resumen: 'Hablamos de su familia.', celebracion: 'Se bautizó' })]}
      />,
    )
    const recientes = within(screen.getByRole('region', { name: '1 a 1 recientes' }))
    expect(recientes.getByText('Ana Pérez → Luis Gómez y María Gómez')).toBeInTheDocument()
    expect(recientes.getByText('martes 20 de octubre de 2026, 15:30')).toBeInTheDocument()
    expect(recientes.getByText('Realizado')).toBeInTheDocument()
    expect(recientes.getByText('Café Centro')).toBeInTheDocument()
    expect(recientes.getByText('Hablamos de su familia.')).toBeInTheDocument()
    expect(recientes.getByText('Se bautizó')).toBeInTheDocument()
  })

  it('shows the motivo of a cancelled 1:1 and the estado of a scheduled one', () => {
    render(
      <SupervisionUnoAUno
        lideres={[]}
        recientes={[
          supervisado({ id: 's-1', estado: 'cancelado', motivoCancelacion: 'Viaje' }),
          supervisado({ id: 's-2', estado: 'agendado' }),
        ]}
      />,
    )
    expect(screen.getByText('Cancelado')).toBeInTheDocument()
    expect(screen.getByText('Motivo: Viaje')).toBeInTheDocument()
    expect(screen.getByText('Agendado')).toBeInTheDocument()
  })

  it('is read-only and never shows a private note', () => {
    const conNota = { ...supervisado({ resumen: 'Bien' }), notaPrivada: 'Secreto pastoral' } as UnoAUnoSupervisado
    render(<SupervisionUnoAUno lideres={[lider({})]} recientes={[conNota]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('Secreto pastoral')).not.toBeInTheDocument()
    expect(screen.queryByText('Nota privada')).not.toBeInTheDocument()
  })

  it('says so when there are no recent 1:1s', () => {
    render(<SupervisionUnoAUno lideres={[]} recientes={[]} />)
    expect(screen.getByText('No hay 1 a 1 en los últimos 90 días.')).toBeInTheDocument()
  })
})

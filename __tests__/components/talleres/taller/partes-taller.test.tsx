/**
 * @jest-environment jsdom
 *
 * R3d (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the side column of the
 * v2 taller page: Pasos para abrir una edición, Equipo and Página pública.
 */

import { render, screen, within } from '@testing-library/react'

import {
  EquipoTaller,
  PaginaPublicaTaller,
  PasosAbrirEdicion,
  ordenarEquipo,
} from '@/components/talleres/taller/partes-taller'
import type { ServidorDelTaller } from '@/lib/platform/talleres/servidores-del-taller'
import type { PlantillaGrupo } from '@/lib/platform/talleres/plantilla'

const NEIDA: ServidorDelTaller = { personaId: 'p-1', nombre: 'Neida', apellido: 'Castillo', rolServicio: 'Coordinadora', equipoLabel: null }
const BELKIS: ServidorDelTaller = { personaId: 'p-2', nombre: 'Belkis', apellido: 'Arráez', rolServicio: 'Servidora', equipoLabel: null }
const ANA: ServidorDelTaller = { personaId: 'p-3', nombre: 'Ana', apellido: 'Gómez', rolServicio: null, equipoLabel: null }

const GRUPOS: PlantillaGrupo[] = [
  {
    id: 'g-1',
    nombre: 'Grupo A',
    orden: 1,
    capacidad: 10,
    activo: true,
    facilitadores: [{ id: 'f-1', personaId: 'p-2', rol: 'facilitador', nombre: 'Belkis', apellido: 'Arráez' }],
  },
  {
    id: 'g-2',
    nombre: 'Grupo viejo',
    orden: 2,
    capacidad: 10,
    activo: false,
    facilitadores: [{ id: 'f-2', personaId: 'p-3', rol: 'facilitador', nombre: 'Ana', apellido: 'Gómez' }],
  },
]

describe('PasosAbrirEdicion', () => {
  it('shows each step as Listo / Pendiente in words and links the last one to #ediciones', () => {
    render(
      <PasosAbrirEdicion
        pasos={[
          { etiqueta: 'Equipo del nodo', listo: true },
          { etiqueta: 'Plantilla de clases', listo: false },
        ]}
        textoFinal="Crear edición (primera clase)"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Pasos para abrir una edición' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Equipo del nodoListo')
    expect(items[1]).toHaveTextContent('Plantilla de clasesPendiente')
    expect(screen.getByRole('link', { name: 'Crear edición (primera clase)' })).toHaveAttribute('href', '#ediciones')
  })
})

describe('EquipoTaller', () => {
  it('lists the coordinación first, with rol and the active plantilla grupos each one facilitates', () => {
    render(<EquipoTaller servidores={[ANA, BELKIS, NEIDA]} sinAutoridad={false} grupos={GRUPOS} enlaceServidores={null} />)
    expect(screen.getByRole('heading', { name: 'Equipo' })).toBeInTheDocument()
    expect(screen.getByText('Servidores activos; se gestionan en Dream Team.')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    const nombres = ['Neida Castillo', 'Ana Gómez', 'Belkis Arráez']
    nombres.forEach((nombre, i) => expect(within(items[i]!).getByText(nombre)).toBeInTheDocument())
    expect(items[0]).toHaveTextContent('Coordinadora')
    expect(items[2]).toHaveTextContent('Servidora · Facilitador · Grupo A')
    // An inactive grupo does not count.
    expect(items[1]).toHaveTextContent('—')
    expect(screen.queryByRole('link', { name: 'Gestionar en Servidores' })).not.toBeInTheDocument()
  })

  it('links to Gestionar en Servidores when the page passes the link', () => {
    render(
      <EquipoTaller servidores={[NEIDA]} sinAutoridad={false} grupos={[]} enlaceServidores="/admin/dream-team/servidores?equipo=eq-1" />,
    )
    expect(screen.getByRole('link', { name: 'Gestionar en Servidores' })).toHaveAttribute(
      'href',
      '/admin/dream-team/servidores?equipo=eq-1',
    )
  })

  it('shows the empty state (neutral Spanish) when there are no active servidores', () => {
    render(<EquipoTaller servidores={[]} sinAutoridad={false} grupos={[]} enlaceServidores={null} />)
    expect(screen.getByText('Sin servidores activos en este equipo')).toBeInTheDocument()
    expect(screen.getByText(/para que aparezcan aquí\./)).toBeInTheDocument()
  })

  it('shows the access state, not the empty one, without authority over the equipo', () => {
    render(<EquipoTaller servidores={[]} sinAutoridad grupos={[]} enlaceServidores={null} />)
    expect(screen.getByText('No tienes autoridad para ver el equipo de este taller.')).toBeInTheDocument()
    expect(screen.queryByText('Sin servidores activos en este equipo')).not.toBeInTheDocument()
  })

  it('ordenarEquipo keeps names in alphabetical order after the coordinación', () => {
    expect(ordenarEquipo([BELKIS, ANA, NEIDA]).map((s) => s.personaId)).toEqual(['p-1', 'p-3', 'p-2'])
  })
})

describe('PaginaPublicaTaller', () => {
  it('a public taller: «Recibe solicitudes», its public path, Ver página and the read-only note', () => {
    render(<PaginaPublicaTaller slug="mujer-de-hoy" publico enlaceCompartir="/talleres/mujer-de-hoy/compartir" />)
    expect(screen.getByRole('heading', { name: 'Página pública' })).toBeInTheDocument()
    expect(screen.getByText('Recibe solicitudes')).toBeInTheDocument()
    expect(screen.getByText('/talleres/reservar/mujer-de-hoy')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver página' })).toHaveAttribute('href', '/talleres/reservar/mujer-de-hoy')
    expect(screen.getByRole('link', { name: 'Ver página' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Enlace, QR y código' })).toHaveAttribute('href', '/talleres/mujer-de-hoy/compartir')
    expect(screen.getByText(/Este dato no se cambia desde aquí\./)).toBeInTheDocument()
  })

  it('a non-public taller without Compartir: «No aparece» and no links', () => {
    render(<PaginaPublicaTaller slug="mujer-de-hoy" publico={false} enlaceCompartir={null} />)
    expect(screen.getByText('No aparece')).toBeInTheDocument()
    expect(screen.getByText(/no aparece en la página pública/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

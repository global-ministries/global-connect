/**
 * T2 (odd/tasks/talleres-consolidar-pantallas.md) — `<CatalogoTalleresClient>`,
 * the interactive body of the new `/talleres` catalog.
 *
 * The RSC page (page.test.tsx) proves the DATA/permission wiring (which
 * props get computed for which role); this test proves the RENDERING
 * given those props: section visibility, the "abiertas" filter, and the
 * full-page empty state. Uses real rendering (@testing-library/react) —
 * unlike the RSC gate tests, this is a plain client component so hooks
 * work normally.
 *
 * `CrearTallerAbstractoForm` is mocked: its own behavior (validation,
 * the createTallerAbstract RPC call, useNotificaciones) is already
 * covered by its own test suite — this file only needs to know WHETHER
 * it's rendered, not how it behaves.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CatalogoTalleresClient } from '@/components/talleres/catalogo-talleres-client'
import type { CatalogoTaller, MiGrupoResumen } from '@/lib/platform/talleres/catalogo'
import type { OpcionesEquipoTaller } from '@/lib/platform/talleres/equipo-organigrama'

jest.mock('@/components/talleres/crear-taller-form', () => ({
  CrearTallerAbstractoForm: () => <div data-testid="crear-taller-form" />,
}))

const OPCIONES_VACIAS: OpcionesEquipoTaller = { vincular: [], crearBajo: [] }

const TALLER_ABIERTO: CatalogoTaller = {
  id: 't-1',
  slug: 'matrimonio-sobre-la-roca',
  nombre: 'Matrimonio sobre la Roca',
  estado: 'active',
  dream_team_equipo_id: 'eq-1',
  ediciones: [
    { id: 'e-1', nombre_snapshot: 'Septiembre 2026', tipo: 'pareja', estado: 'abierto', total_inscripciones: 12 },
    { id: 'e-2', nombre_snapshot: 'Marzo 2026', tipo: 'pareja', estado: 'cerrado', total_inscripciones: 30 },
  ],
}

const TALLER_SOLO_CERRADO: CatalogoTaller = {
  id: 't-2',
  slug: 'discipulado',
  nombre: 'Discipulado',
  estado: 'active',
  dream_team_equipo_id: 'eq-2',
  ediciones: [
    { id: 'e-3', nombre_snapshot: 'Enero 2026', tipo: 'individual', estado: 'cerrado', total_inscripciones: 8 },
  ],
}

const MI_GRUPO: MiGrupoResumen = {
  id: 'g-1',
  nombre: 'Grupo A',
  estado: 'activo',
  tallerNombre: 'Matrimonio sobre la Roca',
  edicionNombre: 'Septiembre 2026',
  proximaClase: '2026-10-01',
}

describe('CatalogoTalleresClient — Mis grupos section', () => {
  it('shows "Mis grupos" with the taller/edición name and próxima clase when the viewer leads a grupo', () => {
    render(
      <CatalogoTalleresClient
        catalogo={[]}
        misGrupos={[MI_GRUPO]}
        puedeCrear={false}
        opciones={OPCIONES_VACIAS}
      />,
    )
    expect(screen.getByText('Mis grupos')).toBeInTheDocument()
    expect(screen.getByText('Grupo A')).toBeInTheDocument()
    expect(screen.getByText(/Matrimonio sobre la Roca/)).toBeInTheDocument()
  })

  it('omits the "Mis grupos" section entirely when the viewer leads no grupos', () => {
    render(
      <CatalogoTalleresClient
        catalogo={[TALLER_ABIERTO]}
        misGrupos={[]}
        puedeCrear={false}
        opciones={OPCIONES_VACIAS}
      />,
    )
    expect(screen.queryByText('Mis grupos')).not.toBeInTheDocument()
  })

  it('shows a placeholder, not a blank line, when a grupo has no resolvable taller/edición name', () => {
    render(
      <CatalogoTalleresClient
        catalogo={[]}
        misGrupos={[{ ...MI_GRUPO, tallerNombre: null, edicionNombre: null, proximaClase: null }]}
        puedeCrear={false}
        opciones={OPCIONES_VACIAS}
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText(/Sin próxima clase programada/)).toBeInTheDocument()
  })
})

describe('CatalogoTalleresClient — Catálogo + crear taller', () => {
  it('director (puedeCrear=true) sees the catálogo AND the create control', () => {
    render(
      <CatalogoTalleresClient
        catalogo={[TALLER_ABIERTO]}
        misGrupos={[]}
        puedeCrear={true}
        opciones={OPCIONES_VACIAS}
      />,
    )
    expect(screen.getByText('Catálogo')).toBeInTheDocument()
    expect(screen.getByText('Matrimonio sobre la Roca')).toBeInTheDocument()
    expect(screen.getByTestId('crear-taller-form')).toBeInTheDocument()
  })

  it('coordinator (puedeCrear=false) sees the catálogo WITHOUT the create control', () => {
    render(
      <CatalogoTalleresClient
        catalogo={[TALLER_ABIERTO]}
        misGrupos={[]}
        puedeCrear={false}
        opciones={OPCIONES_VACIAS}
      />,
    )
    expect(screen.getByText('Catálogo')).toBeInTheDocument()
    expect(screen.getByText('Matrimonio sobre la Roca')).toBeInTheDocument()
    expect(screen.queryByTestId('crear-taller-form')).not.toBeInTheDocument()
  })

  it('shows each edición with its estado label and inscripciones count', () => {
    render(
      <CatalogoTalleresClient
        catalogo={[TALLER_ABIERTO]}
        misGrupos={[]}
        puedeCrear={false}
        opciones={OPCIONES_VACIAS}
      />,
    )
    expect(screen.getByText('Septiembre 2026')).toBeInTheDocument()
    expect(screen.getByText('Abierta')).toBeInTheDocument()
    expect(screen.getByText('Cerrada')).toBeInTheDocument()
    expect(screen.getByText(/12 inscrit/)).toBeInTheDocument()
  })
})

describe('CatalogoTalleresClient — filtro "abiertas"', () => {
  it('defaults to showing every edición regardless of estado', () => {
    render(
      <CatalogoTalleresClient
        catalogo={[TALLER_ABIERTO, TALLER_SOLO_CERRADO]}
        misGrupos={[]}
        puedeCrear={false}
        opciones={OPCIONES_VACIAS}
      />,
    )
    expect(screen.getByText('Matrimonio sobre la Roca')).toBeInTheDocument()
    expect(screen.getByText('Discipulado')).toBeInTheDocument()
    expect(screen.getByText('Marzo 2026')).toBeInTheDocument()
  })

  it('switching to "Abiertas" drops cerrado ediciones and talleres left with none', async () => {
    const user = userEvent.setup()
    render(
      <CatalogoTalleresClient
        catalogo={[TALLER_ABIERTO, TALLER_SOLO_CERRADO]}
        misGrupos={[]}
        puedeCrear={false}
        opciones={OPCIONES_VACIAS}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Abiertas' }))

    // TALLER_ABIERTO keeps its 'abierto' edición, loses the 'cerrado' one.
    expect(screen.getByText('Matrimonio sobre la Roca')).toBeInTheDocument()
    expect(screen.getByText('Septiembre 2026')).toBeInTheDocument()
    expect(screen.queryByText('Marzo 2026')).not.toBeInTheDocument()

    // TALLER_SOLO_CERRADO has nothing left to show and disappears entirely.
    expect(screen.queryByText('Discipulado')).not.toBeInTheDocument()
  })

  it('switching back to "Todas" restores the full list', async () => {
    const user = userEvent.setup()
    render(
      <CatalogoTalleresClient
        catalogo={[TALLER_ABIERTO, TALLER_SOLO_CERRADO]}
        misGrupos={[]}
        puedeCrear={false}
        opciones={OPCIONES_VACIAS}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Abiertas' }))
    await user.click(screen.getByRole('button', { name: 'Todas' }))

    expect(screen.getByText('Discipulado')).toBeInTheDocument()
    expect(screen.getByText('Marzo 2026')).toBeInTheDocument()
  })
})

describe('CatalogoTalleresClient — empty states', () => {
  it('shows one page-wide empty state when there is nothing to show at all', () => {
    render(
      <CatalogoTalleresClient
        catalogo={[]}
        misGrupos={[]}
        puedeCrear={false}
        opciones={OPCIONES_VACIAS}
      />,
    )
    expect(screen.getByText(/Aún no hay talleres/i)).toBeInTheDocument()
  })

  it('shows a catálogo-specific empty message when misGrupos or puedeCrear still has content', () => {
    render(
      <CatalogoTalleresClient
        catalogo={[]}
        misGrupos={[MI_GRUPO]}
        puedeCrear={false}
        opciones={OPCIONES_VACIAS}
      />,
    )
    expect(screen.getByText('Mis grupos')).toBeInTheDocument()
    expect(screen.getByText('Catálogo')).toBeInTheDocument()
    expect(within(screen.getByText('Catálogo').closest('section') as HTMLElement).getByText(/no hay talleres registrados/i)).toBeInTheDocument()
  })
})

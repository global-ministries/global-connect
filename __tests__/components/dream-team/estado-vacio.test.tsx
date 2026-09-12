/**
 * `<EstadoVacio>` — Dream Team's own empty-state card, replacing the
 * talleres-borrowed `EmptyState`. Mirrors the Grupos de Vida empty-state
 * pattern (see GruposList.client.tsx:468-479): a lucide icon, a title, and
 * an optional subtitle, inside a `TarjetaSistema`.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { Network } from 'lucide-react'

import { EstadoVacio } from '@/components/dream-team/estado-vacio'

describe('EstadoVacio', () => {
  it('renders the icon, title and subtitle', () => {
    render(<EstadoVacio icono={Network} titulo="No hay equipos" subtitulo="Probá con otro filtro." />)

    expect(screen.getByText('No hay equipos')).toBeInTheDocument()
    expect(screen.getByText('Probá con otro filtro.')).toBeInTheDocument()
  })

  it('renders without a subtitle when none is given', () => {
    render(<EstadoVacio icono={Network} titulo="No hay equipos" />)

    expect(screen.getByText('No hay equipos')).toBeInTheDocument()
  })
})

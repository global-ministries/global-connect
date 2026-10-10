import { render, screen, within } from '@testing-library/react'

import { FamiliasNuevas } from '@/components/ninos/reportes-familias'
import type { NinoNuevo } from '@/lib/platform/ninos/reportes'

const nuevo = (p: Partial<NinoNuevo>): NinoNuevo => ({
  nino_id: 'n',
  nombre: 'Niño',
  fecha: '2026-09-27',
  salon: 'Maternal',
  visita_id: 'v',
  padres: [],
  estado: 'no_volvio',
  estado_familia: 'no_volvio',
  visitas: 1,
  ultima_fecha: '2026-09-27',
  ...p,
})

// Synthetic children: siblings Dos and Tres share one first visit and only Dos came back.
const nuevos = [
  nuevo({ nino_id: 'a', nombre: 'Niño Uno', visita_id: 'v1', salon: '1º grado', padres: ['Padre Uno'] }),
  nuevo({ nino_id: 'b', nombre: 'Niña Dos', visita_id: 'v2', padres: ['Madre Dos'], estado: 'volvio', estado_familia: 'volvio',
    visitas: 3, ultima_fecha: '2026-10-11' }),
  nuevo({ nino_id: 'c', nombre: 'Niño Tres', visita_id: 'v2', padres: ['Madre Dos'], estado_familia: 'volvio' }),
  nuevo({ nino_id: 'd', nombre: 'Niña Cuatro', visita_id: 'v3', fecha: '2026-10-11', ultima_fecha: '2026-10-11',
    estado: 'pendiente', estado_familia: 'pendiente' }),
]

describe('FamiliasNuevas', () => {
  it('splits new families into returned, not returned and recent first visit, with counts', () => {
    render(<FamiliasNuevas nuevos={nuevos} />)

    const volvieron = screen.getByRole('region', { name: 'Volvieron' })
    expect(within(volvieron).getByRole('heading')).toHaveTextContent(/^Volvieron\s*1$/)
    expect(within(volvieron).getByText('Niña Dos y Niño Tres')).toBeInTheDocument()
    expect(within(volvieron).getByText('Niña Dos: 3 visitas · la última el 11/10/2026')).toBeInTheDocument()
    expect(within(volvieron).getByText('Padres: Madre Dos')).toBeInTheDocument()

    const noVolvieron = screen.getByRole('region', { name: 'No han vuelto' })
    expect(within(noVolvieron).getByRole('heading')).toHaveTextContent(/^No han vuelto\s*1$/)
    expect(within(noVolvieron).getByText('Niño Uno')).toBeInTheDocument()
    expect(within(noVolvieron).getByText('Primera visita el 27/09/2026 · 1º grado')).toBeInTheDocument()

    const recientes = screen.getByRole('region', { name: 'Primera visita reciente' })
    expect(within(recientes).getByRole('heading')).toHaveTextContent(/^Primera visita reciente\s*1$/)
    expect(within(recientes).getByText('Niña Cuatro')).toBeInTheDocument()
    expect(within(recientes).getByText('Sin padres vinculados')).toBeInTheDocument()
    // Pending is per campus: a service at another campus does not count.
    expect(within(recientes).getByText('Aún no ha habido otro servicio en su campus desde su primera visita.')).toBeInTheDocument()
  })

  it('says so when a group has no families', () => {
    render(<FamiliasNuevas nuevos={[nuevos[0]]} />)
    expect(within(screen.getByRole('region', { name: 'Volvieron' })).getByText('Ninguna en este rango.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Volvieron' })).getByRole('heading')).toHaveTextContent(/^Volvieron\s*0$/)
  })
})

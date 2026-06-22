import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MapaInteractivoInner } from '@/components/grupos-vida/mapa-interactivo-inner'
import type { GrupoMapa, MiembroMapa } from '@/components/grupos-vida/mapa-location-model'

jest.mock('leaflet/dist/leaflet.css', () => ({}))
jest.mock('leaflet', () => {
  const Marker = function Marker() {}
  Marker.prototype = { options: {} }
  return {
    __esModule: true,
    default: {
      Marker,
      divIcon: jest.fn((input) => ({ type: 'divIcon', input })),
      icon: jest.fn((input) => ({ type: 'icon', input })),
      latLngBounds: jest.fn((points) => ({ points })),
    },
  }
})
jest.mock('react-leaflet', () => {
  const LayersControl = ({ children }: { children: React.ReactNode }) => <div data-testid="layers-control">{children}</div>
  const LayersControlOverlay = ({ checked, children, name }: { checked?: boolean; children: React.ReactNode; name: string }) => (
    <section data-testid={`overlay-${name}`} data-checked={checked ? 'true' : 'false'} aria-label={name}>{children}</section>
  )
  LayersControl.Overlay = LayersControlOverlay
  return {
    LayerGroup: ({ children }: { children: React.ReactNode }) => <div data-testid="layer-group">{children}</div>,
    LayersControl,
    MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
    Marker: ({ children, position }: { children: React.ReactNode; position: [number, number] }) => <article data-testid="marker" data-position={position.join(',')}>{children}</article>,
    Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
    TileLayer: () => <div data-testid="tile-layer" />,
    useMap: () => ({ fitBounds: jest.fn() }),
  }
})

describe('MapaInteractivoInner member layer contract', () => {
  it('renders separated group and member overlays with privacy-safe member popup data', () => {
    render(<MapaInteractivoInner grupos={[createGroup()]} miembros={[createMember()]} />)

    expect(screen.getByTestId('layers-control')).toBeInTheDocument()
    expect(screen.getByTestId('overlay-Grupos')).toHaveAttribute('data-checked', 'true')
    expect(screen.getByTestId('overlay-Miembros')).toHaveAttribute('data-checked', 'false')
    expect(within(screen.getByTestId('overlay-Grupos')).getByText('Grupo Centro')).toBeInTheDocument()
    expect(within(screen.getByTestId('overlay-Miembros')).getByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.getByText('Ubicación exacta privada; uso restringido a coordinación pastoral y operativa autorizada.')).toBeInTheDocument()
    expect(screen.queryByText(/calle/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument()
  })

  it('renders only group markers without member layer controls when the member payload is empty', () => {
    render(<MapaInteractivoInner grupos={[createGroup()]} miembros={[]} />)

    expect(screen.queryByTestId('layers-control')).not.toBeInTheDocument()
    expect(screen.queryByTestId('overlay-Miembros')).not.toBeInTheDocument()
    expect(screen.getByText('Grupo Centro')).toBeInTheDocument()
  })

  it('does not pass invalid member coordinates to markers and reports skipped private pins', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    render(<MapaInteractivoInner grupos={[createGroup()]} miembros={[createMember(), createMember({ id: 'bad', nombre: 'Fuera de rango', latitud: 91 })]} />)

    expect(screen.getAllByTestId('marker').map((marker) => marker.getAttribute('data-position'))).toEqual(['10.1,-69.2', '10.2,-69.25'])
    expect(screen.queryByText('Fuera de rango')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/1 ubicación de miembro no se pudo mostrar/i)
    await waitFor(() => expect(warnSpy).toHaveBeenCalledWith('member-map-observability', {
      phase: 'member-layer',
      reason: 'invalid-coordinates',
      count: 1,
    }))
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('Fuera de rango')
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('91')
    warnSpy.mockRestore()
  })
})

function createGroup(overrides: Partial<GrupoMapa> = {}): GrupoMapa {
  return { id: 'g1', nombre: 'Grupo Centro', latitud: 10.1, longitud: -69.2, dia_reunion: 'Viernes', hora_reunion: '19:00', estado_ciclo: 'activo', segmento: 'Adultos', temporada: '2026', total_miembros: 8, capacidad_maxima: 12, casa_id: 'c1', barrio: 'Centro', notas_publicas: null, ...overrides }
}

function createMember(overrides: Partial<MiembroMapa> = {}): MiembroMapa {
  return { id: 'm1', nombre: 'Juan Pérez', grupo_id: 'g1', grupo_nombre: 'Grupo Centro', latitud: 10.2, longitud: -69.25, ...overrides }
}

import { describeHostHomeLocation, type GrupoMapa } from '@/components/grupos-vida/mapa-host-home-model'

describe('host-home map popup model', () => {
  it('describes approved family host-home details without exposing exact address fields', () => {
    expect(describeHostHomeLocation(createGroup())).toEqual({
      locationTypeLabel: 'Casa Anfitriona',
      publicLocationLabel: 'Barrio Centro',
      publicNotes: 'Entrada por el portón principal.',
      privacyMessage: 'La dirección exacta se comparte únicamente por canales autorizados del grupo.',
    })
  })

  it('uses a safe neutral fallback when the RPC does not provide barrio', () => {
    expect(describeHostHomeLocation(createGroup({ barrio: null }))).toEqual(expect.objectContaining({
      locationTypeLabel: 'Casa Anfitriona',
      publicLocationLabel: 'Ubicación aprobada; dirección exacta reservada',
    }))
  })

  it('does not require or expose private host-home names in the public popup model', () => {
    expect(describeHostHomeLocation(createGroup())).not.toHaveProperty('privateHostHomeName')
  })
})

function createGroup(overrides: Partial<GrupoMapa> = {}): GrupoMapa {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    nombre: 'Grupo Centro',
    latitud: 10.1,
    longitud: -69.2,
    dia_reunion: 'Viernes',
    hora_reunion: '19:00',
    estado_ciclo: 'activo',
    segmento: 'Adultos',
    temporada: 'Temporada 2026',
    total_miembros: 8,
    capacidad_maxima: 12,
    casa_id: '22222222-2222-2222-2222-222222222222',
    barrio: 'Centro',
    notas_publicas: 'Entrada por el portón principal.',
    ...overrides,
  }
}

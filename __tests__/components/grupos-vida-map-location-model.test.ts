import { describeHostHomeLocation, describeMemberLocation, type GrupoMapa, type MiembroMapa } from '@/components/grupos-vida/mapa-location-model'

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

describe('member map popup model', () => {
  it('describes authorized member pins without adding address fields', () => {
    expect(describeMemberLocation(createMember())).toEqual({
      locationTypeLabel: 'Miembro',
      memberName: 'Juan Pérez',
      groupLabel: 'Grupo Norte',
      privacyMessage: 'Ubicación exacta privada; uso restringido a coordinación pastoral y operativa autorizada.',
    })
  })

  it('keeps member popup output limited to the authorized RPC payload', () => {
    const details = describeMemberLocation(createMember())

    expect(details).not.toHaveProperty('calle')
    expect(details).not.toHaveProperty('telefono')
    expect(details).not.toHaveProperty('email')
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

function createMember(overrides: Partial<MiembroMapa> = {}): MiembroMapa {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    nombre: 'Juan Pérez',
    grupo_id: '11111111-1111-1111-1111-111111111111',
    grupo_nombre: 'Grupo Norte',
    latitud: 10.2,
    longitud: -69.25,
    ...overrides,
  }
}

import { cargarServiciosPersona } from '@/lib/platform/usuarios/ficha-servicio'

type Fila = Record<string, unknown>

function cliente(tablas: Record<string, Fila[] | Error>) {
  const filtros: { tabla: string; metodo: string; args: unknown[] }[] = []
  return {
    filtros,
    from(tabla: string) {
      const resultado = tablas[tabla]
      const consulta = {
        select: () => consulta,
        eq: (...args: unknown[]) => (filtros.push({ tabla, metodo: 'eq', args }), consulta),
        in: (...args: unknown[]) => (filtros.push({ tabla, metodo: 'in', args }), consulta),
        then: (ok: (r: { data: Fila[] | null; error: Error | null }) => unknown) =>
          Promise.resolve(resultado instanceof Error ? { data: null, error: resultado } : { data: resultado ?? [], error: null }).then(ok),
      }
      return consulta
    },
  }
}

const equipos = [
  { id: 'dir', label: 'Dirección de Niños', parent_equipo_id: null },
  { id: 'area', label: 'Waumba Land', parent_equipo_id: 'dir' },
  { id: 'eq', label: 'Salón 3 años', parent_equipo_id: 'area' },
]

describe('Servicio tab loader', () => {
  it('returns each servicio with its team path, rol and etapa, retired ones left out', async () => {
    const c = cliente({
      dream_team_servicios: [
        { id: 's1', equipo_id: 'eq', rol_id: 'r1', estado: 'activo', fecha_inicio: '2025-02-01' },
        { id: 's2', equipo_id: 'area', rol_id: 'r2', estado: 'en_orientacion', fecha_inicio: '2026-09-01' },
        { id: 's3', equipo_id: 'eq', rol_id: 'r1', estado: 'retirado', fecha_inicio: '2020-01-01' },
      ],
      dream_team_equipos: equipos,
      dream_team_roles: [
        { id: 'r1', label: 'Voluntario' },
        { id: 'r2', label: 'Líder de salón' },
      ],
    })
    const servicios = await cargarServiciosPersona(c as never, 'u-2')
    expect(servicios).toEqual([
      { id: 's1', equipo: 'Salón 3 años', ruta: 'Dirección de Niños · Waumba Land', rol: 'Voluntario', etapa: 'Activo', tono: 'success', desde: '2025-02-01' },
      { id: 's2', equipo: 'Waumba Land', ruta: 'Dirección de Niños', rol: 'Líder de salón', etapa: 'En orientación', tono: 'info', desde: '2026-09-01' },
    ])
    expect(c.filtros).toContainEqual({ tabla: 'dream_team_servicios', metodo: 'eq', args: ['persona_id', 'u-2'] })
  })

  it('returns an empty list when the viewer cannot read servicios', async () => {
    expect(await cargarServiciosPersona(cliente({ dream_team_servicios: new Error('denied') }) as never, 'u-2')).toEqual([])
    expect(await cargarServiciosPersona(cliente({ dream_team_servicios: [] }) as never, 'u-2')).toEqual([])
  })
})

/**
 * The two blocks of S11 and S12 (odd/tasks/home-por-rol.md T7): the leaders'
 * notes from obtener_eventos_con_notas (same arguments as the old
 * NotasLideresWidget) and the birthdays obtener_datos_dashboard already
 * returns for each role. A source that fails leaves its block empty (hidden).
 */
import { cumpleanosDelTablero } from '@/lib/inicio/cargar-cumpleanos'
import { cargarNotasLideres } from '@/lib/inicio/cargar-notas-lideres'
import type { ClienteInicio } from '@/lib/inicio/cargar-hechos'

const EVENTO = {
  evento_id: 'e-1',
  grupo_id: 'g-1',
  grupo_nombre: 'Mujeres +36 · El Ujano',
  fecha: '2026-11-05',
  hora: '19:30',
  tema: 'Sin tema',
  notas: '  Oramos por la familia Pérez; Gladys vuelve la próxima semana.  ',
  lider_nombre: 'Yelitza Rodríguez',
  presentes: 9,
  total: 12,
}

const cliente = (rpc: jest.Mock) => ({ rpc }) as unknown as ClienteInicio

describe('cargarNotasLideres', () => {
  let consola: jest.SpyInstance

  beforeEach(() => {
    consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => consola.mockRestore())

  it('lee las notas con los mismos parámetros del widget anterior', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [EVENTO, { ...EVENTO, evento_id: 'e-2', notas: '   ' }, { grupo_id: 'g-x' }], error: null })

    await expect(cargarNotasLideres(cliente(rpc), 'auth-1')).resolves.toEqual([
      {
        eventoId: 'e-1',
        grupoId: 'g-1',
        grupo: 'Mujeres +36 · El Ujano',
        nota: 'Oramos por la familia Pérez; Gladys vuelve la próxima semana.',
        lider: 'Yelitza Rodríguez',
        presentes: 9,
        total: 12,
        fecha: '2026-11-05',
      },
    ])
    expect(rpc).toHaveBeenCalledWith('obtener_eventos_con_notas', { p_auth_id: 'auth-1', p_limite: 10 })
  })

  it('un error de la RPC deja la lista vacía y lo registra', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(cargarNotasLideres(cliente(rpc), 'auth-1')).resolves.toEqual([])
    expect(consola).toHaveBeenCalled()
  })

  it('si la RPC lanza, también queda vacía', async () => {
    const rpc = jest.fn().mockRejectedValue(new Error('red caída'))

    await expect(cargarNotasLideres(cliente(rpc), 'auth-1')).resolves.toEqual([])
  })
})

describe('cumpleanosDelTablero', () => {
  const fila = (id: string, nombre: string, proximo: string) => ({ id, nombre_completo: nombre, foto_url: null, fecha_nacimiento: '1990-01-01', proximo })

  it('líder: los de su grupo, con el grupo como contexto', () => {
    const tablero = { rol: 'lider', widgets: { proximos_cumpleanos_grupo: [fila('u-2', 'Luis Torres', '2026-11-12'), fila('u-1', 'Ramón Pérez', '2026-11-10')] } }

    expect(cumpleanosDelTablero(tablero, 'Hombres +36')).toEqual([
      { id: 'u-1', nombre: 'Ramón Pérez', fecha: '2026-11-10', contexto: 'Hombres +36' },
      { id: 'u-2', nombre: 'Luis Torres', fecha: '2026-11-12', contexto: 'Hombres +36' },
    ])
  })

  it('directora de etapa: los de su alcance', () => {
    const tablero = { rol: 'director-etapa', widgets: { proximos_cumpleanos_alcance: [fila('u-1', 'Gladys Piña', '2026-11-11')], proximos_cumpleanos: [fila('u-9', 'Otra', '2026-11-11')] } }

    expect(cumpleanosDelTablero(tablero, 'No se usa')).toEqual([{ id: 'u-1', nombre: 'Gladys Piña', fecha: '2026-11-11', contexto: null }])
  })

  it.each(['director-general', 'admin', 'pastor'])('%s: proximos_cumpleanos', (rol) => {
    const tablero = { rol, widgets: { proximos_cumpleanos: [fila('u-1', 'Ana Pérez', '2026-11-20T00:00:00')] } }

    expect(cumpleanosDelTablero(tablero, null)).toEqual([{ id: 'u-1', nombre: 'Ana Pérez', fecha: '2026-11-20', contexto: null }])
  })

  it('sin tablero, con otro rol o con filas incompletas no hay cumpleaños', () => {
    expect(cumpleanosDelTablero(null, null)).toEqual([])
    expect(cumpleanosDelTablero({ rol: 'miembro', widgets: { proximos_cumpleanos: [fila('u-1', 'Ana', '2026-11-20')] } }, null)).toEqual([])
    expect(cumpleanosDelTablero({ rol: 'admin', widgets: { proximos_cumpleanos: [{ id: 'u-1', nombre_completo: 'Ana' }, 'x'] } }, null)).toEqual([])
  })
})

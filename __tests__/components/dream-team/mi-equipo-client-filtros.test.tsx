/**
 * `<MiEquipoClient>` — filters and views (T7a-3, S11 decisions 2, 4, 5 and 7
 * of odd/tasks/sistema-diseno-v2.md): the attention metrics are the filters
 * ("Por activar" replaces the old pending strip and its "Revisar"), the etapa
 * pills and the Turno select move into the Filtros sheet, every active filter
 * is a chip, "Por servicio" lists one row per servicio, and all of it lives in
 * the URL. Intent kept from the old suite: counters per etapa that follow the
 * search, the hidden etapas nobody is in, the shift line of each person and a
 * Turno filter limited to the campus selected in the app.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MiEquipoClient, type MiEquipoClientProps } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import { FILTROS_MI_EQUIPO } from '@/lib/platform/dream-team/mi-equipo-filtros'
import { listarDirecciones, vistaDeDireccion, type PersonasPorEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'
import { ID_CONEXION, ID_DHAH, ID_PDP, arbolConexion, personasPorEquipoConexion } from '@/tests/helpers/mi-equipo-conexion'

const replace = jest.fn()
let campusActivoId: string | null = null
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: campusActivoId }) }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dream-team/mi-equipo',
}))
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => <header /> }))

jest.setTimeout(15_000)
let user: ReturnType<typeof userEvent.setup>
beforeEach(() => {
  campusActivoId = null
  replace.mockClear()
  user = userEvent.setup({ delay: null })
})

const T9 = '00000000-0000-4000-8000-000000000009'
const TCCS = '00000000-0000-4000-8000-000000000017'
const turnos = [
  { id: T9, label: 'Domingo 9:00', campusId: 'bqt' },
  { id: TCCS, label: 'Sábado 17:00', campusId: 'ccs' },
]
// Edmir Muñoz serves in no shift yet; everybody else has Domingo 9:00. Two people have no account.
const conTurnos: PersonasPorEquipo = Object.fromEntries(
  Object.entries(personasPorEquipoConexion).map(([equipo, personas]) => [
    equipo,
    personas.map((p) => ({
      ...p,
      turnoIds: p.nombre === 'Edmir Muñoz' ? [] : [T9],
      tieneCuenta: p.nombre === 'Luis Barrios' || p.nombre === 'Karol Valero' ? false : true,
    })),
  ]),
)

function props(overrides: Partial<MiEquipoClientProps> = {}): MiEquipoClientProps {
  return {
    direcciones: listarDirecciones(arbolConexion, conTurnos),
    vista: vistaDeDireccion(arbolConexion, conTurnos, ID_CONEXION),
    direccionId: ID_CONEXION,
    rol: 'sin_permisos',
    equiposAsignables: [],
    rolesPorEquipo: {},
    turnos,
    ...overrides,
  }
}

const lista = () => screen.queryByRole('table', { name: /del equipo$/, hidden: true })
const filas = () => (lista() ? within(lista() as HTMLElement).queryAllByRole('button', { name: /^Abrir /, hidden: true }) : [])
const nombres = () => filas().map((b) => (b.getAttribute('aria-label') ?? '').replace(/^Abrir /, ''))
const metrica = (etiqueta: string) =>
  within(screen.getByRole('group', { name: 'Necesitan atención', hidden: true })).getByRole('button', {
    name: (n) => n.startsWith(etiqueta),
    hidden: true,
  })
const tarjeta = (prefijo: string) => within(screen.getByRole('group', { name: 'Equipos' })).getByRole('button', { name: (n) => n.startsWith(prefijo) })
async function abrirFiltros() {
  await user.click(screen.getAllByRole('button', { name: /^Filtros/ })[0])
  return within(screen.getByRole('dialog', { name: 'Filtros' }))
}

describe('MiEquipoClient — attention metrics are the filters (S11 decisions 2 and 4)', () => {
  it('shows Sirviendo, Por activar, Sin cuenta and Sin turno counting people, with the prototype hints', () => {
    render(<MiEquipoClient {...props()} />)
    expect(metrica('Sirviendo')).toHaveTextContent('35')
    expect(metrica('Sirviendo')).toHaveTextContent('92% del equipo')
    expect(metrica('Por activar')).toHaveTextContent('2')
    expect(metrica('Por activar')).toHaveTextContent('esperan que los actives')
    expect(metrica('Sin cuenta')).toHaveTextContent('2')
    expect(metrica('Sin cuenta')).toHaveTextContent('invitalos a la plataforma')
    expect(metrica('Sin turno')).toHaveTextContent('1')
    expect(screen.queryByRole('region', { name: 'Pendientes' })).not.toBeInTheDocument()
  })

  it('"Por activar" lists who waits (the old "Revisar"); pressing it again clears it; the URL follows', async () => {
    render(<MiEquipoClient {...props()} />)
    await user.click(metrica('Por activar'))
    expect(metrica('Por activar')).toHaveAttribute('aria-pressed', 'true')
    expect(nombres().sort()).toEqual(['Luis Barrios', 'Wilennys García'])
    expect(replace).toHaveBeenLastCalledWith('/dream-team/mi-equipo?por_activar=1', { scroll: false })
    await user.click(metrica('Por activar'))
    expect(filas()).toHaveLength(38)
    expect(replace).toHaveBeenLastCalledWith('/dream-team/mi-equipo', { scroll: false })
  })

  it('Sirviendo is the Activo etapa, Sin cuenta and Sin turno their own filter', async () => {
    render(<MiEquipoClient {...props()} />)
    await user.click(metrica('Sirviendo'))
    expect(filas()).toHaveLength(35)
    expect(replace).toHaveBeenLastCalledWith('/dream-team/mi-equipo?etapa=activo', { scroll: false })
    await user.click(metrica('Sirviendo'))
    await user.click(metrica('Sin cuenta'))
    expect(nombres().sort()).toEqual(['Karol Valero', 'Luis Barrios'])
    await user.click(metrica('Sin cuenta'))
    await user.click(metrica('Sin turno'))
    expect(nombres()).toEqual(['Edmir Muñoz'])
    expect(replace).toHaveBeenLastCalledWith('/dream-team/mi-equipo?sin_turno=1', { scroll: false })
  })

  it('the numbers follow the scope', async () => {
    render(<MiEquipoClient {...props()} />)
    await user.click(tarjeta('Punto de Partida'))
    expect(metrica('Por activar')).toHaveTextContent('1')
    expect(metrica('Sirviendo')).toHaveTextContent('12')
  })
})

describe('MiEquipoClient — the Filtros sheet (S11 decision 5)', () => {
  it('counts by etapa, hides etapas nobody is in, follows the search and filters by pill', async () => {
    render(<MiEquipoClient {...props()} />)
    let hoja = await abrirFiltros()
    expect(hoja.getByRole('button', { name: 'Todos 38' })).toHaveAttribute('aria-pressed', 'true')
    expect(hoja.getByRole('button', { name: 'Activos 35' })).toBeInTheDocument()
    expect(hoja.getByRole('button', { name: 'En pausa 1' })).toBeInTheDocument()
    expect(hoja.queryByRole('button', { name: /^Postulado/ })).not.toBeInTheDocument()
    await user.click(hoja.getByRole('button', { name: 'En pausa 1' }))
    expect(nombres()).toEqual(['Sixta Fernandez'])
    expect(hoja.getByRole('button', { name: 'Ver 1 persona' })).toBeInTheDocument()
    await user.click(hoja.getByRole('button', { name: 'Limpiar' }))
    await user.click(hoja.getByRole('button', { name: 'Ver 38 personas' }))
    expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Buscar en tu equipo' }), 'blanca')
    hoja = await abrirFiltros()
    expect(hoja.getByRole('button', { name: 'Todos 2' })).toBeInTheDocument()
    expect(hoja.getByRole('button', { name: 'En orientación 0' })).toBeInTheDocument()
  })

  it('the Turno select offers only the shifts of the campus selected in the app and filters by it', async () => {
    campusActivoId = 'ccs'
    const { unmount } = render(<MiEquipoClient {...props()} />)
    let hoja = await abrirFiltros()
    expect(Array.from((hoja.getByLabelText('Turno') as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      'Todos',
      'Sábado 17:00',
      'Sin turno',
    ])
    unmount()
    campusActivoId = null
    render(<MiEquipoClient {...props()} />)
    hoja = await abrirFiltros()
    await user.selectOptions(hoja.getByLabelText('Turno'), 'sin_turno')
    expect(nombres()).toEqual(['Edmir Muñoz'])
    expect(replace).toHaveBeenLastCalledWith('/dream-team/mi-equipo?turno=sin_turno', { scroll: false })
  })

  it('has no Turno select when the campus has no shifts', async () => {
    render(<MiEquipoClient {...props({ turnos: [] })} />)
    const hoja = await abrirFiltros()
    expect(hoja.queryByLabelText('Turno')).not.toBeInTheDocument()
  })

  it('lists every active filter as a chip with its count on Filtros; X removes one, "Limpiar todo" all', async () => {
    render(<MiEquipoClient {...props()} />)
    await user.click(metrica('Sirviendo'))
    await user.click(metrica('Sin cuenta'))
    const chips = () => screen.getByRole('group', { name: 'Filtros activos' })
    expect(within(chips()).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Quitar Etapa: Activo',
      'Quitar Sin cuenta',
      'Limpiar todo',
    ])
    expect(screen.getAllByRole('button', { name: /^Filtros/ })[0]).toHaveAccessibleName(/2/)
    await user.click(within(chips()).getByRole('button', { name: 'Quitar Sin cuenta' }))
    expect(metrica('Sirviendo')).toHaveAttribute('aria-pressed', 'true')
    await user.click(metrica('Sin cuenta'))
    await user.click(within(chips()).getByRole('button', { name: 'Limpiar todo' }))
    expect(screen.queryByRole('group', { name: 'Filtros activos' })).not.toBeInTheDocument()
    expect(filas()).toHaveLength(38)
  })

  it('opens with the filters of a shared URL', () => {
    render(<MiEquipoClient {...props({ filtrosIniciales: { ...FILTROS_MI_EQUIPO, nivel: ID_DHAH, porActivar: true } })} />)
    expect(metrica('Por activar')).toHaveAttribute('aria-pressed', 'true')
    expect(nombres()).toEqual(['Luis Barrios'])
  })
})

describe('MiEquipoClient — Por persona / Por servicio (S11 decision 7)', () => {
  const conDos: PersonasPorEquipo = {
    ...conTurnos,
    [ID_PDP]: [...conTurnos[ID_PDP], { ...conTurnos[ID_DHAH][0], clave: 'edmir-pdp', servicioId: 'servicio-edmir-pdp' }],
  }

  it('"Por servicio" lists one row per servicio; the footer and the URL follow', async () => {
    render(<MiEquipoClient {...props({ vista: vistaDeDireccion(arbolConexion, conDos, ID_CONEXION) })} />)
    expect(screen.getByRole('group', { name: 'Vista' })).toBeInTheDocument()
    expect(filas()).toHaveLength(38)
    expect(screen.getByText('38 personas · 39 servicios')).toBeInTheDocument()
    await user.click(within(screen.getByRole('group', { name: 'Vista' })).getByRole('button', { name: 'Por servicio' }))
    expect(filas()).toHaveLength(39)
    expect(screen.getByRole('button', { name: 'Abrir Edmir Muñoz en Punto de Partida', hidden: true })).toBeInTheDocument()
    expect(screen.getByText('39 servicios · 38 personas')).toBeInTheDocument()
    expect(replace).toHaveBeenLastCalledWith('/dream-team/mi-equipo?vista=servicio', { scroll: false })
  })

  it('names each servicio with its shifts, a dash when none', () => {
    render(<MiEquipoClient {...props({ filtrosIniciales: { ...FILTROS_MI_EQUIPO, vista: 'servicio' } })} />)
    const fila = (nombre: string) =>
      screen.getByRole('button', { name: (n) => n.startsWith(`Abrir ${nombre} en`), hidden: true }).closest('[role="row"]') as HTMLElement
    expect(within(fila('Antholy Ludovic Gómez')).getByText('Domingo 9:00')).toBeInTheDocument()
    expect(within(fila('Edmir Muñoz')).getByText('—')).toBeInTheDocument()
  })
})

/**
 * `<PendientesClient>` — /dream-team/pendientes (odd/tasks/dream-team-pendientes-director.md,
 * T4, S1, S2, S4, S6, S7; artboards design/pendientes-director/01 and 02):
 * the "% en orden", the metrics that filter (in the URL), the "Urgente"
 * section and one group per alert type, each row with its direct action. The
 * actions are the existing Dream Team dialogs (mocked here to read the props
 * they get); after any of them the page refreshes.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PendientesClient, type PendientesClientProps } from '@/components/dream-team/pendientes/pendientes-client'
import { mapFilasPendientes, type ResumenPendientes } from '@/lib/platform/dream-team/pendientes'
import type { SolicitudCambioArea } from '@/lib/platform/dream-team/cambiar-area'

const replace = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: jest.fn() }),
  usePathname: () => '/dream-team/pendientes',
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

// The existing dialogs, as doubles that show what they were opened with.
type Abrible = { abierto?: boolean; onAbiertoChange?: (abierto: boolean) => void }
jest.mock('@/components/dream-team/asignador-servicio-dialog', () => ({
  AsignadorServicioDialog: (p: Abrible & { equipoIdInicial?: string; soloRegistrar?: boolean; onAsignado: () => void; nodosPlanos: { id: string }[] }) =>
    p.abierto ? (
      <div role="dialog" aria-label="Asignar servicio">
        {`equipo:${p.equipoIdInicial} solo:${String(p.soloRegistrar)} nodos:${p.nodosPlanos.map((n) => n.id).join(',')}`}
        <button onClick={p.onAsignado}>simular asignado</button>
      </div>
    ) : null,
}))
jest.mock('@/components/dream-team/servidores/editar-ficha-panel', () => ({
  EditarFichaPanel: (
    p: Abrible & {
      personaId: string
      nombre: string
      onGuardado: () => void
      serie?: { origen: string; posicion: number; total: number; onSiguiente?: () => void }
    },
  ) =>
    p.abierto ? (
      <div role="dialog" aria-label="Editar ficha">
        {`${p.nombre} · ${p.serie?.origen} · ${p.serie?.posicion} de ${p.serie?.total}`}
        <button onClick={p.onGuardado}>simular guardado</button>
        {p.serie?.onSiguiente && <button onClick={p.serie.onSiguiente}>simular siguiente</button>}
        <button onClick={() => p.onAbiertoChange?.(false)}>cerrar ficha</button>
      </div>
    ) : null,
}))
jest.mock('@/components/cuentas/invitar-cuenta-panel', () => ({
  InvitarCuentaPanel: (p: Abrible & { personaId: string; nombre: string; onInvitada?: () => void }) =>
    p.abierto ? (
      <div role="dialog" aria-label="Invitar">
        {`invitar:${p.personaId}`}
        <button onClick={p.onInvitada}>simular invitada</button>
      </div>
    ) : null,
}))
jest.mock('@/components/dream-team/avance-etapa-control', () => ({
  AvanceEtapaControl: (p: Abrible & { servicioId: string; estadoActual: string; version: number; onSuccess: () => void }) =>
    p.abierto ? (
      <div role="dialog" aria-label="Cambiar etapa">
        {`etapa:${p.servicioId}:${p.estadoActual}:${p.version}`}
        <button onClick={p.onSuccess}>simular etapa</button>
      </div>
    ) : null,
}))
jest.mock('@/components/dream-team/turnos/turnos-servicio-dialog', () => ({
  TurnosServicioDialog: (p: Abrible & { servicioId: string; nombre: string; onGuardado: () => void }) =>
    p.abierto ? (
      <div role="dialog" aria-label="Turnos">
        {`turnos:${p.servicioId}:${p.nombre}`}
        <button onClick={p.onGuardado}>simular turnos</button>
      </div>
    ) : null,
}))
jest.mock('@/components/dream-team/solicitudes-cambio-area', () => ({
  SolicitudesCambioArea: (p: { solicitudes: { personaNombre: string }[]; onResuelta: () => void }) => (
    <section aria-label="Solicitudes de cambio de área">
      {p.solicitudes.map((s) => s.personaNombre).join(', ')}
      <button onClick={p.onResuelta}>simular resuelta</button>
    </section>
  ),
}))

jest.setTimeout(15_000)
let user: ReturnType<typeof userEvent.setup>
beforeEach(() => {
  replace.mockClear()
  refresh.mockClear()
  user = userEvent.setup({ delay: null })
})

const RESUMEN: ResumenPendientes = {
  areasSinServidores: 1,
  areasTotal: 33,
  sinCedula: 2,
  fechaNacimiento: 1,
  sinTelefono: 0,
  generoEstadoCivil: 0,
  fichasIncompletas: 2,
  sinCuenta: 2,
  invitacionesVencidas: 1,
  porActivar: 1,
  sinTurno: 6,
  solicitudes: 1,
  urgentes: 3,
  personasTotal: 214,
  personasEnOrden: 178,
  porcentaje: 83,
}

const ruta = 'DPS › Atención al Invitado › Anfitriones'
const persona = (tipo: string, id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  tipo,
  persona_id: id,
  persona_nombre: nombre,
  equipo_id: 'eq-anf',
  equipo_ruta: ruta,
  ficha_editable: true,
  invitable: true,
  tiene_correo: true,
  tiene_cuenta: false,
  ...extra,
})
const sinTurno = (i: number) =>
  persona('sin_turno', `t${i}`, `Turno ${i}`, { servicio_id: `st${i}`, servicio_estado: 'activo', servicio_version: 1 })

const FILAS = mapFilasPendientes([
  { tipo: 'area_sin_servidores', persona_id: null, equipo_id: 'eq-video', equipo_ruta: 'DPS › Producción › Mesa de video', detalle: { por_activar: 0 } },
  persona('invitacion_vencida', 'p-jose', 'José Piña', { desde: '2026-10-28T12:00:00Z' }),
  persona('sin_cedula', 'p-mari', 'Mariangel Pérez'),
  persona('sin_cedula', 'p-kevin', 'Kevin Mogollón'),
  persona('fecha_nacimiento', 'p-mari', 'Mariangel Pérez', { detalle: { motivo: 'marcador_1900' } }),
  persona('sin_cuenta', 'p-vale', 'Valentina Suárez', { detalle: { invitacion: 'sin_invitar' } }),
  persona('sin_cuenta', 'p-jose', 'José Piña', { detalle: { invitacion: 'vencida' } }),
  persona('por_activar', 'p-dani', 'Daniela Colmenárez', {
    servicio_id: 's-dani',
    servicio_estado: 'en_orientacion',
    servicio_version: 4,
    desde: '2026-09-12T12:00:00Z',
  }),
  ...[1, 2, 3, 4, 5, 6].map(sinTurno),
])

const SOLICITUD = { id: 'sol-1', personaNombre: 'Valentina Suárez', puedeResolver: true, estado: 'pendiente' } as SolicitudCambioArea

function props(overrides: Partial<PendientesClientProps> = {}): PendientesClientProps {
  return {
    resumen: RESUMEN,
    filas: FILAS,
    solicitudes: [SOLICITUD],
    rol: 'director',
    equiposAsignables: [{ id: 'eq-video', etiqueta: 'Mesa de video', ruta: ['DPS', 'Producción', 'Mesa de video'] }],
    rolesPorEquipo: {},
    grupoInicial: null,
    ...overrides,
  }
}

const grupo = (titulo: string) => screen.getByRole('region', { name: (nombre) => nombre.startsWith(titulo) })

describe('PendientesClient — what the director sees', () => {
  it('shows the hero, the "% en orden" and the urgentes', () => {
    render(<PendientesClient {...props()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Pendientes' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '83% en orden' })).toBeInTheDocument()
    const resumen = screen.getByRole('heading', { level: 1 }).nextElementSibling?.textContent
    expect(resumen).toBe('214 personas · 3 urgentes · 36 con algo pendiente')
  })

  it('lists the Urgente section and one group per alert type', () => {
    render(<PendientesClient {...props()} />)
    const urgente = screen.getByRole('region', { name: 'Urgente' })
    expect(within(urgente).getByRole('heading', { name: /Puestos sin servidores/ })).toBeInTheDocument()
    expect(within(urgente).getByRole('region', { name: 'Solicitudes de cambio de área' })).toHaveTextContent('Valentina Suárez')
    expect(within(urgente).getByRole('heading', { name: /Invitaciones vencidas/ })).toBeInTheDocument()
    const orden = screen.getByRole('region', { name: 'Para mantener todo en orden' })
    for (const titulo of ['Fichas incompletas', 'Por activar', 'Sin cuenta', 'Sin turno']) {
      expect(within(orden).getByRole('heading', { name: (nombre) => nombre.includes(titulo) })).toBeInTheDocument()
    }
  })

  it('shows each ficha row with everything it lacks, by the pill of what is missing', async () => {
    render(<PendientesClient {...props()} />)
    const fichas = grupo('Fichas incompletas')
    const pills = within(fichas).getByRole('group', { name: 'Qué falta' })
    expect(within(pills).getByRole('button', { name: /Sin cédula/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(fichas).getByText('Mariangel Pérez')).toBeInTheDocument()
    expect(within(fichas).getByText('Kevin Mogollón')).toBeInTheDocument()
    expect(within(fichas).getByText('Sin cédula · Nació en 1900')).toBeInTheDocument()

    await user.click(within(pills).getByRole('button', { name: /Fecha de nacimiento/ }))
    expect(within(fichas).queryByText('Kevin Mogollón')).not.toBeInTheDocument()
    expect(within(fichas).getByText('Nació en 1900 · Sin cédula')).toBeInTheDocument()
  })

  it('shows five rows of a long group and the rest on "Ver las N"', async () => {
    render(<PendientesClient {...props()} />)
    const turnos = grupo('Sin turno')
    expect(within(turnos).getAllByRole('button', { name: /^Turnos de / })).toHaveLength(5)
    await user.click(within(turnos).getByRole('button', { name: 'Ver las 6' }))
    expect(within(turnos).getAllByRole('button', { name: /^Turnos de / })).toHaveLength(6)
  })
})

describe('PendientesClient — the metrics filter', () => {
  it('leaves only the pressed group and writes it to the URL', async () => {
    render(<PendientesClient {...props()} />)
    const metricas = screen.getByRole('group', { name: 'Filtrar por grupo' })
    const fichas = within(metricas).getByRole('button', { name: /Fichas incompletas/ })
    await user.click(fichas)
    expect(fichas).toHaveAttribute('aria-pressed', 'true')
    expect(replace).toHaveBeenLastCalledWith('/dream-team/pendientes?grupo=fichas', { scroll: false })
    expect(screen.queryByRole('region', { name: 'Urgente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Sin turno/ })).not.toBeInTheDocument()
    expect(grupo('Fichas incompletas')).toBeInTheDocument()

    await user.click(fichas)
    expect(replace).toHaveBeenLastCalledWith('/dream-team/pendientes', { scroll: false })
    expect(screen.getByRole('region', { name: 'Urgente' })).toBeInTheDocument()
  })

  it('opens filtered from the URL, with every row of the group', () => {
    render(<PendientesClient {...props({ grupoInicial: 'turno' })} />)
    expect(within(screen.getByRole('group', { name: 'Filtrar por grupo' })).getByRole('button', { name: /Sin turno/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(grupo('Sin turno')).getAllByRole('button', { name: /^Turnos de / })).toHaveLength(6)
    expect(screen.queryByRole('heading', { name: /Fichas incompletas/ })).not.toBeInTheDocument()
  })

  it('"Cuenta" keeps the expired invitations and the people without account', async () => {
    render(<PendientesClient {...props()} />)
    await user.click(within(screen.getByRole('group', { name: 'Filtrar por grupo' })).getByRole('button', { name: /Sin cuenta/ }))
    expect(replace).toHaveBeenLastCalledWith('/dream-team/pendientes?grupo=cuenta', { scroll: false })
    expect(screen.getByRole('heading', { name: /Invitaciones vencidas/ })).toBeInTheDocument()
    expect(grupo('Sin cuenta')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Solicitudes de cambio de área' })).not.toBeInTheDocument()
  })
})

describe('PendientesClient — each row opens its existing action, then refreshes', () => {
  it('Asignar opens the assigner on that área', async () => {
    render(<PendientesClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Asignar servicio en Mesa de video' }))
    expect(screen.getByRole('dialog', { name: 'Asignar servicio' })).toHaveTextContent('equipo:eq-video solo:false nodos:eq-video')
    await user.click(screen.getByRole('button', { name: 'simular asignado' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('Reenviar and Invitar open the invitation panel of that person', async () => {
    render(<PendientesClient {...props()} />)
    await user.click(within(grupo('Invitaciones vencidas')).getByRole('button', { name: 'Reenviar invitación a José Piña' }))
    expect(screen.getByRole('dialog', { name: 'Invitar' })).toHaveTextContent('invitar:p-jose')
    await user.click(screen.getByRole('button', { name: 'simular invitada' }))
    expect(refresh).toHaveBeenCalledTimes(1)

    await user.click(within(grupo('Sin cuenta')).getByRole('button', { name: 'Invitar a Valentina Suárez' }))
    expect(screen.getByRole('dialog', { name: 'Invitar' })).toHaveTextContent('invitar:p-vale')
  })

  it('Cambiar etapa opens the stage dialog with the servicio and its version', async () => {
    render(<PendientesClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Cambiar etapa de Daniela Colmenárez' }))
    expect(screen.getByRole('dialog', { name: 'Cambiar etapa' })).toHaveTextContent('etapa:s-dani:en_orientacion:4')
    await user.click(screen.getByRole('button', { name: 'simular etapa' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('Turnos opens the shifts dialog of that servicio', async () => {
    render(<PendientesClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Turnos de Turno 2' }))
    expect(screen.getByRole('dialog', { name: 'Turnos' })).toHaveTextContent('turnos:st2:Turno 2')
    await user.click(screen.getByRole('button', { name: 'simular turnos' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('a resolved cambio-de-área request refreshes', async () => {
    render(<PendientesClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'simular resuelta' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('Editar ficha opens the panel at that person, "1 de N" over the pill list, and moves to the next', async () => {
    render(<PendientesClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Editar ficha de Mariangel Pérez' }))
    const panel = screen.getByRole('dialog', { name: 'Editar ficha' })
    expect(panel).toHaveTextContent('Mariangel Pérez · Sin cédula · 1 de 2')
    await user.click(within(panel).getByRole('button', { name: 'simular guardado' }))
    expect(refresh).toHaveBeenCalledTimes(1)
    await user.click(within(panel).getByRole('button', { name: 'simular siguiente' }))
    expect(screen.getByRole('dialog', { name: 'Editar ficha' })).toHaveTextContent('Kevin Mogollón · Sin cédula · 2 de 2')
    // The last one has no next.
    expect(screen.queryByRole('button', { name: 'simular siguiente' })).not.toBeInTheDocument()
  })

  it('"Completar una por una" starts at the first person of the pill', async () => {
    render(<PendientesClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Completar una por una' }))
    expect(screen.getByRole('dialog', { name: 'Editar ficha' })).toHaveTextContent('Mariangel Pérez · Sin cédula · 1 de 2')
  })
})

describe('PendientesClient — what each role may do', () => {
  it('a coordinador fixes fichas, shifts and invites but never changes the stage; the assigner only registers', async () => {
    render(<PendientesClient {...props({ rol: 'coordinador' })} />)
    expect(screen.queryByRole('button', { name: /^Cambiar etapa de / })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar ficha de Mariangel Pérez' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Asignar servicio en Mesa de video' }))
    expect(screen.getByRole('dialog', { name: 'Asignar servicio' })).toHaveTextContent('solo:true')
  })

  it('a read-only viewer sees the rows without actions', () => {
    render(<PendientesClient {...props({ rol: 'sin_permisos' })} />)
    expect(screen.queryByRole('button', { name: /^(Asignar servicio en|Editar ficha de|Turnos de|Cambiar etapa de) / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Completar una por una' })).not.toBeInTheDocument()
    expect(within(grupo('Sin turno')).getByText('Turno 1')).toBeInTheDocument()
  })

  it('hides Editar ficha where the database does not let the viewer edit, and Invitar where it does not let them invite', () => {
    const filas = mapFilasPendientes([
      persona('sin_cedula', 'p-x', 'Xiomara Ruiz', { ficha_editable: false }),
      persona('sin_cuenta', 'p-y', 'Yorman Díaz', { invitable: false, detalle: {} }),
    ])
    render(<PendientesClient {...props({ filas })} />)
    expect(screen.getByText('Xiomara Ruiz')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar ficha de Xiomara Ruiz' })).not.toBeInTheDocument()
    expect(screen.getByText('Yorman Díaz')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invitar a Yorman Díaz' })).not.toBeInTheDocument()
  })
})

describe('PendientesClient — empty states', () => {
  it('says so when the read failed', () => {
    render(<PendientesClient {...props({ resumen: null, filas: [], solicitudes: [] })} />)
    expect(screen.getByText('No se pudieron cargar los pendientes')).toBeInTheDocument()
  })

  it('says everything is in order when nothing is missing', () => {
    const vacio: ResumenPendientes = {
      ...RESUMEN,
      areasSinServidores: 0,
      sinCedula: 0,
      fechaNacimiento: 0,
      fichasIncompletas: 0,
      sinCuenta: 0,
      invitacionesVencidas: 0,
      porActivar: 0,
      sinTurno: 0,
      solicitudes: 0,
      urgentes: 0,
      personasEnOrden: 214,
      porcentaje: 100,
    }
    render(<PendientesClient {...props({ resumen: vacio, filas: [], solicitudes: [] })} />)
    expect(screen.getByText('Todo en orden')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Urgente' })).not.toBeInTheDocument()
  })
})

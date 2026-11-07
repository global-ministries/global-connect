/**
 * The group panel and the actionable alerts (T6 of odd/tasks/planner-gdv.md;
 * artboards 02 and 03; S2–S7, S10, S13, S22).
 *
 * The group panel opens from a card (its name or "Abrir"), from the alerts
 * ("Ir al grupo") and from the bank (the person's current group). Each field
 * applies on blur or selection as one pending edit with only the changed key
 * (S24: saved with the rest on "Guardar"), and a refusal shows in the field.
 * Members by role carry their warning chips and the actions change role,
 * Mover and back to the bank. Read-only for a segment the actor does
 * not edit; "Eliminar grupo" only while the group has not started. The alerts
 * panel applies a localidad suggestion ("Usar sugerida", one row at a time in
 * "Revisar sugerencias de localidad") and opens Ubicar for unplaced people.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlannerClient } from '@/components/grupos-vida/planner/planner-client'
import { bancoDe, enGrupo, grupo, LOCALIDADES, persona } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { DatosPlanner } from '@/lib/platform/grupos-vida/planner/datos'
import type { Bloqueo, GrupoTablero, TemporadasPlanner } from '@/lib/platform/grupos-vida/planner'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: jest.fn(), replace: jest.fn() }) }))

const acciones = {
  guardarCambiosAction: jest.fn(),
  deshacerPasoAction: jest.fn(),
  marcarSegmentoAction: jest.fn(),
}
jest.mock('@/app/(auth)/grupos-vida/planificar/actions', () => ({
  guardarCambiosAction: (...a: unknown[]) => acciones.guardarCambiosAction(...a),
  deshacerPasoAction: (...a: unknown[]) => acciones.deshacerPasoAction(...a),
  marcarSegmentoAction: (...a: unknown[]) => acciones.marcarSegmentoAction(...a),
}))

const PASO_OK = { ok: true, datos: { pasoId: 'p-nuevo', descripcion: 'editó el grupo', segmentosReabiertos: [] } }

const TEMPORADA = {
  id: 't-2026-ii',
  nombre: '2026-II',
  fecha_inicio: '2026-10-12',
  fecha_fin: null,
  estado: 'planificacion',
  activa: false,
  cohorte: 'II' as const,
  origen_id: 't-2025-ii',
  origen_nombre: '2025 - II',
}

const HECTOR = { segmento_lider_id: 'sl-hector', usuario_id: 'u-hector', nombre: 'Héctor', apellido: 'Linárez' }
const NANCY = { segmento_lider_id: 'sl-nancy', usuario_id: 'u-nancy', nombre: 'Nancy', apellido: 'Linárez' }
const JESUS = { segmento_lider_id: 'sl-jesus', usuario_id: 'u-jesus', nombre: 'Jesús', apellido: 'Escobar' }

const TORREALBA: GrupoTablero = grupo({
  grupo_id: 'g-torrealba',
  nombre: 'Grupo #9 Familia Torrealba',
  localidad_id: null,
  localidad_nombre: null,
  localidad_municipio_id: null,
  localidad_municipio_nombre: null,
  capacidad_maxima: 16,
  directores: [HECTOR, NANCY],
  lideres: [
    { ...enGrupo('l1'), nombre: 'José', apellido: 'Torrealba' },
    { ...enGrupo('l2'), nombre: 'Mariela', apellido: 'Torrealba' },
  ],
  aprendices: [{ ...enGrupo('a1'), nombre: 'Leonardo', apellido: 'Mujica' }],
  miembros: [{ ...enGrupo('pedro', ['l1']), nombre: 'Pedro', apellido: 'Gil' }, enGrupo('m2'), enGrupo('m3')],
})

const VALIENTES: GrupoTablero = grupo({
  grupo_id: 'g-valientes',
  nombre: 'Mujeres Valientes',
  segmento_id: 'seg-muj',
  segmento_nombre: 'Mujeres +36',
  localidad_id: 'loc-bqto',
  localidad_nombre: 'Barquisimeto',
  localidad_municipio_id: 'mun-iri',
  localidad_municipio_nombre: 'Iribarren',
  capacidad_maxima: 14,
  activo: true,
  estado_ciclo: 'activo',
  lideres: [],
  aprendices: [enGrupo('a2')],
  miembros: [enGrupo('m4')],
})

const sinGrupo = { grupo_actual_id: null, grupo_actual_nombre: null, grupo_actual_rol: null, grupo_actual_segmento_id: null, grupos_en_temporada: 0 }
const enTorrealba = { grupo_actual_id: 'g-torrealba', grupo_actual_nombre: TORREALBA.nombre, grupo_actual_segmento_id: 'seg-mat' }

const PEDRO = persona({ usuario_id: 'pedro', nombre: 'Pedro', apellido: 'Gil', conyuge_id: 'ana', ...enTorrealba })
const M2 = persona({ usuario_id: 'm2', municipio_id: null, ...enTorrealba })
const ANA = persona({ usuario_id: 'ana', nombre: 'Ana', apellido: 'Gil', conyuge_id: 'pedro', ...sinGrupo })
// Héctor and Nancy are spouses in the bank, so they are one director option.
const LINAREZ = [
  persona({ usuario_id: 'u-hector', nombre: 'Héctor', apellido: 'Linárez', conyuge_id: 'u-nancy', ...sinGrupo }),
  persona({ usuario_id: 'u-nancy', nombre: 'Nancy', apellido: 'Linárez', conyuge_id: 'u-hector', ...sinGrupo }),
]
const LUIS = persona({ usuario_id: 'luis', nombre: 'Luis', apellido: 'Gil', origen_grupo_id: 'g-viejo', origen_grupo_nombre: 'Grupo Viejo', ...sinGrupo })

const DIRECTOR_GENERAL: TemporadasPlanner = {
  usuario_id: 'u-dg',
  ve_todos_los_segmentos: true,
  puede_publicar: true,
  puede_crear_temporada: true,
  segmentos_editables: ['seg-mat', 'seg-muj'],
  segmentos: [
    { id: 'seg-mat', nombre: 'Matrimonios', directores: [HECTOR, NANCY, JESUS] },
    { id: 'seg-muj', nombre: 'Mujeres +36', directores: [] },
  ],
  temporadas: [TEMPORADA],
}

const BLOQUEOS: Bloqueo[] = [
  { tipo: 'sin_localidad', segmento_id: 'seg-mat', grupo_id: 'g-torrealba', grupo_nombre: TORREALBA.nombre, usuario_id: null, detalle: '' },
  { tipo: 'sin_lider', segmento_id: 'seg-muj', grupo_id: 'g-valientes', grupo_nombre: 'Mujeres Valientes', usuario_id: null, detalle: '' },
]

const datos = (parcial: Partial<DatosPlanner> = {}): DatosPlanner => ({
  capacidades: DIRECTOR_GENERAL,
  temporada: TEMPORADA,
  grupos: [TORREALBA, VALIENTES],
  banco: bancoDe([TORREALBA, VALIENTES], [PEDRO, M2, ANA, LUIS, ...LINAREZ]),
  bloqueos: BLOQUEOS,
  estado: null,
  localidades: LOCALIDADES,
  faltantes: [],
  ...parcial,
})

const tarjeta = (nombre: string) => screen.getByRole('article', { name: nombre })
const panelGrupo = (nombre = TORREALBA.nombre) => screen.getByRole('dialog', { name: nombre })
const seccion = (nombre: string) => within(panelGrupo()).getByRole('region', { name: nombre })

async function abrirTorrealba() {
  await userEvent.click(within(tarjeta(TORREALBA.nombre)).getByRole('button', { name: TORREALBA.nombre }))
  return panelGrupo()
}

async function abrirAlertas() {
  await userEvent.click(screen.getByRole('button', { name: /^Alertas:/ }))
  return screen.getByRole('dialog', { name: 'Alertas de 2026-II' })
}

/** Closes the open panels, clicks the header "Guardar" and returns the changes it sent (S24). */
async function pendientes() {
  while (screen.queryAllByRole('dialog').length > 0) await userEvent.keyboard('{Escape}')
  const guardar = screen.getByRole('button', { name: 'Guardar' })
  if (guardar.hasAttribute('disabled')) return []
  await userEvent.click(guardar)
  await waitFor(() => expect(acciones.guardarCambiosAction).toHaveBeenCalled())
  return (acciones.guardarCambiosAction.mock.calls.at(-1) as [{ cambios: unknown[] }])[0].cambios
}

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  acciones.deshacerPasoAction.mockResolvedValue(PASO_OK)
  acciones.marcarSegmentoAction.mockResolvedValue(PASO_OK)
  acciones.guardarCambiosAction.mockImplementation(async ({ cambios }: { cambios: unknown[] }) => ({ ok: true, datos: { guardados: cambios.length, pasos: [], gruposCreados: {} } }))
})

describe('opening the group panel', () => {
  it('opens from the card name and from "Abrir", with every section', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    await abrirTorrealba()
    for (const nombre of ['Nombre', 'Localidad', 'Reunión', 'Directores de etapa', 'Integrantes']) {
      expect(seccion(nombre)).toBeInTheDocument()
    }
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: TORREALBA.nombre })).not.toBeInTheDocument())

    await userEvent.click(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: 'Abrir Mujeres Valientes' }))
    expect(panelGrupo('Mujeres Valientes')).toBeInTheDocument()
  })

  it('opens from the bank, on the person current group', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const banco = screen.getByRole('complementary', { name: 'Banco de personas' })
    await userEvent.click(within(banco).getByRole('button', { name: /^Sin ubicar/ }))
    await userEvent.click(within(banco).getByRole('button', { name: 'Abrir el grupo de Pedro Gil' }))

    expect(panelGrupo()).toBeInTheDocument()
  })
})

describe('sections from the data (S3, S4, S5)', () => {
  it('shows the name with its suggestion, the label and the full name', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    const nombre = seccion('Nombre')
    expect(within(nombre).getByLabelText('Nombre del grupo')).toHaveValue(TORREALBA.nombre)
    expect(within(nombre).getByRole('button', { name: 'Usar sugerencia: Cabudare Matrimonios 1' })).toBeInTheDocument()
    expect(within(nombre).getByText('Matrimonios · Sin localidad')).toBeInTheDocument()
    expect(within(nombre).getByText('Grupo #9 Familia Torrealba · Matrimonios · Sin localidad')).toBeInTheDocument()
  })

  it('suggests the localidad with its reason and shows where the members live', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    const localidad = seccion('Localidad')
    expect(within(localidad).getByLabelText('Localidad del grupo')).toHaveValue('')
    expect(within(localidad).getByText('Sugerido: Cabudare — los líderes y 3 de 4 viven en Palavecino')).toBeInTheDocument()
    expect(within(localidad).getByText('Sin localidad no se puede publicar la temporada.')).toBeInTheDocument()
    const viven = within(localidad).getByRole('list', { name: 'Dónde viven los integrantes' })
    expect(within(viven).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Palavecino5, con los líderes', 'Sin dirección1'])
  })

  it('shows the meeting, the directors of the segment and the members by role with their chips', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    const reunion = seccion('Reunión')
    expect(within(reunion).getByLabelText('Día')).toHaveValue('Jueves')
    expect(within(reunion).getByLabelText('Hora')).toHaveValue('19:30')
    expect(within(reunion).getByLabelText('Capacidad')).toHaveValue(16)

    const directores = within(seccion('Directores de etapa')).getByRole('group', { name: 'Directores de etapa' })
    expect(within(directores).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Héctor y Nancy Linárez', 'true'],
      ['Jesús Escobar', 'false'],
    ])

    const integrantes = seccion('Integrantes')
    expect(within(integrantes).getByRole('region', { name: 'Líderes' })).toHaveTextContent('José Torrealba')
    expect(within(integrantes).getByRole('region', { name: 'Aprendiz' })).toHaveTextContent('Leonardo Mujica')
    const pedro = within(integrantes).getByRole('listitem', { name: 'Pedro Gil' })
    expect(within(pedro).getByText('Repite líder')).toBeInTheDocument()
    expect(within(within(integrantes).getByRole('listitem', { name: 'm2 Pérez' })).getByText('Sin dirección')).toBeInTheDocument()
  })
})

describe('each field as one pending edit (S3, S4, S24)', () => {
  it('applies the name on blur with only that key, and nothing when it did not change', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    const campo = within(seccion('Nombre')).getByLabelText('Nombre del grupo')
    await userEvent.click(campo)
    await userEvent.tab()
    expect(screen.queryByRole('button', { name: /sin guardar$/ })).not.toBeInTheDocument()

    await userEvent.clear(campo)
    await userEvent.type(campo, 'Los Torrealba')
    await userEvent.tab()

    expect(within(panelGrupo('Los Torrealba')).getByRole('status', { name: 'Cambios del grupo' })).toHaveTextContent('Cambiaste el nombre. Sin guardar.')
    expect(acciones.guardarCambiosAction).not.toHaveBeenCalled()
    expect(await pendientes()).toEqual([{ tipo: 'editar', grupo: 'g-torrealba', cambios: { nombre: 'Los Torrealba' } }])
  })

  it('applies the name suggestion as one edit', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    await userEvent.click(within(seccion('Nombre')).getByRole('button', { name: 'Usar sugerencia: Cabudare Matrimonios 1' }))

    expect(within(panelGrupo('Cabudare Matrimonios 1')).getByLabelText('Nombre del grupo')).toHaveValue('Cabudare Matrimonios 1')
    expect(await pendientes()).toEqual([{ tipo: 'editar', grupo: 'g-torrealba', cambios: { nombre: 'Cabudare Matrimonios 1' } }])
  })

  it('refuses a blank name in place without adding a change', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    await userEvent.clear(within(seccion('Nombre')).getByLabelText('Nombre del grupo'))
    await userEvent.tab()

    expect(within(seccion('Nombre')).getByRole('alert')).toHaveTextContent('El grupo debe tener nombre.')
    expect(await pendientes()).toEqual([])
  })

  it('refuses a name another group of the segment already has', async () => {
    const otro = { ...TORREALBA, grupo_id: 'g-otro', nombre: 'Los Rivas', lideres: [], aprendices: [], miembros: [] }
    render(<PlannerClient datos={datos({ grupos: [TORREALBA, otro, VALIENTES] })} pasos={[]} />)
    await abrirTorrealba()

    const campo = within(seccion('Nombre')).getByLabelText('Nombre del grupo')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'los rivas')
    await userEvent.tab()

    expect(within(seccion('Nombre')).getByRole('alert')).toHaveTextContent('Ya hay un grupo llamado «los rivas» en Matrimonios.')
    expect(await pendientes()).toEqual([])
  })

  it('applies the localidad on selection and with "Usar <localidad>", one edit per field', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    await userEvent.selectOptions(within(seccion('Localidad')).getByLabelText('Localidad del grupo'), 'loc-bqto')
    expect(panelGrupo()).toHaveAccessibleDescription('Matrimonios · Barquisimeto')

    await userEvent.click(within(seccion('Localidad')).getByRole('button', { name: 'Usar Cabudare' }))
    expect(await pendientes()).toEqual([{ tipo: 'editar', grupo: 'g-torrealba', cambios: { localidad_id: 'loc-cab' } }])
  })

  it('applies the day on selection, at once in the panel', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    await userEvent.selectOptions(within(seccion('Reunión')).getByLabelText('Día'), 'Martes')

    expect(within(seccion('Reunión')).getByLabelText('Día')).toHaveValue('Martes')
    expect(within(seccion('Reunión')).queryByText('Guardando…')).not.toBeInTheDocument()
    expect(await pendientes()).toEqual([{ tipo: 'editar', grupo: 'g-torrealba', cambios: { dia_reunion: 'Martes' } }])
  })

  it('applies the capacity and the hour on blur, and refuses an invalid capacity in place', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    const capacidad = within(seccion('Reunión')).getByLabelText('Capacidad')
    await userEvent.clear(capacidad)
    await userEvent.type(capacidad, '20')
    await userEvent.tab()

    const hora = within(seccion('Reunión')).getByLabelText('Hora')
    await userEvent.clear(hora)
    await userEvent.type(hora, '20:00')
    await userEvent.tab()

    await userEvent.clear(capacidad)
    await userEvent.type(capacidad, '0')
    await userEvent.tab()
    expect(within(seccion('Reunión')).getByRole('alert')).toHaveTextContent('La capacidad debe ser un número entero mayor que 0.')

    expect(await pendientes()).toEqual([
      { tipo: 'editar', grupo: 'g-torrealba', cambios: { capacidad_maxima: 20 } },
      { tipo: 'editar', grupo: 'g-torrealba', cambios: { hora_reunion: '20:00' } },
    ])
  })

  it('applies the directors as one list, a couple in or out together', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    const directores = within(seccion('Directores de etapa')).getByRole('group', { name: 'Directores de etapa' })
    await userEvent.click(within(directores).getByRole('button', { name: 'Jesús Escobar' }))

    expect(within(directores).getByRole('button', { name: 'Jesús Escobar' })).toHaveAttribute('aria-pressed', 'true')
    expect(await pendientes()).toEqual([{ tipo: 'editar', grupo: 'g-torrealba', cambios: { director_etapa_ids: ['u-hector', 'u-nancy', 'u-jesus'] } }])
  })
})

describe('members (S2, S7)', () => {
  it('changes the role of a member as one move with the new role', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    await userEvent.selectOptions(within(seccion('Integrantes')).getByLabelText('Rol de m2 Pérez'), 'aprendiz')

    expect(within(within(seccion('Integrantes')).getByRole('listitem', { name: 'm2 Pérez' })).getByText('Sin guardar')).toBeInTheDocument()
    expect(await pendientes()).toEqual([{ tipo: 'mover', usuarios: ['m2'], grupo: 'g-torrealba', rol: 'aprendiz' }])
  })

  it('sends a member back to the bank and opens Mover', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await abrirTorrealba()

    await userEvent.click(within(seccion('Integrantes')).getByRole('button', { name: 'Devolver a m3 Pérez al banco' }))
    expect(within(seccion('Integrantes')).queryByRole('listitem', { name: 'm3 Pérez' })).not.toBeInTheDocument()

    await userEvent.click(within(seccion('Integrantes')).getByRole('button', { name: 'Mover a Pedro Gil' }))
    expect(screen.getByRole('dialog', { name: 'Mover a Pedro Gil' })).toBeInTheDocument()
    expect(await pendientes()).toEqual([{ tipo: 'mover', usuarios: ['m3'], grupo: null, rol: null }])
  })
})

describe('scope and deleting (S10, S22)', () => {
  it('is read-only for a group of a segment the actor does not edit', async () => {
    const capacidades = { ...DIRECTOR_GENERAL, segmentos_editables: ['seg-muj'] }
    render(<PlannerClient datos={datos({ capacidades })} pasos={[]} />)
    await abrirTorrealba()

    const panel = panelGrupo()
    expect(within(panel).getByText(/Solo lectura/)).toBeInTheDocument()
    expect(within(panel).getByLabelText('Nombre del grupo')).toBeDisabled()
    expect(within(panel).getByLabelText('Localidad del grupo')).toBeDisabled()
    expect(within(panel).getByLabelText('Día')).toBeDisabled()
    expect(within(panel).getByLabelText('Capacidad')).toBeDisabled()
    expect(within(panel).queryByRole('button', { name: /^Usar/ })).not.toBeInTheDocument()
    expect(within(panel).queryByLabelText(/^Rol de/)).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /^Mover a/ })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Eliminar grupo' })).not.toBeInTheDocument()
  })

  it('offers "Eliminar grupo" only for a group that has not started', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    await abrirTorrealba()
    await userEvent.click(within(panelGrupo()).getByRole('button', { name: 'Eliminar grupo' }))
    expect(screen.getByRole('alertdialog', { name: `¿Eliminar ${TORREALBA.nombre}?` })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await userEvent.click(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: 'Abrir Mujeres Valientes' }))
    expect(within(panelGrupo('Mujeres Valientes')).queryByRole('button', { name: 'Eliminar grupo' })).not.toBeInTheDocument()
    expect(within(panelGrupo('Mujeres Valientes')).getByText(/Los cambios quedan sin guardar hasta que toques «Guardar»/)).toBeInTheDocument()
  })
})

describe('actionable alerts (03)', () => {
  it('"Ir al grupo" opens the group panel', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const alertas = await abrirAlertas()
    await userEvent.click(within(within(alertas).getByRole('region', { name: '1 grupo sin localidad' })).getByRole('button', { name: 'Ir al grupo' }))

    expect(await screen.findByRole('dialog', { name: TORREALBA.nombre })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Alertas de 2026-II' })).not.toBeInTheDocument()
  })

  it('"Usar sugerida" applies the suggested localidad as one edit, and the blocker goes away at once', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const alertas = await abrirAlertas()
    const sinLocalidad = within(alertas).getByRole('region', { name: '1 grupo sin localidad' })
    expect(sinLocalidad).toHaveTextContent('Sugerida: Cabudare · los líderes y 3 de 4 viven en Palavecino')
    await userEvent.click(within(sinLocalidad).getByRole('button', { name: 'Usar sugerida' }))

    expect(within(alertas).getByRole('region', { name: '0 grupos sin localidad' })).toHaveTextContent('Todo en orden')
    expect(await pendientes()).toEqual([{ tipo: 'editar', grupo: 'g-torrealba', cambios: { localidad_id: 'loc-cab' } }])
  })

  it('reviews the localidad suggestions one row at a time', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const alertas = await abrirAlertas()
    const revisar = within(alertas).getByRole('button', { name: 'Revisar sugerencias de localidad' })
    expect(revisar).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(revisar)
    expect(revisar).toHaveAttribute('aria-expanded', 'true')

    const lista = within(alertas).getByRole('list', { name: 'Sugerencias de localidad' })
    await userEvent.click(within(lista).getByRole('button', { name: `Usar Cabudare en ${TORREALBA.nombre}` }))

    // Applied: the group has a localidad now, so it leaves the blockers.
    expect(within(alertas).queryByRole('list', { name: 'Sugerencias de localidad' })).not.toBeInTheDocument()
    expect(await pendientes()).toEqual([{ tipo: 'editar', grupo: 'g-torrealba', cambios: { localidad_id: 'loc-cab' } }])
  })

  it('"Ubicar" on an unplaced person opens the Ubicar dialog', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const alertas = await abrirAlertas()
    const sinUbicar = within(alertas).getByRole('region', { name: '1 persona de 2025 - II sin ubicar' })
    await userEvent.click(within(sinUbicar).getByRole('button', { name: 'Ubicar a Luis Gil' }))

    expect(screen.getByRole('dialog', { name: 'Ubicar a Luis Gil' })).toBeInTheDocument()
  })

  it('offers no "Usar sugerida" for a group the actor does not edit', async () => {
    const capacidades = { ...DIRECTOR_GENERAL, segmentos_editables: ['seg-muj'] }
    render(<PlannerClient datos={datos({ capacidades })} pasos={[]} />)

    const alertas = await abrirAlertas()
    expect(within(within(alertas).getByRole('region', { name: '1 grupo sin localidad' })).queryByRole('button', { name: 'Usar sugerida' })).not.toBeInTheDocument()
  })
})

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { VoluntariosClient } from '@/components/ninos/voluntarios-client'
import type { FilaVoluntario, TurnoVoluntarios } from '@/lib/platform/ninos/voluntarios'

const rpc = jest.fn()
const replace = jest.fn()
const toastError = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))
jest.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: jest.fn(), info: jest.fn() } }))

const turnos: TurnoVoluntarios[] = [
  { id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1, dia_semana: 0, campus_id: 'c1', campus: 'Campus Uno' },
]

function fila(parcial: Partial<FilaVoluntario> & Pick<FilaVoluntario, 'servicio_id' | 'nombre'>): FilaVoluntario {
  return {
    apellido: 'Prueba',
    area_id: 'aw',
    area: 'Waumba Land',
    equipo_id: 'em',
    equipo: 'Maternal',
    rol: 'Voluntario',
    esperado: true,
    sin_turno: false,
    estado: null,
    ...parcial,
  }
}

const voluntarios: FilaVoluntario[] = [
  fila({ servicio_id: 's1', nombre: 'Ana' }),
  fila({ servicio_id: 's2', nombre: 'Luis', estado: 'presente' }),
  fila({ servicio_id: 's3', nombre: 'María', equipo_id: 'ep', equipo: 'Producción', rol: 'Coordinador' }),
  fila({ servicio_id: 's4', nombre: 'José', esperado: false }),
  fila({ servicio_id: 's5', nombre: 'Carla', equipo_id: 'ep', equipo: 'Producción', esperado: false, sin_turno: true }),
  fila({ servicio_id: 's6', nombre: 'Pedro', area_id: 'au', area: 'UpStreet', equipo_id: 'el', equipo: 'Líderes' }),
]

function planilla(extra: Record<string, unknown> = {}) {
  return {
    turno_id: 't9',
    turno: 'Domingo 9:00',
    fecha: '2026-10-04',
    hoy: '2026-10-10',
    editable: true,
    areas: [
      { id: 'au', nombre: 'UpStreet' },
      { id: 'aw', nombre: 'Waumba Land' },
    ],
    voluntarios,
    ...extra,
  }
}

let respuestaMarcar: { data: unknown; error: unknown } = { data: { cambiados: 1 }, error: null }

beforeEach(() => {
  rpc.mockReset()
  replace.mockReset()
  toastError.mockReset()
  respuestaMarcar = { data: { cambiados: 1 }, error: null }
  rpc.mockImplementation((nombre: string) =>
    Promise.resolve(nombre === 'ninos_voluntarios_planilla' ? { data: planilla(), error: null } : respuestaMarcar),
  )
})

function renderVoluntarios(areaId: string | null = 'aw') {
  return render(
    <VoluntariosClient turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-10-04' }} areaId={areaId} hoy="2026-10-10" />,
  )
}

const filaDe = (id: string) => screen.getByTestId(`voluntario-${id}`)
const boton = (id: string, nombre: string) => within(filaDe(id)).getByRole('button', { name: nombre })
const contador = (etiqueta: string) => within(screen.getByRole('region', { name: 'Resumen' })).getByTestId(`contador-${etiqueta}`)

describe('VoluntariosClient', () => {
  it('loads the roster of the service and counts the selected area', async () => {
    renderVoluntarios()
    await screen.findByTestId('voluntario-s1')
    expect(rpc).toHaveBeenCalledWith('ninos_voluntarios_planilla', { p_turno_id: 't9', p_fecha: '2026-10-04' })
    expect(contador('esperados')).toHaveTextContent('3')
    expect(contador('presentes')).toHaveTextContent('1')
    expect(contador('avisos')).toHaveTextContent('0')
    expect(contador('faltas')).toHaveTextContent('0')
    expect(contador('sin-marcar')).toHaveTextContent('2')
    expect(screen.getByRole('heading', { name: 'Maternal' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Producción' })).toBeInTheDocument()
    expect(screen.queryByTestId('voluntario-s6')).not.toBeInTheDocument()
  })

  it('marks optimistically and sends the mark', async () => {
    renderVoluntarios()
    await screen.findByTestId('voluntario-s1')
    fireEvent.click(boton('s1', 'Presente'))
    expect(boton('s1', 'Presente')).toHaveAttribute('aria-pressed', 'true')
    expect(contador('presentes')).toHaveTextContent('2')
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_voluntarios_marcar', {
        p_turno_id: 't9',
        p_fecha: '2026-10-04',
        p_servicio_ids: ['s1'],
        p_estado: 'presente',
        p_solo_sin_marcar: false,
      }),
    )
  })

  it('tapping the active estado clears the mark', async () => {
    renderVoluntarios()
    await screen.findByTestId('voluntario-s2')
    fireEvent.click(boton('s2', 'Presente'))
    expect(boton('s2', 'Presente')).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_voluntarios_marcar', expect.objectContaining({ p_servicio_ids: ['s2'], p_estado: null })),
    )
  })

  it('rolls back and shows an error toast when the mark fails', async () => {
    respuestaMarcar = { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    renderVoluntarios()
    await screen.findByTestId('voluntario-s1')
    fireEvent.click(boton('s1', 'Avisó'))
    expect(boton('s1', 'Avisó')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(boton('s1', 'Avisó')).toHaveAttribute('aria-pressed', 'false'))
    expect(toastError).toHaveBeenCalledWith('Error', { description: expect.stringMatching(/No tienes permiso/) })
  })

  it('"Marcar el resto como Faltó" marks only the unmarked expected volunteers of that equipo', async () => {
    renderVoluntarios()
    await screen.findByTestId('voluntario-s1')
    const maternal = screen.getByTestId('equipo-em')
    fireEvent.click(within(maternal).getByRole('button', { name: /Marcar el resto como Faltó/ }))
    fireEvent.click(within(maternal).getByRole('button', { name: 'Sí, marcar' }))
    expect(boton('s1', 'Faltó')).toHaveAttribute('aria-pressed', 'true')
    expect(boton('s2', 'Presente')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_voluntarios_marcar', {
        p_turno_id: 't9',
        p_fecha: '2026-10-04',
        p_servicio_ids: ['s1'],
        p_estado: 'ausente',
        p_solo_sin_marcar: true,
      }),
    )
  })

  it('keeps volunteers who are not expected in collapsed groups', async () => {
    renderVoluntarios()
    await screen.findByTestId('voluntario-s1')
    const otros = screen.getByRole('button', { name: /Otros voluntarios \(1\)/ })
    expect(otros).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('voluntario-s4')).not.toBeInTheDocument()
    fireEvent.click(otros)
    expect(screen.getByTestId('voluntario-s4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Sin turno asignado \(1\)/ }))
    fireEvent.click(boton('s5', 'Presente'))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_voluntarios_marcar', expect.objectContaining({ p_servicio_ids: ['s5'], p_estado: 'presente' })),
    )
  })

  it('explains an area where nobody has a turno and opens "Sin turno asignado" so marking can start', async () => {
    const sinTurnos = [
      fila({ servicio_id: 's7', nombre: 'Rosa', esperado: false, sin_turno: true }),
      fila({ servicio_id: 's8', nombre: 'Elena', esperado: false, sin_turno: true }),
    ]
    rpc.mockImplementation((nombre: string) =>
      Promise.resolve(
        nombre === 'ninos_voluntarios_planilla'
          ? { data: planilla({ areas: [{ id: 'aw', nombre: 'Waumba Land' }], voluntarios: sinTurnos }), error: null }
          : respuestaMarcar,
      ),
    )
    renderVoluntarios()
    expect(await screen.findByText(/todavía no tiene turno asignado/)).toBeInTheDocument()
    expect(screen.getByText(/Mi equipo/)).toBeInTheDocument()
    const grupo = screen.getByRole('button', { name: /Sin turno asignado \(2\)/ })
    expect(grupo).toHaveAttribute('aria-expanded', 'true')
    expect(contador('esperados')).toHaveTextContent('0')
    fireEvent.click(boton('s7', 'Presente'))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_voluntarios_marcar', expect.objectContaining({ p_servicio_ids: ['s7'], p_estado: 'presente' })),
    )
    fireEvent.click(grupo)
    expect(grupo).toHaveAttribute('aria-expanded', 'false')
  })

  it('filters by name and opens the groups with matches', async () => {
    renderVoluntarios()
    await screen.findByTestId('voluntario-s1')
    fireEvent.change(screen.getByLabelText('Buscar voluntario'), { target: { value: 'carla' } })
    expect(screen.getByTestId('voluntario-s5')).toBeInTheDocument()
    expect(screen.queryByTestId('voluntario-s1')).not.toBeInTheDocument()
  })

  it('switches between the areas the caller may mark and keeps it in the URL', async () => {
    renderVoluntarios()
    await screen.findByTestId('voluntario-s1')
    fireEvent.click(screen.getByRole('button', { name: 'UpStreet' }))
    expect(screen.getByTestId('voluntario-s6')).toBeInTheDocument()
    expect(screen.queryByTestId('voluntario-s1')).not.toBeInTheDocument()
    expect(replace).toHaveBeenLastCalledWith('/ninos/voluntarios?turno=t9&fecha=2026-10-04&area=au')
  })

  it('is read-only outside the marking window', async () => {
    rpc.mockImplementation(() => Promise.resolve({ data: planilla({ editable: false }), error: null }))
    renderVoluntarios()
    await screen.findByTestId('voluntario-s1')
    expect(boton('s1', 'Presente')).toBeDisabled()
    expect(screen.getByText(/Solo se puede marcar hoy o hasta 14 días atrás/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Marcar el resto como Faltó/ })).not.toBeInTheDocument()
  })

  it('explains a date that is not a day of the service', async () => {
    rpc.mockImplementation(() => Promise.resolve({ data: null, error: { code: '22023', message: 'fecha_invalida' } }))
    renderVoluntarios()
    expect(await screen.findByRole('alert')).toHaveTextContent(/no es día de este servicio/)
  })

  it('refreshes when the window regains focus', async () => {
    renderVoluntarios()
    await screen.findByTestId('voluntario-s1')
    const antes = rpc.mock.calls.length
    await act(async () => {
      fireEvent(window, new Event('focus'))
    })
    await waitFor(() => expect(rpc.mock.calls.length).toBeGreaterThan(antes))
  })
})

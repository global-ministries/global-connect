/**
 * The one-screen registration at the desk (odd/tasks/ninos-v2.md N4b, S5–S6, prototype 04):
 * "Registrar y dar ingreso" chains the existing registration and check-in.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { PanelesCheckin } from '@/components/ninos/checkin/paneles-checkin'
import { RegistroMesa } from '@/components/ninos/registro-rapido/registro-mesa'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
const fetchMock = jest.fn()

const PREESCOLAR = '00000000-0000-4000-8000-000000000002'
const salones: SalonNivel[] = [
  { id: PREESCOLAR, nombre: 'Preescolar', area: 'waumba', edadMinMeses: 36, edadMaxMeses: 71, gradoMin: null, gradoMax: null, esNecesidadesEspeciales: false, activo: true, orden: 1 },
]
const ingreso = { turnoId: 't9', fecha: '2026-11-01' }
const fila = { nino_id: 'n1', salon_id: PREESCOLAR, codigo: '5172', ocupacion: 17, capacidad: 18, sobre_capacidad: false }

beforeEach(() => {
  rpc.mockReset()
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function responder(registro: { data: unknown; error: unknown } = { data: { padre_id: 'p1', padre_nuevo: true, hijos: ['n1'] }, error: null }) {
  rpc.mockImplementation((fn: string) => {
    if (fn === 'ninos_buscar_padre' || fn === 'ninos_hijos_coincidencias') return Promise.resolve({ data: [], error: null })
    return Promise.resolve(registro)
  })
}

const ingresoOk = () => fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ filas: [fila] }) })

const elegir = (grupo: string, opcion: string) => fireEvent.click(within(screen.getByRole('group', { name: grupo })).getByRole('button', { name: opcion }))
const escribir = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })

function llenar() {
  escribir('Nombre del representante', 'María')
  escribir('Apellido del representante', 'Linárez')
  escribir('Teléfono', '04145123388')
  elegir('Género del representante', 'Mamá')
  escribir('Nombre del niño 1', 'Camila')
  escribir('Fecha de nacimiento del niño 1', '2022-02-09')
  elegir('Género del niño 1', 'Niña')
  elegir('¿Camila tiene alergias?', 'Sí')
  escribir('Alergias de Camila', 'Maní')
}

const registros = () => rpc.mock.calls.filter(([fn]) => fn === 'ninos_registrar_familia_mesa' || fn === 'ninos_registrar_familia')

describe('RegistroMesa', () => {
  it('without a service it keeps the former single action', () => {
    render(<RegistroMesa salones={salones} onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Registrar familia' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Registrar y dar ingreso/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Solo registrar' })).not.toBeInTheDocument()
  })

  it('shows the salón live and health inline; health answers are optional at the desk', () => {
    render(<RegistroMesa salones={salones} ingreso={ingreso} onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    escribir('Fecha de nacimiento del niño 1', '2022-02-09')
    expect(screen.getByText('Preescolar', { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar y dar ingreso · 1' })).toBeInTheDocument()
  })

  it('"Registrar y dar ingreso" registers, checks the new children in and shows the code with the optional invitation', async () => {
    responder()
    ingresoOk()
    const onRegistrada = jest.fn()
    render(<RegistroMesa salones={salones} ingreso={ingreso} onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    llenar()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y dar ingreso · 1' }))

    expect(await screen.findByText('5172')).toBeInTheDocument()
    expect(registros()).toHaveLength(1)
    expect(registros()[0]).toEqual([
      'ninos_registrar_familia_mesa',
      { p: expect.objectContaining({ padre: expect.objectContaining({ nombre: 'María', genero: 'Femenino' }), hijos: [expect.objectContaining({ nombre: 'Camila', alergias: 'Maní', salon_preferido_id: PREESCOLAR })] }) },
    ])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ninos/checkin')
    expect(JSON.parse(init.body)).toEqual({ ninoIds: ['n1'], salonIds: [PREESCOLAR], turnoId: 't9', fecha: '2026-11-01' })
    const codigo = screen.getByRole('region', { name: 'Ingreso registrado' })
    expect(within(codigo).getByText('Camila Linárez')).toBeInTheDocument()
    expect(within(codigo).getByText('Preescolar · Alergias: Maní')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invitar a crear su cuenta' })).toBeInTheDocument()
    expect(onRegistrada).not.toHaveBeenCalled()
  })

  it('"Siguiente familia" after the code hands back to the desk', async () => {
    responder()
    ingresoOk()
    const onIngresado = jest.fn()
    render(<RegistroMesa salones={salones} ingreso={ingreso} onIngresado={onIngresado} onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    llenar()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y dar ingreso · 1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Siguiente familia' }))
    expect(onIngresado).toHaveBeenCalled()
  })

  it('when the check-in fails the family stays registered and the error says so', async () => {
    responder()
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { code: '23505' } }) })
    const onRegistrada = jest.fn()
    render(<RegistroMesa salones={salones} ingreso={ingreso} onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    llenar()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y dar ingreso · 1' }))

    expect(await screen.findByText('La familia quedó registrada, pero no se pudo dar ingreso: Uno de los niños ya ingresó en este servicio.')).toBeInTheDocument()
    expect(screen.getByText('Familia registrada')).toBeInTheDocument()
    expect(registros()).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Registrar y dar ingreso/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir en la mesa' }))
    expect(onRegistrada).toHaveBeenCalledWith('p1', 'Camila Linárez')
  })

  it('a child without a salón is registered but not checked in, and the error says so', async () => {
    responder()
    render(<RegistroMesa salones={[]} ingreso={ingreso} onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    llenar()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y dar ingreso · 1' }))
    expect(await screen.findByText('La familia quedó registrada, pero no se pudo dar ingreso: Camila no tiene salón: asígnalo antes de registrar.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('"Solo registrar" registers without the check-in', async () => {
    responder({ data: { padre_id: 'p1', padre_nuevo: false, hijos: ['n1'] }, error: null })
    const onRegistrada = jest.fn()
    render(<RegistroMesa salones={salones} ingreso={ingreso} onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    llenar()
    fireEvent.click(screen.getByRole('button', { name: 'Solo registrar' }))
    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith('p1', 'Camila Linárez'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the under-13 rule on the card and maps the server refusal (fuera_de_rango)', async () => {
    render(<RegistroMesa salones={salones} ingreso={ingreso} onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    llenar()
    escribir('Fecha de nacimiento del niño 1', '2012-08-30')
    expect(screen.getByText(/Con esa fecha Camila tendría 14 años/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y dar ingreso · 1' }))
    expect(registros()).toHaveLength(0)

    responder({ data: null, error: { code: '22023', message: 'fuera_de_rango' } })
    escribir('Fecha de nacimiento del niño 1', '2022-02-09')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y dar ingreso · 1' }))
    expect(await screen.findByText('Solo se registran en Niños los menores de 13 años con fecha de nacimiento.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('PanelesCheckin: Nueva familia', () => {
  const base = {
    onCerrar: jest.fn(),
    salones: [],
    salonesNivel: salones,
    fecha: '2026-11-01',
    ocupacion: new Map(),
    salonDe: () => ({ salonId: null, origen: 'ninguno' as const }),
    onElegirSalon: jest.fn(),
    onAbrirFamilia: jest.fn(),
    onFichaGuardada: jest.fn(),
  }

  it('with the service it offers "Registrar y dar ingreso" and closes on "Siguiente familia"', async () => {
    responder()
    ingresoOk()
    const onCerrar = jest.fn()
    const onIngresado = jest.fn()
    render(<PanelesCheckin {...base} panel={{ tipo: 'nueva' }} turnoId="t9" onCerrar={onCerrar} onIngresado={onIngresado} />)
    const panel = await screen.findByRole('dialog', { name: 'Nueva familia' })
    llenar()
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar y dar ingreso · 1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Siguiente familia' }))
    expect(onCerrar).toHaveBeenCalled()
    expect(onIngresado).toHaveBeenCalled()
  })

  it('without the service it keeps "Registrar familia"', async () => {
    render(<PanelesCheckin {...base} panel={{ tipo: 'nueva' }} />)
    const panel = await screen.findByRole('dialog', { name: 'Nueva familia' })
    expect(within(panel).getByRole('button', { name: 'Registrar familia' })).toBeInTheDocument()
  })
})

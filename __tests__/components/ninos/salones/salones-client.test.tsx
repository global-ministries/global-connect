/**
 * Niños › Salones (odd/tasks/ninos-checkin-pco.md, T1d): the screen of
 * /ninos/salones with the server actions mocked. Who configures an area edits
 * its salones inline (rules, name / quota / ranges, open or closed), its
 * carpeta and creates salones; the other areas read only. «Probar reglas»
 * follows the saved rules. Without matchMedia the panels are the desktop side
 * panel. All data is fictitious.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { SalonesClient, type SalonesClientProps } from '@/components/ninos/salones/salones-client'
import { leerSalones } from '@/lib/platform/ninos/salones-reglas'

const refresh = jest.fn()
const push = jest.fn()
const guardarReglasSalon = jest.fn()
const guardarDatosSalon = jest.fn()
const guardarCarpeta = jest.fn()
const crearSalon = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push, replace: jest.fn() }) }))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs, accionPrincipal }: { breadcrumbs?: React.ReactNode; accionPrincipal?: React.ReactNode }) => (
    <header>
      {breadcrumbs}
      {accionPrincipal}
    </header>
  ),
}))
jest.mock('@/lib/actions/ninos-salones.actions', () => ({
  guardarReglasSalon: (...a: unknown[]) => guardarReglasSalon(...a),
  guardarDatosSalon: (...a: unknown[]) => guardarDatosSalon(...a),
  guardarCarpeta: (...a: unknown[]) => guardarCarpeta(...a),
  crearSalon: (...a: unknown[]) => crearSalon(...a),
}))

const CAMPUS = '11111111-1111-4111-8111-111111111111'
const WAUMBA = 'eq-waumba'
const UPSTREET = 'eq-upstreet'

const fila = (o: Record<string, unknown>) => ({
  campus_id: CAMPUS,
  equipo_id: WAUMBA,
  area: 'waumba',
  capacidad: 20,
  edad_min_meses: null,
  edad_max_meses: null,
  grado_min: null,
  grado_max: null,
  es_necesidades_especiales: false,
  activo: true,
  cupo_visitantes: 0,
  ninos_por_voluntario: null,
  min_voluntarios: 0,
  abierto: true,
  opcion_panal: false,
  opcion_merienda: false,
  corte_mes: null,
  corte_dia: null,
  promocion_mes: null,
  promocion_dia: null,
  ...o,
})

const salones = leerSalones([
  fila({ id: 'maternal', nombre: 'Maternal', edad_min_meses: 0, edad_max_meses: 23, orden: 10, capacidad: 18, opcion_panal: true }),
  fila({ id: 'pre2', nombre: 'Preescolar II', edad_min_meses: 36, edad_max_meses: 47, orden: 30, cupo_visitantes: 2, ninos_por_voluntario: 5, min_voluntarios: 2 }),
  fila({ id: 'pre3', nombre: 'Preescolar III', edad_min_meses: 48, edad_max_meses: 71, orden: 40 }),
  fila({ id: 'g1', nombre: '1º grado', area: 'upstreet', equipo_id: UPSTREET, grado_min: 1, grado_max: 1, orden: 110 }),
  fila({ id: 'pread', nombre: 'Preadolescentes', area: 'upstreet', equipo_id: UPSTREET, grado_min: 5, grado_max: 6, orden: 150, abierto: false }),
])

function pintar(props: Partial<SalonesClientProps> = {}) {
  return render(
    <SalonesClient
      campus={[{ id: CAMPUS, nombre: 'Barquisimeto' }]}
      campusId={CAMPUS}
      salones={salones}
      carpetas={[{ area: 'upstreet', mantenerRegulares: false }]}
      equiposEditables={[WAUMBA, UPSTREET]}
      ocupadosHoy={{ pre2: 14 }}
      fechaServicio="2026-11-08"
      errorLectura={null}
      {...props}
    />,
  )
}

const resultado = () => screen.getByTestId('resultado-prueba')
const enviarCampo = async (campo: HTMLElement, valor: string) => {
  fireEvent.change(campo, { target: { value: valor } })
  await act(async () => {
    fireEvent.blur(campo)
  })
}
const abrirSalon = (nombre: string) => fireEvent.click(screen.getByRole('button', { name: `Editar ${nombre}` }))
const panel = () => screen.getByRole('dialog')

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/ninos/salones')
  for (const f of [guardarReglasSalon, guardarDatosSalon, guardarCarpeta]) f.mockResolvedValue({ ok: true, data: null })
})

describe('reading', () => {
  it('summarizes the campus and lists each carpeta in fill order', () => {
    pintar()
    expect(screen.getAllByTestId('resumen-salones')[0]).toHaveTextContent(
      'Barquisimeto · 5 salones en 2 carpetas · cupo 78 regulares + 2 visitantes · 1 cerrado',
    )
    const waumba = screen.getByRole('region', { name: 'Waumba Land' })
    expect(within(waumba).getAllByRole('listitem').map((li) => li.textContent?.split('meses')[0])).toEqual([
      expect.stringContaining('Maternal'),
      expect.stringContaining('Preescolar II'),
      expect.stringContaining('Preescolar III'),
    ])
    expect(within(waumba).getByText('36–47 meses')).toBeInTheDocument()
    expect(within(waumba).getByText('1 cada 5 · mín 2')).toBeInTheDocument()
    const upstreet = screen.getByRole('region', { name: 'UpStreet' })
    expect(within(upstreet).getByText('5º a 6º grado')).toBeInTheDocument()
    expect(within(upstreet).getByText('Cerrado')).toBeInTheDocument()
    // S9.5: no distribution per carpeta; each child only enters the salones of their age, grade or needs.
    expect(screen.queryByText('Distribución')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Equilibrada|En orden/ })).not.toBeInTheDocument()
    expect(within(upstreet).getByText(/cada niño entra solo a los salones de su edad, grado o necesidades/)).toHaveTextContent(
      'En orden: cada niño entra solo a los salones de su edad, grado o necesidades; entre ellos se llena el primero hasta el cupo.',
    )
    expect(within(upstreet).getByRole('switch', { name: /Mantener a los regulares/ })).toHaveAttribute('aria-checked', 'false')
    const tabs = screen.getByRole('navigation', { name: 'Administración del check-in' })
    expect(within(tabs).getByRole('link', { name: 'Salones' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Eventos' })).toHaveAttribute('href', `/ninos/eventos?campus=${CAMPUS}`)
  })

  it('opens a salón in its panel and keeps it in the URL', () => {
    pintar()
    abrirSalon('Preescolar II')
    expect(within(panel()).getByRole('textbox', { name: 'Cupo de visitantes' })).toHaveValue('2')
    expect(within(panel()).getByText(/hacen falta/)).toHaveTextContent('Con el cupo lleno (22 niños) hacen falta 5 voluntarios.')
    expect(window.location.search).toBe(`?campus=${CAMPUS}&salon=pre2`)
  })

  it('says when the campus has no salones', () => {
    pintar({ salones: [] })
    expect(screen.getByText('No hay salones de Niños')).toBeInTheDocument()
    expect(screen.queryByText('Probar reglas')).not.toBeInTheDocument()
  })
})

describe('read-only', () => {
  it('lets an area coordinator change only their area', () => {
    pintar({ equiposEditables: [WAUMBA] })
    expect(screen.getByText('Puedes cambiar los salones de Waumba Land; los demás son de solo lectura.')).toBeInTheDocument()
    const upstreet = screen.getByRole('region', { name: 'UpStreet' })
    expect(within(upstreet).queryByRole('switch')).not.toBeInTheDocument()
    expect(within(upstreet).getByText('No mantiene a los regulares en su salón')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Waumba Land' })).getByRole('switch')).toBeInTheDocument()

    abrirSalon('1º grado')
    expect(within(panel()).getByText('Solo quien coordina esta área puede cambiar este salón.')).toBeInTheDocument()
    expect(within(panel()).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(panel()).queryByRole('switch')).not.toBeInTheDocument()
  })

  it('shows no write control to who configures no area of the salones', () => {
    pintar({ equiposEditables: [] })
    expect(screen.getByText('Puedes ver los salones de este campus. Solo quien coordina un área puede cambiar sus salones.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nuevo salón' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'En orden' })).not.toBeInTheDocument()
    abrirSalon('Preescolar II')
    expect(within(panel()).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(panel()).getByText('Abierto')).toBeInTheDocument()
  })
})

describe('editing a salón', () => {
  it('saves a rule with every other rule as it was', async () => {
    pintar()
    abrirSalon('Preescolar II')
    await enviarCampo(within(panel()).getByRole('textbox', { name: 'Cupo de visitantes' }), '4')
    expect(guardarReglasSalon).toHaveBeenCalledWith({
      salonId: 'pre2',
      reglas: {
        cupoVisitantes: 4,
        ninosPorVoluntario: 5,
        minVoluntarios: 2,
        abierto: true,
        opcionPanal: false,
        opcionMerienda: false,
        corteMes: null,
        corteDia: null,
        promocionMes: null,
        promocionDia: null,
      },
    })
    expect(screen.getByRole('status')).toHaveTextContent('Cupo de visitantes de Preescolar II: 4.')
    expect(refresh).toHaveBeenCalled()
    // The next field saves on top of the first change.
    await enviarCampo(within(panel()).getByRole('textbox', { name: 'Cumple antes del' }), '1 dic')
    expect(guardarReglasSalon).toHaveBeenLastCalledWith({ salonId: 'pre2', reglas: expect.objectContaining({ cupoVisitantes: 4, corteMes: 12, corteDia: 1 }) })
  })

  it('keeps an invalid value with its sentence and does not save', async () => {
    pintar()
    abrirSalon('Preescolar II')
    const campo = within(panel()).getByRole('textbox', { name: 'Niños por voluntario' })
    await enviarCampo(campo, '0')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Niños por voluntario va de 1 a 100 y el mínimo de voluntarios de 0 a 50.')
    await enviarCampo(within(panel()).getByRole('textbox', { name: 'Cumple antes del' }), '1/12')
    expect(screen.getByRole('status')).toHaveTextContent('Escribe la fecha como 1 dic o 15 ago, o déjala vacía.')
    expect(guardarReglasSalon).not.toHaveBeenCalled()
  })

  it('saves the name, quota and ranges on the salón', async () => {
    pintar()
    abrirSalon('Preescolar II')
    await enviarCampo(within(panel()).getByRole('textbox', { name: 'Cupo de regulares' }), '18')
    expect(guardarDatosSalon).toHaveBeenCalledWith({
      salonId: 'pre2',
      datos: { nombre: 'Preescolar II', capacidad: 18, edadMinMeses: 36, edadMaxMeses: 47, gradoMin: null, gradoMax: null },
    })
    await enviarCampo(within(panel()).getByRole('textbox', { name: 'Edad hasta, en meses' }), '')
    expect(guardarDatosSalon).toHaveBeenLastCalledWith({ salonId: 'pre2', datos: expect.objectContaining({ capacidad: 18, edadMaxMeses: null }) })
  })

  it('closes and opens the salón, and turns options on', async () => {
    pintar()
    abrirSalon('Preescolar II')
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('button', { name: 'Cerrado' }))
    })
    expect(guardarReglasSalon).toHaveBeenLastCalledWith({ salonId: 'pre2', reglas: expect.objectContaining({ abierto: false }) })
    expect(screen.getByRole('status')).toHaveTextContent('Preescolar II: cerrado.')
    await act(async () => {
      fireEvent.click(within(panel()).getByRole('switch', { name: 'Usa pañal' }))
    })
    expect(guardarReglasSalon).toHaveBeenLastCalledWith({ salonId: 'pre2', reglas: expect.objectContaining({ abierto: false, opcionPanal: true }) })
  })

  it('shows the HINT when the database refuses', async () => {
    guardarReglasSalon.mockResolvedValue({ ok: false, message: 'No tienes permiso para configurar este salón.' })
    pintar()
    abrirSalon('Preescolar II')
    const campo = within(panel()).getByRole('textbox', { name: 'Mínimo de voluntarios' })
    await enviarCampo(campo, '3')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(within(panel()).getByText('No se pudo guardar · No tienes permiso para configurar este salón.')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('carpetas', () => {
  it('saves keeping the regulars (the only carpeta setting)', async () => {
    pintar()
    await act(async () => {
      fireEvent.click(within(screen.getByRole('region', { name: 'UpStreet' })).getByRole('switch'))
    })
    expect(guardarCarpeta).toHaveBeenCalledWith({ campusId: CAMPUS, area: 'upstreet', mantenerRegulares: true })
    expect(screen.getByRole('status')).toHaveTextContent('UpStreet: mantiene a los regulares en su salón.')
    await act(async () => {
      fireEvent.click(within(screen.getByRole('region', { name: 'Waumba Land' })).getByRole('switch'))
    })
    expect(guardarCarpeta).toHaveBeenLastCalledWith({ campusId: CAMPUS, area: 'waumba', mantenerRegulares: false })
  })
})

describe('Probar reglas', () => {
  it('says where a child goes and why, and opens that salón', () => {
    pintar()
    expect(resultado()).toHaveTextContent('Escribe la fecha de nacimiento o elige el grado.')
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '2023-01-15' } })
    expect(resultado()).toHaveTextContent('Va aPreescolar II(3 años 9 meses)')
    expect(within(resultado()).getByText('Regular: cupo de 20')).toBeInTheDocument()
    expect(within(resultado()).getByText('Maternal: 45 meses no está entre 0 y 23')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Visitante' }))
    expect(within(resultado()).getByText('Visitante: puede usar los 2 puestos de visitantes además del cupo de 20')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Como están hoy (14)' }))
    expect(within(resultado()).getByText('Hay 14 niños de 20 regulares + 2 visitantes')).toBeInTheDocument()

    fireEvent.click(within(resultado()).getByRole('button', { name: 'Ver salón' }))
    expect(within(panel()).getByRole('textbox', { name: 'Nombre del salón' })).toHaveValue('Preescolar II')
  })

  it('places by grade and follows the carpeta, and says when the salón is closed', () => {
    pintar()
    fireEvent.change(screen.getByLabelText('Grado'), { target: { value: '6' } })
    expect(resultado()).toHaveTextContent('Le toca Preadolescentes, pero está cerrado')
    expect(resultado()).toHaveTextContent('Abre el salón o, en la mesa, elige otro a mano.')
    fireEvent.change(screen.getByLabelText('Grado'), { target: { value: '1' } })
    expect(resultado()).toHaveTextContent('Va a1º grado')
  })
})

describe('Nuevo salón', () => {
  it('creates a salón in a carpeta the caller configures and opens it', async () => {
    crearSalon.mockResolvedValue({ ok: true, data: { id: 'nuevo' } })
    pintar({ equiposEditables: [UPSTREET] })
    fireEvent.click(screen.getAllByRole('button', { name: 'Nuevo salón' })[0])
    const formulario = await screen.findByRole('dialog')
    expect(within(formulario).queryByRole('group', { name: 'Carpeta' })).not.toBeInTheDocument()
    fireEvent.change(within(formulario).getByLabelText(/Nombre del salón/), { target: { value: '2º grado' } })
    await act(async () => {
      fireEvent.click(within(formulario).getByRole('button', { name: 'Crear salón' }))
    })
    expect(crearSalon).toHaveBeenCalledWith({ campusId: CAMPUS, area: 'upstreet', nombre: '2º grado' })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Creaste 2º grado. Ahora ponle edades y cupo.'))
  })

  it('shows why the salón was not created', async () => {
    crearSalon.mockResolvedValue({ ok: false, message: 'Ya hay un salón con ese nombre en este campus.' })
    pintar()
    fireEvent.click(screen.getAllByRole('button', { name: 'Nuevo salón' })[0])
    const formulario = await screen.findByRole('dialog')
    fireEvent.click(within(formulario).getByRole('button', { name: 'UpStreet' }))
    fireEvent.change(within(formulario).getByLabelText(/Nombre del salón/), { target: { value: '1º grado' } })
    await act(async () => {
      fireEvent.click(within(formulario).getByRole('button', { name: 'Crear salón' }))
    })
    expect(crearSalon).toHaveBeenCalledWith({ campusId: CAMPUS, area: 'upstreet', nombre: '1º grado' })
    expect(within(formulario).getByText('Ya hay un salón con ese nombre en este campus.')).toBeInTheDocument()
  })
})

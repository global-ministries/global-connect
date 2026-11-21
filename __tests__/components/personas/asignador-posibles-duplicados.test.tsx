/**
 * Dream Team — «Registrar persona nueva» in the assigner asks
 * «¿Es alguna de estas personas?» before going on (T4, S6b): «Siguiente» on
 * step 1 calls GET /api/dream-team/usuarios/posibles-duplicados with the
 * typed nombre, apellido, cédula and teléfono; with matches the panel stays
 * on step 1 and shows them; «Usar esta persona» assigns that person instead;
 * «No, es otra persona, crear» goes on to step 2 and the registration goes
 * through. No matches or a failed check never block the registration.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AsignadorServicioDialog } from '@/components/dream-team/asignador-servicio-dialog'

const EQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ISAAC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
}

const OPCIONES = [{ id: EQ, etiqueta: 'Waumba Land', roles: [{ id: ROL, label: 'voluntario' }] }]
const COINCIDENCIA = {
  id: ISAAC,
  nombre: 'Isaac José',
  apellido: 'Paez Cordero',
  nombreCorto: 'Isaac Paez',
  campus: 'Valencia',
  servicios: 2,
  tieneCuenta: true,
  coincide: ['nombre'],
}

const toast = { success: jest.fn(), error: jest.fn() }
let duplicados: () => Promise<Response>
const llamadas: Array<{ url: string; init?: RequestInit }> = []

beforeEach(() => {
  toast.success.mockReset()
  toast.error.mockReset()
  llamadas.length = 0
  duplicados = () => respuesta(200, { personas: [COINCIDENCIA] })
  global.fetch = ((url: string, init?: RequestInit) => {
    llamadas.push({ url, init })
    if (url === '/api/dream-team/usuarios/registrables') return respuesta(200, { equipos: OPCIONES })
    if (url.startsWith('/api/dream-team/usuarios/posibles-duplicados')) return duplicados()
    if (url === '/api/dream-team/usuarios') return respuesta(201, { resultado: 'creada', personaId: 'nueva', nombre: 'Isaac Paez', servicioId: 'srv' })
    if (url === '/api/dream-team/servicios') return respuesta(201, { servicio: { id: 'srv-2' } })
    return Promise.reject(new Error(`unexpected fetch ${url}`))
  }) as unknown as typeof fetch
})

function abrir() {
  const onAsignado = jest.fn()
  render(
    <AsignadorServicioDialog
      abierto
      onClose={jest.fn()}
      nodosPlanos={[{ id: EQ, etiqueta: 'Waumba Land', ruta: ['Waumba Land'] }]}
      rolesPorEquipo={{ [EQ]: [{ id: ROL, equipoId: EQ, label: 'voluntario', activo: true }] as never }}
      onAsignado={onAsignado}
      toast={toast as never}
      equipoIdInicial={EQ}
    />,
  )
  return onAsignado
}

async function llenarYSeguir() {
  await userEvent.click(await screen.findByRole('button', { name: 'Registrar persona nueva' }))
  await userEvent.type(screen.getByLabelText('Nombre'), 'Isaac')
  await userEvent.type(screen.getByLabelText('Apellido'), 'Paez')
  await userEvent.selectOptions(screen.getByLabelText('Género'), 'Masculino')
  await userEvent.type(screen.getByLabelText('Fecha de nacimiento'), '1990-05-05')
  await userEvent.click(screen.getByRole('button', { name: 'Más datos (opcional)' }))
  await userEvent.type(screen.getByLabelText('Teléfono (opcional)'), '0414 123 4567')
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
}

describe('AsignadorServicioDialog — «¿Es alguna de estas personas?»', () => {
  it('searches the possible duplicates with the typed data and stays on step 1 showing them', async () => {
    abrir()
    await llenarYSeguir()
    const panel = await screen.findByRole('region', { name: '¿Es alguna de estas personas?' })
    expect(within(panel).getByText('Isaac Paez')).toBeInTheDocument()
    expect(screen.getByText('Paso 1 de 3: Persona')).toBeInTheDocument()
    const llamada = llamadas.find((l) => l.url.startsWith('/api/dream-team/usuarios/posibles-duplicados'))
    expect(llamada?.url).toBe('/api/dream-team/usuarios/posibles-duplicados?nombre=Isaac&apellido=Paez&telefono=0414+123+4567')
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('«Usar esta persona» assigns the existing person instead of creating one', async () => {
    const onAsignado = abrir()
    await llenarYSeguir()
    await userEvent.click(await screen.findByRole('button', { name: 'Usar esta persona: Isaac Paez' }))
    expect(screen.getByText('Isaac José Paez Cordero')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Paso 2 de 3: Equipo y rol')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Rol'), ROL)
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Asignar' }))
    const post = llamadas.find((l) => l.url === '/api/dream-team/servicios')
    expect(JSON.parse(String(post?.init?.body))).toEqual({ personaId: ISAAC, equipoId: EQ, rolId: ROL })
    expect(llamadas.some((l) => l.url === '/api/dream-team/usuarios')).toBe(false)
    expect(onAsignado).toHaveBeenCalled()
  })

  it('«No, es otra persona, crear» goes on to step 2 and registers the new person', async () => {
    const onAsignado = abrir()
    await llenarYSeguir()
    await userEvent.click(await screen.findByRole('button', { name: 'No, es otra persona, crear' }))
    expect(await screen.findByText('Paso 2 de 3: Equipo y rol')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Rol'), ROL)
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Asignar' }))
    expect(llamadas.some((l) => l.url === '/api/dream-team/usuarios' && l.init?.method === 'POST')).toBe(true)
    expect(onAsignado).toHaveBeenCalled()
  })

  it('without matches goes straight to step 2', async () => {
    duplicados = () => respuesta(200, { personas: [] })
    abrir()
    await llenarYSeguir()
    expect(await screen.findByText('Paso 2 de 3: Equipo y rol')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '¿Es alguna de estas personas?' })).not.toBeInTheDocument()
  })

  it('a failed check never blocks the registration', async () => {
    duplicados = () => respuesta(500, { error: 'Error interno' })
    abrir()
    await llenarYSeguir()
    expect(await screen.findByText('Paso 2 de 3: Equipo y rol')).toBeInTheDocument()
  })
})

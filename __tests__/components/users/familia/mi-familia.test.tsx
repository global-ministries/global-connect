/**
 * Mi familia tab (S15 decisions 5, 6, 8 and 9): the empty state, an incoming
 * request ("X dice que es tu hermana" with Confirmar / No es mi familiar),
 * confirmed relatives (Sin cuenta, edit only for my ficha, Mis hijos for a
 * child) and sent requests (Pendiente, Cancelar), with the error toast.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh, replace: jest.fn() }), usePathname: () => '/perfil' }))
const exito = jest.fn()
const fallo = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success: exito, error: fallo, info: jest.fn() }) }))
jest.mock('@/lib/actions/familia.actions', () => ({
  buscarFamiliar: jest.fn(), verificarFamiliar: jest.fn(), solicitarFamiliar: jest.fn(), solicitarFamiliarSinCuenta: jest.fn(),
  responderSolicitud: jest.fn(), cancelarSolicitud: jest.fn(), quitarFamiliar: jest.fn(),
}))

import { MiFamilia } from '@/components/users/familia/mi-familia'
import { cancelarSolicitud, quitarFamiliar, responderSolicitud } from '@/lib/actions/familia.actions'
import type { Familiar, MiFamilia as Datos } from '@/lib/platform/usuarios/familia-vista'

const VACIA: Datos = { familiares: [], enviadas: [], recibidas: [] }
const familiar = (p: Partial<Familiar>): Familiar => ({
  relacionId: 'r1', usuarioId: 'u2', relacion: 'conyuge', nombre: 'José Gregorio', apellido: 'Pérez', genero: 'Masculino',
  cuenta: true, puedoEditar: false, esNino: false, ...p,
})

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/perfil')
})

describe('MiFamilia', () => {
  it('empty: says no relatives yet and offers Agregar familiar', () => {
    render(<MiFamilia familia={VACIA} campus="Barquisimeto" />)
    expect(screen.getByText('Todavía no tienes familiares vinculados')).toBeInTheDocument()
    expect(screen.getByText('Agrega a tu cónyuge, padres o hermanos. Cada persona confirma antes de aparecer aquí.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Agregar familiar' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('region', { name: 'Solicitudes enviadas' })).not.toBeInTheDocument()
  })

  it('incoming: "X dice que es tu hermana" and Confirmar answers yes', async () => {
    jest.mocked(responderSolicitud).mockResolvedValue({ ok: true, data: 'CONFIRMADA' })
    render(<MiFamilia familia={{ ...VACIA, recibidas: [{ id: 's2', relacion: 'hermano', nombre: 'Lisbeth', apellido: 'Rodríguez', genero: 'Femenino', creadoEn: '' }] }} campus={null} />)
    const tarjeta = screen.getByRole('region', { name: 'Lisbeth Rodríguez dice que es tu hermana' })
    expect(screen.getByText('Responde la solicitud de arriba o agrega a tu familia. Cada persona confirma antes de aparecer aquí.')).toBeInTheDocument()
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Confirmar' }))
    expect(responderSolicitud).toHaveBeenCalledWith('s2', true)
    expect(exito).toHaveBeenCalledWith('Lisbeth ya está en tu familia.')
    expect(refresh).toHaveBeenCalled()
  })

  it('incoming: "No es mi familiar" asks first, then rejects', async () => {
    jest.mocked(responderSolicitud).mockResolvedValue({ ok: true, data: 'RECHAZADA' })
    render(<MiFamilia familia={{ ...VACIA, recibidas: [{ id: 's2', relacion: 'hermano', nombre: 'Lisbeth', apellido: 'Rodríguez', genero: 'Femenino', creadoEn: '' }] }} campus={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'No es mi familiar' }))
    const dialogo = screen.getByRole('alertdialog', { name: 'No es mi familiar' })
    expect(responderSolicitud).not.toHaveBeenCalled()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'No es mi familiar' }))
    expect(responderSolicitud).toHaveBeenCalledWith('s2', false)
    expect(exito).toHaveBeenCalledWith('Solicitud cerrada.')
  })

  it('shows the RPC error message when an answer fails', async () => {
    jest.mocked(responderSolicitud).mockResolvedValue({ ok: false, codigo: 'YA_RESUELTO', mensaje: 'Esta solicitud ya se resolvió.' })
    render(<MiFamilia familia={{ ...VACIA, recibidas: [{ id: 's2', relacion: 'padre', nombre: 'Luis', apellido: 'Barrios', genero: 'Masculino', creadoEn: '' }] }} campus={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(fallo).toHaveBeenCalledWith('Esta solicitud ya se resolvió.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('confirmed: gendered label, Sin cuenta, edit only for my ficha, Mis hijos for a child', async () => {
    jest.mocked(quitarFamiliar).mockResolvedValue({ ok: true, data: 'QUITADA' })
    render(
      <MiFamilia
        familia={{
          ...VACIA,
          familiares: [
            familiar({}),
            familiar({ relacionId: 'r2', usuarioId: 'x2', relacion: 'padre', nombre: 'Carmen', apellido: 'Colmenárez', genero: 'Femenino', cuenta: false, puedoEditar: true }),
            familiar({ relacionId: 'r3', usuarioId: 'x1', relacion: 'hijo', nombre: 'Valentina', apellido: 'Pérez', genero: 'Femenino', cuenta: false, esNino: true }),
          ],
        }}
        campus={null}
      />,
    )
    const filas = within(screen.getByRole('region', { name: 'Tu familia' })).getAllByRole('listitem')
    expect(filas[0]).toHaveTextContent('Esposo')
    expect(within(filas[0]).queryByRole('link')).not.toBeInTheDocument()
    expect(filas[1]).toHaveTextContent('MadreSin cuenta')
    expect(within(filas[1]).getByRole('link', { name: 'Editar los datos de Carmen Colmenárez' })).toHaveAttribute('href', '/users/x2/edit')
    expect(within(filas[2]).queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument()
    await userEvent.click(within(filas[2]).getByRole('button', { name: /Mis hijos/ }))
    expect(window.location.hash).toBe('#mis-hijos')

    await userEvent.click(within(filas[0]).getByRole('button', { name: 'Quitar a José Gregorio Pérez de tu familia' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Quitar de tu familia' })).getByRole('button', { name: 'Quitar' }))
    expect(quitarFamiliar).toHaveBeenCalledWith('r1')
    expect(exito).toHaveBeenCalledWith('Vínculo quitado.')
  })

  it('sent: Pendiente, who it waits for, and Cancelar after asking', async () => {
    jest.mocked(cancelarSolicitud).mockResolvedValue({ ok: true, data: 'CANCELADA' })
    render(
      <MiFamilia
        familia={{
          ...VACIA,
          enviadas: [
            { id: 's1', tipo: 'hermano', nombre: 'Luis', apellido: 'Barrios R.', genero: 'Masculino', espera: 'persona', creadoEn: '' },
            { id: 's3', tipo: 'padre', nombre: 'Rafael', apellido: 'Colmenárez', genero: null, espera: 'campus', creadoEn: '' },
          ],
        }}
        campus={null}
      />,
    )
    const tarjeta = screen.getByRole('region', { name: 'Solicitudes enviadas' })
    expect(within(tarjeta).getAllByText('Pendiente')).toHaveLength(2)
    expect(within(tarjeta).getByText('Esperando que Luis confirme')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Esperando la revisión de tu campus')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Padre o madre')).toBeInTheDocument()
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Cancelar la solicitud a Luis Barrios R.' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Cancelar solicitud' })).getByRole('button', { name: 'Cancelar solicitud' }))
    expect(cancelarSolicitud).toHaveBeenCalledWith('s1')
  })

  it('says so when the family could not be read', () => {
    render(<MiFamilia familia={null} campus={null} />)
    expect(screen.getByText('No pudimos cargar tu familia')).toBeInTheDocument()
  })
})

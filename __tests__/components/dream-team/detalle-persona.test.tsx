/**
 * `<DetallePersona>` — the shared person panel of Servidores and Mi equipo
 * (T7a-2 of odd/tasks/sistema-diseno-v2.md, S11 decision 1): identity, quick
 * actions, the "Revisar teléfono" and "Sin cuenta" callouts, one card per
 * servicio, every action gated by its flags. The screen owns the dialogs:
 * choosing an action closes the panel and calls back.
 *
 * jsdom has no matchMedia, so `DetalleResponsivo` renders the desktop side panel.
 */
import React, { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  DetallePersona,
  type DetallePersonaProps,
  type ServicioDetalle,
} from '@/components/dream-team/detalle-persona'

const user = userEvent.setup({ delay: null })

const SIN_ACCIONES = { cambiarEtapa: false, turnos: false, editarFicha: false, invitar: false }

const CORO: ServicioDetalle = {
  clave: 's-coro',
  equipoLabel: 'Coro',
  equipoRuta: 'Alabanza',
  rolLabel: 'Integrante',
  estado: 'activo',
  turnoTexto: 'Domingo 9:00',
  desde: '2026-01-10T12:00:00Z',
  origen: 'dream_team',
  acciones: { cambiarEtapa: true, turnos: true, editarFicha: true, invitar: true, verEquipo: '/dream-team/mi-equipo?direccion=dir-1' },
}

const GDV: ServicioDetalle = {
  clave: 'gdv:p-1:seg',
  equipoLabel: 'Matrimonios',
  equipoRuta: '',
  rolLabel: 'Líder de grupo',
  estado: 'activo',
  turnoTexto: '—',
  desde: null,
  origen: 'grupos_vida',
  acciones: SIN_ACCIONES,
}

function base(over: Partial<DetallePersonaProps> = {}): DetallePersonaProps {
  return {
    persona: { nombre: 'Ana Ruiz', telefono: '04125457346', tieneCuenta: true, soloGruposVida: false },
    servicios: [CORO],
    abierto: true,
    onCambioAbierto: jest.fn(),
    onCambiarEtapa: jest.fn(),
    onTurnos: jest.fn(),
    onEditarFicha: jest.fn(),
    onInvitar: jest.fn(),
    ...over,
  }
}

function Controlado(props: DetallePersonaProps) {
  const [abierto, setAbierto] = useState(true)
  return (
    <DetallePersona
      {...props}
      abierto={abierto}
      onCambioAbierto={(valor) => {
        setAbierto(valor)
        props.onCambioAbierto(valor)
      }}
    />
  )
}

const panel = () => screen.getByRole('dialog', { name: 'Ana Ruiz' })
const tarjeta = (nombre: string) => within(within(panel()).getByRole('group', { name: nombre }))

describe('DetallePersona — identity and quick actions', () => {
  it('shows the name, how many servicios and the phone in mono, with WhatsApp, Llamar and Editar ficha', () => {
    render(<DetallePersona {...base()} />)
    expect(within(panel()).getByText('1 servicio')).toBeInTheDocument()
    expect(within(panel()).getByText('0412 545 7346')).toHaveClass('font-mono', 'tabular-nums')
    expect(within(panel()).getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/584125457346')
    expect(within(panel()).getByRole('link', { name: 'Llamar' })).toHaveAttribute('href', 'tel:04125457346')
    expect(within(panel()).getByRole('button', { name: 'Editar ficha' })).toBeInTheDocument()
  })

  it('without a phone both quick actions are disabled and it says "Sin teléfono"', () => {
    render(<DetallePersona {...base({ persona: { nombre: 'Ana Ruiz', telefono: null, tieneCuenta: true, soloGruposVida: false } })} />)
    expect(within(panel()).getByText('Sin teléfono')).toBeInTheDocument()
    expect(within(panel()).getByRole('button', { name: 'WhatsApp' })).toBeDisabled()
    expect(within(panel()).getByRole('button', { name: 'Llamar' })).toBeDisabled()
  })

  it('"Editar ficha" closes the panel, then calls back', async () => {
    const props = base()
    render(<Controlado {...props} />)
    await user.click(within(panel()).getByRole('button', { name: 'Editar ficha' }))
    expect(props.onCambioAbierto).toHaveBeenCalledWith(false)
    expect(props.onEditarFicha).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Ana Ruiz' })).not.toBeInTheDocument()
  })
})

describe('DetallePersona — callouts', () => {
  it('an unrecognizable phone explains why and offers "Corregir en la ficha"', async () => {
    const props = base({ persona: { nombre: 'Ana Ruiz', telefono: '+17867312193', tieneCuenta: true, soloGruposVida: false } })
    render(<DetallePersona {...props} />)
    expect(within(panel()).getByText('Revisar teléfono')).toBeInTheDocument()
    expect(within(panel()).getByText('«+17867312193» no parece un número válido, así que WhatsApp no funciona.')).toBeInTheDocument()
    expect(within(panel()).getByRole('button', { name: 'WhatsApp' })).toBeDisabled()
    await user.click(within(panel()).getByRole('button', { name: 'Corregir en la ficha' }))
    expect(props.onEditarFicha).toHaveBeenCalledTimes(1)
  })

  it('someone without account gets the callout and "Invitar a la plataforma"', async () => {
    const props = base({ persona: { nombre: 'Ana Ruiz', telefono: null, tieneCuenta: false, soloGruposVida: false } })
    render(<DetallePersona {...props} />)
    expect(within(panel()).getByText('No tiene cuenta en la plataforma')).toBeInTheDocument()
    expect(within(panel()).getByText('No ve sus turnos ni recibe recordatorios.')).toBeInTheDocument()
    await user.click(within(panel()).getByRole('button', { name: 'Invitar a la plataforma' }))
    expect(props.onCambioAbierto).toHaveBeenCalledWith(false)
    expect(props.onInvitar).toHaveBeenCalledTimes(1)
  })

  it('an unknown account status shows no callout', () => {
    render(<DetallePersona {...base({ persona: { nombre: 'Ana Ruiz', telefono: null, tieneCuenta: null, soloGruposVida: false } })} />)
    expect(within(panel()).queryByText('No tiene cuenta en la plataforma')).not.toBeInTheDocument()
  })
})

describe('DetallePersona — one card per servicio', () => {
  it('shows Rol, Turno and Desde with the etapa, and Cambiar etapa / Turnos / Ver su equipo', async () => {
    const props = base()
    render(<DetallePersona {...props} />)
    expect(within(panel()).getByRole('heading', { name: 'Dónde sirve' })).toBeInTheDocument()
    const coro = tarjeta('Coro')
    expect(coro.getByText('Alabanza')).toBeInTheDocument()
    expect(coro.getByText('Activo')).toBeInTheDocument()
    expect(coro.getByText('Integrante')).toBeInTheDocument()
    expect(coro.getByText('Domingo 9:00')).toBeInTheDocument()
    expect(coro.getByText('10 ene 2026')).toBeInTheDocument()
    expect(coro.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cambiar etapa', 'Turnos'])
    expect(coro.getByRole('link', { name: 'Ver su equipo' })).toHaveAttribute('href', '/dream-team/mi-equipo?direccion=dir-1')

    await user.click(coro.getByRole('button', { name: 'Cambiar etapa' }))
    expect(props.onCambiarEtapa).toHaveBeenCalledWith('s-coro')
    await user.click(coro.getByRole('button', { name: 'Turnos' }))
    expect(props.onTurnos).toHaveBeenCalledWith('s-coro')
  })

  it('names the root and dashes a missing date', () => {
    render(<DetallePersona {...base({ servicios: [{ ...CORO, equipoRuta: '', desde: null }] })} />)
    expect(tarjeta('Coro').getByText('Raíz del organigrama')).toBeInTheDocument()
    expect(tarjeta('Coro').getByText('—')).toBeInTheDocument()
  })

  it('counts servicios in plural', () => {
    render(<DetallePersona {...base({ servicios: [CORO, { ...CORO, clave: 's-2', equipoLabel: 'Sonido' }] })} />)
    expect(within(panel()).getByText('2 servicios')).toBeInTheDocument()
  })
})

describe('DetallePersona — gating by flags', () => {
  it('only the allowed actions show; "Editar ficha" and "Invitar" follow any servicio', () => {
    const soloTurnos = { ...CORO, acciones: { ...SIN_ACCIONES, turnos: true, editarFicha: true, invitar: true, verEquipo: '/x' } }
    render(<DetallePersona {...base({ servicios: [soloTurnos], persona: { nombre: 'Ana Ruiz', telefono: null, tieneCuenta: false, soloGruposVida: false } })} />)
    expect(tarjeta('Coro').getAllByRole('button').map((b) => b.textContent)).toEqual(['Turnos'])
    expect(within(panel()).getByRole('button', { name: 'Editar ficha' })).toBeInTheDocument()
    expect(within(panel()).getByRole('button', { name: 'Invitar a la plataforma' })).toBeInTheDocument()
  })

  it('without flags there is no action, no "Ver su equipo", no "Editar ficha" and no fix buttons', () => {
    render(
      <DetallePersona
        {...base({
          servicios: [{ ...CORO, acciones: SIN_ACCIONES }],
          persona: { nombre: 'Ana Ruiz', telefono: '+17867312193', tieneCuenta: false, soloGruposVida: false },
        })}
      />,
    )
    expect(tarjeta('Coro').queryByRole('button')).not.toBeInTheDocument()
    expect(tarjeta('Coro').queryByRole('link')).not.toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: 'Editar ficha' })).not.toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: 'Corregir en la ficha' })).not.toBeInTheDocument()
    expect(within(panel()).queryByRole('button', { name: 'Invitar a la plataforma' })).not.toBeInTheDocument()
    // The callouts still explain the situation.
    expect(within(panel()).getByText('Revisar teléfono')).toBeInTheDocument()
    expect(within(panel()).getByText('No tiene cuenta en la plataforma')).toBeInTheDocument()
  })
})

describe('DetallePersona — Grupos de Vida is read-only', () => {
  it('says where it is managed and its card has no action', () => {
    render(<DetallePersona {...base({ servicios: [CORO, GDV] })} />)
    expect(within(panel()).getByText('Sus servicios de Grupos de Vida se gestionan desde Grupos de Vida.')).toBeInTheDocument()
    expect(tarjeta('Matrimonios').queryByRole('button')).not.toBeInTheDocument()
    expect(tarjeta('Matrimonios').queryByRole('link')).not.toBeInTheDocument()
  })

  it('a person only in Grupos de Vida carries the mark next to the count', () => {
    render(<DetallePersona {...base({ servicios: [GDV], persona: { nombre: 'Ana Ruiz', telefono: null, tieneCuenta: true, soloGruposVida: true } })} />)
    expect(within(panel()).getByText('1 servicio · Grupos de Vida')).toBeInTheDocument()
  })

  it('without Grupos de Vida servicios there is no note', () => {
    render(<DetallePersona {...base()} />)
    expect(within(panel()).queryByText('Sus servicios de Grupos de Vida se gestionan desde Grupos de Vida.')).not.toBeInTheDocument()
  })
})

describe('DetallePersona — closing', () => {
  it('Escape closes the panel', async () => {
    const props = base()
    render(<Controlado {...props} />)
    await user.keyboard('{Escape}')
    expect(props.onCambioAbierto).toHaveBeenCalledWith(false)
    expect(screen.queryByRole('dialog', { name: 'Ana Ruiz' })).not.toBeInTheDocument()
  })

  it('closed, it renders no panel', () => {
    render(<DetallePersona {...base({ abierto: false })} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('DetallePersona — Mi equipo additions (T7a-3)', () => {
  it('without start dates the third datum is the Origen; the age range goes next to the count', () => {
    const { desde: _desde, ...sinDesde } = CORO
    render(
      <DetallePersona
        {...base({
          persona: { nombre: 'Ana Ruiz', telefono: null, tieneCuenta: true, soloGruposVida: false, edad: '26+' },
          servicios: [sinDesde, GDV],
        })}
      />,
    )
    expect(within(panel()).getByText('2 servicios · Edad 26+')).toBeInTheDocument()
    expect(tarjeta('Coro').getByText('Origen')).toBeInTheDocument()
    expect(tarjeta('Coro').getByText('Dream Team')).toBeInTheDocument()
    expect(tarjeta('Coro').queryByText('Desde')).not.toBeInTheDocument()
    // A screen that passes a start date (Servidores) keeps "Desde", a dash when null.
    expect(tarjeta('Matrimonios').getByText('Desde')).toBeInTheDocument()
  })

  it('"Ver su equipo" inside the screen closes the panel and calls back with the servicio', async () => {
    const onVerEquipo = jest.fn()
    const props = base({
      servicios: [{ ...CORO, acciones: { ...SIN_ACCIONES, irAEquipo: true } }],
      onVerEquipo,
    })
    render(<Controlado {...props} />)
    await user.click(tarjeta('Coro').getByRole('button', { name: 'Ver su equipo' }))
    expect(onVerEquipo).toHaveBeenCalledWith('s-coro')
    expect(props.onCambioAbierto).toHaveBeenCalledWith(false)
  })

  it('without irAEquipo nor a link there is no "Ver su equipo"', () => {
    render(<DetallePersona {...base({ servicios: [GDV], onVerEquipo: jest.fn() })} />)
    expect(tarjeta('Matrimonios').queryByRole('button', { name: 'Ver su equipo' })).not.toBeInTheDocument()
    expect(tarjeta('Matrimonios').queryByRole('link', { name: 'Ver su equipo' })).not.toBeInTheDocument()
  })
})

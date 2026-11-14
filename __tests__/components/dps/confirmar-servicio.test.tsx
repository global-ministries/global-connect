/**
 * The public «Confirmar» page (odd/tasks/dps-asistencia-pco.md, T16b;
 * S14.2, S14.5; artboard design/dps-avisos-correo/05): opening the link never
 * confirms (link scanners open it too) — it shows puesto, fecha and hours
 * (never a name) and a big «Confirmar»; the button confirms through the
 * token and the page says «¡Listo, confirmaste!». Every other state says
 * what happened in one sentence and offers the next step: already
 * confirmed, already said «No puedo» (the link never undoes it), changed
 * since the e-mail (nothing confirmed), taken out, expired, invalid, and a
 * failure that keeps the button. Every person is fictitious.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ConfirmarServicio } from '@/components/dps/confirmar-servicio'
import type { ServicioEnlace } from '@/lib/platform/dps/avisos-correo'

const PLAN = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'A'.repeat(43)

const servicio = (parche: Partial<ServicioEnlace> = {}): ServicioEnlace => ({
  estado: 'por_confirmar',
  planId: PLAN,
  fecha: '2026-11-15',
  tipo: 'domingo',
  titulo: null,
  serie: 'Tu casa tiene influencers',
  roles: [{ nombre: 'Comunicador', equipo: 'Producción Creativa' }],
  horarios: ['09:00', '11:30'],
  llegada: '07:30',
  respondidoAt: null,
  antes: null,
  ...parche,
})

function pagina(inicial: ServicioEnlace, onConfirmar = jest.fn(async () => servicio({ estado: 'confirmado' }))) {
  render(<ConfirmarServicio token={TOKEN} inicial={inicial} onConfirmar={onConfirmar} />)
  return onConfirmar
}

describe('opening the link', () => {
  it('confirms nothing: it shows the service and a big «Confirmar»', () => {
    const onConfirmar = pagina(servicio())
    expect(onConfirmar).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: '¿Puedes servir este domingo?' })).toBeInTheDocument()
    expect(screen.getByText('Domingo 15 de noviembre · Comunicador')).toBeInTheDocument()
    expect(screen.getByText('Comunicador · Producción Creativa')).toBeInTheDocument()
    expect(screen.getByText('Llegada del equipo').nextSibling).toHaveTextContent('7:30')
    expect(screen.getByText('Servicios').nextSibling).toHaveTextContent('9:00 y 11:30')
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'No puedo' })).toHaveAttribute('href', `/mis-servicios/${PLAN}#no-puedo`)
  })
})

describe('the «Confirmar» button', () => {
  it('confirms with the token and says so', async () => {
    const onConfirmar = pagina(servicio())
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(onConfirmar).toHaveBeenCalledWith(TOKEN)
    expect(await screen.findByRole('heading', { level: 1, name: '¡Listo, confirmaste!' })).toBeInTheDocument()
    expect(screen.getByText('Gracias. Tu equipo ya lo ve en el plan.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver en Global Connect' })).toHaveAttribute('href', `/mis-servicios/${PLAN}`)
    expect(screen.getByRole('link', { name: '¿Te equivocaste? No puedo' })).toHaveAttribute('href', `/mis-servicios/${PLAN}#no-puedo`)
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
  })

  it('shows what the database answered when it could not confirm (changed meanwhile)', async () => {
    pagina(servicio(), jest.fn(async () => servicio({ estado: 'cambio', llegada: '07:00', antes: { roles: null, fecha: null, horarios: null, llegada: '07:30' } })))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Este servicio cambió' })).toBeInTheDocument()
  })

  it('keeps the button and says why when confirming fails', async () => {
    pagina(servicio(), jest.fn(async () => servicio({ estado: 'error' })))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No pudimos confirmar. Intenta de nuevo en un momento.'))
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled()
  })
})

describe('a link the page could not read', () => {
  it('says so and keeps «Confirmar» to try again', () => {
    pagina({ ...servicio({ estado: 'error' }), planId: null, fecha: null, roles: [], horarios: [], llegada: null })
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos abrir tu servicio. Toca «Confirmar» para intentarlo de nuevo.')
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled()
  })
})

describe('the other states (05)', () => {
  it('already confirmed: nothing else to do', () => {
    pagina(servicio({ estado: 'ya_confirmado', respondidoAt: '2026-11-11T22:00:00Z' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Ya habías confirmado' })).toBeInTheDocument()
    expect(screen.getByText(/Confirmaste el miércoles 11\. No tienes que hacer nada más\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
  })

  it('already said «No puedo»: the link does not undo it, the app does (with login)', () => {
    pagina(servicio({ estado: 'no_puede', respondidoAt: '2026-11-13T01:14:00Z' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Ya dijiste que no puedes' })).toBeInTheDocument()
    expect(screen.getByText(/Respondiste el jueves 12\. Quien planifica ya lo sabe\./)).toBeInTheDocument()
    expect(screen.getByText('¿Al final sí puedes? Cámbialo en Global Connect.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ábrelo en Global Connect' })).toHaveAttribute('href', `/mis-servicios/${PLAN}`)
    expect(screen.getByText('Te pedirá iniciar sesión.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
  })

  it('changed since the e-mail: shows before and after and confirms nothing', () => {
    pagina(servicio({ estado: 'cambio', llegada: '07:00', antes: { roles: null, fecha: null, horarios: null, llegada: '07:30' } }))
    expect(screen.getByRole('heading', { level: 1, name: 'Este servicio cambió' })).toBeInTheDocument()
    expect(screen.getByText(/Todavía no confirmamos nada\./)).toBeInTheDocument()
    expect(screen.getByText('Llegada del equipo').nextSibling).toHaveTextContent(/^Antes 7:30 ahora →\s?7:00$/)
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver en Global Connect' })).toHaveAttribute('href', `/mis-servicios/${PLAN}`)
  })

  it('taken out: the day is free', () => {
    pagina(servicio({ estado: 'quitado' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Ya no estás programado' })).toBeInTheDocument()
    expect(screen.getByText(/Te quitaron del domingo 15 de noviembre\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver mis servicios' })).toHaveAttribute('href', '/mis-servicios')
  })

  it('expired: the date passed, nothing was saved', () => {
    pagina(servicio({ estado: 'vencido', roles: [], horarios: [], llegada: null }))
    expect(screen.getByRole('heading', { level: 1, name: 'Este enlace ya venció' })).toBeInTheDocument()
    expect(screen.getByText(/Era para el domingo 15 de noviembre, que ya pasó\. No guardamos ninguna respuesta\./)).toBeInTheDocument()
  })

  it('invalid: says nothing about whose it was', () => {
    pagina({ ...servicio({ estado: 'invalido' }), planId: null, fecha: null, roles: [], horarios: [], llegada: null, serie: null })
    expect(screen.getByRole('heading', { level: 1, name: 'No reconocemos este enlace' })).toBeInTheDocument()
    expect(screen.queryByText(/Comunicador/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/')
  })
})

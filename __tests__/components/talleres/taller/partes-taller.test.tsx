/**
 * @jest-environment jsdom
 *
 * R3d (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the side column of the
 * v2 taller page: Pasos para abrir una edición, Equipo and Página pública.
 *
 * R3k (L10) — Equipo without servidores is one compact line (said once on the
 * page), a non-public taller is one short line, and Próximo Paso's card shows
 * its registration link (copy + QR in a DetalleResponsivo).
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const writeText = jest.fn()
const qrSvg = jest.fn()

// qrcode needs TextEncoder, which jsdom lacks; the poster's own helper is mocked, the base URL rule is real.
jest.mock('@/lib/platform/ninos/cartel', () => ({
  ...jest.requireActual('@/lib/platform/ninos/cartel'),
  qrSvg: (texto: string) => qrSvg(texto),
}))

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  qrSvg.mockReset().mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  Object.assign(navigator, { clipboard: { writeText } })
  process.env.NEXT_PUBLIC_SITE_URL = 'https://miembros.yosoyglobal.org'
})

import {
  EquipoTaller,
  PaginaPublicaTaller,
  PasosAbrirEdicion,
  ordenarEquipo,
} from '@/components/talleres/taller/partes-taller'
import type { ServidorDelTaller } from '@/lib/platform/talleres/servidores-del-taller'
import type { PlantillaGrupo } from '@/lib/platform/talleres/plantilla'

const NEIDA: ServidorDelTaller = { personaId: 'p-1', nombre: 'Neida', apellido: 'Castillo', rolServicio: 'Coordinadora', equipoLabel: null }
const BELKIS: ServidorDelTaller = { personaId: 'p-2', nombre: 'Belkis', apellido: 'Arráez', rolServicio: 'Servidora', equipoLabel: null }
const ANA: ServidorDelTaller = { personaId: 'p-3', nombre: 'Ana', apellido: 'Gómez', rolServicio: null, equipoLabel: null }

const GRUPOS: PlantillaGrupo[] = [
  {
    id: 'g-1',
    nombre: 'Grupo A',
    orden: 1,
    capacidad: 10,
    activo: true,
    facilitadores: [{ id: 'f-1', personaId: 'p-2', rol: 'facilitador', nombre: 'Belkis', apellido: 'Arráez' }],
  },
  {
    id: 'g-2',
    nombre: 'Grupo viejo',
    orden: 2,
    capacidad: 10,
    activo: false,
    facilitadores: [{ id: 'f-2', personaId: 'p-3', rol: 'facilitador', nombre: 'Ana', apellido: 'Gómez' }],
  },
]

describe('PasosAbrirEdicion', () => {
  it('shows each step as Listo / Pendiente in words and links the last one to #ediciones', () => {
    render(
      <PasosAbrirEdicion
        pasos={[
          { etiqueta: 'Equipo del nodo', listo: true },
          { etiqueta: 'Plantilla de clases', listo: false },
        ]}
        textoFinal="Crear edición (primera clase)"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Pasos para abrir una edición' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Equipo del nodoListo')
    expect(items[1]).toHaveTextContent('Plantilla de clasesPendiente')
    expect(screen.getByRole('link', { name: 'Crear edición (primera clase)' })).toHaveAttribute('href', '#ediciones')
  })
})

describe('EquipoTaller', () => {
  it('lists the coordinación first, with rol and the active plantilla grupos each one facilitates', () => {
    render(<EquipoTaller servidores={[ANA, BELKIS, NEIDA]} sinAutoridad={false} grupos={GRUPOS} enlaceServidores={null} />)
    expect(screen.getByRole('heading', { name: 'Equipo' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    const nombres = ['Neida Castillo', 'Ana Gómez', 'Belkis Arráez']
    nombres.forEach((nombre, i) => expect(within(items[i]!).getByText(nombre)).toBeInTheDocument())
    expect(items[0]).toHaveTextContent('Coordinadora')
    expect(items[2]).toHaveTextContent('Servidora · Facilitador · Grupo A')
    // An inactive grupo does not count.
    expect(items[1]).toHaveTextContent('—')
    expect(screen.queryByRole('link', { name: 'Gestionar en Servidores' })).not.toBeInTheDocument()
  })

  it('links to Gestionar en Servidores when the page passes the link', () => {
    render(
      <EquipoTaller servidores={[NEIDA]} sinAutoridad={false} grupos={[]} enlaceServidores="/admin/dream-team/servidores?equipo=eq-1" />,
    )
    expect(screen.getByRole('link', { name: 'Gestionar en Servidores' })).toHaveAttribute(
      'href',
      '/admin/dream-team/servidores?equipo=eq-1',
    )
  })

  it('without active servidores: one compact line with the link, said once', () => {
    render(
      <EquipoTaller servidores={[]} sinAutoridad={false} grupos={[]} enlaceServidores="/admin/dream-team/servidores?equipo=eq-1" />,
    )
    expect(screen.getAllByText(/Sin servidores activos/)).toHaveLength(1)
    expect(screen.getByText('Sin servidores activos.')).toBeInTheDocument()
    const enlaces = screen.getAllByRole('link', { name: 'Gestionar en Servidores' })
    expect(enlaces).toHaveLength(1)
    expect(enlaces[0]).toHaveAttribute('href', '/admin/dream-team/servidores?equipo=eq-1')
  })

  it('without active servidores nor the link: just the line', () => {
    render(<EquipoTaller servidores={[]} sinAutoridad={false} grupos={[]} enlaceServidores={null} />)
    expect(screen.getByText('Sin servidores activos.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows the access state, not the empty one, without authority over the equipo', () => {
    render(<EquipoTaller servidores={[]} sinAutoridad grupos={[]} enlaceServidores={null} />)
    expect(screen.getByText('No tienes autoridad para ver el equipo de este taller.')).toBeInTheDocument()
    expect(screen.queryByText(/Sin servidores activos/)).not.toBeInTheDocument()
  })

  it('ordenarEquipo keeps names in alphabetical order after the coordinación', () => {
    expect(ordenarEquipo([BELKIS, ANA, NEIDA]).map((s) => s.personaId)).toEqual(['p-1', 'p-3', 'p-2'])
  })
})

describe('PaginaPublicaTaller', () => {
  it('a public taller: «Recibe solicitudes», its public path, Ver página and Compartir', () => {
    render(<PaginaPublicaTaller slug="mujer-de-hoy" publico enlaceCompartir="/talleres/mujer-de-hoy/compartir" />)
    expect(screen.getByRole('heading', { name: 'Página pública' })).toBeInTheDocument()
    expect(screen.getByText('Recibe solicitudes')).toBeInTheDocument()
    expect(screen.getByText('/talleres/reservar/mujer-de-hoy')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver página' })).toHaveAttribute('href', '/talleres/reservar/mujer-de-hoy')
    expect(screen.getByRole('link', { name: 'Ver página' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Enlace, QR y código' })).toHaveAttribute('href', '/talleres/mujer-de-hoy/compartir')
  })

  it('a non-public taller without Compartir: «No aparece», one short line and no links', () => {
    render(<PaginaPublicaTaller slug="mujer-de-hoy" publico={false} enlaceCompartir={null} />)
    expect(screen.getByText('No aparece')).toBeInTheDocument()
    expect(screen.getByText('Solo se inscribe desde la app o la coordinación.')).toBeInTheDocument()
    expect(screen.queryByText(/Este dato no se cambia/)).not.toBeInTheDocument()
    expect(screen.queryByText('/talleres/reservar/mujer-de-hoy')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('a non-public taller with Compartir keeps the link next to the line', () => {
    render(<PaginaPublicaTaller slug="mujer-de-hoy" publico={false} enlaceCompartir="/talleres/mujer-de-hoy/compartir" />)
    expect(screen.getByRole('link', { name: 'Enlace, QR y código' })).toHaveAttribute('href', '/talleres/mujer-de-hoy/compartir')
  })
})

describe('PaginaPublicaTaller — Próximo Paso (R3k)', () => {
  it('shows «Se inscriben con este enlace» and the /proximo-paso URL instead of the public page line', async () => {
    render(<PaginaPublicaTaller slug="proximo-paso" publico={false} enlaceCompartir="/talleres/proximo-paso/compartir" />)
    expect(screen.getByRole('heading', { name: 'Página pública' })).toBeInTheDocument()
    expect(screen.getByText('Se inscriben con este enlace')).toBeInTheDocument()
    const url = await screen.findByText('https://miembros.yosoyglobal.org/proximo-paso')
    expect(url.className).toMatch(/truncate/)
    expect(url.className).toMatch(/font-mono/)
    expect(screen.queryByText('No aparece')).not.toBeInTheDocument()
    expect(screen.queryByText(/Solo se inscribe desde la app/)).not.toBeInTheDocument()
    expect(screen.queryByText('/talleres/reservar/proximo-paso')).not.toBeInTheDocument()
  })

  it('copies the link, for anyone who sees the page', async () => {
    render(<PaginaPublicaTaller slug="proximo-paso" publico={false} enlaceCompartir={null} />)
    await screen.findByText('https://miembros.yosoyglobal.org/proximo-paso')
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://miembros.yosoyglobal.org/proximo-paso'))
    expect(await screen.findByText('Enlace copiado')).toBeInTheDocument()
  })

  it('«Ver QR» opens the QR with «Descargar imagen»', async () => {
    render(<PaginaPublicaTaller slug="proximo-paso" publico={false} enlaceCompartir={null} />)
    await screen.findByText('https://miembros.yosoyglobal.org/proximo-paso')
    expect(screen.queryByRole('img', { name: /Código QR/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver QR' }))
    const qr = await screen.findByRole('img', { name: 'Código QR de https://miembros.yosoyglobal.org/proximo-paso' })
    expect(qrSvg).toHaveBeenCalledWith('https://miembros.yosoyglobal.org/proximo-paso')
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(screen.getByRole('link', { name: 'Descargar imagen' })).toHaveAttribute('download', 'proximo-paso-qr.svg')
  })
})

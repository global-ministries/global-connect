/**
 * @jest-environment jsdom
 *
 * /talleres/explorar client.
 *
 * R3a (odd/tasks/talleres-rediseno.md, S1 S2 S6 S7; design/talleres-interior/
 * 20 and 21) — one card per taller with its ediciones (Empieza el, hora,
 * lugar, cupo) and the state button: Inscribirme / Ya inscrito|Ya inscrita
 * by the ficha's género / Pendiente / Lleno. «Inscribirme» opens the
 * confirmation in DetalleResponsivo; a couple edición continues to the
 * partner picker (P2 of odd/tasks/talleres-inscripcion-en-pareja.md).
 *
 * T9 (odd/tasks/proximo-paso.md, L21–L23) — the toast follows the real
 * estado of the inscripción, and every text is neutral Spanish (tú).
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'

const inscribirseActionMock = jest.fn()
const notificar = { success: jest.fn(), error: jest.fn(), info: jest.fn() }

jest.mock('@/app/(auth)/talleres/explorar/actions', () => ({
  inscribirseATaller: (...args: unknown[]) => inscribirseActionMock(...args),
}))

jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => notificar,
}))

jest.mock('@/lib/platform/ninos/cartel', () => ({
  qrSvg: jest.fn().mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
}))

// The partner picker is covered by __tests__/components/talleres/selector-pareja.test.tsx.
const selectorMock = jest.fn()
jest.mock('@/components/talleres/selector-pareja', () => ({
  SelectorPareja: (props: {
    edicionId: string
    vinculoEdicion: 'matrimonio' | 'novios' | null
    onCerrar: () => void
    onInscrito: () => void
  }) => {
    selectorMock(props)
    return (
      <div data-testid="selector-pareja">
        <button onClick={props.onInscrito}>pareja-inscrita</button>
        <button onClick={props.onCerrar}>cerrar-selector</button>
      </div>
    )
  },
}))

import { ExplorarTalleresClient, ESPERA_FILAS_MS } from '@/app/(auth)/talleres/explorar/explorar-client'
import type { TallerExplorarFila } from '@/components/talleres/explorar/modelo'

const URL_PP = 'https://miembros.yosoyglobal.org/proximo-paso'

const individual: TallerExplorarFila = {
  id: 'ed-ind',
  nombre: 'De Hombre a Hombre',
  slug: 'de-hombre-a-hombre',
  tipo: 'individual',
  link_type: null,
  edicion: 'Noviembre 2026',
  estado: 'abierto',
  ya_inscrito: false,
  estado_inscripcion: null,
  descripcion: 'Seis viernes para crecer como hombre de fe.',
  cierre_inscripcion: null,
  primera_clase: '2026-11-26',
  cupo_completo: false,
  hora: '19:30',
  lugar: 'Salón 1',
  clases: 6,
  cupo: { total: 24, ocupados: 12, disponibles: 12, unidad: 'personas' },
  genero_requerido: 'Masculino',
  inscripcion_automatica: false,
}

const pareja: TallerExplorarFila = {
  ...individual,
  id: 'ed-par',
  nombre: 'Matrimonio sobre la Roca',
  slug: 'matrimonio-sobre-la-roca',
  tipo: 'pareja',
  link_type: 'matrimonio',
  edicion: 'Enero 2027',
  descripcion: null,
  genero_requerido: null,
  cupo: { total: 15, ocupados: 6, disponibles: 9, unidad: 'parejas' },
}

const persona = { nombre: 'Jonathan Rodríguez', telefono: '0414-552-3018', email: 'jonathan@x.org', genero: 'Masculino' as const }

function conMatchMedia(escritorio: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: escritorio,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
}

beforeEach(() => {
  inscribirseActionMock.mockReset()
  selectorMock.mockReset()
  notificar.success.mockReset()
  notificar.error.mockReset()
  // No matchMedia: DetalleResponsivo falls back to the desktop panel.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test cleanup
  delete (window as any).matchMedia
})

describe('ExplorarTalleresClient — tarjeta del taller (R3a)', () => {
  it('shows who it is for, the name, the edición, Empieza el, hora, lugar and cupo', () => {
    render(<ExplorarTalleresClient talleres={[individual]} />)

    expect(screen.getByText('Para hombres')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'De Hombre a Hombre' })).toBeInTheDocument()
    expect(screen.getByText('Seis viernes para crecer como hombre de fe.')).toBeInTheDocument()
    expect(screen.getByText('Noviembre 2026')).toBeInTheDocument()
    expect(screen.getByText('Abierta')).toBeInTheDocument()
    expect(screen.getByText('Empieza el')).toBeInTheDocument()
    expect(screen.getByText('jue 26 nov')).toBeInTheDocument()
    expect(screen.getByText('6 clases')).toBeInTheDocument()
    expect(screen.getByText('Jueves')).toBeInTheDocument()
    expect(screen.getByText('7:30 p.m.')).toBeInTheDocument()
    expect(screen.getByText('Salón 1')).toBeInTheDocument()
    expect(screen.getByText(/Quedan/).textContent).toBe('Quedan 12 lugares de 24')
  })

  it('a couple taller says it is for matrimonios and counts parejas', () => {
    render(<ExplorarTalleresClient talleres={[pareja]} />)
    expect(screen.getByText('Para matrimonios · se inscriben los dos')).toBeInTheDocument()
    expect(screen.getByText(/Quedan/).textContent).toBe('Quedan 9 parejas de 15')
    expect(screen.getByRole('button', { name: /Inscribirnos en Matrimonio sobre la Roca/ })).toBeInTheDocument()
  })

  it('groups the ediciones of one taller in one card', () => {
    render(
      <ExplorarTalleresClient
        talleres={[individual, { ...individual, id: 'ed-ind-2', edicion: 'Diciembre 2026' }]}
      />,
    )
    expect(screen.getAllByRole('heading', { name: 'De Hombre a Hombre' })).toHaveLength(1)
    expect(screen.getByText('Noviembre 2026')).toBeInTheDocument()
    expect(screen.getByText('Diciembre 2026')).toBeInTheDocument()
  })

  it('an edición en curso shows «En curso» and no «Empieza el»', () => {
    render(<ExplorarTalleresClient talleres={[{ ...individual, estado: 'en_curso' }]} />)
    expect(screen.getByText('En curso')).toBeInTheDocument()
    expect(screen.queryByText('Empieza el')).not.toBeInTheDocument()
    expect(screen.queryByText('en_curso')).not.toBeInTheDocument()
  })

  it('shows «Inscripción hasta el …» as that calendar day, only when there is one', () => {
    const { rerender } = render(<ExplorarTalleresClient talleres={[{ ...individual, cierre_inscripcion: '2027-01-03' }]} />)
    expect(screen.getByText('Inscripción hasta el 3 de enero de 2027')).toBeInTheDocument()
    rerender(<ExplorarTalleresClient talleres={[individual]} />)
    expect(screen.queryByText(/Inscripción hasta/)).not.toBeInTheDocument()
  })

  it('without hora, lugar or cupo it shows only what it knows', () => {
    render(
      <ExplorarTalleresClient
        talleres={[{ ...individual, hora: null, lugar: null, cupo: null, clases: null, primera_clase: null }]}
      />,
    )
    expect(screen.queryByText('Hora')).not.toBeInTheDocument()
    expect(screen.queryByText('Lugar')).not.toBeInTheDocument()
    expect(screen.queryByText(/Quedan/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Inscribirme en De Hombre a Hombre/ })).toBeInTheDocument()
  })

  it('no talleres: the empty state', () => {
    render(<ExplorarTalleresClient talleres={[]} />)
    expect(screen.getByText('No hay talleres abiertos en este momento.')).toBeInTheDocument()
  })
})

describe('ExplorarTalleresClient — estado de cada edición (R3a, S6)', () => {
  it('«Ya inscrito» for an approved inscripción of a man or an unknown ficha', () => {
    render(
      <ExplorarTalleresClient
        talleres={[{ ...individual, ya_inscrito: true, estado_inscripcion: 'aprobado' }]}
        persona={persona}
      />,
    )
    expect(screen.getByText('Ya inscrito')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Inscribirme/ })).not.toBeInTheDocument()
  })

  it('«Ya inscrita» when the ficha says Femenino', () => {
    render(
      <ExplorarTalleresClient
        talleres={[{ ...individual, ya_inscrito: true, estado_inscripcion: 'aprobado' }]}
        persona={{ ...persona, nombre: 'Génesis Rodríguez', genero: 'Femenino' }}
      />,
    )
    expect(screen.getByText('Ya inscrita')).toBeInTheDocument()
    expect(screen.queryByText('Ya inscrito')).not.toBeInTheDocument()
  })

  it('«Pendiente» while the coordinación confirms it', () => {
    render(<ExplorarTalleresClient talleres={[{ ...individual, ya_inscrito: true, estado_inscripcion: 'pendiente' }]} />)
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Inscribirme/ })).not.toBeInTheDocument()
  })

  it('«Lleno» without the button when the cupo is full', () => {
    render(
      <ExplorarTalleresClient
        talleres={[{ ...individual, cupo_completo: true, cupo: { total: 24, ocupados: 24, disponibles: 0, unidad: 'personas' } }]}
      />,
    )
    expect(screen.getByText('Lleno')).toBeInTheDocument()
    expect(screen.getByText(/ocupados/).textContent).toBe('24 de 24 lugares ocupados')
    expect(screen.queryByRole('button', { name: /Inscribirme/ })).not.toBeInTheDocument()
  })

  it('never «Lleno» for whoever is already in', () => {
    render(
      <ExplorarTalleresClient talleres={[{ ...individual, ya_inscrito: true, cupo_completo: true }]} />,
    )
    expect(screen.getByText('Ya inscrito')).toBeInTheDocument()
    expect(screen.queryByText('Lleno')).not.toBeInTheDocument()
  })
})

describe('ExplorarTalleresClient — confirmación (R3a)', () => {
  it('«Inscribirme» opens the confirmation with the edición and «Tus datos»', async () => {
    render(<ExplorarTalleresClient talleres={[individual]} persona={persona} />)
    fireEvent.click(screen.getByRole('button', { name: /Inscribirme en De Hombre a Hombre/ }))

    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Confirmar inscripción')).toBeInTheDocument()
    expect(within(panel).getByText('Empieza el 26 de noviembre de 2026 · Jueves 7:30 p.m. · 6 clases')).toBeInTheDocument()
    expect(within(panel).getByText('Jonathan Rodríguez')).toBeInTheDocument()
    expect(within(panel).getByText('0414-552-3018')).toBeInTheDocument()
    expect(within(panel).getByText(/La coordinación revisa cada solicitud/)).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /Enviar solicitud/ })).toBeInTheDocument()
    expect(inscribirseActionMock).not.toHaveBeenCalled()
  })

  it('inscripción automática: the button says «Inscribirme» and the note does not promise a review', async () => {
    render(<ExplorarTalleresClient talleres={[{ ...individual, inscripcion_automatica: true }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Inscribirme en De Hombre a Hombre/ }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('button', { name: /^Inscribirme$/ })).toBeInTheDocument()
    expect(within(panel).queryByText(/La coordinación revisa/)).not.toBeInTheDocument()
  })

  it('sends the inscripción with no pareja and closes the panel', async () => {
    inscribirseActionMock.mockResolvedValue({ ok: true, inscripcionId: 'insc-1' })
    render(<ExplorarTalleresClient talleres={[individual]} />)
    fireEvent.click(screen.getByRole('button', { name: /Inscribirme en De Hombre a Hombre/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Enviar solicitud/ }))

    await waitFor(() => expect(inscribirseActionMock).toHaveBeenCalledWith({ edicionId: 'ed-ind', pareja: null }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows the action message inside the panel on failure, never the raw code', async () => {
    inscribirseActionMock.mockResolvedValue({
      ok: false,
      error: 'EDICION_NO_ABIERTA',
      message: 'Las inscripciones de esta edición están cerradas.',
    })
    render(<ExplorarTalleresClient talleres={[individual]} />)
    fireEvent.click(screen.getByRole('button', { name: /Inscribirme en De Hombre a Hombre/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Enviar solicitud/ }))

    expect(await screen.findByText('Las inscripciones de esta edición están cerradas.')).toBeInTheDocument()
    expect(screen.queryByText(/EDICION_NO_ABIERTA/)).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(notificar.success).not.toHaveBeenCalled()
  })
})

describe('ExplorarTalleresClient — pareja (P2, R3a #parejas)', () => {
  async function abrirPareja(fila: TallerExplorarFila = pareja) {
    render(<ExplorarTalleresClient talleres={[fila]} />)
    fireEvent.click(screen.getByRole('button', { name: /Inscribirnos en Matrimonio sobre la Roca/ }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Inscribirse en pareja')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: /Elegir a mi pareja/ }))
    return screen.findByTestId('selector-pareja')
  }

  it('«Elegir a mi pareja» opens the partner picker for that edición without enrolling yet', async () => {
    await abrirPareja()
    expect(selectorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ edicionId: 'ed-par', vinculoEdicion: 'matrimonio' }),
    )
    expect(inscribirseActionMock).not.toHaveBeenCalled()
  })

  it('a pareja without vínculo hands the picker a null vínculo', async () => {
    await abrirPareja({ ...pareja, link_type: null })
    expect(selectorMock).toHaveBeenLastCalledWith(expect.objectContaining({ edicionId: 'ed-par', vinculoEdicion: null }))
  })

  it('closing the picker enrolls nothing', async () => {
    await abrirPareja()
    fireEvent.click(screen.getByText('cerrar-selector'))
    expect(screen.queryByTestId('selector-pareja')).not.toBeInTheDocument()
    expect(inscribirseActionMock).not.toHaveBeenCalled()
    expect(notificar.success).not.toHaveBeenCalled()
  })

  it('a finished enrollment closes the picker and, without new rows, says «Recibimos tu inscripción.»', async () => {
    await abrirPareja()
    jest.useFakeTimers()
    try {
      fireEvent.click(screen.getByText('pareja-inscrita'))
      expect(screen.queryByTestId('selector-pareja')).not.toBeInTheDocument()
      expect(notificar.success).not.toHaveBeenCalled()
      act(() => {
        jest.advanceTimersByTime(ESPERA_FILAS_MS)
      })
      expect(notificar.success).toHaveBeenCalledWith('Recibimos tu inscripción.')
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('ExplorarTalleresClient — estado real de la inscripción (T9)', () => {
  async function inscribirYRecargar(estado: 'aprobado' | 'pendiente', genero: 'Masculino' | 'Femenino' = 'Masculino') {
    inscribirseActionMock.mockResolvedValue({ ok: true, inscripcionId: 'insc-9' })
    const ficha = { ...persona, genero }
    const { rerender } = render(<ExplorarTalleresClient talleres={[individual]} persona={ficha} />)
    fireEvent.click(screen.getByRole('button', { name: /Inscribirme en De Hombre a Hombre/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Enviar solicitud/ }))
    await waitFor(() => expect(inscribirseActionMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // The action revalidates /talleres/explorar: the rows arrive with the estado.
    rerender(
      <ExplorarTalleresClient talleres={[{ ...individual, ya_inscrito: true, estado_inscripcion: estado }]} persona={ficha} />,
    )
  }

  it('approved right away: «¡Listo, ya estás inscrito!»', async () => {
    await inscribirYRecargar('aprobado')
    await waitFor(() => expect(notificar.success).toHaveBeenCalledWith('¡Listo, ya estás inscrito!'))
    expect(notificar.success).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Ya inscrito')).toBeInTheDocument()
  })

  it('approved right away, ficha Femenino: «¡Listo, ya estás inscrita!» and «Ya inscrita»', async () => {
    await inscribirYRecargar('aprobado', 'Femenino')
    await waitFor(() => expect(notificar.success).toHaveBeenCalledWith('¡Listo, ya estás inscrita!'))
    expect(screen.getByText('Ya inscrita')).toBeInTheDocument()
  })

  it('pending: «Recibimos tu inscripción. La coordinación la confirmará.»', async () => {
    await inscribirYRecargar('pendiente')
    await waitFor(() =>
      expect(notificar.success).toHaveBeenCalledWith('Recibimos tu inscripción. La coordinación la confirmará.'),
    )
    expect(notificar.success).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
  })

  it('renders no voseo nor «inscripto», and no modality jargon', async () => {
    const { container } = render(
      <ExplorarTalleresClient
        talleres={[{ ...individual, ya_inscrito: true }, pareja, { ...individual, id: 'ed-pp', nombre: 'Próximo Paso', slug: 'proximo-paso' }]}
        persona={persona}
        proximoPasoHecho
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Inscribirnos en Matrimonio sobre la Roca/ }))
    await screen.findByRole('dialog')
    const texto = `${container.textContent ?? ''} ${document.body.textContent ?? ''}`
    expect(texto).not.toMatch(/Tocá|tenés|Explorá|para vos|inscripto|Permanente custom|Modalidad/)
  })
})

describe('ExplorarTalleresClient — compartir Próximo Paso (R3a, S7)', () => {
  it('no share card unless the person already did Próximo Paso', () => {
    render(<ExplorarTalleresClient talleres={[individual]} />)
    expect(screen.queryByText('Ya hiciste Próximo Paso')).not.toBeInTheDocument()
  })

  it('shows the share card with the link, «Compartir enlace» and «Ver código QR»', () => {
    render(<ExplorarTalleresClient talleres={[individual]} proximoPasoHecho />)
    expect(screen.getByRole('heading', { name: 'Ya hiciste Próximo Paso' })).toBeInTheDocument()
    expect(screen.getByText('Compártelo con alguien que todavía no lo ha hecho.')).toBeInTheDocument()
    expect(screen.getByText('miembros.yosoyglobal.org/proximo-paso')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compartir enlace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver código QR' })).toBeInTheDocument()
  })

  it('shows the share card even when no taller is open', () => {
    render(<ExplorarTalleresClient talleres={[]} proximoPasoHecho />)
    expect(screen.getByRole('heading', { name: 'Ya hiciste Próximo Paso' })).toBeInTheDocument()
  })

  it('desktop: «Compartir enlace» copies the absolute link and says so', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText }, share: jest.fn() })
    render(<ExplorarTalleresClient talleres={[]} proximoPasoHecho />)
    fireEvent.click(screen.getByRole('button', { name: 'Compartir enlace' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_PP))
    expect(notificar.success).toHaveBeenCalledWith(
      'Copiamos el enlace de Próximo Paso. Pégalo en un mensaje para quien todavía no lo ha hecho.',
    )
    expect((navigator as unknown as { share: jest.Mock }).share).not.toHaveBeenCalled()
  })

  it('desktop: a failed copy says how to do it by hand', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('no')) } })
    render(<ExplorarTalleresClient talleres={[]} proximoPasoHecho />)
    fireEvent.click(screen.getByRole('button', { name: 'Compartir enlace' }))
    await waitFor(() => expect(notificar.error).toHaveBeenCalledWith('No se pudo copiar. Selecciona el enlace y cópialo.'))
  })

  it('phone with a share sheet: opens it with the link, no copy', async () => {
    conMatchMedia(false)
    const share = jest.fn().mockResolvedValue(undefined)
    const writeText = jest.fn()
    Object.assign(navigator, { clipboard: { writeText }, share })
    render(<ExplorarTalleresClient talleres={[]} proximoPasoHecho />)
    fireEvent.click(screen.getByRole('button', { name: 'Compartir enlace' }))
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: URL_PP, title: 'Próximo Paso' })))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('phone without a share sheet: copies', async () => {
    conMatchMedia(false)
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText }, share: undefined })
    render(<ExplorarTalleresClient talleres={[]} proximoPasoHecho />)
    fireEvent.click(screen.getByRole('button', { name: 'Compartir enlace' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_PP))
  })

  it('«Ver código QR» opens the QR of the link', async () => {
    render(<ExplorarTalleresClient talleres={[]} proximoPasoHecho />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver código QR' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Código QR de Próximo Paso')).toBeInTheDocument()
    expect(await within(panel).findByAltText(`Código QR de ${URL_PP}`)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /Descargar imagen/ })).toHaveAttribute('download', 'proximo-paso-qr.svg')
  })
})

/**
 * @jest-environment jsdom
 *
 * R4b (odd/tasks/talleres-rediseno.md, S10; design/talleres-avisos/01) — the
 * notices list gains the «Texto» column (Texto predeterminado / Personalizado
 * · quién · cuándo; Cambio de fecha: «Lo escribe quien mueve la fecha»),
 * «Editar texto» for editors and «Ver texto» for readers, and the filter
 * «Personalizados».
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

jest.mock('@/lib/platform/talleres/avisos-actions', () => ({ guardarAvisoTallerAction: jest.fn() }))
jest.mock('@/lib/platform/talleres/avisos-textos-actions', () => ({
  guardarTextoAvisoAction: jest.fn(),
  restaurarTextoAvisoAction: jest.fn(),
  enviarPruebaAvisoAction: jest.fn(),
}))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) }))

import { CentroAvisos } from '@/app/(auth)/talleres/[taller]/avisos/centro-avisos.client'
import type { PanelAvisos } from '@/lib/platform/talleres/avisos-panel'
import type { VariablesAvisos } from '@/lib/platform/talleres/avisos-textos'

const TODAS = ['nombre', 'taller', 'edicion', 'fecha', 'hora', 'lugar', 'indicaciones', 'grupo', 'facilitadores', 'numero', 'clase', 'mensaje_no_aprobado']
const VARIABLES: VariablesAvisos = Object.fromEntries(
  ['inscripcion_recibida', 'inscripcion_aprobada', 'inscripcion_rechazada', 'grupo_asignado', 'recordatorio_clase', 'certificado_listo', 'lugar_disponible'].map(
    (tipo) => [tipo, { variables: TODAS, asunto: ['nombre', 'taller', 'edicion'] }],
  ),
)

function panel(overrides: Partial<PanelAvisos> = {}): PanelAvisos {
  return {
    config: {},
    puedeEditar: true,
    mes: { inscripcion_aprobada: 22 },
    resumen: { enviadosMes: 22, sinEntregar: 0, sinCorreo: 0 },
    historial: [],
    textos: [
      { tipo: 'inscripcion_aprobada', claseId: null, asunto: 'A', mensaje: 'B', editadoPor: 'Neida Castillo', editadoEn: '2026-11-04T14:00:00Z' },
      { tipo: 'recordatorio_clase', claseId: 'c2', asunto: 'A', mensaje: 'B', editadoPor: 'Mariela Torres', editadoEn: '2026-11-10T14:00:00Z' },
    ],
    ...overrides,
  }
}

const CLASES = [
  { id: 'c1', numero: 1, tema: 'Sígueme' },
  { id: 'c2', numero: 2, tema: 'Intimidad con Dios' },
]

function pintar(props: Partial<Parameters<typeof CentroAvisos>[0]> = {}) {
  return render(
    <CentroAvisos tallerId="t1" tallerNombre="Mujer de Hoy" panel={panel()} variables={VARIABLES} clases={CLASES} {...props} />,
  )
}

function fila(nombre: string) {
  return screen.getByRole('listitem', { name: nombre })
}

describe('CentroAvisos — «Texto» column', () => {
  it('each notice says whether it uses its default text or a custom one, by whom and when', () => {
    pintar()
    expect(within(fila('Solicitud recibida')).getByText('Texto predeterminado')).toBeInTheDocument()
    expect(within(fila('Aprobada')).getByText('Personalizado')).toBeInTheDocument()
    expect(within(fila('Aprobada')).getByText('Neida Castillo · 4 nov')).toBeInTheDocument()
    expect(within(fila('Recordatorio de clase')).getByText('Personalizado')).toBeInTheDocument()
    expect(within(fila('Recordatorio de clase')).getByText('1 de 2 clases con texto propio')).toBeInTheDocument()
    expect(within(fila('Cambio de fecha')).getByText('Lo escribe quien mueve la fecha')).toBeInTheDocument()
  })

  it('editors get «Editar texto»; it opens the editor of that notice', () => {
    pintar()
    expect(within(fila('Solicitud recibida')).getByRole('button', { name: 'Editar texto: Solicitud recibida' })).toBeInTheDocument()
    expect(within(fila('Cambio de fecha')).queryByRole('button', { name: /Editar texto/ })).not.toBeInTheDocument()
    fireEvent.click(within(fila('Aprobada')).getByRole('button', { name: 'Editar texto: Aprobada' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Aprobada')
    expect(screen.getByLabelText(/Asunto del correo/)).toHaveValue('A')
  })

  it('readers get «Ver texto» instead', () => {
    pintar({ panel: panel({ puedeEditar: false }) })
    expect(within(fila('Aprobada')).getByRole('button', { name: 'Ver texto: Aprobada' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar texto/ })).not.toBeInTheDocument()
  })

  it('the «Personalizados» filter shows only the custom ones, with an empty state', () => {
    pintar()
    fireEvent.click(screen.getByRole('button', { name: /Personalizados/ }))
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Aprobada', 'Recordatorio de clase'])

    pintar({ panel: panel({ textos: [] }), filtroInicial: 'personalizados' })
    expect(screen.getByText('Ningún aviso tiene texto personalizado')).toBeInTheDocument()
  })
})

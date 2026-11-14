/**
 * @jest-environment jsdom
 *
 * R4b (odd/tasks/talleres-rediseno.md, S10; design/talleres-avisos 02–04) —
 * the editor of one notice's text: subject and message with counters, the
 * variable chips of talleres_aviso_variables() for that kind, the live
 * preview (email and bell) with sample data, client validation that mirrors
 * the server (unknown variable → error with «Quitar {x}», Guardar disabled),
 * server errors, «Restaurar texto predeterminado» with confirmation,
 * «Enviarme una prueba», the reader view, and the class reminder's «Por
 * clase» / «Texto general».
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const guardarMock = jest.fn()
const restaurarMock = jest.fn()
const pruebaMock = jest.fn()
const notificar = { success: jest.fn(), error: jest.fn(), info: jest.fn() }

jest.mock('@/lib/platform/talleres/avisos-textos-actions', () => ({
  guardarTextoAvisoAction: (...args: unknown[]) => guardarMock(...args),
  restaurarTextoAvisoAction: (...args: unknown[]) => restaurarMock(...args),
  enviarPruebaAvisoAction: (...args: unknown[]) => pruebaMock(...args),
}))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => notificar }))

import { PanelTextoAviso } from '@/components/talleres/avisos/panel-texto-aviso'
import { AVISOS_TALLER } from '@/lib/platform/talleres/avisos-catalogo'
import type { DefinicionVariables, TextoAvisoGuardado } from '@/lib/platform/talleres/avisos-textos'

const TALLER = '6f1d2c3b-1111-4222-8333-444455556666'
const APROBADA = AVISOS_TALLER.find((a) => a.tipo === 'inscripcion_aprobada')!
const RECORDATORIO = AVISOS_TALLER.find((a) => a.tipo === 'recordatorio_clase')!
const DEF_APROBADA: DefinicionVariables = {
  variables: ['nombre', 'taller', 'edicion', 'fecha', 'hora', 'lugar', 'indicaciones'],
  asunto: ['nombre', 'taller', 'edicion'],
}
const DEF_RECORDATORIO: DefinicionVariables = {
  variables: ['nombre', 'taller', 'edicion', 'numero', 'clase', 'grupo', 'facilitadores', 'fecha', 'hora', 'lugar', 'indicaciones'],
  asunto: ['nombre', 'taller', 'edicion', 'grupo', 'numero'],
}
const PROPIO: TextoAvisoGuardado = {
  tipo: 'inscripcion_aprobada',
  claseId: null,
  asunto: '¡Ya tienes tu lugar en {taller}!',
  mensaje: '¡Qué alegría tenerte en {taller}!\n\nNos vemos en {lugar}.',
  editadoPor: 'Neida Castillo',
  editadoEn: '2026-11-04T14:00:00Z',
}

function abrir(props: Partial<Parameters<typeof PanelTextoAviso>[0]> = {}) {
  const onCerrar = jest.fn()
  render(
    <PanelTextoAviso
      abierto
      onCerrar={onCerrar}
      aviso={APROBADA}
      tallerId={TALLER}
      tallerNombre="Mujer de Hoy"
      definicion={DEF_APROBADA}
      textos={[]}
      clases={[]}
      puedeEditar
      {...props}
    />,
  )
  return { onCerrar }
}

const asunto = () => screen.getByLabelText(/Asunto del correo/) as HTMLInputElement
const mensaje = () => screen.getByLabelText(/^Mensaje/) as HTMLTextAreaElement

beforeEach(() => {
  jest.clearAllMocks()
  guardarMock.mockResolvedValue({ ok: true, mensaje: 'Guardado. Los próximos avisos «Aprobada» salen con este texto.' })
  restaurarMock.mockResolvedValue({ ok: true, mensaje: '«Aprobada» vuelve al texto predeterminado.' })
  pruebaMock.mockResolvedValue({ ok: true, mensaje: 'Te enviamos la prueba a neida@example.test.' })
})

describe('PanelTextoAviso — editor', () => {
  it('starts with the default text, counters and one chip per variable of the kind', () => {
    abrir()
    expect(screen.getByText('Texto predeterminado')).toBeInTheDocument()
    expect(asunto().value).toBe('Aprobamos tu inscripción en {taller}')
    expect(mensaje().value).toContain('Tienes tu lugar en {taller}.')
    expect(screen.getByText(`${asunto().value.length}`, { selector: '[data-contador="asunto"]' })).toBeInTheDocument()
    const chips = within(screen.getByRole('group', { name: /Datos de este aviso/ })).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual(DEF_APROBADA.variables.map((v) => `{${v}}`))
    expect(screen.getByText(/En el asunto solo puedes usar/)).toHaveTextContent('{nombre}, {taller}, {edicion}')
  })

  it('a saved custom text shows who edited it', () => {
    abrir({ textos: [PROPIO] })
    expect(screen.getByText('Personalizado')).toBeInTheDocument()
    expect(screen.getByText(/editado por Neida Castillo el 4 nov/)).toBeInTheDocument()
    expect(asunto().value).toBe(PROPIO.asunto)
  })

  it('the preview renders the sample data live, with the line breaks', () => {
    abrir()
    fireEvent.change(mensaje(), { target: { value: 'Hola {taller}.\nNos vemos en {lugar}.' } })
    const correo = screen.getByRole('region', { name: 'Vista previa del correo' })
    expect(correo).toHaveTextContent('¡Hola, Carolina!')
    expect(correo).toHaveTextContent('Hola Mujer de Hoy.')
    expect(correo).toHaveTextContent('Nos vemos en Salón 2.')
    expect(within(correo).getAllByText('Mujer de Hoy', { selector: 'mark, span' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: 'Vista previa de la campana' })).toHaveTextContent('Aprobamos tu inscripción')
  })

  it('an unknown variable: error, «Quitar {x}» and Guardar disabled until it is fixed', () => {
    abrir()
    fireEvent.change(mensaje(), { target: { value: 'En unos días te contamos tu grupo: {grupo}.' } })
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('No se puede guardar todavía')
    expect(alerta).toHaveTextContent('{grupo} no es un dato de «Aprobada».')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    expect(mensaje()).toHaveAttribute('aria-invalid', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Quitar {grupo}' }))
    expect(mensaje().value).toBe('En unos días te contamos tu grupo.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  })

  it('a variable that can be missing in the subject is an error of the subject', () => {
    abrir()
    fireEvent.change(asunto(), { target: { value: 'Te esperamos en {lugar}' } })
    expect(screen.getByRole('alert')).toHaveTextContent('El asunto no puede usar {lugar}')
    expect(asunto()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('a chip inserts its variable where the cursor was', () => {
    abrir()
    fireEvent.change(mensaje(), { target: { value: 'Hola ' } })
    mensaje().focus()
    mensaje().setSelectionRange(5, 5)
    fireEvent.click(screen.getByRole('button', { name: 'Insertar {nombre}' }))
    expect(mensaje().value).toBe('Hola {nombre}')
  })

  it('Guardar sends the draft and closes; a server error stays in the panel', async () => {
    const { onCerrar } = abrir()
    fireEvent.change(asunto(), { target: { value: '¡Ya tienes tu lugar en {taller}!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onCerrar).toHaveBeenCalled())
    expect(guardarMock).toHaveBeenCalledWith({
      tallerId: TALLER,
      tipo: 'inscripcion_aprobada',
      claseId: null,
      asunto: '¡Ya tienes tu lugar en {taller}!',
      mensaje: mensaje().value,
    })
    expect(notificar.success).toHaveBeenCalledWith('Guardado. Los próximos avisos «Aprobada» salen con este texto.')

    guardarMock.mockResolvedValue({ ok: false, mensaje: '{x} no es un dato de este aviso. Quítalo o elige uno de la lista.' })
    fireEvent.change(asunto(), { target: { value: 'Otro asunto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('{x} no es un dato de este aviso.')
  })

  it('«Restaurar texto predeterminado» asks first, then restores', async () => {
    abrir({ textos: [PROPIO] })
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar texto predeterminado' }))
    expect(screen.getByText('¿Volver al texto predeterminado?')).toBeInTheDocument()
    expect(restaurarMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(restaurarMock).toHaveBeenCalledWith({ tallerId: TALLER, tipo: 'inscripcion_aprobada', claseId: null }))
    expect(asunto().value).toBe('Aprobamos tu inscripción en {taller}')
  })

  it('«Enviarme una prueba» sends the current draft', async () => {
    abrir()
    fireEvent.change(asunto(), { target: { value: 'Prueba de {taller}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviarme una prueba' }))
    await waitFor(() =>
      expect(pruebaMock).toHaveBeenCalledWith(
        expect.objectContaining({ tallerId: TALLER, tipo: 'inscripcion_aprobada', claseId: null, asunto: 'Prueba de {taller}' }),
      ),
    )
    expect(notificar.success).toHaveBeenCalledWith('Te enviamos la prueba a neida@example.test.')
  })

  it('a reader sees the text and the preview, without editing', () => {
    abrir({ textos: [PROPIO], puedeEditar: false })
    expect(screen.queryByLabelText(/Asunto del correo/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviarme una prueba' })).not.toBeInTheDocument()
    expect(screen.getByText(PROPIO.asunto)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Vista previa del correo' })).toHaveTextContent('¡Qué alegría tenerte en Mujer de Hoy!')
  })
})

describe('PanelTextoAviso — Recordatorio de clase', () => {
  const CLASES = [
    { id: 'c1', numero: 1, tema: 'Sígueme' },
    { id: 'c2', numero: 2, tema: 'Intimidad con Dios' },
  ]
  const PROPIO_C2: TextoAvisoGuardado = {
    tipo: 'recordatorio_clase', claseId: 'c2', asunto: 'Mañana: clase {numero}', mensaje: 'Clase {numero}: {clase}.', editadoPor: 'Mariela Torres', editadoEn: '2026-11-10T14:00:00Z',
  }

  it('«Por clase» lists the plantilla clases, each with its own text or the general one', () => {
    abrir({ aviso: RECORDATORIO, definicion: DEF_RECORDATORIO, clases: CLASES, textos: [PROPIO_C2] })
    expect(screen.getByRole('tab', { name: /Por clase/ })).toHaveAttribute('aria-selected', 'true')
    const lista = screen.getByRole('list', { name: 'Clases de la plantilla' })
    const filas = within(lista).getAllByRole('listitem')
    expect(filas[0]).toHaveTextContent('Clase 1 · Sígueme')
    expect(filas[0]).toHaveTextContent('Usa el texto general')
    expect(filas[1]).toHaveTextContent('Clase 2 · Intimidad con Dios')
    expect(filas[1]).toHaveTextContent('Texto propio')
  })

  it('a clase opens its editor; Guardar saves with its clase_id and the preview uses that clase', async () => {
    abrir({ aviso: RECORDATORIO, definicion: DEF_RECORDATORIO, clases: CLASES, textos: [PROPIO_C2] })
    fireEvent.click(screen.getByRole('button', { name: 'Escribir texto propio: Clase 1 · Sígueme' }))
    expect(asunto().value).toBe('Mañana es tu clase de {taller}')
    fireEvent.change(mensaje(), { target: { value: 'Mañana empieza: {clase}.' } })
    expect(screen.getByRole('region', { name: 'Vista previa del correo' })).toHaveTextContent('Mañana empieza: Sígueme.')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(guardarMock).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'recordatorio_clase', claseId: 'c1', mensaje: 'Mañana empieza: {clase}.' })),
    )
  })

  it('«Usar el texto general» deletes the text of that clase', async () => {
    abrir({ aviso: RECORDATORIO, definicion: DEF_RECORDATORIO, clases: CLASES, textos: [PROPIO_C2] })
    fireEvent.click(screen.getByRole('button', { name: 'Editar: Clase 2 · Intimidad con Dios' }))
    expect(asunto().value).toBe('Mañana: clase {numero}')
    fireEvent.click(screen.getByRole('button', { name: 'Usar el texto general' }))
    await waitFor(() => expect(restaurarMock).toHaveBeenCalledWith({ tallerId: TALLER, tipo: 'recordatorio_clase', claseId: 'c2' }))
  })

  it('«Texto general» edits the text without clase', () => {
    abrir({ aviso: RECORDATORIO, definicion: DEF_RECORDATORIO, clases: CLASES })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Texto general' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Texto general' }))
    expect(asunto().value).toBe('Mañana es tu clase de {taller}')
  })

  it('without plantilla clases there are no tabs: only the general text', () => {
    abrir({ aviso: RECORDATORIO, definicion: DEF_RECORDATORIO, clases: [] })
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(asunto().value).toBe('Mañana es tu clase de {taller}')
  })
})

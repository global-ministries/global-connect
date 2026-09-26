/**
 * @jest-environment jsdom
 *
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — the bounded
 * facilitador picker, extracted from plantilla-grupos-section.tsx (T3) so
 * it can be shared by /talleres/[taller] (plantilla grupos) and
 * /talleres/[taller]/[edicion] (instanciados grupos) alike: a plain
 * <select> built from the `servidores` prop, never a free-text search.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { FacilitadorPicker } from '@/components/talleres/facilitador-picker'

const SERVIDORES = [
  { personaId: 'p-1', nombre: 'Ana', apellido: 'Gómez' },
  { personaId: 'p-2', nombre: 'Carlos', apellido: 'Ruiz' },
]

describe('FacilitadorPicker — bounded', () => {
  it('offers only the servidores prop as options, never a free-text search', () => {
    render(
      <FacilitadorPicker
        servidores={SERVIDORES}
        onAgregar={jest.fn()}
        onAgregado={jest.fn()}
        onError={jest.fn()}
      />,
    )
    const picker = screen.getByRole('combobox', { name: /servidor a agregar/i })
    const options = within(picker).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Ana Gómez', 'Carlos Ruiz'])
    expect(screen.queryByRole('textbox', { name: /buscar/i })).not.toBeInTheDocument()
  })

  it('calls onAgregar with the selected persona and rol, then onAgregado on success', async () => {
    const onAgregar = jest.fn().mockResolvedValue({ ok: true })
    const onAgregado = jest.fn()
    render(
      <FacilitadorPicker
        servidores={SERVIDORES}
        onAgregar={onAgregar}
        onAgregado={onAgregado}
        onError={jest.fn()}
      />,
    )
    fireEvent.change(screen.getByRole('combobox', { name: /servidor a agregar/i }), {
      target: { value: 'p-2' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: /^rol$/i }), {
      target: { value: 'voluntario' },
    })
    fireEvent.click(screen.getByRole('button', { name: /agregar facilitador/i }))

    expect(onAgregar).toHaveBeenCalledWith('p-2', 'voluntario')
    await waitFor(() => expect(onAgregado).toHaveBeenCalled())
  })

  it('surfaces the message from a failed onAgregar (e.g. NO_ES_SERVIDOR_ACTIVO_DEL_TALLER) via onError', async () => {
    const onAgregar = jest.fn().mockResolvedValue({
      ok: false,
      message: 'Esa persona no es un servidor activo de este taller. Asignala primero en Dream Team → Servidores.',
    })
    const onError = jest.fn()
    render(
      <FacilitadorPicker
        servidores={SERVIDORES}
        onAgregar={onAgregar}
        onAgregado={jest.fn()}
        onError={onError}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /agregar facilitador/i }))

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        'Esa persona no es un servidor activo de este taller. Asignala primero en Dream Team → Servidores.',
      ),
    )
  })
})

/**
 * @jest-environment node
 *
 * R3a (odd/tasks/talleres-rediseno.md, S6 S7, L5) — the viewer's facts of
 * Explorar: «Ya inscrito» / «Ya inscrita» by the ficha's género, and
 * hizo_proximo_paso(usuarios.id), whose `true` alone hides Próximo Paso.
 */

import {
  cargarHizoProximoPaso,
  cargarPersonaExplorar,
  etiquetaInscrito,
  mensajeInscrito,
  sinProximoPasoSiLoHizo,
  URL_COMPARTIR_PROXIMO_PASO,
} from '@/lib/platform/talleres/explorar'

function clienteUsuarios(respuesta: { data: unknown; error: unknown }) {
  const eq = jest.fn(() => ({ maybeSingle: () => Promise.resolve(respuesta) }))
  const select = jest.fn(() => ({ eq }))
  return { cliente: { from: jest.fn(() => ({ select })) }, select, eq }
}

describe('etiquetaInscrito / mensajeInscrito (S6)', () => {
  it('says «Ya inscrita» only for Femenino', () => {
    expect(etiquetaInscrito('Femenino')).toBe('Ya inscrita')
    expect(etiquetaInscrito('Masculino')).toBe('Ya inscrito')
    expect(etiquetaInscrito(null)).toBe('Ya inscrito')
    expect(mensajeInscrito('Femenino')).toBe('¡Listo, ya estás inscrita!')
    expect(mensajeInscrito(undefined)).toBe('¡Listo, ya estás inscrito!')
  })
})

describe('cargarPersonaExplorar', () => {
  it('reads the viewer ficha by usuarios.id', async () => {
    const { cliente, eq } = clienteUsuarios({
      data: { nombre: 'Génesis', apellido: 'Rodríguez', telefono: '0424-517-8821', email: 'g@x.org', genero: 'Femenino' },
      error: null,
    })
    await expect(cargarPersonaExplorar(cliente, 'u-1')).resolves.toEqual({
      nombre: 'Génesis Rodríguez',
      telefono: '0424-517-8821',
      email: 'g@x.org',
      genero: 'Femenino',
    })
    expect(cliente.from).toHaveBeenCalledWith('usuarios')
    expect(eq).toHaveBeenCalledWith('id', 'u-1')
  })

  it('is null on an error and when the query throws', async () => {
    await expect(cargarPersonaExplorar(clienteUsuarios({ data: null, error: { message: 'x' } }).cliente, 'u-1')).resolves.toBeNull()
    await expect(cargarPersonaExplorar({ from: () => { throw new Error('x') } }, 'u-1')).resolves.toBeNull()
  })
})

describe('cargarHizoProximoPaso (L5)', () => {
  it('calls hizo_proximo_paso with p_usuario_id = usuarios.id and returns the boolean', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null })
    await expect(cargarHizoProximoPaso({ rpc }, 'u-1')).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledWith('hizo_proximo_paso', { p_usuario_id: 'u-1' })
  })

  it('is null on an RPC error, a non-boolean or a throw', async () => {
    await expect(cargarHizoProximoPaso({ rpc: jest.fn().mockResolvedValue({ data: null, error: { code: '42883' } }) }, 'u')).resolves.toBeNull()
    await expect(cargarHizoProximoPaso({ rpc: jest.fn().mockResolvedValue({ data: null, error: null }) }, 'u')).resolves.toBeNull()
    await expect(cargarHizoProximoPaso({ rpc: jest.fn().mockRejectedValue(new Error('red')) }, 'u')).resolves.toBeNull()
  })
})

describe('sinProximoPasoSiLoHizo (S7)', () => {
  const filas = [{ slug: 'proximo-paso' }, { slug: 'parejas' }]
  it('drops Próximo Paso only when the person did it', () => {
    expect(sinProximoPasoSiLoHizo(filas, true)).toEqual([{ slug: 'parejas' }])
    expect(sinProximoPasoSiLoHizo(filas, false)).toEqual(filas)
    expect(sinProximoPasoSiLoHizo(filas, null)).toEqual(filas)
  })

  it('shares the absolute members URL', () => {
    expect(URL_COMPARTIR_PROXIMO_PASO).toBe('https://miembros.yosoyglobal.org/proximo-paso')
  })
})

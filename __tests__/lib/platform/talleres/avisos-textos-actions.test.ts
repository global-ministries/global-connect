/**
 * @jest-environment node
 *
 * R4b (odd/tasks/talleres-rediseno.md, S10 S11; L13) — the editor's server
 * actions: save and restore go through the permission-checked RPCs and map
 * their errors; «Enviarme una prueba» renders the draft with sample data and
 * sends ONE email, to the current user only, with the talleres notice
 * template (TallerAvisoEmail, inside EmailLayout), at most 5 per hour per
 * person.
 */
import { TallerAvisoEmail } from '@/emails/taller-aviso'
import {
  enviarPruebaAvisoAction,
  guardarTextoAvisoAction,
  restaurarTextoAvisoAction,
} from '@/lib/platform/talleres/avisos-textos-actions'
import { reiniciarLimitePruebas } from '@/lib/platform/talleres/avisos-prueba'

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: jest.fn(() => true) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn() }))

const TALLER = '6f1d2c3b-1111-4222-8333-444455556666'
const CLASE = '7a1d2c3b-1111-4222-8333-444455556666'
const servidor = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const enviar = jest.requireMock('@/lib/email/send').sendEmail as jest.Mock
const revalidar = jest.requireMock('next/cache').revalidatePath as jest.Mock

const VARIABLES = {
  inscripcion_aprobada: {
    variables: ['nombre', 'taller', 'edicion', 'fecha', 'hora', 'lugar', 'indicaciones'],
    asunto: ['nombre', 'taller', 'edicion'],
  },
  recordatorio_clase: {
    variables: ['nombre', 'taller', 'edicion', 'numero', 'clase', 'grupo', 'facilitadores', 'fecha', 'hora', 'lugar', 'indicaciones'],
    asunto: ['nombre', 'taller', 'edicion', 'grupo', 'numero'],
  },
}

interface Opciones {
  readonly usuario?: { id: string; email: string | null } | null
  readonly puedeEditar?: boolean
  readonly errores?: Record<string, { code?: string; message?: string }>
}

function cliente({ usuario = { id: 'u1', email: 'neida@example.test' }, puedeEditar = true, errores = {} }: Opciones = {}) {
  const rpc = jest.fn(async (nombre: string) => {
    if (errores[nombre]) return { data: null, error: errores[nombre] }
    if (nombre === 'talleres_avisos_panel') return { data: { puede_editar: puedeEditar }, error: null }
    if (nombre === 'talleres_aviso_variables') return { data: VARIABLES, error: null }
    return { data: true, error: null }
  })
  const maybeSingle = jest.fn(async () => ({ data: { nombre: 'Mujer de Hoy' }, error: null }))
  const from = jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }))
  const client = { rpc, from, auth: { getUser: jest.fn(async () => ({ data: { user: usuario } })) } }
  servidor.mockResolvedValue(client)
  return client
}

const BORRADOR = {
  tallerId: TALLER,
  tipo: 'inscripcion_aprobada',
  claseId: null,
  asunto: '¡Ya tienes tu lugar en {taller}!',
  mensaje: '¡Qué alegría tenerte en {taller}!\n\nLa primera clase es el {fecha} a las {hora}.\nNos vemos en {lugar}.',
}

beforeEach(() => {
  jest.clearAllMocks()
  reiniciarLimitePruebas()
  enviar.mockResolvedValue({ success: true, id: 'r1' })
})

describe('guardarTextoAvisoAction', () => {
  it('saves through talleres_aviso_texto_guardar with the exact arguments', async () => {
    const client = cliente()
    const resultado = await guardarTextoAvisoAction(BORRADOR)
    expect(resultado).toEqual({ ok: true, mensaje: 'Guardado. Los próximos avisos «Aprobada» salen con este texto.' })
    expect(client.rpc).toHaveBeenCalledWith('talleres_aviso_texto_guardar', {
      p_taller_id: TALLER,
      p_tipo: 'inscripcion_aprobada',
      p_clase_id: null,
      p_asunto: BORRADOR.asunto,
      p_mensaje: BORRADOR.mensaje,
    })
    expect(revalidar).toHaveBeenCalledWith('/talleres/[taller]/avisos', 'page')
  })

  it('maps the server errors to Spanish «tú» messages', async () => {
    cliente({ errores: { talleres_aviso_texto_guardar: { code: '22023', message: 'VARIABLE_DESCONOCIDA: {grupo}' } } })
    expect(await guardarTextoAvisoAction(BORRADOR)).toEqual({
      ok: false,
      mensaje: '{grupo} no es un dato de este aviso. Quítalo o elige uno de la lista.',
    })
    expect(revalidar).not.toHaveBeenCalled()
  })

  it('refuses a fixed or unknown kind and a bad id before calling the database', async () => {
    const client = cliente()
    expect(await guardarTextoAvisoAction({ ...BORRADOR, tipo: 'taller_cambio_fecha' })).toEqual({ ok: false, mensaje: 'Ese aviso no se puede editar.' })
    expect(await guardarTextoAvisoAction({ ...BORRADOR, tallerId: 'x' })).toEqual({ ok: false, mensaje: 'Ese aviso no se puede editar.' })
    expect(client.rpc).not.toHaveBeenCalled()
  })
})

describe('restaurarTextoAvisoAction', () => {
  it('deletes the custom text (general or of a clase)', async () => {
    const client = cliente()
    expect(await restaurarTextoAvisoAction({ tallerId: TALLER, tipo: 'recordatorio_clase', claseId: CLASE })).toEqual({
      ok: true,
      mensaje: 'Esta clase vuelve a usar el texto general.',
    })
    expect(client.rpc).toHaveBeenCalledWith('talleres_aviso_texto_restaurar', {
      p_taller_id: TALLER,
      p_tipo: 'recordatorio_clase',
      p_clase_id: CLASE,
    })
    expect(await restaurarTextoAvisoAction({ tallerId: TALLER, tipo: 'inscripcion_aprobada', claseId: null })).toEqual({
      ok: true,
      mensaje: '«Aprobada» vuelve al texto predeterminado.',
    })
  })
})

describe('enviarPruebaAvisoAction («Enviarme una prueba»)', () => {
  it('sends ONE email to the current user with the TallerAvisoEmail template and the draft rendered with sample data', async () => {
    cliente()
    const resultado = await enviarPruebaAvisoAction(BORRADOR)
    expect(resultado).toEqual({ ok: true, mensaje: 'Te enviamos la prueba a neida@example.test.' })
    expect(enviar).toHaveBeenCalledTimes(1)
    const correo = enviar.mock.calls[0][0]
    expect(correo.to).toBe('neida@example.test')
    expect(correo.subject).toBe('Prueba · ¡Ya tienes tu lugar en Mujer de Hoy!')
    expect(correo.template.type).toBe(TallerAvisoEmail)
    expect(correo.template.props).toMatchObject({
      nombre: 'Carolina',
      titulo: 'Aprobamos tu inscripción',
      cuerpo: '¡Qué alegría tenerte en Mujer de Hoy!\n\nLa primera clase es el jueves 8 de octubre a las 7:00 p. m.\nNos vemos en Salón 2.',
      tallerNombre: 'Mujer de Hoy',
    })
  })

  it('a class reminder of a clase uses that clase in the sample data', async () => {
    cliente()
    await enviarPruebaAvisoAction({
      ...BORRADOR,
      tipo: 'recordatorio_clase',
      claseId: CLASE,
      asunto: 'Mañana: clase {numero}',
      mensaje: 'Clase {numero}: {clase}.',
      clase: { numero: 2, tema: 'Intimidad con Dios' },
    })
    const correo = enviar.mock.calls[0][0]
    expect(correo.subject).toBe('Prueba · Mañana: clase 2')
    expect(correo.template.props.cuerpo).toBe('Clase 2: Intimidad con Dios.')
  })

  it('at most 5 per hour per person: the sixth is refused and nothing is sent', async () => {
    cliente()
    for (let i = 0; i < 5; i += 1) expect((await enviarPruebaAvisoAction(BORRADOR)).ok).toBe(true)
    expect(await enviarPruebaAvisoAction(BORRADOR)).toEqual({
      ok: false,
      mensaje: 'Ya te enviaste 5 pruebas en la última hora. Vuelve a intentarlo más tarde.',
    })
    expect(enviar).toHaveBeenCalledTimes(5)

    cliente({ usuario: { id: 'u2', email: 'otra@example.test' } })
    expect((await enviarPruebaAvisoAction(BORRADOR)).ok).toBe(true)
  })

  it('an invalid draft is not sent (same validation as saving)', async () => {
    cliente()
    expect(await enviarPruebaAvisoAction({ ...BORRADOR, mensaje: 'Tu grupo: {grupo}' })).toEqual({
      ok: false,
      mensaje: '{grupo} no es un dato de «Aprobada». El grupo se conoce al asignarlo; lo avisa «Grupo asignado».',
    })
    expect(enviar).not.toHaveBeenCalled()
  })

  it('only whoever can edit the notices of the taller, and only with an email', async () => {
    cliente({ puedeEditar: false })
    expect(await enviarPruebaAvisoAction(BORRADOR)).toEqual({
      ok: false,
      mensaje: 'Solo la coordinación o la dirección del taller puede cambiar el texto de sus avisos.',
    })
    cliente({ usuario: { id: 'u3', email: null } })
    expect(await enviarPruebaAvisoAction(BORRADOR)).toEqual({ ok: false, mensaje: 'Tu cuenta no tiene un correo para enviarte la prueba.' })
    expect(enviar).not.toHaveBeenCalled()
  })

  it('a send failure is reported', async () => {
    cliente()
    enviar.mockResolvedValue({ success: false, error: 'boom' })
    expect(await enviarPruebaAvisoAction(BORRADOR)).toEqual({ ok: false, mensaje: 'No se pudo enviar la prueba. Inténtalo de nuevo.' })
  })
})

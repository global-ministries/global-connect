/**
 * Familia in the Usuarios pending panel (S15 decision 10 of
 * odd/tasks/sistema-diseno-v2.md, T11b-2): the notice text for every count
 * combination, the parser of familia_pendientes_listar, the request text with
 * the gendered relation, the action label and the tuteo message of every
 * familia_resolver code.
 */
import {
  CODIGOS_RESOLVER_FAMILIA,
  detalleSolicitudFamilia,
  etiquetaAprobar,
  mensajeResolverFamilia,
  parseFamiliaPendientes,
  quitaFilaFamilia,
  resultadoFamilia,
  resumenAviso,
  textoAvisoPendientes,
  textoSolicitudFamilia,
  type SolicitudFamiliaPendiente,
} from '@/lib/platform/usuarios/familia-pendientes-vista'

const conCuenta = {
  id: 's1',
  tipo_relacion: 'hermano',
  creado_en: '2026-10-30T10:00:00Z',
  solicitante: { id: 'u1', nombre: 'María Fernanda', apellido: 'Colmenárez' },
  destino: { id: 'u2', nombre: 'Luis', apellido: 'Barrios', cuenta: true },
  sin_cuenta: null,
  crea_ficha: false,
}
const sinCuenta = {
  id: 's2',
  tipo_relacion: 'padre',
  creado_en: '2026-10-31T10:00:00Z',
  solicitante: { id: 'u1', nombre: 'María Fernanda', apellido: 'Colmenárez' },
  destino: null,
  sin_cuenta: { nombre: 'Rafael', apellido: 'Colmenárez', fecha_nacimiento: '1958-03-12', genero: 'Masculino', cedula: 'V-4123456', telefono: '0414-5550000' },
  crea_ficha: true,
}

function parsear(...filas: unknown[]): SolicitudFamiliaPendiente[] {
  const res = parseFamiliaPendientes({ ok: true, solicitudes: filas })
  if (!res) throw new Error('parse failed')
  return res
}

describe('the notice on /users', () => {
  it('renders nothing when both counts are 0', () => {
    expect(resumenAviso(0, 0)).toBeNull()
    expect(textoAvisoPendientes(0, 0)).toBeNull()
  })

  it.each([
    [1, 0, '1 vínculo pendiente · 1 cuenta por cédula'],
    [2, 0, '2 vínculos pendientes · 2 cuentas por cédula'],
    [0, 1, '1 vínculo pendiente · 1 de familia'],
    [0, 3, '3 vínculos pendientes · 3 de familia'],
    [1, 1, '2 vínculos pendientes · 1 cuenta por cédula · 1 de familia'],
    [2, 1, '3 vínculos pendientes · 2 cuentas por cédula · 1 de familia'],
  ])('%i por cédula and %i de familia: "%s"', (cuentas, familia, texto) => {
    expect(textoAvisoPendientes(cuentas, familia)).toBe(texto)
  })

  it('splits the total from the breakdown', () => {
    expect(resumenAviso(2, 1)).toEqual({ total: 3, titulo: 'vínculos pendientes', desglose: '2 cuentas por cédula · 1 de familia' })
  })
})

describe('familia_pendientes_listar', () => {
  it('parses both kinds of requests', () => {
    const [a, b] = parsear(conCuenta, sinCuenta)
    expect(a).toEqual({
      id: 's1', tipo: 'hermano', creadoEn: '2026-10-30T10:00:00Z',
      solicitante: { id: 'u1', nombre: 'María Fernanda', apellido: 'Colmenárez' },
      destino: { id: 'u2', nombre: 'Luis', apellido: 'Barrios', cuenta: true, genero: null }, sinCuenta: null, creaFicha: false,
    })
    expect(b.destino).toBeNull()
    expect(b.sinCuenta).toEqual({ nombre: 'Rafael', apellido: 'Colmenárez', fechaNacimiento: '1958-03-12', genero: 'Masculino', cedula: 'V-4123456', telefono: '0414-5550000' })
    expect(b.creaFicha).toBe(true)
  })

  it('returns null for an error answer and skips malformed rows', () => {
    expect(parseFamiliaPendientes({ ok: false, codigo: 'SIN_SESION' })).toBeNull()
    expect(parseFamiliaPendientes(null)).toBeNull()
    expect(parsear({ id: 1 }, { ...conCuenta, tipo_relacion: 'tutor' }, conCuenta)).toHaveLength(1)
  })
})

describe('the text of a request', () => {
  it('without an account: "agregó a … como su …", gendered by the typed data', () => {
    const [s] = parsear(sinCuenta)
    expect(textoSolicitudFamilia(s)).toBe('María Fernanda Colmenárez agregó a Rafael Colmenárez como su padre')
    const [f] = parsear({ ...sinCuenta, sin_cuenta: { ...sinCuenta.sin_cuenta, genero: 'Femenino' } })
    expect(textoSolicitudFamilia(f)).toBe('María Fernanda Colmenárez agregó a Rafael Colmenárez como su madre')
  })

  it('with an account and no gender: "dice que … es su …" with the neutral label', () => {
    const [s] = parsear(conCuenta)
    expect(textoSolicitudFamilia(s)).toBe('María Fernanda Colmenárez dice que Luis Barrios es su hermano o hermana')
  })

  it('with an account: gendered by the destino ficha', () => {
    const [s] = parsear({ ...conCuenta, destino: { ...conCuenta.destino, genero: 'Masculino' } })
    expect(textoSolicitudFamilia(s)).toBe('María Fernanda Colmenárez dice que Luis Barrios es su hermano')
    const [f] = parsear({ ...conCuenta, destino: { ...conCuenta.destino, genero: 'Femenino' } })
    expect(textoSolicitudFamilia(f)).toBe('María Fernanda Colmenárez dice que Luis Barrios es su hermana')
  })

  it('the second line shows the typed data or whether the person has an account', () => {
    const [con, sin] = parsear(conCuenta, sinCuenta)
    expect(detalleSolicitudFamilia(con)).toBe('Tiene cuenta. Debe confirmarlo o lo apruebas tú.')
    expect(detalleSolicitudFamilia({ ...con, destino: { ...con.destino!, cuenta: false } })).toBe('Ficha sin cuenta.')
    expect(detalleSolicitudFamilia(sin)).toBe('Sin cuenta · nació el 12 mar 1958 · cédula V-4123456 · teléfono 0414-5550000')
    const [minimo] = parsear({ ...sinCuenta, sin_cuenta: { nombre: 'Ana', apellido: 'Paz', fecha_nacimiento: '2000-12-01' } })
    expect(detalleSolicitudFamilia(minimo)).toBe('Sin cuenta · nació el 1 dic 2000 · sin cédula')
  })

  it('"Aprobar y crear ficha" only when the ficha does not exist yet', () => {
    const [con, sin] = parsear(conCuenta, sinCuenta)
    expect(etiquetaAprobar(con)).toBe('Aprobar')
    expect(etiquetaAprobar(sin)).toBe('Aprobar y crear ficha')
  })
})

describe('familia_resolver answers', () => {
  it('the result line of each success', () => {
    const [con, sin] = parsear(conCuenta, sinCuenta)
    expect(resultadoFamilia(con, 'APROBADA', false)).toBe('Aprobado: Luis Barrios ya está en la familia de María Fernanda Colmenárez.')
    expect(resultadoFamilia(sin, 'APROBADA', true)).toBe('Aprobado: se creó la ficha de Rafael Colmenárez y ya está en la familia de María Fernanda Colmenárez.')
    expect(resultadoFamilia(con, 'RECHAZADA', false)).toBe('Rechazado: la solicitud de María Fernanda Colmenárez.')
  })

  it.each([
    ['NO_ENCONTRADO', 'No encontramos esta solicitud o ya no puedes resolverla. Recarga la página.'],
    ['YA_RESUELTO', 'Esta solicitud ya se resolvió.'],
    ['CEDULA_EXISTENTE', 'Ya existe una ficha con esa cédula, así que no se creó otra. Rechaza esta solicitud y revisa esa ficha.'],
    ['YA_TIENE_CONYUGE', 'Quien lo pide ya tiene un cónyuge registrado. Cada persona puede tener uno solo.'],
    ['YA_RELACIONADOS', 'Estas dos personas ya están relacionadas.'],
    ['SIN_CAMPUS', 'Quien lo pide no tiene un campus principal. Asígnaselo antes de crear la ficha.'],
    ['SIN_SESION', 'Tu sesión terminó. Vuelve a iniciar sesión.'],
    ['PARAMETROS_INVALIDOS', 'No se pudo leer la solicitud. Recarga la página e inténtalo de nuevo.'],
  ])('%s → "%s"', (codigo, mensaje) => {
    expect(mensajeResolverFamilia(codigo)).toBe(mensaje)
  })

  it('every error code has its own message and unknown ones get a generic one', () => {
    expect(CODIGOS_RESOLVER_FAMILIA).toHaveLength(8)
    expect(mensajeResolverFamilia('OTRO')).toBe('No se pudo resolver la solicitud. Inténtalo de nuevo.')
    expect(mensajeResolverFamilia(null)).toBe('No se pudo resolver la solicitud. Inténtalo de nuevo.')
  })

  it('no message uses voseo', () => {
    for (const c of CODIGOS_RESOLVER_FAMILIA) expect(mensajeResolverFamilia(c)).not.toMatch(/\b(podés|tenés|querés|revisá|recargá|volvé|asignale|rechazá)\b/i)
  })

  it('a request already gone leaves the list; other failures keep it', () => {
    expect(quitaFilaFamilia('YA_RESUELTO')).toBe(true)
    expect(quitaFilaFamilia('NO_ENCONTRADO')).toBe(true)
    expect(quitaFilaFamilia('CEDULA_EXISTENTE')).toBe(false)
    expect(quitaFilaFamilia(null)).toBe(false)
  })
})

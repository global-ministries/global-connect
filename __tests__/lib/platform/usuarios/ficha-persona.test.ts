import { aPersonaFicha, cargarFichaPersona, terminoDeBusqueda } from '@/lib/platform/usuarios/ficha-persona'

const detalle = {
  id: 'u-2',
  nombre: 'Ana',
  apellido: 'Pérez',
  cedula: 'V-18.456.789',
  email: 'ana@example.com',
  telefono: '04141234567',
  fecha_nacimiento: '1988-04-17',
  fecha_registro: '2021-03-14T10:00:00Z',
  estado_civil: 'Casada',
  genero: 'Femenino',
  foto_perfil_url: null,
  roles: ['lider'],
  ocupacion: { id: 'o', nombre: 'Empleada' },
  profesion: null,
  direccion: {
    calle: 'Calle 3',
    barrio: null,
    codigo_postal: '3001',
    referencia: null,
    latitud: 10.07,
    longitud: -69.32,
    parroquia: { nombre: 'Santa Rosa', municipio: { nombre: 'Iribarren', estado: { nombre: 'Lara', pais: { nombre: 'Venezuela' } } } },
  },
  relaciones: [],
}

function cliente(respuestas: Record<string, { data: unknown; error: unknown }>) {
  const llamadas: { nombre: string; args: unknown }[] = []
  return {
    llamadas,
    rpc: (nombre: string, args: unknown) => {
      llamadas.push({ nombre, args })
      return Promise.resolve(respuestas[nombre] ?? { data: null, error: null })
    },
  }
}

describe('ficha loader', () => {
  it('maps the detail payload: role from nombre_interno, address chain', () => {
    const p = aPersonaFicha(detalle)
    expect(p.rol).toEqual({ interno: 'lider', etiqueta: 'Líder' })
    expect(p.ocupacion).toBe('Empleada')
    expect(p.profesion).toBeNull()
    expect(p.direccion).toMatchObject({ pais: 'Venezuela', estado: 'Lara', municipio: 'Iribarren', parroquia: 'Santa Rosa', latitud: 10.07 })
  })

  it('searches the list by cédula, then email, then surname', () => {
    expect(terminoDeBusqueda(aPersonaFicha(detalle))).toBe('V-18.456.789')
    expect(terminoDeBusqueda(aPersonaFicha({ ...detalle, cedula: null }))).toBe('ana@example.com')
    expect(terminoDeBusqueda(aPersonaFicha({ ...detalle, cedula: null, email: null }))).toBe('Pérez')
  })

  it('takes cuenta, campus and es_de_mi_grupo from the person’s own list row', async () => {
    const c = cliente({
      obtener_detalle_usuario: { data: detalle, error: null },
      puede_editar_usuario: { data: true, error: null },
      listar_usuarios_con_permisos_v2: {
        data: [
          { id: 'otra', cuenta: 'si', campus_nombre: 'Otro', es_de_mi_grupo: false, grupo_nombre: null },
          { id: 'u-2', cuenta: 'invitada', campus_nombre: 'Barquisimeto', es_de_mi_grupo: true, grupo_nombre: 'Mujeres de Fe' },
        ],
        error: null,
      },
    })
    const r = await cargarFichaPersona(c as never, { usuarioId: 'u-2', authId: 'auth-1' })
    expect(r).toMatchObject({
      ok: true,
      puedeEditar: true,
      resumen: { cuenta: 'invitada', campus: 'Barquisimeto', esDeMiGrupo: true, grupoActual: 'Mujeres de Fe' },
    })
    expect(c.llamadas.find((l) => l.nombre === 'listar_usuarios_con_permisos_v2')?.args).toMatchObject({
      p_auth_id: 'auth-1',
      p_busqueda: 'V-18.456.789',
    })
  })

  it('leaves the summary unknown when the list does not return the person', async () => {
    const c = cliente({ obtener_detalle_usuario: { data: detalle, error: null }, puede_editar_usuario: { data: null, error: null } })
    const r = await cargarFichaPersona(c as never, { usuarioId: 'u-2', authId: 'auth-1' })
    expect(r).toMatchObject({ ok: true, puedeEditar: false, resumen: { cuenta: null, campus: null, esDeMiGrupo: false, grupoActual: null } })
  })

  it('tells "not allowed" from "not found"', async () => {
    const denegado = cliente({ obtener_detalle_usuario: { data: null, error: { code: '42501', message: 'Not authorized' } } })
    expect(await cargarFichaPersona(denegado as never, { usuarioId: 'u-2', authId: 'a' })).toMatchObject({ ok: false, motivo: 'sin-permiso' })
    const ausente = cliente({ obtener_detalle_usuario: { data: null, error: { code: '02000', message: 'User not found' } } })
    expect(await cargarFichaPersona(ausente as never, { usuarioId: 'u-2', authId: 'a' })).toMatchObject({ ok: false, motivo: 'no-encontrado' })
    const caido = cliente({ obtener_detalle_usuario: { data: null, error: { code: 'XX000', message: 'boom' } } })
    expect(await cargarFichaPersona(caido as never, { usuarioId: 'u-2', authId: 'a' })).toMatchObject({ ok: false, motivo: 'error' })
  })
})

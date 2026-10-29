/**
 * Usuarios list view model (S13 of odd/tasks/sistema-diseno-v2.md; prototype
 * docs/design-system/prototipos/usuarios/01-lista-escritorio.html): rows per
 * person with the account state and contact actions per viewer, the attention
 * metrics that are filters, the RPC arguments, the active-filter count and the
 * URL codec.
 */
import {
  FILTROS_INICIALES,
  aEstadisticas,
  aPersonas,
  argumentosEstadisticas,
  argumentosLista,
  contarFiltrosActivos,
  escribirFiltrosEnUrl,
  filasDeVista,
  leerFiltrosDeUrl,
  metricasAtencion,
  parcheMetrica,
  resumenTotales,
  totalPaginas,
  type FilaUsuarioRpc,
  type FiltrosUsuarios,
} from '@/lib/platform/usuarios/lista-vista'

const fila = (cambios: Partial<FilaUsuarioRpc> = {}): FilaUsuarioRpc => ({
  id: 'u-1', nombre: 'Ana', apellido: 'Pérez', email: null, telefono: '04145550101', cedula: null,
  fecha_registro: '2026-10-20T12:00:00Z', rol_nombre_interno: 'miembro', rol_nombre_visible: 'Miembro',
  foto_perfil_url: null, total_count: 1, puede_ver: true, cuenta: 'no', grupo_id: 'g-1',
  grupo_nombre: 'Familias Unidas', campus_nombre: 'Barquisimeto', es_de_mi_grupo: true, ...cambios,
})

const f = (cambios: Partial<FiltrosUsuarios> = {}): FiltrosUsuarios => ({ ...FILTROS_INICIALES, ...cambios })

describe('aPersonas', () => {
  it('merges the one-row-per-role rows into one person, keeping the RPC order', () => {
    const personas = aPersonas([
      fila({ id: 'b', nombre: 'Beto', rol_nombre_interno: 'lider', rol_nombre_visible: 'Líder' }),
      fila({ id: 'a' }),
      fila({ id: 'b', nombre: 'Beto', rol_nombre_interno: 'pastor', rol_nombre_visible: 'Pastor' }),
    ])
    expect(personas.map((p) => p.id)).toEqual(['b', 'a'])
    expect(personas[0].roles).toEqual(['pastor', 'lider'])
  })

  it('a person without role has no roles; an unknown cuenta reads as no', () => {
    const [p] = aPersonas([fila({ rol_nombre_interno: null, rol_nombre_visible: null, cuenta: 'rara' })])
    expect(p.roles).toEqual([])
    expect(p.cuenta).toBe('no')
  })
})

describe('filasDeVista', () => {
  const admin = { roles: ['admin'], usuarioId: 'yo' }

  it('row model: name, initials, account label and tone, role labels, group · campus', () => {
    const [r] = filasDeVista(aPersonas([fila({ cuenta: 'invitada', rol_nombre_interno: 'lider', rol_nombre_visible: 'Líder' })]), admin)
    expect(r).toMatchObject({
      nombreCompleto: 'Ana Pérez', iniciales: 'AP', cuentaEtiqueta: 'Invitación enviada', cuentaTono: 'info',
      rolesEtiqueta: 'Líder', detalle: 'Familias Unidas · Barquisimeto',
    })
  })

  it.each([
    ['si', 'Con cuenta', 'success'],
    ['invitada', 'Invitación enviada', 'info'],
    ['no', 'Sin cuenta', 'warning'],
  ] as const)('cuenta %s is "%s" (%s)', (cuenta, etiqueta, tono) => {
    const [r] = filasDeVista(aPersonas([fila({ cuenta })]), admin)
    expect([r.cuentaEtiqueta, r.cuentaTono]).toEqual([etiqueta, tono])
  })

  it('no role reads "Sin rol"; no group and campus leave an empty detail', () => {
    const [r] = filasDeVista(aPersonas([fila({ rol_nombre_interno: null, grupo_nombre: null, campus_nombre: null })]), admin)
    expect([r.rolesEtiqueta, r.detalle]).toEqual(['Sin rol', ''])
  })

  it('contact actions follow the viewer: a leader only for their own group', () => {
    const lider = { roles: ['lider'], usuarioId: 'yo' }
    const [mio, ajeno] = filasDeVista(
      aPersonas([fila({ id: 'm', es_de_mi_grupo: true }), fila({ id: 'x', es_de_mi_grupo: false })]),
      lider,
    )
    expect(mio.contacto).toEqual({ llamar: 'tel:04145550101', whatsapp: 'https://wa.me/584145550101' })
    expect(ajeno.contacto).toEqual({ llamar: null, whatsapp: null })
  })
})

describe('metrics', () => {
  const stats = aEstadisticas({
    total_usuarios: 200, con_email: 150, con_telefono: 180, registrados_hoy: 2, nuevos_7d: 12,
    sin_grupo: 80, sin_cuenta: 60, sin_telefono: 20, invitadas: 5,
  })

  it('reads the RPC row; a missing row is zeros', () => {
    expect(stats).toEqual({
      total: 200, conEmail: 150, conTelefono: 180, registradosHoy: 2, nuevos7d: 12,
      sinGrupo: 80, sinCuenta: 60, sinTelefono: 20, invitadas: 5,
    })
    expect(aEstadisticas(undefined).total).toBe(0)
  })

  it('four attention metrics with value, total and hint', () => {
    expect(metricasAtencion(stats, f())).toEqual([
      { id: 'nuevos', etiqueta: 'Nuevos', valor: 12, total: 200, pista: 'se registraron en los últimos 7 días', tono: 'success', activa: false },
      { id: 'sinGrupo', etiqueta: 'Sin grupo', valor: 80, total: 200, pista: 'no están en un Grupo de Vida', tono: 'info', activa: false },
      { id: 'sinCuenta', etiqueta: 'Sin cuenta', valor: 60, total: 200, pista: '5 con invitación enviada', tono: 'warning', activa: false },
      { id: 'sinTelefono', etiqueta: 'Sin teléfono', valor: 20, total: 200, pista: 'no se les puede escribir', tono: 'danger', activa: false },
    ])
  })

  it('without invitations the Sin cuenta hint says they do not enter the platform', () => {
    const sinInv = metricasAtencion({ ...stats, invitadas: 0 }, f()).find((m) => m.id === 'sinCuenta')
    expect(sinInv?.pista).toBe('no entran a la plataforma')
  })

  it('a metric is active when its filter is on', () => {
    const activas = metricasAtencion(stats, f({ nuevos: true, enGrupo: false, conCuenta: false, conTelefono: false }))
    expect(activas.every((m) => m.activa)).toBe(true)
    expect(metricasAtencion(stats, f({ enGrupo: true, conCuenta: true })).some((m) => m.activa)).toBe(false)
  })

  it('pressing a metric toggles its filter and goes back to page 1', () => {
    expect(parcheMetrica(f({ pagina: 3 }), 'nuevos')).toEqual({ nuevos: true, pagina: 1 })
    expect(parcheMetrica(f({ nuevos: true }), 'nuevos')).toEqual({ nuevos: false, pagina: 1 })
    expect(parcheMetrica(f(), 'sinGrupo')).toEqual({ enGrupo: false, pagina: 1 })
    expect(parcheMetrica(f({ enGrupo: false }), 'sinGrupo')).toEqual({ enGrupo: null, pagina: 1 })
    expect(parcheMetrica(f({ conCuenta: true }), 'sinCuenta')).toEqual({ conCuenta: false, pagina: 1 })
    expect(parcheMetrica(f(), 'sinTelefono')).toEqual({ conTelefono: false, pagina: 1 })
  })

  it('the hero summary uses the real totals', () => {
    expect(resumenTotales(stats)).toBe('200 personas · 140 con cuenta · 120 en un Grupo de Vida')
    expect(resumenTotales({ ...stats, total: 1, sinCuenta: 0, sinGrupo: 1 })).toBe('1 persona · 1 con cuenta · 0 en un Grupo de Vida')
  })
})

describe('RPC arguments', () => {
  it('the list sends every filter, the sort and the page window', () => {
    expect(
      argumentosLista(
        f({ q: ' 0414 ', roles: ['lider'], conEmail: true, conTelefono: false, enGrupo: false, conCuenta: false, nuevos: true, orden: 'registro_desc', pagina: 3 }),
        { authId: 'auth-1', campusId: 'c-1', limite: 20 },
      ),
    ).toEqual({
      p_auth_id: 'auth-1', p_busqueda: '0414', p_roles_filtro: ['lider'], p_con_email: true, p_con_telefono: false,
      p_en_grupo: false, p_con_cuenta: false, p_nuevos_dias: 7, p_orden: 'registro_desc', p_limite: 20, p_offset: 40,
      p_campus_id: 'c-1',
    })
  })

  it('unset filters are left out so the database defaults apply', () => {
    expect(argumentosLista(f(), { authId: 'auth-1', campusId: null, limite: 20 })).toEqual({
      p_auth_id: 'auth-1', p_busqueda: '', p_orden: 'nombre', p_limite: 20, p_offset: 0,
    })
  })

  it('the metrics count the whole scope: only the caller and the campus', () => {
    expect(argumentosEstadisticas({ authId: 'auth-1', campusId: 'c-1' })).toEqual({ p_auth_id: 'auth-1', p_campus_id: 'c-1' })
    expect(argumentosEstadisticas({ authId: 'auth-1', campusId: null })).toEqual({ p_auth_id: 'auth-1' })
  })

  it('pages: ceil(total / limite), at least 1', () => {
    expect([totalPaginas(0, 20), totalPaginas(20, 20), totalPaginas(21, 20)]).toEqual([1, 1, 2])
  })
})

describe('contarFiltrosActivos', () => {
  it('counts the sheet filters (each role apart), not the search, sort, page or person', () => {
    expect(contarFiltrosActivos(f({ q: 'ana', orden: 'registro_asc', pagina: 2, persona: 'p' }))).toBe(0)
    expect(contarFiltrosActivos(f({ roles: ['lider', 'pastor'], conEmail: false, enGrupo: true, conCuenta: true, conTelefono: true, nuevos: true }))).toBe(7)
  })
})

describe('URL codec', () => {
  it('defaults write nothing and read back as the defaults', () => {
    expect(escribirFiltrosEnUrl(FILTROS_INICIALES)).toBe('')
    expect(leerFiltrosDeUrl(new URLSearchParams(''))).toEqual(FILTROS_INICIALES)
  })

  it('round-trips every filter, the sort, the page and the open person', () => {
    const todos = f({
      q: 'ana pérez', roles: ['lider', 'miembro'], conEmail: false, conTelefono: true, enGrupo: false,
      conCuenta: true, nuevos: true, orden: 'registro_asc', pagina: 4, persona: 'u-9',
    })
    const qs = escribirFiltrosEnUrl(todos)
    expect(qs).toBe('q=ana+p%C3%A9rez&roles=lider%2Cmiembro&email=0&tel=1&grupo=0&cuenta=1&nuevos=1&orden=registro_asc&pagina=4&persona=u-9')
    expect(leerFiltrosDeUrl(new URLSearchParams(qs))).toEqual(todos)
  })

  it('reads a plain record (page searchParams) and drops invalid values', () => {
    expect(
      leerFiltrosDeUrl({ q: ['  x  '], roles: 'lider,raro,,admin', tel: 'quizas', orden: 'zz', pagina: '-2', persona: ' ' }),
    ).toEqual(f({ q: 'x', roles: ['lider', 'admin'] }))
  })
})

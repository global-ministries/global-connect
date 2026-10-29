import { ENTRADAS_NAVEGACION, filtrarVisibles } from '@/lib/navegacion/registro'
import {
  ORDEN_SECCIONES,
  agruparPorSeccion,
  contenidoMas,
  esPestanaActiva,
  filasDeMas,
  pestanasBarraInferior,
  type SeccionNavegacion,
} from '@/lib/navegacion/secciones'

type Entrada = {
  id: string
  label: string
  href: string
  seccion: SeccionNavegacion
  labelMovil?: string
  children?: { id: string; label: string; href: string }[]
}

const e = (id: string, seccion: SeccionNavegacion, extra: Partial<Entrada> = {}): Entrada => ({
  id, label: id, href: `/${id}`, seccion, ...extra,
})

const INICIO = e('dashboard', 'general', { label: 'Inicio', href: '/dashboard' })
const UNO_A_UNO = e('mis-uno-a-uno', 'general', { label: 'Mis 1 a 1' })
const USUARIOS = e('usuarios', 'administracion', { label: 'Usuarios', href: '/users' })
const GRUPOS = e('grupos-vida', 'ministerios', {
  label: 'Grupos de Vida', labelMovil: 'Grupos', href: '/grupos-vida',
  children: [{ id: 'gv-mapa', label: 'Mapa', href: '/grupos-vida/mapa' }],
})
const DREAM_TEAM = e('dream-team', 'dream-team', {
  label: 'Dream Team', labelMovil: 'Equipo', href: '/dream-team/mi-equipo',
  children: [
    { id: 'dt-mi-equipo', label: 'Mi equipo', href: '/dream-team/mi-equipo' },
    { id: 'dt-servidores', label: 'Servidores', href: '/admin/dream-team/servidores' },
  ],
})
const NINOS = e('ninos', 'ministerios', {
  label: 'Niños', href: '/ninos/checkin',
  children: [{ id: 'ninos-checkin', label: 'Check-in', href: '/ninos/checkin' }],
})
const TALLERES = e('platform-talleres_participation-taller-global', 'ministerios', { label: 'Talleres', href: '/talleres/explorar' })
const CONFIG = e('configuracion-global', 'administracion', {
  label: 'Configuración', href: '/configuracion',
  children: [{ id: 'config-general', label: 'General', href: '/configuracion' }],
})
const CONFIG_SOPORTE = { id: 'config-soporte', label: 'Configuración de soporte', href: '/configuracion/soporte' }
const TALLERES_PAGINAS = [
  { id: 'talleres_catalogo', label: 'Catálogo', href: '/talleres' },
  { id: 'talleres_participante_explorar', label: 'Explorar', href: '/talleres/explorar' },
]
const ACTUALIZACIONES = e('actualizaciones', 'pie', { label: 'Actualizaciones' })
const AYUDA = e('ayuda', 'pie', { label: 'Ayuda' })
const PERFIL = e('perfil', 'cuenta', { label: 'Mi perfil' })

const ids = (entradas: readonly { id: string }[]) => entradas.map((entrada) => entrada.id)

describe('navigation sections', () => {
  it('orders the sections general, ministerios, dream-team, administracion, pie, cuenta', () => {
    expect(ORDEN_SECCIONES).toEqual(['general', 'ministerios', 'dream-team', 'administracion', 'pie', 'cuenta'])
  })

  it('groups the visible entries in section order, keeping each entry order and dropping empty sections', () => {
    const grupos = agruparPorSeccion([PERFIL, USUARIOS, INICIO, GRUPOS, AYUDA, UNO_A_UNO, CONFIG, NINOS])

    expect(grupos.map((grupo) => grupo.seccion)).toEqual(['general', 'ministerios', 'administracion', 'pie', 'cuenta'])
    expect(grupos.map((grupo) => ids(grupo.entradas))).toEqual([
      ['dashboard', 'mis-uno-a-uno'],
      ['grupos-vida', 'ninos'],
      ['usuarios', 'configuracion-global'],
      ['ayuda'],
      ['perfil'],
    ])
  })

  it('returns no groups for no entries', () => {
    expect(agruparPorSeccion([])).toEqual([])
  })

  it('files every registry entry under its section and calls the home entry "Inicio"', () => {
    const seccionDe = Object.fromEntries(ENTRADAS_NAVEGACION.map((entrada) => [entrada.id, entrada.seccion]))
    expect(seccionDe).toEqual({
      dashboard: 'general',
      usuarios: 'administracion',
      'grupos-vida': 'ministerios',
      'configuracion-global': 'administracion',
      'soporte-admin': 'administracion',
      actualizaciones: 'pie',
      ayuda: 'pie',
      perfil: 'cuenta',
    })
    const inicio = ENTRADAS_NAVEGACION.find((entrada) => entrada.id === 'dashboard')!
    expect(inicio).toMatchObject({ label: 'Inicio', href: '/dashboard' })
    expect(ENTRADAS_NAVEGACION.map((entrada) => entrada.label)).not.toContain('Dashboard')
  })

  it('keeps the registry role rule: a member sees no Administración entry', () => {
    const visibles = filtrarVisibles(ENTRADAS_NAVEGACION, { roles: ['miembro'], supportCapabilities: [] })
    expect(agruparPorSeccion(visibles).map((grupo) => grupo.seccion)).toEqual(['general', 'ministerios', 'pie', 'cuenta'])
  })
})

describe('bottom tab bar', () => {
  const pestanas = (entradas: Entrada[]) => pestanasBarraInferior(entradas).map((p) => p.labelMovil)

  it('takes Inicio, Grupos, Niños and Equipo when all are allowed (admin)', () => {
    expect(pestanas([INICIO, UNO_A_UNO, USUARIOS, GRUPOS, DREAM_TEAM, NINOS, TALLERES, CONFIG, ACTUALIZACIONES, AYUDA, PERFIL]))
      .toEqual(['Inicio', 'Grupos', 'Niños', 'Equipo'])
  })

  it('fills with Talleres after Equipo when there is no Niños', () => {
    expect(pestanas([INICIO, UNO_A_UNO, GRUPOS, DREAM_TEAM, TALLERES, ACTUALIZACIONES, AYUDA, PERFIL]))
      .toEqual(['Inicio', 'Grupos', 'Equipo', 'Talleres'])
  })

  it('fills with Talleres then Ayuda without Niños and Dream Team', () => {
    expect(pestanas([INICIO, UNO_A_UNO, USUARIOS, GRUPOS, TALLERES, ACTUALIZACIONES, AYUDA, PERFIL]))
      .toEqual(['Inicio', 'Grupos', 'Talleres', 'Ayuda'])
  })

  it('shows only what qualifies when fewer than four do', () => {
    expect(pestanas([INICIO, GRUPOS, ACTUALIZACIONES, AYUDA, PERFIL])).toEqual(['Inicio', 'Grupos', 'Ayuda'])
    expect(pestanas([])).toEqual([])
  })

  it('never adds an entry that is not visible, nor non-priority entries', () => {
    const tabs = pestanasBarraInferior([USUARIOS, CONFIG, UNO_A_UNO, AYUDA])
    expect(ids(tabs)).toEqual(['ayuda'])
  })

  it('keeps the entry (full label, href, children) and adds the short label', () => {
    const [, , equipo] = pestanasBarraInferior([INICIO, GRUPOS, DREAM_TEAM])
    expect(equipo).toMatchObject({ id: 'dream-team', label: 'Dream Team', labelMovil: 'Equipo', href: '/dream-team/mi-equipo' })
    expect(ids(equipo.children ?? [])).toEqual(['dt-mi-equipo', 'dt-servidores'])
  })

  it('shows "Talleres" for a scoped Talleres item, keeping its full name as the label', () => {
    const scoped = { ...TALLERES, label: 'Talleres — de-hombre-a-hombre' }
    const [, , talleres] = pestanasBarraInferior([INICIO, GRUPOS, scoped])
    expect(talleres).toMatchObject({ label: 'Talleres — de-hombre-a-hombre', labelMovil: 'Talleres' })
  })

  it('marks a tab active on its route, below it, or on any child route', () => {
    expect(esPestanaActiva('/grupos-vida/123', GRUPOS)).toBe(true)
    expect(esPestanaActiva('/admin/dream-team/servidores', DREAM_TEAM)).toBe(true)
    expect(esPestanaActiva('/dashboard', INICIO)).toBe(true)
    expect(esPestanaActiva('/dashboard-otra', INICIO)).toBe(false)
    expect(esPestanaActiva('/users', GRUPOS)).toBe(false)
  })
})

const bloques = (mas: { subpaginas: { grupo: { id: string }; paginas: { href: string }[] }[] }) =>
  mas.subpaginas.map((bloque) => [bloque.grupo.id, bloque.paginas.map((pagina) => pagina.href)])

describe('"Más" sheet contents', () => {
  it('lists account, then every entry not in the tabs by section without submenus, then the footer', () => {
    const entradas = [INICIO, UNO_A_UNO, USUARIOS, GRUPOS, DREAM_TEAM, NINOS, TALLERES, CONFIG, ACTUALIZACIONES, AYUDA, PERFIL]
    const mas = contenidoMas(entradas, pestanasBarraInferior(entradas))

    expect(ids(mas.cuenta)).toEqual(['perfil'])
    // Configuración has sub-pages, so it moves from its section to its own block (S10).
    expect(mas.secciones.map((grupo) => [grupo.seccion, ids(grupo.entradas)])).toEqual([
      ['general', ['mis-uno-a-uno']],
      ['ministerios', ['platform-talleres_participation-taller-global']],
      ['administracion', ['usuarios']],
    ])
    expect(ids(mas.pie)).toEqual(['actualizaciones', 'ayuda'])
    const filas = [...mas.cuenta, ...mas.secciones.flatMap((grupo) => grupo.entradas), ...mas.pie]
    expect(filas.every((fila) => !('children' in fila))).toBe(true)
  })

  it('shows a group without visible sub-pages as one row to its own page', () => {
    const configSinHijas = { ...CONFIG, children: [] }
    const entradas = [INICIO, configSinHijas, AYUDA]
    const mas = contenidoMas(entradas, [])
    expect(mas.secciones.flatMap((grupo) => grupo.entradas).map((fila) => [fila.id, fila.href])).toEqual([
      ['dashboard', '/dashboard'],
      ['configuracion-global', '/configuracion'],
    ])
    expect(mas.subpaginas).toEqual([])
  })

  it('leaves out an entry whose page a tab already opens (a platform Grupos de Vida item)', () => {
    const gruposPlataforma = e('platform-grupos_vida_stage-etapa-adultos', 'ministerios', { label: 'Grupos de Vida — Adultos', href: '/grupos-vida' })
    const entradas = [INICIO, { ...GRUPOS, children: [] }, gruposPlataforma, TALLERES, ACTUALIZACIONES, AYUDA, PERFIL]
    const mas = contenidoMas(entradas, pestanasBarraInferior(entradas))
    expect(mas.secciones).toEqual([])
    expect(ids(mas.pie)).toEqual(['actualizaciones'])
  })
})

describe('"Más" sub-page blocks (S10)', () => {
  it('gives Grupos de Vida a block with its sub-pages even though Grupos is a tab', () => {
    const entradas = [INICIO, GRUPOS, AYUDA]
    const mas = contenidoMas(entradas, pestanasBarraInferior(entradas))

    expect(bloques(mas)).toEqual([['grupos-vida', ['/grupos-vida/mapa']]])
    expect(mas.subpaginas[0].grupo).toMatchObject({ label: 'Grupos de Vida' })
    expect(mas.subpaginas[0].grupo).not.toHaveProperty('children')
  })

  it('gives Configuración a block with General and Configuración de soporte, and drops its section row', () => {
    const config = { ...CONFIG, children: [...CONFIG.children!, CONFIG_SOPORTE] }
    const entradas = [INICIO, GRUPOS, USUARIOS, config, AYUDA]
    const mas = contenidoMas(entradas, pestanasBarraInferior(entradas))

    expect(bloques(mas)).toEqual([
      ['grupos-vida', ['/grupos-vida/mapa']],
      ['configuracion-global', ['/configuracion', '/configuracion/soporte']],
    ])
    expect(mas.subpaginas[1].paginas.map((pagina) => pagina.label)).toEqual(['General', 'Configuración de soporte'])
    expect(mas.secciones.map((grupo) => [grupo.seccion, ids(grupo.entradas)])).toEqual([['administracion', ['usuarios']]])
  })

  it('starts the block with the group page when no child and no tab opens it', () => {
    const config = { ...CONFIG, children: [CONFIG_SOPORTE] }
    const mas = contenidoMas([INICIO, config], [INICIO])

    expect(bloques(mas)).toEqual([['configuracion-global', ['/configuracion', '/configuracion/soporte']]])
    expect(mas.subpaginas[0].paginas[0]).toMatchObject({ id: 'configuracion-global', label: 'Configuración' })
    expect(mas.secciones).toEqual([])
  })

  it('gives no block to Dream Team, nor to Niños and Talleres when they are tabs', () => {
    const talleres = { ...TALLERES, children: TALLERES_PAGINAS }
    const conNinos = [INICIO, GRUPOS, DREAM_TEAM, NINOS, AYUDA]
    expect(bloques(contenidoMas(conNinos, pestanasBarraInferior(conNinos)))).toEqual([['grupos-vida', ['/grupos-vida/mapa']]])

    const conTalleres = [INICIO, GRUPOS, talleres, AYUDA]
    expect(ids(pestanasBarraInferior(conTalleres))).toContain(talleres.id)
    expect(bloques(contenidoMas(conTalleres, pestanasBarraInferior(conTalleres)))).toEqual([['grupos-vida', ['/grupos-vida/mapa']]])

    const sinPestanas = [DREAM_TEAM]
    expect(contenidoMas(sinPestanas, []).subpaginas).toEqual([])
  })

  it('gives Niños and Talleres a block when they are not tabs', () => {
    const talleres = { ...TALLERES, children: TALLERES_PAGINAS }
    const entradas = [INICIO, GRUPOS, DREAM_TEAM, NINOS, talleres, AYUDA]
    const pestanas = pestanasBarraInferior(entradas)
    expect(ids(pestanas)).not.toContain(talleres.id)
    const mas = contenidoMas(entradas, pestanas)
    expect(bloques(mas)).toEqual([
      ['grupos-vida', ['/grupos-vida/mapa']],
      [talleres.id, ['/talleres', '/talleres/explorar']],
    ])
    expect(mas.secciones).toEqual([])

    const ninosSinPestana = contenidoMas([NINOS], [])
    expect(bloques(ninosSinPestana)).toEqual([['ninos', ['/ninos/checkin']]])
  })

  it('orders the blocks by sidebar section, not by list order', () => {
    const config = { ...CONFIG, children: [CONFIG_SOPORTE] }
    const mas = contenidoMas([INICIO, config, GRUPOS], [INICIO])
    expect(mas.subpaginas.map((bloque) => bloque.grupo.id)).toEqual(['grupos-vida', 'configuracion-global'])
  })

  it('lists every row in order with filasDeMas', () => {
    const config = { ...CONFIG, children: [...CONFIG.children!, CONFIG_SOPORTE] }
    const entradas = [INICIO, UNO_A_UNO, GRUPOS, USUARIOS, config, ACTUALIZACIONES, AYUDA, PERFIL]
    const mas = contenidoMas(entradas, pestanasBarraInferior(entradas))
    expect(filasDeMas(mas).map((fila) => fila.href)).toEqual([
      '/perfil', '/mis-uno-a-uno', '/users', '/grupos-vida/mapa', '/configuracion', '/configuracion/soporte', '/actualizaciones',
    ])
  })
})

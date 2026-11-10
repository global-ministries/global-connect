import { buildDpsMenuItem, getDpsNavItems } from '@/components/dps/dps-menu-item'
import { buildEstudiantesMenuItem, getEstudiantesNavItems } from '@/components/estudiantes/estudiantes-menu-item'
import { buildNinosMenuItem, getNinosNavItems } from '@/components/ninos/ninos-menu-item'
import { componerNavegacion, paginasTalleres } from '@/components/navegacion/componer-navegacion'
import { buildDreamTeamMenuItem } from '@/components/ui/dream-team-menu-item'
import { buildTalleresMenuItem } from '@/components/ui/talleres-menu-item'
import { resolvePlatformNavigationViewItems, type PlatformNavigationViewItem } from '@/components/ui/platform-navigation-view-items'
import { buildUnoAUnoMenuItem } from '@/components/uno-a-uno/uno-a-uno-menu-item'
import { getDreamTeamNavItems } from '@/lib/platform/dream-team/navigation'
import { SIN_ACCESO_DPS, type DpsAcceso } from '@/lib/platform/dps/acceso'
import type { PlatformSession, PlatformSessionCapability } from '@/lib/platform/session/types'
import { SIN_ACCESO_ESTUDIANTES, type AccesoEstudiantes } from '@/lib/platform/estudiantes/acceso'
import { SIN_ACCESO_UNO_A_UNO } from '@/lib/uno-a-uno/acceso'

/**
 * The shell's navigation per role (odd/tasks/sistema-diseno-v2.md, S9): the
 * sections, the Dream Team group and the phone tab bar, built from the same
 * builders the menus use. One sample person per role of the approved
 * prototype (design/app-shell).
 */

type Rol = {
  roles: string[]
  capabilities?: PlatformSessionCapability[]
  ninos?: { puedeOperar?: boolean; puedeVerSalon?: boolean; puedeConfigurar?: boolean; puedeMarcarVoluntarios?: boolean }
  unoAUno?: boolean
  puedeRegistrar?: boolean
  estudiantes?: Partial<AccesoEstudiantes>
}

const cap = (key: string): PlatformSessionCapability => ({
  key, experience: 'dream_team', scopeType: 'equipo', scopeId: 'equipo-1', source: 'dream-team',
})
const orgManage: PlatformSessionCapability = { key: 'dream_team.org.manage', experience: 'dream_team', scopeType: 'experience', source: 'manual' }

const ROLES: Record<string, Rol> = {
  admin: {
    roles: ['admin'],
    capabilities: [orgManage],
    ninos: { puedeOperar: true, puedeVerSalon: true, puedeConfigurar: true, puedeMarcarVoluntarios: true },
    unoAUno: true,
  },
  'director DT': { roles: ['miembro'], capabilities: [cap('dream_team.direct')], unoAUno: true },
  coordinador: { roles: ['miembro'], capabilities: [cap('dream_team.coordinate')], unoAUno: true },
  lider: { roles: ['lider'], unoAUno: true },
  'operador Niños': { roles: ['miembro'], ninos: { puedeOperar: true, puedeVerSalon: true } },
}

// Estudiantes (C4b of odd/tasks/estudiantes-fase-b.md): server-fed like Niños.
const ROLES_ESTUDIANTES: Record<string, Rol> = {
  'admin con Estudiantes': { ...ROLES.admin, estudiantes: { grupos: 6, vivo: true, gestiona: true } },
  'líder de grupo': { roles: ['miembro'], estudiantes: { grupos: 1, lidera: true } },
  'líder de GdV con Estudiantes': { roles: ['lider'], unoAUno: true, estudiantes: { grupos: 1, lidera: true } },
}

function sesion(rol: Rol): PlatformSession {
  return { personaId: 'persona-1', subjectAuthId: 'auth-1', globalRoles: rol.roles, contexts: [], capabilities: rol.capabilities ?? [] }
}

async function navegacionDe(
  nombre: string,
  { plataforma = true, dps, talleresMenu = false }: { plataforma?: boolean; dps?: DpsAcceso; talleresMenu?: boolean } = {},
) {
  const rol = ROLES[nombre] ?? ROLES_ESTUDIANTES[nombre]
  const platformSession = sesion(rol)
  const items: PlatformNavigationViewItem[] = plataforma
    ? await resolvePlatformNavigationViewItems(platformSession, { enabled: true })
    : []
  return componerNavegacion({
    credenciales: { roles: rol.roles, supportCapabilities: [] },
    dreamTeam: buildDreamTeamMenuItem(getDreamTeamNavItems(platformSession, true, { puedeRegistrar: rol.puedeRegistrar })),
    ninos: buildNinosMenuItem(getNinosNavItems({
      puedeOperar: false, puedeVerSalon: false, puedeConfigurar: false, puedeMarcarVoluntarios: false, ...rol.ninos,
    })),
    unoAUno: buildUnoAUnoMenuItem({ ...SIN_ACCESO_UNO_A_UNO, lidera: rol.unoAUno === true }),
    estudiantes: buildEstudiantesMenuItem(getEstudiantesNavItems({ ...SIN_ACCESO_ESTUDIANTES, ...rol.estudiantes })),
    plataforma: items,
    talleres: paginasTalleres(platformSession.capabilities.map((capacidad) => capacidad.key)),
    ...(dps ? { dps: buildDpsMenuItem(getDpsNavItems(dps, platformSession)) } : {}),
    ...(talleresMenu ? { talleresMenu: buildTalleresMenuItem(true) } : {}),
  })
}

const ids = (entradas: readonly { id: string }[]) => entradas.map((entrada) => entrada.id)

describe('shell navigation per role', () => {
  it.each([
    ['admin', ['Inicio', 'Grupos', 'Niños', 'Equipo']],
    // Pendientes takes the fourth tab of whoever has team authority (odd/tasks/dream-team-pendientes-director.md,
    // T4, artboard 02); Talleres moves to "Más".
    ['director DT', ['Inicio', 'Grupos', 'Equipo', 'Pendientes']],
    ['coordinador', ['Inicio', 'Grupos', 'Equipo', 'Pendientes']],
    ['lider', ['Inicio', 'Grupos', 'Talleres', 'Ayuda']],
    ['operador Niños', ['Inicio', 'Grupos', 'Niños', 'Talleres']],
  ])('gives the %s the tabs %j', async (nombre, esperadas) => {
    const { pestanas } = await navegacionDe(nombre)
    expect(pestanas.map((pestana) => pestana.labelMovil)).toEqual(esperadas)
  })

  it('opens each tab on its first page', async () => {
    const { pestanas } = await navegacionDe('admin')
    expect(pestanas.map((pestana) => [pestana.label, pestana.href])).toEqual([
      ['Inicio', '/dashboard'],
      ['Grupos de Vida', '/grupos-vida'],
      ['Niños', '/ninos/checkin'],
      ['Dream Team', '/dream-team/mi-equipo'],
    ])
  })

  it('models Dream Team as one group in its own section, with the reader screens for a director', async () => {
    const { secciones } = await navegacionDe('director DT')
    const dreamTeam = secciones.find((grupo) => grupo.seccion === 'dream-team')!
    expect(ids(dreamTeam.entradas)).toEqual(['dream-team'])
    expect(dreamTeam.entradas[0]).toMatchObject({ label: 'Dream Team', labelMovil: 'Equipo', href: '/dream-team/mi-equipo' })
    expect(ids(dreamTeam.entradas[0].children ?? [])).toEqual(['dt-mi-equipo', 'dt-pendientes', 'dt-servidores', 'dt-estructura'])
  })

  it('gives a coordinator the Dream Team group with Mi equipo and Pendientes only', async () => {
    const { secciones } = await navegacionDe('coordinador')
    const dreamTeam = secciones.find((grupo) => grupo.seccion === 'dream-team')!
    expect(ids(dreamTeam.entradas[0].children ?? [])).toEqual(['dt-mi-equipo', 'dt-pendientes'])
  })

  it('has no Dream Team section for whoever opens no Dream Team page', async () => {
    const { secciones } = await navegacionDe('lider')
    expect(secciones.map((grupo) => grupo.seccion)).not.toContain('dream-team')
  })

  it('files the admin entries under the sidebar sections, in order', async () => {
    const { secciones } = await navegacionDe('admin')
    expect(secciones.map((grupo) => [grupo.seccion, ids(grupo.entradas)])).toEqual([
      ['general', ['dashboard', 'mis-uno-a-uno']],
      ['ministerios', ['grupos-vida', 'ninos', 'platform-talleres_participation-taller-global']],
      ['dream-team', ['dream-team']],
      ['administracion', ['usuarios', 'configuracion-global']],
      ['pie', ['actualizaciones', 'ayuda']],
      ['cuenta', ['perfil']],
    ])
  })

  it('keeps the sidebar list (principales) in its current order', async () => {
    const { principales } = await navegacionDe('admin')
    expect(ids(principales)).toEqual([
      'dashboard', 'mis-uno-a-uno', 'usuarios', 'grupos-vida', 'dream-team', 'ninos',
      'configuracion-global', 'platform-talleres_participation-taller-global',
    ])
  })

  it('lists the rest in "Más" for a leader: account, sections without submenus, footer', async () => {
    const { mas } = await navegacionDe('lider')
    expect(ids(mas.cuenta)).toEqual(['perfil'])
    expect(mas.secciones.map((grupo) => [grupo.seccion, ids(grupo.entradas)])).toEqual([
      ['general', ['mis-uno-a-uno']],
      ['administracion', ['usuarios']],
    ])
    expect(ids(mas.pie)).toEqual(['actualizaciones'])
  })

  it('gives the admin "Más" blocks for Grupos de Vida, Talleres (not a tab) and Configuración (S10)', async () => {
    const { mas } = await navegacionDe('admin')
    expect(mas.subpaginas.map((bloque) => [bloque.grupo.label, bloque.paginas.map((pagina) => pagina.href)])).toEqual([
      ['Grupos de Vida', [
        '/grupos-vida/casas-anfitrionas', '/grupos-vida/segmentos', '/grupos-vida/directores', '/grupos-vida/temporadas',
        '/grupos-vida/planificar', '/grupos-vida/mapa', '/grupos-vida/reportes/asistencia-semanal', '/grupos-vida/dashboard-riesgo',
        '/grupos-vida/solicitudes', '/grupos-vida/configuracion',
      ]],
      ['Talleres', paginasTalleres([]).map((pagina) => pagina.href)],
      ['Configuración', ['/configuracion']],
    ])
    expect(paginasTalleres([]).map((pagina) => pagina.href)).toEqual(['/talleres', '/talleres/explorar', '/talleres/mi-recorrido'])
  })

  it('gives no Talleres block where Talleres is a tab (a leader)', async () => {
    const { mas } = await navegacionDe('lider')
    expect(mas.subpaginas).toEqual([])
  })

  it('still has tabs without platform navigation (flag off or still loading)', async () => {
    const { pestanas } = await navegacionDe('lider', { plataforma: false })
    expect(pestanas.map((pestana) => pestana.labelMovil)).toEqual(['Inicio', 'Grupos', 'Ayuda'])
  })

  it('only offers tabs and "Más" rows the sidebar already shows', async () => {
    for (const nombre of Object.keys(ROLES)) {
      const { principales, pie, cuenta, pestanas, mas } = await navegacionDe(nombre)
      // A Dream Team child counts: the Pendientes tab is the sidebar's Dream Team › Pendientes.
      const visibles = new Set(
        [...principales, ...pie, ...cuenta].flatMap((entrada) => [entrada.id, ...(entrada.children ?? []).map((hija) => hija.id)]),
      )
      const ofrecidas = [
        ...pestanas, ...mas.cuenta, ...mas.secciones.flatMap((grupo) => grupo.entradas),
        ...mas.subpaginas.map((bloque) => bloque.grupo), ...mas.pie,
      ]
      expect(ofrecidas.filter((entrada) => !visibles.has(entrada.id))).toEqual([])
    }
  })
})

describe('the Estudiantes section (C4b)', () => {
  it('sits in Ministerios right after Niños, with its entries', async () => {
    const { secciones, principales } = await navegacionDe('admin con Estudiantes')
    const ministerios = secciones.find((grupo) => grupo.seccion === 'ministerios')!
    expect(ids(ministerios.entradas)).toEqual(['grupos-vida', 'ninos', 'estudiantes', 'platform-talleres_participation-taller-global'])
    expect(ids(principales).slice(4, 7)).toEqual(['dream-team', 'ninos', 'estudiantes'])
    const estudiantes = ministerios.entradas.find((entrada) => entrada.id === 'estudiantes')!
    expect(estudiantes).toMatchObject({ label: 'Estudiantes', href: '/estudiantes' })
    expect((estudiantes.children ?? []).map((hija) => [hija.label, hija.href])).toEqual([
      ['Mis grupos', '/estudiantes'],
      ['En vivo', '/estudiantes/vivo'],
      ['Grupos', '/estudiantes/grupos'],
      ['Reportes', '/estudiantes/reportes'],
    ])
  })

  it('follows Grupos de Vida when the user has neither Dream Team nor Niños', async () => {
    const { secciones } = await navegacionDe('líder de grupo')
    const ministerios = secciones.find((grupo) => grupo.seccion === 'ministerios')!
    expect(ids(ministerios.entradas).slice(0, 2)).toEqual(['grupos-vida', 'estudiantes'])
  })

  it('is absent without access', async () => {
    const { secciones } = await navegacionDe('admin')
    expect(secciones.flatMap((grupo) => ids(grupo.entradas))).not.toContain('estudiantes')
  })

  it('does not change the phone tabs: the section goes to "Más" as a block', async () => {
    expect((await navegacionDe('admin con Estudiantes')).pestanas.map((pestana) => pestana.labelMovil)).toEqual(['Inicio', 'Grupos', 'Niños', 'Equipo'])
    const lider = await navegacionDe('líder de GdV con Estudiantes')
    expect(lider.pestanas.map((pestana) => pestana.labelMovil)).toEqual(['Inicio', 'Grupos', 'Talleres', 'Ayuda'])
    expect(lider.mas.subpaginas.map((bloque) => [bloque.grupo.label, bloque.paginas.map((pagina) => pagina.href)])).toEqual([['Estudiantes', ['/estudiantes']]])
  })
})

// DPS (odd/tasks/dps-asistencia-pco.md, T9, L29): its own ministry, server-fed like Niños and Estudiantes.
describe('the DPS section', () => {
  const dpsDe = (acceso: DpsAcceso, capabilities: PlatformSessionCapability[] = []) =>
    buildDpsMenuItem(getDpsNavItems(acceso, sesion({ roles: ['miembro'], capabilities })))

  it('sits in Ministerios right after Estudiantes (else Niños), with its entries', async () => {
    const conEstudiantes = await navegacionDe('admin con Estudiantes', { dps: { ver: true, planificar: true } })
    const ministerios = conEstudiantes.secciones.find((grupo) => grupo.seccion === 'ministerios')!
    expect(ids(ministerios.entradas)).toEqual(['grupos-vida', 'ninos', 'estudiantes', 'dps', 'platform-talleres_participation-taller-global'])
    const dps = ministerios.entradas.find((entrada) => entrada.id === 'dps')!
    expect(dps).toMatchObject({ label: 'DPS', href: '/dps/plan' })
    expect((dps.children ?? []).map((hija) => [hija.label, hija.href])).toEqual([
      ['Plan', '/dps/plan'],
      ['Programación', '/dps/programacion'],
      ['Asistencia', '/dps/asistencia'],
      ['Configuración', '/dps/configuracion'],
    ])
    expect(conEstudiantes.secciones.find((grupo) => grupo.seccion === 'dream-team')!.entradas[0].children?.map((hija) => hija.id)).toEqual([
      'dt-mi-equipo', 'dt-pendientes', 'dt-servidores', 'dt-estructura',
    ])
    const sinEstudiantes = await navegacionDe('admin', { dps: { ver: true, planificar: true } })
    expect(ids(sinEstudiantes.secciones.find((grupo) => grupo.seccion === 'ministerios')!.entradas).slice(0, 3)).toEqual(['grupos-vida', 'ninos', 'dps'])
  })

  it('gives a DPS coordinator Plan, Programación and Asistencia, and a plain DPS servidor only Plan and Programación (T10, T11)', () => {
    expect(dpsDe({ ver: true, planificar: false }, [cap('dream_team.coordinate')])?.children.map((hija) => hija.href)).toEqual([
      '/dps/plan', '/dps/programacion', '/dps/asistencia',
    ])
    expect(dpsDe({ ver: true, planificar: false })?.children.map((hija) => hija.href)).toEqual(['/dps/plan', '/dps/programacion'])
    expect(dpsDe(SIN_ACCESO_DPS, [cap('dream_team.coordinate')])).toBeNull()
  })

  it('leaves the navigation of a non-DPS user unchanged', async () => {
    for (const nombre of [...Object.keys(ROLES), ...Object.keys(ROLES_ESTUDIANTES)]) {
      const antes = await navegacionDe(nombre)
      const despues = await navegacionDe(nombre, { dps: SIN_ACCESO_DPS })
      expect(despues).toEqual(antes)
      expect(ids(despues.principales)).not.toContain('dps')
    }
  })

  it('is not a phone tab: it goes to "Más" as a block', async () => {
    const { pestanas, mas } = await navegacionDe('admin', { dps: { ver: true, planificar: true } })
    expect(pestanas.map((pestana) => pestana.labelMovil)).toEqual(['Inicio', 'Grupos', 'Niños', 'Equipo'])
    expect(mas.subpaginas.find((bloque) => bloque.grupo.label === 'DPS')?.paginas.map((pagina) => pagina.href)).toEqual([
      '/dps/plan', '/dps/programacion', '/dps/asistencia', '/dps/configuracion',
    ])
  })
})

// «Talleres» as its own entry (odd/tasks/proximo-paso.md, T6, L18): on with talleres, without platform navigation.
describe('the Talleres entry', () => {
  const ministeriosDe = (secciones: Awaited<ReturnType<typeof navegacionDe>>['secciones']) =>
    ids(secciones.find((grupo) => grupo.seccion === 'ministerios')!.entradas)

  it('is built only when talleres is on', () => {
    expect(buildTalleresMenuItem(false)).toBeNull()
    expect(buildTalleresMenuItem(true)).toMatchObject({ id: 'talleres', label: 'Talleres', href: '/talleres/explorar' })
  })

  it('sits in Ministerios after DPS without platform navigation', async () => {
    const conDps = await navegacionDe('admin', { plataforma: false, talleresMenu: true, dps: { ver: true, planificar: true } })
    expect(ministeriosDe(conDps.secciones)).toEqual(['grupos-vida', 'ninos', 'dps', 'talleres'])
    const sinDps = await navegacionDe('admin', { plataforma: false, talleresMenu: true })
    expect(ministeriosDe(sinDps.secciones)).toEqual(['grupos-vida', 'ninos', 'talleres'])
  })

  it('replaces the platform Talleres item, so only one shows', async () => {
    const { principales, secciones } = await navegacionDe('admin', { talleresMenu: true, dps: { ver: true, planificar: true } })
    expect(ids(principales).filter((id) => id.includes('talleres'))).toEqual(['talleres'])
    expect(ministeriosDe(secciones)).toEqual(['grupos-vida', 'ninos', 'dps', 'talleres'])
  })

  it('keeps the Talleres tab and the "Más" block it had as a platform item', async () => {
    const lider = await navegacionDe('lider', { plataforma: false, talleresMenu: true })
    expect(lider.pestanas.map((pestana) => pestana.labelMovil)).toEqual(['Inicio', 'Grupos', 'Talleres', 'Ayuda'])
    expect(lider.mas.subpaginas).toEqual([])
    const admin = await navegacionDe('admin', { plataforma: false, talleresMenu: true })
    expect(admin.mas.subpaginas.find((bloque) => bloque.grupo.label === 'Talleres')?.paginas.map((pagina) => pagina.href)).toEqual(
      paginasTalleres([]).map((pagina) => pagina.href),
    )
  })
})

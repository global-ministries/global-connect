import { buildNinosMenuItem, getNinosNavItems } from '@/components/ninos/ninos-menu-item'
import { componerNavegacion, paginasTalleres } from '@/components/navegacion/componer-navegacion'
import { buildDreamTeamMenuItem } from '@/components/ui/dream-team-menu-item'
import { resolvePlatformNavigationViewItems, type PlatformNavigationViewItem } from '@/components/ui/platform-navigation-view-items'
import { buildUnoAUnoMenuItem } from '@/components/uno-a-uno/uno-a-uno-menu-item'
import { getDreamTeamNavItems } from '@/lib/platform/dream-team/navigation'
import type { PlatformSession, PlatformSessionCapability } from '@/lib/platform/session/types'
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

function sesion(rol: Rol): PlatformSession {
  return { personaId: 'persona-1', subjectAuthId: 'auth-1', globalRoles: rol.roles, contexts: [], capabilities: rol.capabilities ?? [] }
}

async function navegacionDe(nombre: string, { plataforma = true } = {}) {
  const rol = ROLES[nombre]
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
    plataforma: items,
    talleres: paginasTalleres(platformSession.capabilities.map((capacidad) => capacidad.key)),
  })
}

const ids = (entradas: readonly { id: string }[]) => entradas.map((entrada) => entrada.id)

describe('shell navigation per role', () => {
  it.each([
    ['admin', ['Inicio', 'Grupos', 'Niños', 'Equipo']],
    ['director DT', ['Inicio', 'Grupos', 'Equipo', 'Talleres']],
    ['coordinador', ['Inicio', 'Grupos', 'Equipo', 'Talleres']],
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
    expect(ids(dreamTeam.entradas[0].children ?? [])).toEqual(['dt-mi-equipo', 'dt-servidores', 'dt-estructura'])
  })

  it('gives a coordinator the Dream Team group with Mi equipo only', async () => {
    const { secciones } = await navegacionDe('coordinador')
    const dreamTeam = secciones.find((grupo) => grupo.seccion === 'dream-team')!
    expect(ids(dreamTeam.entradas[0].children ?? [])).toEqual(['dt-mi-equipo'])
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
        '/grupos-vida/mapa', '/grupos-vida/reportes/asistencia-semanal', '/grupos-vida/dashboard-riesgo',
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
      const visibles = new Set([...principales, ...pie, ...cuenta].map((entrada) => entrada.id))
      const ofrecidas = [
        ...pestanas, ...mas.cuenta, ...mas.secciones.flatMap((grupo) => grupo.entradas),
        ...mas.subpaginas.map((bloque) => bloque.grupo), ...mas.pie,
      ]
      expect(ofrecidas.filter((entrada) => !visibles.has(entrada.id))).toEqual([])
    }
  })
})

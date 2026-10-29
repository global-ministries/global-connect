import { insertNinosMenuItem, type NinosMenuItem } from '@/components/ninos/ninos-menu-item'
import { insertDreamTeamMenuItem, type DreamTeamMenuItem } from '@/components/ui/dream-team-menu-item'
import {
  seccionDePlatformNavigationViewItem,
  type PlatformNavigationViewItem,
} from '@/components/ui/platform-navigation-view-items'
import { insertUnoAUnoMenuItem, type UnoAUnoMenuItem } from '@/components/uno-a-uno/uno-a-uno-menu-item'
import {
  entradasDeSecciones,
  filtrarVisibles,
  type CredencialesNavegacion,
  type EntradaNavegacion,
  type SubEntradaNavegacion,
} from '@/lib/navegacion/registro'
import { getTalleresFlags } from '@/lib/platform/talleres/flags'
import { groupTalleresNavItems } from '@/lib/platform/talleres/navigation'
import { getTalleresNavItems } from '@/lib/platform/talleres/route-access'
import {
  agruparPorSeccion,
  contenidoMas,
  pestanasBarraInferior,
  SECCIONES_PRINCIPALES,
} from '@/lib/navegacion/secciones'

/** One entry as the menus render it (registry, Dream Team, Niños, Mis 1 a 1 or platform). */
export type EntradaMenu = Pick<
  EntradaNavegacion,
  'id' | 'label' | 'href' | 'icon' | 'roles' | 'capabilities' | 'children' | 'seccion' | 'labelMovil' | 'hrefRaiz'
>

export interface FuentesNavegacion {
  credenciales: CredencialesNavegacion
  dreamTeam: DreamTeamMenuItem | null
  ninos: NinosMenuItem | null
  unoAUno: UnoAUnoMenuItem | null
  plataforma: readonly PlatformNavigationViewItem[]
  /** The Talleres pages the sidebar's TalleresNavSubmenu lists ({@link paginasTalleres}); "Más" shows them when Talleres is not a tab. */
  talleres?: readonly SubEntradaNavegacion[]
}

/**
 * The pages under a Talleres platform item, as the sidebar's TalleresNavSubmenu
 * (components/talleres/nav-submenu.tsx) lists them: none with the kill switch
 * on, else by capability and in role-group order. "Mis grupos" is data-gated
 * there and the sidebar passes no counters, so it is left out here too.
 */
export function paginasTalleres(capacidades: readonly string[]): SubEntradaNavegacion[] {
  if (getTalleresFlags().killSwitch) return []
  return groupTalleresNavItems(getTalleresNavItems(capacidades, { isEnabled: true }))
    .flatMap((grupo) => grupo.items)
    .map(({ id, label, href }) => ({ id, label, href }))
}

function esTalleres(entrada: { id: string }): boolean {
  return entrada.id.startsWith('platform-talleres_')
}

/**
 * Everything the shell renders, from the user's sources (pure; the hook is
 * components/navegacion/use-entradas-navegacion.ts):
 * - principales: the main list in its current order — "Mis 1 a 1" right after
 *   Inicio, Dream Team and Niños right after Grupos de Vida, then the platform
 *   items — each filtered by the registry role rule;
 * - pie and cuenta: the footer and account links;
 * - secciones: every visible entry grouped by section (lib/navegacion/secciones.ts);
 * - pestanas and mas: the phone tab bar and the "Más" sheet (where a Talleres
 *   item carries its `talleres` pages, so it gets a block when not a tab).
 */
export function componerNavegacion({ credenciales, dreamTeam, ninos, unoAUno, plataforma, talleres = [] }: FuentesNavegacion) {
  const principales = filtrarVisibles<EntradaMenu>(
    [
      ...insertUnoAUnoMenuItem<EntradaMenu>(
        insertNinosMenuItem<EntradaMenu>(
          insertDreamTeamMenuItem<EntradaMenu>(entradasDeSecciones(...SECCIONES_PRINCIPALES), dreamTeam),
          ninos && { ...ninos, seccion: 'ministerios' },
        ),
        unoAUno && { ...unoAUno, seccion: 'general' },
      ),
      ...plataforma.map((item) => ({ ...item, seccion: seccionDePlatformNavigationViewItem(item) })),
    ],
    credenciales,
  )
  const pie = filtrarVisibles<EntradaMenu>(entradasDeSecciones('pie'), credenciales)
  const cuenta = filtrarVisibles<EntradaMenu>(entradasDeSecciones('cuenta'), credenciales)
  const todas = [...principales, ...pie, ...cuenta]
  const pestanas = pestanasBarraInferior(todas)

  return {
    principales,
    pie,
    cuenta,
    secciones: agruparPorSeccion(todas),
    pestanas,
    mas: contenidoMas(
      talleres.length > 0 ? todas.map((entrada) => (esTalleres(entrada) ? { ...entrada, children: [...talleres] } : entrada)) : todas,
      pestanas,
    ),
  }
}

export type NavegacionCompuesta = ReturnType<typeof componerNavegacion>

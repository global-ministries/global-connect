/**
 * /talleres/temporadas — R3b (odd/tasks/talleres-rediseno.md, S1, S2, S5):
 * rebuilt on the v2 list anatomy (artboards design/talleres-interior/26 and
 * 27). One screen holds the list, the drawer of each temporada and the
 * «Crear temporada» form; the old /talleres/temporadas/[id] and /crear routes
 * redirect here (`?temporada=<id>`, `?crear=1`).
 *
 * GATE, unchanged: flag -> user -> session, each an informational card. No
 * role required: RLS on talleres_temporadas decides which rows come back.
 *
 * PERMISSIONS, unchanged:
 * - «Crear temporada» shows when some dirección from
 *   `loadDireccionesConTalleres` carries `puedeEditar` (cargarPermisos(...)
 *   .editarTaller); the form only offers those direcciones.
 * - The drawer's write controls (Abrir, Cerrar, Cancelar, Agregar, Quitar)
 *   use the old detail page's check: talleres_crecimiento.director.write OR
 *   admin.manage. The server actions and their RPCs / RLS check again.
 *
 * Before reading, `refrescarEstadosEdiciones(client)` (unscoped, as the old
 * detail page did) so every edición shows its effective estado.
 */

import {
  PaginaSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import { TemporadasClient } from '@/components/talleres/temporadas/temporadas-client'
import { leerFiltros } from '@/components/talleres/temporadas/vista-temporadas'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { refrescarEstadosEdiciones } from '@/lib/platform/talleres/refrescar-estados'
import {
  loadDireccionesConTalleres,
  loadPanelTemporadas,
  loadTalleresDeDireccion,
} from '@/lib/platform/talleres/temporadas'

export const metadata = { title: 'Temporadas' }

type Params = Record<string, string | string[] | undefined>

interface PageProps {
  readonly searchParams: Promise<Params>
}

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}

/** The gate's informational card, as an element (not a component) so the page returns PaginaSistema itself. */
function aviso(texto: string) {
  return (
    <PaginaSistema titulo="Temporadas">
      <TarjetaSistema variante="outlined" className="p-6 text-center">
        <TextoSistema variante="sutil">{texto}</TextoSistema>
      </TarjetaSistema>
    </PaginaSistema>
  )
}

export default async function TemporadasPage({ searchParams }: PageProps) {
  if (!isTalleresEnabled()) return aviso('El módulo de talleres está deshabilitado.')

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return aviso('Necesitas iniciar sesión.')

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) return aviso('No se pudo resolver tu sesión.')

  const caps = session.capabilities.map((c) => c.key)
  const puedeEditar =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')

  const params = await searchParams

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  await refrescarEstadosEdiciones(client)
  const [direcciones, temporadas] = await Promise.all([
    loadDireccionesConTalleres(client),
    loadPanelTemporadas(client),
  ])

  const direccionesCrear = await Promise.all(
    direcciones
      .filter((d) => d.puedeEditar)
      .map(async (d) => ({ id: d.id, label: d.label, talleres: await loadTalleresDeDireccion(client, d.id) })),
  )

  return (
    <TemporadasClient
      temporadas={temporadas}
      puedeEditar={puedeEditar}
      direccionesCrear={direccionesCrear}
      filtrosIniciales={leerFiltros({
        vista: primero(params.vista),
        atencion: primero(params.atencion),
        direccion: primero(params.direccion),
        q: primero(params.q),
      })}
      temporadaInicial={primero(params.temporada) ?? null}
      crearInicial={primero(params.crear) === '1'}
    />
  )
}

/**
 * T2 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres, the new
 * consolidated catalog.
 *
 * Replaces /talleres/direccion, /talleres/coordinacion,
 * /talleres/direccion/talleres, /talleres/coordinacion/talleres and
 * /admin/talleres/abstracto's list+create; absorbs the leader's
 * /talleres/equipo/mis-grupos + /talleres/equipo/proximas-sesiones as a
 * section (docs/talleres-de-punta-a-punta.md §8, "De 32 a once"). The
 * old routes keep working until T10 deletes them — several of them
 * still import the two loaders this page's own loader (catalogo.ts)
 * does NOT replace.
 *
 * GATING DECISION (task's own "decide and document which of the two"):
 * this page is open to any signed-in user, not gated behind a
 * capability card like app/(auth)/admin/talleres/abstracto/page.tsx —
 * it only gates on the feature flag and a resolved session. A viewer
 * with zero talleres capabilities still reaches the page and simply
 * sees what RLS gives them (today: every taller name via the PUBLIC
 * talleres_select_all policy, no ediciones) plus the explorar link —
 * this is required for acceptance criterion 5 ("un miembro sin permisos
 * ve explorar y su recorrido, y nada más") and the "member" page-test
 * scenario, neither of which would be reachable behind a capability
 * card.
 *
 * PERMISSIONS: `puedeCrear` mirrors create_taller_abstract's OWN
 * capability gate (`auth_has_talleres_capability` — UNSCOPED: any
 * grant, anywhere, regardless of org-chart node, satisfies it) rather
 * than `cargarPermisos(client, equipoId)`. This is the one deliberate
 * exception to "every control's visibility comes from cargarPermisos
 * for the equipo of the object it acts on": creating a taller has no
 * existing object/equipo yet to scope the check against (the equipo is
 * either linked or minted as part of the same call), so there is
 * nothing to pass as `equipoId`. `cargarPermisos(client, null)` would
 * NOT be equivalent here — it only satisfies a truly GLOBAL grant
 * (scope_id IS NULL) and would wrongly hide "Crear taller" from a
 * director scoped to just one branch, even though the RPC's own
 * unscoped gate lets them through. No other control exists on this
 * screen yet (T3 adds the per-taller "editar"/"abrir edición" controls,
 * which DO read cargarPermisos for that taller's dream_team_equipo_id).
 */

import Link from 'next/link'
import { Compass } from 'lucide-react'

import { ContenedorDashboard, BotonSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { CatalogoTalleresClient } from '@/components/talleres/catalogo-talleres-client'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadCatalogoTalleres, loadMisGruposResumen } from '@/lib/platform/talleres/catalogo'
import { fetchOpcionesEquipoTaller } from '@/lib/platform/talleres/equipo-organigrama'
import { rutaExplorar } from '@/lib/platform/talleres/rutas'
import type { OperacionalContext } from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Talleres' }

export default async function TalleresCatalogoPage() {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Talleres">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Talleres">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">Necesitás iniciar sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) {
    return (
      <ContenedorDashboard titulo="Talleres">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const caps = session.capabilities.map((c) => c.key)
  const puedeCrear =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase

  // loadMisGruposResumen/loadEquipoGrupos/loadEquipoProximasSesiones only
  // ever read `.supabase` and `.personaId` off this context — `role` is
  // an OperacionalContext field this page has no use for (it serves
  // every role from one screen), so it's a fixed placeholder, never
  // branched on.
  const equipoCtx: OperacionalContext = {
    supabase,
    personaId: session.personaId,
    role: 'L',
    capabilities: caps,
  }

  const [catalogo, misGrupos, opciones] = await Promise.all([
    loadCatalogoTalleres(client),
    loadMisGruposResumen(equipoCtx),
    puedeCrear ? fetchOpcionesEquipoTaller(supabase) : Promise.resolve({ vincular: [], crearBajo: [] }),
  ])

  return (
    <ContenedorDashboard
      titulo="Talleres"
      botonRegreso={{ href: '/dashboard', texto: 'Inicio' }}
      accionPrincipal={
        <Link href={rutaExplorar()}>
          <BotonSistema type="button" variante="outline" icono={Compass}>
            Explorar
          </BotonSistema>
        </Link>
      }
    >
      <CatalogoTalleresClient
        catalogo={catalogo}
        misGrupos={misGrupos}
        puedeCrear={puedeCrear}
        opciones={opciones}
      />
    </ContenedorDashboard>
  )
}

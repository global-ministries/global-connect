/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas/
 * crear, replacing app/(auth)/admin/talleres/temporadas/crear/page.tsx
 * (kept alive, unmodified, until T10 deletes it).
 *
 * "crear", not "nueva" — parent decision, 2026-09-20: 4 of the app's 6
 * creation routes already use "crear", and the same object in Grupos de
 * Vida is already grupos-vida/temporadas/crear (see rutas.ts's
 * rutaTemporadaCrear header for the full reasoning).
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the form now
 * PICKS a dirección instead of assuming a single global scope: this page
 * loads every dirección the viewer can actually create a temporada for
 * (`loadDireccionesConTalleres`, filtered to `puedeEditar`) plus, for EACH
 * one, its own tree's talleres (`loadTalleresDeDireccion`) so the
 * checklist never needs a second round trip when the viewer switches the
 * dirección picker. Zero eligible direcciones -> the same "no permisos"
 * card as before, now with a neutral (no voseo) message.
 */

import {
  PaginaSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadDireccionesConTalleres, loadTalleresDeDireccion } from '@/lib/platform/talleres/temporadas'
import { rutaTemporadas } from '@/lib/platform/talleres/rutas'

import { TallerTemporadaForm } from './temporada-form'

export const metadata = { title: 'Crear Temporada' }

export default async function CrearTemporadaPage() {
  if (!isTalleresEnabled()) {
    return (
      <PaginaSistema titulo="Crear Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </PaginaSistema>
    )
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <PaginaSistema titulo="Crear Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">Necesitas iniciar sesión.</TextoSistema>
        </TarjetaSistema>
      </PaginaSistema>
    )
  }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) {
    return (
      <PaginaSistema titulo="Crear Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </PaginaSistema>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const direcciones = (await loadDireccionesConTalleres(client)).filter((d) => d.puedeEditar)

  if (direcciones.length === 0) {
    return (
      <PaginaSistema
        titulo="Crear Temporada"
        regreso={{ href: rutaTemporadas(), texto: 'Temporadas' }}
      >
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No tienes permisos para crear temporadas.</TextoSistema>
        </TarjetaSistema>
      </PaginaSistema>
    )
  }

  const direccionesConTalleres = await Promise.all(
    direcciones.map(async (direccion) => ({
      id: direccion.id,
      label: direccion.label,
      talleres: await loadTalleresDeDireccion(client, direccion.id),
    })),
  )

  return (
    <PaginaSistema
      titulo="Crear Temporada"
      regreso={{ href: rutaTemporadas(), texto: 'Temporadas' }}
    >
      <TallerTemporadaForm direcciones={direccionesConTalleres} />
    </PaginaSistema>
  )
}

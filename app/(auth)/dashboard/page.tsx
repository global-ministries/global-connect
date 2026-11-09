/**
 * Inicio (/dashboard) by person (odd/tasks/home-por-rol.md T3, T4): the facts
 * of the person decide the sections (decidirSecciones) and each section loads
 * only when present: «A tu cargo» one block per cargo (cargarACargo),
 * «Visión general» the campus numbers for admin and pastor. Both read
 * obtener_datos_dashboard (tablero.tsx) only where they need it.
 */
import { redirect } from 'next/navigation'

import { TarjetaMisHijosDashboard } from '@/components/dashboard/TarjetaMisHijosDashboard'
import { PantallaInicio } from '@/components/inicio/pantalla-inicio'
import { MigasInicio } from '@/components/inicio/partes-inicio'
import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { cargarACargo, type DatosCargo } from '@/lib/inicio/cargar-a-cargo'
import { cargarGruposMiembro, type DatosGrupoMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import { cargarHechosInicio } from '@/lib/inicio/cargar-hechos'
import { decidirSecciones } from '@/lib/inicio/decidir-secciones'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import { cargarMisHijosDashboard } from './mis-hijos-dashboard'
import { cargarTablero, cargarVisionGeneral } from './tablero'

export const dynamic = 'force-dynamic'

// First name for the greeting: one column of the own row by auth_id, as cargarHechosInicio.
async function leerNombre(authId: string): Promise<string | null> {
  try {
    const { data } = await createSupabaseAdminClient().from('usuarios').select('nombre').eq('auth_id', authId).maybeSingle()
    return data?.nombre ?? null
  } catch (error) {
    console.error('Inicio: no se pudo leer el nombre:', error)
    return null
  }
}

export default async function PaginaInicio() {
  // Started first so it runs alongside the facts; shown only when «Mis hijos» is decided.
  const misHijosPromesa = cargarMisHijosDashboard()
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const hoy = hoyEnCaracas()
  const [hechos, nombre] = await Promise.all([cargarHechosInicio(supabase, user), leerNombre(user.id)])
  const secciones = decidirSecciones(hechos)

  const grupos = secciones.flatMap((s) => (s.id === 'grupo-miembro' ? [{ grupoId: s.grupoId, nombre: s.nombre }] : []))
  const aCargo = secciones.find((s) => s.id === 'a-cargo')
  const conVision = secciones.some((s) => s.id === 'vision-general')

  const usuarioId = hechos.usuarioId
  const tableroPromesa = aCargo || conVision ? cargarTablero() : Promise.resolve(null)
  const [gruposMiembro, cargos, visionGeneral, tablero, misHijos] = await Promise.all([
    usuarioId && grupos.length > 0
      ? cargarGruposMiembro(supabase, { authId: user.id, usuarioId, hoy, grupos })
      : Promise.resolve<Record<string, DatosGrupoMiembro>>({}),
    usuarioId && aCargo
      ? cargarACargo(supabase, { authId: user.id, usuarioId, hoy, cargos: aCargo.cargos, tablero: tableroPromesa })
      : Promise.resolve<(DatosCargo | null)[]>([]),
    conVision ? tableroPromesa.then((t) => cargarVisionGeneral(supabase, t, hechos.pendientes.gruposSinCasa)) : Promise.resolve(null),
    tableroPromesa,
    misHijosPromesa,
  ])

  return (
    <PaginaSistema breadcrumbs={<MigasInicio />}>
      <PantallaInicio
        nombre={nombre}
        hoy={hoy}
        secciones={secciones}
        gruposMiembro={gruposMiembro}
        // «Mis servicios» (S2) mounts here when feat/dps-avisos is merged: add cargarMisServiciosPanel()
        // to the Promise.all above when the section is present, then
        // misServicios={misServicios && <TarjetaMisServicios inicial={misServicios} hoy={hoy} />}
        misHijos={misHijos && <TarjetaMisHijosDashboard hijos={misHijos.hijos} prechecks={misHijos.prechecks} />}
        aCargo={cargos}
        visionGeneral={visionGeneral}
        contextos={tablero?.contextos}
      />
    </PaginaSistema>
  )
}

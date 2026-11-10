/**
 * Inicio (/dashboard) by person (odd/tasks/home-por-rol.md T3): the facts of
 * the person decide the sections (decidirSecciones) and each section loads
 * only when present. The previous per-role dashboard stays inside «A tu
 * cargo» and «Visión general» until T4 replaces it.
 */
import { redirect } from 'next/navigation'

import { TarjetaMisHijosDashboard } from '@/components/dashboard/TarjetaMisHijosDashboard'
import { PantallaInicio } from '@/components/inicio/pantalla-inicio'
import { MigasInicio } from '@/components/inicio/partes-inicio'
import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { cargarGruposMiembro, type DatosGrupoMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import { cargarHechosInicio } from '@/lib/inicio/cargar-hechos'
import { decidirSecciones } from '@/lib/inicio/decidir-secciones'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import { cargarMisHijosDashboard } from './mis-hijos-dashboard'
import { cargarTableroAnterior, type TableroAnterior } from './tablero-anterior'

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

  const [gruposMiembro, tablero, misHijos] = await Promise.all([
    hechos.usuarioId && grupos.length > 0
      ? cargarGruposMiembro(supabase, { authId: user.id, usuarioId: hechos.usuarioId, hoy, grupos })
      : Promise.resolve<Record<string, DatosGrupoMiembro>>({}),
    aCargo || conVision ? cargarTableroAnterior({ cargos: aCargo?.cargos ?? null, conVision }) : Promise.resolve<TableroAnterior>({}),
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
        aCargo={tablero.aCargo}
        visionGeneral={tablero.visionGeneral}
      />
    </PaginaSistema>
  )
}

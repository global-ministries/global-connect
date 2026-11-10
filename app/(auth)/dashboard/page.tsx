/**
 * Inicio (/dashboard) by person (odd/tasks/home-por-rol.md T3, T4): the facts
 * of the person decide the sections (decidirSecciones) and each section loads
 * only when present: «A tu cargo» one block per cargo (cargarACargo),
 * «Visión general» the campus numbers for admin and pastor, «Notas de
 * líderes» (cargarNotasLideres) and «Próximos cumpleaños» (from the tablero,
 * T7). obtener_datos_dashboard (tablero.tsx) is read only where needed; each
 * section degrades on its own.
 */
import { redirect } from 'next/navigation'

import { TarjetaMisHijosDashboard } from '@/components/dashboard/TarjetaMisHijosDashboard'
import { PantallaInicio } from '@/components/inicio/pantalla-inicio'
import { cargarMisServiciosPanel } from '@/components/mis-servicios/cargar-mis-servicios'
import { TarjetaMisServicios } from '@/components/mis-servicios/tarjeta-mis-servicios'
import { MigasInicio } from '@/components/inicio/partes-inicio'
import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { cargarACargo, type DatosCargo } from '@/lib/inicio/cargar-a-cargo'
import { cumpleanosDelTablero } from '@/lib/inicio/cargar-cumpleanos'
import { cargarGruposMiembro, type DatosGrupoMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import { cargarHechosInicio } from '@/lib/inicio/cargar-hechos'
import { cargarNotasLideres, type NotaLider } from '@/lib/inicio/cargar-notas-lideres'
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
  // «Mis servicios» (S2, feat/dps-avisos #696): null without services or unseen notices.
  const misServiciosPromesa = cargarMisServiciosPanel()
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const hoy = hoyEnCaracas()
  const [hechosBase, nombre, misServicios] = await Promise.all([
    cargarHechosInicio(supabase, user),
    leerNombre(user.id),
    misServiciosPromesa,
  ])
  // DPS convocations and answers come from «Mis servicios»: it decides the section and the jump row.
  const hechos = misServicios
    ? { ...hechosBase, convocadoEnDps: true, serviciosPorConfirmar: misServicios.porResponder }
    : hechosBase
  const secciones = decidirSecciones(hechos)

  const grupos = secciones.flatMap((s) => (s.id === 'grupo-miembro' ? [{ grupoId: s.grupoId, nombre: s.nombre }] : []))
  const aCargo = secciones.find((s) => s.id === 'a-cargo')
  const conVision = secciones.some((s) => s.id === 'vision-general')
  const conNotas = secciones.some((s) => s.id === 'notas-lideres')
  const conCumpleanos = secciones.some((s) => s.id === 'cumpleanos')
  // The group names the leader's birthdays only when they lead one: the list mixes their groups.
  const gruposLider = aCargo?.cargos.flatMap((c) => (c.tipo === 'grupo-lider' ? [c.nombre] : [])) ?? []
  const grupoCumpleanos = gruposLider.length === 1 ? gruposLider[0] : null

  const usuarioId = hechos.usuarioId
  const tableroPromesa = aCargo || conVision || conCumpleanos ? cargarTablero() : Promise.resolve(null)
  const [gruposMiembro, cargos, visionGeneral, tablero, misHijos, notasLideres] = await Promise.all([
    usuarioId && grupos.length > 0
      ? cargarGruposMiembro(supabase, { authId: user.id, usuarioId, hoy, grupos })
      : Promise.resolve<Record<string, DatosGrupoMiembro>>({}),
    usuarioId && aCargo
      ? cargarACargo(supabase, { authId: user.id, usuarioId, hoy, cargos: aCargo.cargos })
      : Promise.resolve<(DatosCargo | null)[]>([]),
    conVision ? tableroPromesa.then((t) => cargarVisionGeneral(supabase, t, hechos.pendientes.gruposSinCasa)) : Promise.resolve(null),
    tableroPromesa,
    misHijosPromesa,
    conNotas ? cargarNotasLideres(supabase, user.id) : Promise.resolve<NotaLider[]>([]),
  ])
  const cumpleanos = conCumpleanos ? cumpleanosDelTablero(tablero, grupoCumpleanos) : []

  return (
    <PaginaSistema breadcrumbs={<MigasInicio />}>
      <PantallaInicio
        nombre={nombre}
        hoy={hoy}
        secciones={secciones}
        gruposMiembro={gruposMiembro}
        misServicios={misServicios && <TarjetaMisServicios inicial={misServicios} hoy={hoy} />}
        misHijos={misHijos && <TarjetaMisHijosDashboard hijos={misHijos.hijos} prechecks={misHijos.prechecks} />}
        aCargo={cargos}
        visionGeneral={visionGeneral}
        notasLideres={notasLideres}
        cumpleanos={cumpleanos}
        contextos={tablero?.contextos}
      />
    </PaginaSistema>
  )
}

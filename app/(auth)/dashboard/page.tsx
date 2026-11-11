/**
 * Inicio (/dashboard) by person (odd/tasks/home-por-rol.md T3, T4): the facts
 * of the person decide the sections (decidirSecciones) and each section loads
 * only when present: «A tu cargo» one block per cargo (cargarACargo),
 * «Visión general» the campus numbers for admin and pastor, «Notas de
 * líderes» (cargarNotasLideres) and «Próximos cumpleaños» (from the tablero,
 * T7, plus the groups where the person is Miembro or Colíder, T8).
 * obtener_datos_dashboard (tablero.tsx) is read only where needed; each
 * section degrades on its own.
 *
 * Próximo Paso (odd/tasks/proximo-paso.md T8, design/proximo-paso 08–09):
 * only where «Tus próximos pasos» highlights it (who has not done it), the
 * open ediciones and the own inscripción are read with the person's client
 * and the live card takes the highlight's place; a failed read keeps it.
 */
import { redirect } from 'next/navigation'

import { TarjetaMisHijosDashboard } from '@/components/dashboard/TarjetaMisHijosDashboard'
import { TarjetaProximoPaso } from '@/components/dashboard/tarjeta-proximo-paso'
import { PantallaInicio } from '@/components/inicio/pantalla-inicio'
import { cargarMisServiciosPanel } from '@/components/mis-servicios/cargar-mis-servicios'
import { TarjetaMisServicios } from '@/components/mis-servicios/tarjeta-mis-servicios'
import { MigasInicio } from '@/components/inicio/partes-inicio'
import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { cargarACargo, type DatosCargo } from '@/lib/inicio/cargar-a-cargo'
import { cargarCumpleanosGrupos, cumpleanosDelTablero, unirCumpleanos, type Cumpleanos } from '@/lib/inicio/cargar-cumpleanos'
import { cargarGruposMiembro, type DatosGrupoMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import { cargarHechosInicio } from '@/lib/inicio/cargar-hechos'
import { cargarNotasLideres, type NotaLider } from '@/lib/inicio/cargar-notas-lideres'
import { decidirSecciones } from '@/lib/inicio/decidir-secciones'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { cargarEstadoProximoPaso, varianteProximoPaso, type ClienteProximoPaso, type EstadoProximoPaso } from '@/lib/platform/proximo-paso/estado'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
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
  // The highlight is decidirSecciones' rule: never for who already did Próximo Paso.
  const pideProximoPaso = secciones.some((s) => s.id === 'proximos-pasos' && s.pasos.some((p) => p.destacado))
  const proximoPasoPromesa: Promise<EstadoProximoPaso | null> =
    pideProximoPaso && isTalleresEnabled()
      ? cargarEstadoProximoPaso(supabase as unknown as ClienteProximoPaso, { usuarioId, hoy }).catch((error: unknown) => {
          console.error('Inicio: no se pudo leer Próximo Paso:', error)
          return null
        })
      : Promise.resolve(null)
  // The tablero has birthdays only for who leads or oversees, and they all have a cargo or the campus view.
  const tableroPromesa = aCargo || conVision ? cargarTablero() : Promise.resolve(null)
  const [gruposMiembro, cargos, visionGeneral, tablero, misHijos, notasLideres, cumpleanosGrupos, proximoPaso] = await Promise.all([
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
    usuarioId && conCumpleanos && grupos.length > 0
      ? cargarCumpleanosGrupos(supabase, { authId: user.id, usuarioId, hoy, grupos })
      : Promise.resolve<Cumpleanos[]>([]),
    proximoPasoPromesa,
  ])
  // A leader who is also a member elsewhere sees both groups in one list, each person once (S14a).
  const cumpleanos = conCumpleanos ? unirCumpleanos(cumpleanosDelTablero(tablero, grupoCumpleanos), cumpleanosGrupos) : []

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
        proximoPaso={
          proximoPaso && (
            <TarjetaProximoPaso estado={varianteProximoPaso(proximoPaso)} hoy={hoy} nombre={nombre?.trim().split(/\s+/)[0] ?? null} />
          )
        }
      />
    </PaginaSistema>
  )
}

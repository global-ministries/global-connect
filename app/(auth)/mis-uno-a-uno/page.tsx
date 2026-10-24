/**
 * "Mis 1 a 1" — /mis-uno-a-uno (RSC), odd/tasks/uno-a-uno.md T4 and T7.
 *
 * The caller's 1:1s from either side (mis_uno_a_uno) and, for whoever leads
 * someone (mis_dirigidos), the buttons to schedule one or register one that
 * was never scheduled. Someone who leads no one still sees the 1:1s they
 * take part in as a dirigido, read-only.
 *
 * Whoever supervises (uno_a_uno_acceso().supervisa: admin, pastor or someone
 * whose chain leads others) also gets the "Supervisión" tab, ?vista=supervision:
 * the chain's leaders and recent 1:1s, read-only. Every check lives in the
 * database functions; this page only reads through them.
 */

import type { ReactElement } from 'react'

import { ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { AgendarUnoAUnoDialog } from '@/components/uno-a-uno/agendar-uno-a-uno'
import { ListaUnoAUno } from '@/components/uno-a-uno/lista-uno-a-uno'
import { PestanasUnoAUno } from '@/components/uno-a-uno/pestanas-uno-a-uno'
import { RegistrarUnoAUnoDialog } from '@/components/uno-a-uno/registrar-uno-a-uno'
import { SupervisionUnoAUno } from '@/components/uno-a-uno/supervision-uno-a-uno'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parsearAccesoUnoAUno } from '@/lib/uno-a-uno/acceso'
import { desdeHaceDias } from '@/lib/uno-a-uno/fecha'
import {
  DIAS_SUPERVISION_LIDERES,
  DIAS_SUPERVISION_RECIENTES,
  opcionesDirigidos,
  parsearLideresSupervision,
  parsearSupervision,
  parsearUnoAUno,
  vistaUnoAUno,
} from '@/lib/uno-a-uno/vista'

export const metadata = { title: 'Mis 1 a 1' }

type Cliente = Awaited<ReturnType<typeof createSupabaseServerClient>>

interface MisUnoAUnoPageProps {
  readonly searchParams?: Promise<{ readonly vista?: string | readonly string[] }>
}

function ErrorDeCarga({ mensaje }: { mensaje: string }): ReactElement {
  return (
    <TarjetaSistema variante="outlined" className="p-4">
      <TextoSistema role="alert">{mensaje}</TextoSistema>
    </TarjetaSistema>
  )
}

async function cargarMisUnoAUno(supabase: Cliente): Promise<ReactElement> {
  const [dirigidos, unoAUno] = await Promise.all([supabase.rpc('mis_dirigidos'), supabase.rpc('mis_uno_a_uno')])

  const opciones = opcionesDirigidos(dirigidos.data ?? [])
  const lista = parsearUnoAUno(unoAUno.data ?? [])

  return (
    <>
      {opciones.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <AgendarUnoAUnoDialog dirigidos={opciones} />
          <RegistrarUnoAUnoDialog dirigidos={opciones} />
        </div>
      ) : null}

      {unoAUno.error || dirigidos.error ? (
        <ErrorDeCarga mensaje="No pudimos cargar tus 1 a 1. Recarga la página para intentarlo de nuevo." />
      ) : (
        <ListaUnoAUno lista={lista} lideraAAlguien={opciones.length > 0} />
      )}
    </>
  )
}

async function cargarSupervision(supabase: Cliente): Promise<ReactElement> {
  const [lideres, recientes] = await Promise.all([
    supabase.rpc('uno_a_uno_supervision_lideres', { p_dias: DIAS_SUPERVISION_LIDERES }),
    supabase.rpc('uno_a_uno_supervision', { p_desde: desdeHaceDias(DIAS_SUPERVISION_RECIENTES) }),
  ])

  if (lideres.error || recientes.error) {
    return <ErrorDeCarga mensaje="No pudimos cargar la supervisión. Recarga la página para intentarlo de nuevo." />
  }
  return (
    <SupervisionUnoAUno
      lideres={parsearLideresSupervision(lideres.data ?? [])}
      recientes={parsearSupervision(recientes.data ?? [])}
    />
  )
}

export default async function MisUnoAUnoPage({ searchParams }: MisUnoAUnoPageProps) {
  const supabase = await createSupabaseServerClient()
  const acceso = parsearAccesoUnoAUno(await supabase.rpc('uno_a_uno_acceso'))
  const vista = vistaUnoAUno((await searchParams)?.vista, acceso.supervisa)
  const contenido = vista === 'supervision' ? await cargarSupervision(supabase) : await cargarMisUnoAUno(supabase)

  return (
    <ContenedorDashboard titulo="Mis 1 a 1">
      {acceso.supervisa ? <PestanasUnoAUno vista={vista} /> : null}
      {contenido}
    </ContenedorDashboard>
  )
}

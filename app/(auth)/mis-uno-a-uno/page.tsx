/**
 * "Mis 1 a 1" — /mis-uno-a-uno (RSC), odd/tasks/uno-a-uno.md T4.
 *
 * The caller's 1:1s from either side (mis_uno_a_uno) and, for whoever leads
 * someone (mis_dirigidos), the buttons to schedule one or register one that
 * was never scheduled. Someone who leads no one still sees the 1:1s they
 * take part in as a dirigido, read-only. Every check lives in the database
 * functions; this page only reads through them.
 */

import { ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { AgendarUnoAUnoDialog } from '@/components/uno-a-uno/agendar-uno-a-uno'
import { ListaUnoAUno } from '@/components/uno-a-uno/lista-uno-a-uno'
import { RegistrarUnoAUnoDialog } from '@/components/uno-a-uno/registrar-uno-a-uno'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { opcionesDirigidos, parsearUnoAUno } from '@/lib/uno-a-uno/vista'

export const metadata = { title: 'Mis 1 a 1' }

export default async function MisUnoAUnoPage() {
  const supabase = await createSupabaseServerClient()
  const [dirigidos, unoAUno] = await Promise.all([supabase.rpc('mis_dirigidos'), supabase.rpc('mis_uno_a_uno')])

  const opciones = opcionesDirigidos(dirigidos.data ?? [])
  const lista = parsearUnoAUno(unoAUno.data ?? [])

  return (
    <ContenedorDashboard titulo="Mis 1 a 1">
      {opciones.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <AgendarUnoAUnoDialog dirigidos={opciones} />
          <RegistrarUnoAUnoDialog dirigidos={opciones} />
        </div>
      ) : null}

      {unoAUno.error || dirigidos.error ? (
        <TarjetaSistema variante="outlined" className="p-4">
          <TextoSistema role="alert">No pudimos cargar tus 1 a 1. Recarga la página para intentarlo de nuevo.</TextoSistema>
        </TarjetaSistema>
      ) : (
        <ListaUnoAUno lista={lista} lideraAAlguien={opciones.length > 0} />
      )}
    </ContenedorDashboard>
  )
}

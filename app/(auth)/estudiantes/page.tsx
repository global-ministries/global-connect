/**
 * Estudiantes — /estudiantes (RSC), the "Mi grupo" entry (C3b of
 * odd/tasks/estudiantes-fase-b.md). A leader who sees a single group and
 * manages none goes straight to its list; anyone else gets the list of the
 * groups they see (estudiantes_mis_grupos), and managers
 * (estudiantes_subareas_gestionables) also a link to /estudiantes/grupos;
 * whoever has the live view (estudiantes_acceso().vivo, C4b) a link to
 * /estudiantes/vivo.
 */
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { cargarMisGrupos } from '@/lib/platform/estudiantes/lista-servidor'
import { grupoUnico } from '@/lib/platform/estudiantes/lista-vista'
import { parsearAccesoEstudiantes } from '@/lib/platform/estudiantes/acceso'
import { MisGruposClient } from '@/components/estudiantes/mis-grupos-client'

export const metadata = { title: 'Estudiantes' }

export default async function EstudiantesPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [grupos, subareasRes, accesoRes] = await Promise.all([
    cargarMisGrupos(supabase),
    supabase.rpc('estudiantes_subareas_gestionables'),
    supabase.rpc('estudiantes_acceso'),
  ])
  if (subareasRes.error) console.error('[estudiantes] subareas_gestionables failed', subareasRes.error)
  const puedeGestionar = (subareasRes.data ?? []).length > 0
  // Fails closed: no "En vivo" link when the facts cannot be read.
  const puedeVerVivo = parsearAccesoEstudiantes(accesoRes).vivo

  const unico = puedeGestionar ? null : grupoUnico(grupos)
  if (unico) redirect(`/estudiantes/grupos/${unico.grupoId}`)

  return <MisGruposClient grupos={grupos} puedeGestionar={puedeGestionar} puedeVerVivo={puedeVerVivo} />
}

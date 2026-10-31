/**
 * /users/[id]/asistencia moved into the ficha's Asistencia tab (S13 decision 4
 * of odd/tasks/sistema-diseno-v2.md). Old links (dashboard widgets, bookmarks)
 * land on the tab; their fecha_inicio / fecha_fin become Desde / Hasta.
 */
import { redirect } from 'next/navigation'

import { consultaConRango } from '@/lib/platform/usuarios/ficha-vista'

export default async function AsistenciaUsuarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fecha_inicio?: string; fecha_fin?: string }>
}) {
  const { id } = await params
  const { fecha_inicio, fecha_fin } = await searchParams
  redirect(`/users/${encodeURIComponent(id)}${consultaConRango('?tab=asistencia', fecha_inicio ?? '', fecha_fin ?? '')}`)
}

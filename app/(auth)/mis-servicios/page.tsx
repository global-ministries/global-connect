/**
 * /mis-servicios — «Mis servicios» lives on the dashboard (T15c of
 * odd/tasks/dps-asistencia-pco.md); this path only sends there.
 */
import { redirect } from 'next/navigation'

export default function MisServiciosPage() {
  redirect('/dashboard')
}

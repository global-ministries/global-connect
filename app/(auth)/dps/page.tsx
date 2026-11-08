/**
 * DPS — /dps, the root of the "DPS" menu section (odd/tasks/dps-asistencia-pco.md,
 * T9, L29): opens the Sunday attendance, which decides who may see it.
 */
import { redirect } from 'next/navigation'

export default function DpsPage(): never {
  redirect('/dps/asistencia')
}

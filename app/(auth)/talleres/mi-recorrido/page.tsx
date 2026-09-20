/**
 * T9 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/mi-recorrido,
 * replacing the three-way split app/(auth)/talleres/{mis-talleres,
 * historial,certificados} (all three kept alive, unmodified, until T10
 * deletes them — see lib/platform/talleres/rutas.ts). A presentation
 * merge, not a data merge: the parent's inventory (2026-09-20) confirmed
 * the three old pages already call three SEPARATE loaders
 * (loadParticipanteActiveTalleres / loadParticipanteHistorial /
 * loadParticipanteCertificados) that stay exactly as they are here — one
 * screen, three tabs, three unchanged queries run in parallel.
 *
 * GATE: `requireParticipante()`, unchanged from the three old pages —
 * odd/tasks/talleres-autoinscripcion.md acceptance criterion 7 keeps this
 * reachable by ANY authenticated member with a resolvable persona, zero
 * talleres capabilities required. RLS (every query already scoped to the
 * caller's own persona_id) is the real wall.
 *
 * IDENTITY: none of the three loaders embed `usuarios` — verified by the
 * parent 2026-09-20 (all three project only the participant's OWN rows,
 * keyed on ctx.personaId; no cross-identity lookup) — so T6b's "an
 * unreadable identity degrades to an em-dash, a row is never dropped for
 * it" rule does not apply here; there is nothing to degrade.
 *
 * TABS: interactive tab state (URL-synced, restore-on-reload) lives in the
 * client half, MiRecorridoTabs.client.tsx — see its own header for the
 * mechanism.
 */

import { ContenedorDashboard } from '@/components/ui/sistema-diseno'

import {
  loadParticipanteActiveTalleres,
  loadParticipanteHistorial,
  loadParticipanteCertificados,
  requireParticipante,
} from '@/lib/platform/talleres/participante'

import { MiRecorridoTabs } from './MiRecorridoTabs.client'

export const metadata = {
  title: 'Mi Recorrido',
}

export default async function MiRecorridoPage() {
  const ctx = await requireParticipante()

  const [talleres, historial, certificados] = await Promise.all([
    loadParticipanteActiveTalleres(ctx),
    loadParticipanteHistorial(ctx),
    loadParticipanteCertificados(ctx),
  ])

  return (
    <ContenedorDashboard
      titulo="Mi Recorrido"
      botonRegreso={{ href: '/dashboard', texto: 'Inicio' }}
    >
      <MiRecorridoTabs talleres={talleres} historial={historial} certificados={certificados} />
    </ContenedorDashboard>
  )
}

/**
 * PR29-D — /admin/talleres/ediciones-globales (RSC).
 *
 * Lists all ediciones globales (temporadas que agrupan N talleres).
 * Each card links to the detail page where the admin can abrir /
 * cerrar / cancelar / agregar o quitar talleres.
 *
 * Capability gate: director.write OR admin.manage.
 */

import Link from 'next/link'
import { Plus } from 'lucide-react'

import {
  ContenedorDashboard,
  TarjetaSistema,
  TextoSistema,
  BadgeSistema,
} from '@/components/ui/sistema-diseno'

import {
  loadEdicionesGlobales,
  requireEdicionesGlobalesRole,
  type EdicionGlobal,
  type EdicionGlobalEstado,
} from '@/lib/platform/talleres/ediciones-globales'

export const metadata = { title: 'Ediciones Globales' }

function badgeVariant(estado: EdicionGlobalEstado): 'success' | 'warning' | 'info' | 'default' | 'error' {
  switch (estado) {
    case 'abierto':
      return 'success'
    case 'borrador':
      return 'info'
    case 'cerrado':
      return 'default'
    case 'cancelado':
      return 'error'
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default async function EdicionesGlobalesIndexPage() {
  const gate = await requireEdicionesGlobalesRole()
  if (!gate.ok) {
    return (
      <ContenedorDashboard titulo="Ediciones Globales">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">
            {gate.error === 'not-found'
              ? 'El módulo de talleres está deshabilitado.'
              : gate.error === 'unauthorized'
                ? 'Necesitás iniciar sesión.'
                : 'No tenés permiso para ver ediciones globales.'}
          </TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const globales = await loadEdicionesGlobales(client)

  return (
    <ContenedorDashboard
      titulo="Ediciones Globales"
      botonRegreso={{ href: '/admin/talleres/abstracto', texto: 'Grupos de corto plazo' }}
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TextoSistema variante="sutil">
          Una <strong>edición global</strong> es una temporada (ej. &quot;Otoño
          2026&quot;, &quot;Primavera 2027&quot;) que agrupa N talleres y permite
          abrirlos/cerrarlos en simultáneo. La inscripción sigue siendo por
          taller individual — la edición global solo coordina cuándo está
          disponible cada uno.
        </TextoSistema>
      </TarjetaSistema>

      <div className="mb-6 flex justify-end">
        <Link
          href="/admin/talleres/ediciones-globales/nueva"
          className="inline-flex items-center gap-2 rounded bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" /> Crear edición global
        </Link>
      </div>

      {globales.length === 0 ? (
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">
            No hay ediciones globales todavía. Creá la primera con el botón
            de arriba.
          </TextoSistema>
        </TarjetaSistema>
      ) : (
        <ul className="grid gap-3">
          {globales.map((g: EdicionGlobal) => (
            <li key={g.id}>
              <TarjetaSistema variante="elevated" className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <Link
                      href={`/admin/talleres/ediciones-globales/${g.id}`}
                      className="font-medium hover:underline"
                    >
                      {g.nombre}
                    </Link>
                    <TextoSistema variante="sutil" className="mt-1 block text-sm">
                      <code>{g.slug}</code> · Apertura{' '}
                      <strong>{formatDate(g.fecha_apertura)}</strong> · Cierre{' '}
                      <strong>{formatDate(g.fecha_cierre)}</strong> ·{' '}
                      {g.participantes_count} taller
                      {g.participantes_count === 1 ? '' : 'es'}
                    </TextoSistema>
                  </div>
                  <BadgeSistema variante={badgeVariant(g.estado)}>{g.estado}</BadgeSistema>
                </div>
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </ContenedorDashboard>
  )
}
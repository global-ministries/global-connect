/**
 * PR29-D — /admin/talleres/ediciones-globales/[id] (RSC).
 *
 * Detail page for a single edicion global. Lists its associated
 * talleres and the action buttons that depend on the estado machine:
 *
 *   borrador ──→ abierto ──→ cerrado  (terminal)
 *       │            │
 *       └──→ cancelado (terminal)
 *
 * Capability gate: director.write OR admin.manage.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  ContenedorDashboard,
  TarjetaSistema,
  TextoSistema,
  BadgeSistema,
} from '@/components/ui/sistema-diseno'

import {
  loadEdicionGlobalById,
  loadTalleresDisponibles,
  requireEdicionesGlobalesRole,
  type EdicionGlobalEstado,
} from '@/lib/platform/talleres/ediciones-globales'

import { AddTallerForm } from './add-taller-form'
import { CancelEdicionGlobalForm } from './cancel-edicion-form'
import { CloseEdicionGlobalForm } from './close-edicion-form'
import { OpenEdicionGlobalForm } from './open-edicion-form'
import { RemoveTallerButton } from './remove-taller-button'

export const metadata = { title: 'Edición Global' }

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

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

export default async function EdicionGlobalDetailPage(ctx: RouteContext) {
  const gate = await requireEdicionesGlobalesRole()
  if (!gate.ok) {
    return (
      <ContenedorDashboard titulo="Edición global">
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

  const { id } = await ctx.params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const edicion = await loadEdicionGlobalById(client, id)
  if (!edicion) notFound()

  // Warning: any participant taller that's also in another global
  // abierta (overlap). Cheap query — we only do it for the detail page,
  // not the list.
  const { data: overlapRows } = await client
    .from('taller_edicion_global_participantes')
    .select('taller_id, edicion_global_id, taller_ediciones_globales!inner(id, slug, estado)')
    .in('taller_id', edicion.participantes.map((p) => p.id))

  const overlapWarnings = (overlapRows ?? [])
    .map((row: Record<string, unknown>) => {
      const other = row.taller_ediciones_globales as
        | { id: string; slug: string; estado: EdicionGlobalEstado }
        | Array<{ id: string; slug: string; estado: EdicionGlobalEstado }>
        | null
      const otherFlat = Array.isArray(other) ? other[0] : other
      if (!otherFlat) return null
      if (otherFlat.estado !== 'abierto') return null
      if (otherFlat.id === edicion.id) return null
      return {
        taller_id: row.taller_id as string,
        other_slug: otherFlat.slug,
      }
    })
    .filter((x: { taller_id: string; other_slug: string } | null): x is { taller_id: string; other_slug: string } => x !== null)

  const tallerIdToOverlap = new Map<string, string>(
    overlapWarnings.map((w: { taller_id: string; other_slug: string }) => [w.taller_id, w.other_slug]),
  )

  const { disponibles, totalActivos } = await loadTalleresDisponibles(client, edicion.id)

  const editable = edicion.estado === 'borrador'
  const showOpen = edicion.estado === 'borrador'
  const showClose = edicion.estado === 'abierto'
  const showCancel = edicion.estado === 'borrador' || edicion.estado === 'abierto'

  return (
    <ContenedorDashboard
      titulo={edicion.nombre}
      botonRegreso={{
        href: '/admin/talleres/ediciones-globales',
        texto: 'Ediciones globales',
      }}
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1">
            <TextoSistema className="text-sm text-muted-foreground">
              <code>{edicion.slug}</code>
            </TextoSistema>
            {edicion.descripcion && (
              <TextoSistema className="mt-2 block">{edicion.descripcion}</TextoSistema>
            )}
            <TextoSistema variante="sutil" className="mt-2 block text-sm">
              Apertura: <strong>{formatDate(edicion.fecha_apertura)}</strong> ·
              Cierre: <strong>{formatDate(edicion.fecha_cierre)}</strong> ·{' '}
              {edicion.participantes.length} taller
              {edicion.participantes.length === 1 ? '' : 'es'}
            </TextoSistema>
          </div>
          <BadgeSistema variante={badgeVariant(edicion.estado)}>{edicion.estado}</BadgeSistema>
        </div>
      </TarjetaSistema>

      {overlapWarnings.length > 0 && (
        <TarjetaSistema variante="outlined" className="mb-4 border-yellow-400 bg-yellow-50 p-4">
          <TextoSistema className="text-sm">
            <strong>⚠ Atención:</strong> {overlapWarnings.length} taller
            {overlapWarnings.length === 1 ? ' de esta edición también' : 'es de esta edición también'}{' '}
            {overlapWarnings.length === 1 ? 'está' : 'están'} en otra edición global ABIERTA:
            <ul className="mt-2 list-disc pl-5">
              {Array.from(
                new Set<string>(
                  overlapWarnings.map(
                    (w: { taller_id: string; other_slug: string }) => w.other_slug,
                  ),
                ),
              ).map((slug: string) => (
                <li key={slug}>
                  <code>{slug}</code>
                </li>
              ))}
            </ul>
            Esto es válido por diseño (un taller puede estar en múltiples globales), pero verificá que
            sea la intención.
          </TextoSistema>
        </TarjetaSistema>
      )}

      <TextoSistema className="mb-2 block font-medium">
        Talleres participantes ({edicion.participantes.length})
      </TextoSistema>

      {edicion.participantes.length === 0 ? (
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">
            Esta edición todavía no tiene talleres asociados.
            {editable ? ' Usá el selector de abajo para agregar uno.' : ''}
          </TextoSistema>
        </TarjetaSistema>
      ) : (
        <ul className="mb-4 grid gap-3">
          {edicion.participantes.map((p) => {
            const overlapSlug = tallerIdToOverlap.get(p.id)
            return (
              <li key={p.id}>
                <TarjetaSistema variante="elevated" className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <Link
                        href={`/admin/talleres/abstracto/${p.slug}`}
                        className="font-medium hover:underline"
                      >
                        {p.nombre}
                      </Link>
                      <TextoSistema variante="sutil" className="mt-1 block text-sm">
                        <code>{p.slug}</code> ·{' '}
                        {p.modalidad_default === 'periodo_general'
                          ? 'Periodo general'
                          : 'Permanente custom'}
                        {p.edicion_local_estado && (
                          <>
                            {' '}· edición local: <code>{p.edicion_local_estado}</code>
                          </>
                        )}
                      </TextoSistema>
                      {overlapSlug && (
                        <TextoSistema className="mt-1 block text-xs text-yellow-700">
                          ⚠ También está en la global abierta <code>{overlapSlug}</code>.
                        </TextoSistema>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <BadgeSistema variante={p.estado === 'active' ? 'success' : 'default'}>
                        {p.estado}
                      </BadgeSistema>
                      {editable && (
                        <RemoveTallerButton
                          edicionGlobalId={edicion.id}
                          tallerId={p.id}
                          tallerNombre={p.nombre}
                        />
                      )}
                    </div>
                  </div>
                </TarjetaSistema>
              </li>
            )
          })}
        </ul>
      )}

      {editable && (
        <TarjetaSistema variante="outlined" className="mb-4 p-4">
          <AddTallerForm
            edicionGlobalId={edicion.id}
            disponibles={disponibles.map((d) => ({ id: d.id, nombre: d.nombre, slug: d.slug }))}
            totalActivos={totalActivos}
          />
        </TarjetaSistema>
      )}

      <TextoSistema className="mb-2 block font-medium">Acciones</TextoSistema>
      <TarjetaSistema variante="outlined" className="p-4">
        <div className="flex flex-col gap-3">
          {showOpen && <OpenEdicionGlobalForm edicionGlobalId={edicion.id} />}
          {showClose && <CloseEdicionGlobalForm edicionGlobalId={edicion.id} />}
          {showCancel && <CancelEdicionGlobalForm edicionGlobalId={edicion.id} />}
          {!showOpen && !showClose && !showCancel && (
            <TextoSistema variante="sutil" className="block text-sm">
              Esta edición está en estado <strong>{edicion.estado}</strong> (terminal). No hay
              acciones disponibles.
            </TextoSistema>
          )}
        </div>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
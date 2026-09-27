'use client'

/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — season detail client,
 * ported from app/(auth)/admin/talleres/temporadas/[id]/temporada-detail-
 * client.tsx.
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — rewritten.
 * Two write surfaces, both gated behind `canWrite` (re-checked by the
 * server actions + RLS/RPC authority):
 *   1. Estado transitions (borrador → abierto → cerrado / cancelado) —
 *      Abrir/Cerrar run immediately; Cancelar goes through a confirm
 *      dialog, the SAME shape CancelarEdicionButton already uses
 *      (components/talleres/open-edicion-button.tsx).
 *   2. Membership is no longer a single checkbox toggle: "Talleres y
 *      ediciones" lists every taller already in this temporada with its
 *      own edición (state badge, dates, inscritos) and a per-row "Quitar"
 *      icon (its own confirm dialog, surfacing EDICION_CON_INSCRITOS
 *      verbatim — errores-api.ts's own copy); "Agregar taller" is a
 *      separate select+button for the dirección's own régimen=temporada
 *      talleres not yet here (loadTemporadaDetalle's own
 *      `talleresDisponibles`).
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'

import { TarjetaSistema, TextoSistema, BotonSistema, BadgeSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { edicionEstadoBadgeVariante, edicionEstadoLabel } from '@/components/talleres/labels'

import { agregarTallerATemporada, quitarTallerDeTemporada, transitionTemporada } from '../actions'
import { rutaEdicion } from '@/lib/platform/talleres/rutas'
import type { TallerConEdicionDeTemporada, TallerOption } from '@/lib/platform/talleres/temporadas'

type TemporadaEstado = 'borrador' | 'abierto' | 'cerrado' | 'cancelado'
type NextEstado = 'abierto' | 'cerrado' | 'cancelado'

interface Props {
  readonly temporadaId: string
  readonly estado: TemporadaEstado
  readonly canWrite: boolean
  readonly talleresEnTemporada: readonly TallerConEdicionDeTemporada[]
  readonly talleresDisponibles: readonly TallerOption[]
}

const TRANSITIONS: Record<TemporadaEstado, ReadonlyArray<{ next: NextEstado; label: string }>> = {
  borrador: [
    { next: 'abierto', label: 'Abrir temporada' },
    { next: 'cancelado', label: 'Cancelar' },
  ],
  abierto: [
    { next: 'cerrado', label: 'Cerrar temporada' },
    { next: 'cancelado', label: 'Cancelar' },
  ],
  cerrado: [],
  cancelado: [],
}

/** Same 44px icon-button hit area plantilla-grupos-section.tsx's own BOTON_ICONO uses. */
const BOTON_ICONO =
  'inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive'

/** Same UTC-anchored formatting the taller/edición pages already use for a `date`-only column. */
function formatFechaCorta(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es', { timeZone: 'UTC' })
}

export function TemporadaDetailClient({
  temporadaId,
  estado,
  canWrite,
  talleresEnTemporada,
  talleresDisponibles,
}: Props): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const transitions = TRANSITIONS[estado]
  const [cancelarAbierto, setCancelarAbierto] = useState(false)

  function runTransition(next: NextEstado): void {
    setError(null)
    if (next === 'cancelado') {
      setCancelarAbierto(true)
      return
    }
    startTransition(async () => {
      const result = await transitionTemporada({ temporadaId, next })
      if (result.ok) router.refresh()
      else setError(result.message ?? result.error)
    })
  }

  function confirmarCancelar(): void {
    setError(null)
    startTransition(async () => {
      const result = await transitionTemporada({ temporadaId, next: 'cancelado' })
      if (result.ok) {
        setCancelarAbierto(false)
        router.refresh()
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  const [quitarObjetivo, setQuitarObjetivo] = useState<TallerConEdicionDeTemporada | null>(null)
  const [quitarError, setQuitarError] = useState<string | null>(null)

  function abrirQuitar(taller: TallerConEdicionDeTemporada): void {
    setQuitarError(null)
    setQuitarObjetivo(taller)
  }

  function confirmarQuitar(): void {
    if (!quitarObjetivo) return
    setQuitarError(null)
    startTransition(async () => {
      const result = await quitarTallerDeTemporada({ temporadaId, tallerId: quitarObjetivo.id })
      if (result.ok) {
        setQuitarObjetivo(null)
        router.refresh()
      } else {
        setQuitarError(result.message ?? result.error)
      }
    })
  }

  const [tallerAAgregar, setTallerAAgregar] = useState('')
  const [agregarError, setAgregarError] = useState<string | null>(null)

  function agregar(): void {
    if (!tallerAAgregar) return
    setAgregarError(null)
    startTransition(async () => {
      const result = await agregarTallerATemporada({ temporadaId, tallerId: tallerAAgregar })
      if (result.ok) {
        setTallerAAgregar('')
        router.refresh()
      } else {
        setAgregarError(result.message ?? result.error)
      }
    })
  }

  return (
    <div className="grid gap-4">
      {error && (
        <TextoSistema role="alert" className="block text-destructive">
          {error}
        </TextoSistema>
      )}

      {canWrite && transitions.length > 0 && (
        <TarjetaSistema variante="outlined" className="p-4">
          <TextoSistema className="mb-2 block font-medium">Estado</TextoSistema>
          <div className="flex flex-wrap gap-2">
            {transitions.map((t) => (
              <BotonSistema
                key={t.next}
                type="button"
                variante={t.next === 'cancelado' ? 'outline' : 'primario'}
                tamaño="sm"
                disabled={pending}
                onClick={() => runTransition(t.next)}
              >
                {t.label}
              </BotonSistema>
            ))}
          </div>
        </TarjetaSistema>
      )}

      <Dialog open={cancelarAbierto} onOpenChange={setCancelarAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar esta temporada</DialogTitle>
            <DialogDescription>Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={() => setCancelarAbierto(false)} disabled={pending}>
              Volver
            </BotonSistema>
            <BotonSistema type="button" variante="primario" onClick={confirmarCancelar} disabled={pending}>
              {pending ? 'Cancelando…' : 'Confirmar cancelación'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>

      <TarjetaSistema className="p-0">
        <div className="p-4 pb-3">
          <TextoSistema className="font-medium">Talleres y ediciones</TextoSistema>
        </div>
        {talleresEnTemporada.length === 0 ? (
          <div className="px-4 pb-4">
            <TextoSistema variante="sutil" className="block text-sm">
              Todavía no hay talleres en esta temporada.
            </TextoSistema>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {talleresEnTemporada.map((taller) => (
              <div key={taller.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={rutaEdicion(taller.slug, taller.edicion.id)}
                      className="min-w-0 break-words font-medium text-foreground hover:underline"
                    >
                      {taller.edicion.nombre_snapshot}
                    </Link>
                    <BadgeSistema variante={edicionEstadoBadgeVariante(taller.edicion.estado)} tamaño="sm">
                      {edicionEstadoLabel(taller.edicion.estado)}
                    </BadgeSistema>
                  </div>
                  <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                    {formatFechaCorta(taller.edicion.fecha_inicio)} → {formatFechaCorta(taller.edicion.fecha_fin)}
                    {' · '}
                    {taller.edicion.total_inscripciones}{' '}
                    {taller.edicion.total_inscripciones === 1 ? 'inscrito' : 'inscritos'}
                  </TextoSistema>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    aria-label={`Quitar ${taller.nombre} de la temporada`}
                    title="Quitar de la temporada"
                    className={BOTON_ICONO}
                    onClick={() => abrirQuitar(taller)}
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </TarjetaSistema>

      <Dialog open={quitarObjetivo !== null} onOpenChange={(open) => { if (!open) setQuitarObjetivo(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quitar {quitarObjetivo?.nombre}</DialogTitle>
            <DialogDescription>Esta acción cancela su edición en esta temporada.</DialogDescription>
          </DialogHeader>
          {quitarError && (
            <BadgeSistema variante="error" role="alert" tamaño="sm">
              {quitarError}
            </BadgeSistema>
          )}
          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={() => setQuitarObjetivo(null)} disabled={pending}>
              Volver
            </BotonSistema>
            <BotonSistema type="button" variante="primario" onClick={confirmarQuitar} disabled={pending}>
              {pending ? 'Quitando…' : 'Confirmar'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>

      {canWrite && (
        <TarjetaSistema variante="outlined" className="p-4">
          <TextoSistema className="mb-2 block font-medium">Agregar taller</TextoSistema>
          {talleresDisponibles.length === 0 ? (
            <TextoSistema variante="sutil" className="block text-sm">
              No hay talleres disponibles para agregar.
            </TextoSistema>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <SelectSistema
                label="Taller"
                value={tallerAAgregar}
                onValueChange={setTallerAAgregar}
                placeholder="— Elige un taller —"
                opciones={talleresDisponibles.map((t) => ({ valor: t.id, etiqueta: t.nombre }))}
                className="min-w-[12rem]"
              />
              <BotonSistema type="button" variante="outline" onClick={agregar} disabled={!tallerAAgregar || pending}>
                Agregar
              </BotonSistema>
            </div>
          )}
          {agregarError && (
            <BadgeSistema variante="error" role="alert" tamaño="sm" className="mt-2">
              {agregarError}
            </BadgeSistema>
          )}
        </TarjetaSistema>
      )}
    </div>
  )
}

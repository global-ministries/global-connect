'use client'

/**
 * Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) — the
 * director's "Cerrar edición" control on the edición page: a trigger plus a
 * preview/confirm Dialog, same BotonSistema/BadgeSistema + Dialog pattern
 * as components/talleres/open-edicion-button.tsx.
 *
 *   1. Opening the dialog loads `previsualizarCierreEdicion` (read-only):
 *      warnings (clases sin dictar that will be cancelled, reportes sin
 *      enviar that stay open), the minimum, counts by resultado and one row
 *      per inscrito ("X de N" attended, mín., resultado).
 *   2. "Confirmar cierre" calls `cerrarEdicion` and swaps the preview for
 *      the close summary (completados, certificados emitidos, …).
 *
 * Why `puedeCerrar` instead of the page simply not rendering this
 * component: `cerrarEdicion` revalidates the edición page, which re-renders
 * with `cerrada_en` set. If the page dropped this element, React would
 * unmount it and the summary would vanish the instant it appears. The page
 * renders it for every editarEdicion viewer and only the TRIGGER depends on
 * `puedeCerrar`, so the open dialog keeps its state across that refresh.
 */

import { useRef, useState, useTransition, type ReactElement } from 'react'
import { Lock } from 'lucide-react'

import { BadgeSistema, BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { unitEstadoBadgeVariante, unitEstadoConteoLabel, unitEstadoLabel } from '@/components/talleres/labels'

import { cerrarEdicion, previsualizarCierreEdicion } from '@/app/(auth)/talleres/[taller]/[edicion]/actions'
import {
  contarPorResultado,
  type FilaVistaPreviaCierre,
  type ResultadoCierre,
  type ResumenCierre,
  type VistaPreviaCierre,
} from '@/lib/platform/talleres/cierre-edicion'

export interface CerrarEdicionButtonProps {
  readonly tallerSlug: string
  readonly edicionId: string
  /** Whether the trigger is offered (decided by the page: permiso, estado, cerrada_en). */
  readonly puedeCerrar: boolean
}

type Paso =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'error-carga'; readonly mensaje: string }
  | { readonly tipo: 'vista-previa'; readonly vistaPrevia: VistaPreviaCierre }
  | { readonly tipo: 'cerrada'; readonly resumen: ResumenCierre | null }

const RESULTADOS: readonly ResultadoCierre[] = ['completado', 'no_completado', 'abandono']
const ERROR_CARGA = 'No se pudo cargar la vista previa del cierre.'

export function CerrarEdicionButton({ tallerSlug, edicionId, puedeCerrar }: CerrarEdicionButtonProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [paso, setPaso] = useState<Paso>({ tipo: 'cargando' })
  const [errorCierre, setErrorCierre] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Ignores a preview that resolves after the dialog was closed and opened
  // again (only the latest request may write the state).
  const solicitudActual = useRef(0)

  function abrir(): void {
    const solicitud = solicitudActual.current + 1
    solicitudActual.current = solicitud
    setErrorCierre(null)
    setPaso({ tipo: 'cargando' })
    setOpen(true)
    previsualizarCierreEdicion(edicionId)
      .then((result) => {
        if (solicitudActual.current !== solicitud) return
        setPaso(
          result.ok
            ? { tipo: 'vista-previa', vistaPrevia: result.vistaPrevia }
            : { tipo: 'error-carga', mensaje: result.message },
        )
      })
      .catch(() => {
        if (solicitudActual.current !== solicitud) return
        setPaso({ tipo: 'error-carga', mensaje: ERROR_CARGA })
      })
  }

  function confirmar(): void {
    if (pending) return
    setErrorCierre(null)
    startTransition(async () => {
      const result = await cerrarEdicion({ tallerSlug, edicionId })
      if (result.ok) {
        setPaso({ tipo: 'cerrada', resumen: result.resumen })
      } else {
        setErrorCierre(result.message)
      }
    })
  }

  function cambiarApertura(abierto: boolean): void {
    // A close in flight must finish inside the dialog that started it.
    if (pending) return
    setOpen(abierto)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {puedeCerrar && (
        <BotonSistema type="button" variante="outline" tamaño="sm" icono={Lock} onClick={abrir}>
          Cerrar edición
        </BotonSistema>
      )}

      <Dialog open={open} onOpenChange={cambiarApertura}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {paso.tipo === 'cerrada' ? (
            <ResumenCerrada resumen={paso.resumen} onListo={() => setOpen(false)} />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Cerrar edición</DialogTitle>
                <DialogDescription>
                  Se calculará el resultado de cada inscrito con su asistencia, se emitirán los certificados de
                  quienes completaron y se cerrarán los grupos, las clases dictadas y los reportes enviados. Esta
                  acción no se puede deshacer.
                </DialogDescription>
              </DialogHeader>

              {paso.tipo === 'cargando' && (
                <TextoSistema variante="sutil" tamaño="sm" role="status">
                  Cargando vista previa…
                </TextoSistema>
              )}

              {paso.tipo === 'error-carga' && (
                <BadgeSistema variante="error" role="alert" tamaño="sm">
                  {paso.mensaje}
                </BadgeSistema>
              )}

              {paso.tipo === 'vista-previa' && <VistaPrevia vistaPrevia={paso.vistaPrevia} />}

              {/* Inside the dialog, not next to the trigger: Radix hides
                  everything outside an open dialog from assistive tech. */}
              {errorCierre && (
                <BadgeSistema variante="error" role="alert" tamaño="sm">
                  {errorCierre}
                </BadgeSistema>
              )}

              <div className="flex items-center justify-end gap-2">
                <BotonSistema type="button" variante="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Volver
                </BotonSistema>
                {paso.tipo === 'vista-previa' && (
                  <BotonSistema type="button" variante="primario" onClick={confirmar} disabled={pending}>
                    {pending ? 'Cerrando…' : 'Confirmar cierre'}
                  </BotonSistema>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function VistaPrevia({ vistaPrevia }: { readonly vistaPrevia: VistaPreviaCierre }): ReactElement {
  const conteos = contarPorResultado(vistaPrevia.filas)
  const { clasesSinDictar, reportesSinEnviar, clasesMinimas } = vistaPrevia

  return (
    <div className="flex flex-col gap-4">
      {(clasesSinDictar > 0 || reportesSinEnviar > 0) && (
        <div className="flex flex-wrap gap-2">
          {clasesSinDictar > 0 && (
            <BadgeSistema variante="warning" tamaño="sm">
              {clasesSinDictar === 1
                ? '1 clase sin dictar se cancelará.'
                : `${clasesSinDictar} clases sin dictar se cancelarán.`}
            </BadgeSistema>
          )}
          {reportesSinEnviar > 0 && (
            <BadgeSistema variante="warning" tamaño="sm">
              {reportesSinEnviar === 1
                ? '1 reporte sin enviar queda abierto.'
                : `${reportesSinEnviar} reportes sin enviar quedan abiertos.`}
            </BadgeSistema>
          )}
        </div>
      )}

      <TextoSistema tamaño="sm">
        {clasesMinimas === null
          ? 'Mínimo para completar: todas las clases dictadas.'
          : `Mínimo para completar: ${clasesMinimas} ${clasesMinimas === 1 ? 'clase' : 'clases'}.`}
      </TextoSistema>

      <div className="flex flex-wrap gap-2">
        {RESULTADOS.map((resultado) => (
          <BadgeSistema key={resultado} variante={unitEstadoBadgeVariante(resultado)} tamaño="sm">
            {unitEstadoConteoLabel(resultado, conteos[resultado])}
          </BadgeSistema>
        ))}
      </div>

      {vistaPrevia.filas.length === 0 ? (
        <TextoSistema variante="sutil" tamaño="sm">
          No hay inscritos para evaluar en esta edición.
        </TextoSistema>
      ) : (
        <TablaVistaPrevia filas={vistaPrevia.filas} />
      )}
    </div>
  )
}

const CELDA_ENCABEZADO = 'px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground'

function TablaVistaPrevia({ filas }: { readonly filas: readonly FilaVistaPreviaCierre[] }): ReactElement {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border">
            <th className={CELDA_ENCABEZADO}>Persona</th>
            <th className={CELDA_ENCABEZADO}>Grupo</th>
            <th className={CELDA_ENCABEZADO}>Asistencia</th>
            <th className={CELDA_ENCABEZADO}>Resultado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map((fila) => (
            <tr key={fila.inscripcionId}>
              <td className="px-3 py-2">
                <span className="block text-sm font-medium text-foreground">{fila.personaNombre}</span>
                {fila.companeroNombre && (
                  <span className="block text-xs text-muted-foreground">+ {fila.companeroNombre}</span>
                )}
              </td>
              <td className="px-3 py-2 text-sm text-muted-foreground">{fila.grupoNombre ?? '—'}</td>
              <td className="px-3 py-2 text-sm">
                <span className="block text-foreground">
                  {fila.clasesPresente} de {fila.clasesTotal}
                </span>
                <span className="block text-xs text-muted-foreground">mín. {fila.minimo}</span>
              </td>
              <td className="px-3 py-2">
                <BadgeSistema variante={unitEstadoBadgeVariante(fila.resultado)} tamaño="sm">
                  {unitEstadoLabel(fila.resultado)}
                </BadgeSistema>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResumenCerrada({
  resumen,
  onListo,
}: {
  readonly resumen: ResumenCierre | null
  readonly onListo: () => void
}): ReactElement {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edición cerrada</DialogTitle>
        <DialogDescription>
          {resumen
            ? 'Los resultados quedaron registrados y los certificados ya están disponibles para quienes completaron.'
            : 'La edición quedó cerrada.'}
        </DialogDescription>
      </DialogHeader>

      {resumen && (
        <div className="flex flex-col gap-4" role="status">
          <div className="flex flex-wrap gap-2">
            <BadgeSistema variante={unitEstadoBadgeVariante('completado')} tamaño="sm">
              {unitEstadoConteoLabel('completado', resumen.completados)}
            </BadgeSistema>
            <BadgeSistema variante={unitEstadoBadgeVariante('no_completado')} tamaño="sm">
              {unitEstadoConteoLabel('no_completado', resumen.noCompletados)}
            </BadgeSistema>
            <BadgeSistema variante={unitEstadoBadgeVariante('abandono')} tamaño="sm">
              {unitEstadoConteoLabel('abandono', resumen.abandonos)}
            </BadgeSistema>
          </div>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DatoResumen titulo="Certificados emitidos" valor={resumen.certificadosEmitidos} />
            <DatoResumen titulo="Grupos completados" valor={resumen.gruposCompletados} />
            <DatoResumen titulo="Clases cerradas" valor={resumen.clasesCerradas} />
            <DatoResumen titulo="Clases canceladas" valor={resumen.clasesCanceladas} />
            <DatoResumen titulo="Reportes cerrados" valor={resumen.reportesCerrados} />
            <DatoResumen titulo="Reportes sin enviar" valor={resumen.reportesSinEnviar} />
          </dl>
        </div>
      )}

      <div className="flex items-center justify-end">
        <BotonSistema type="button" variante="primario" onClick={onListo}>
          Listo
        </BotonSistema>
      </div>
    </>
  )
}

function DatoResumen({ titulo, valor }: { readonly titulo: string; readonly valor: number }): ReactElement {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{valor}</dd>
    </div>
  )
}

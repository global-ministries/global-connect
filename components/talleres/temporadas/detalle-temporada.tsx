'use client'

/**
 * R3b (odd/tasks/talleres-rediseno.md, S5) — the one drawer per temporada of
 * /talleres/temporadas (artboards design/talleres-interior/26 and 27: default
 * panel, `#borrador`, `#cerrar`), replacing the old [id] detail page.
 *
 * Views inside the same drawer (no stacked dialogs): the detail (summary,
 * notices, its ediciones, «Agregar taller»), and the confirmations for
 * «Cerrar temporada», «Cancelar temporada» and «Quitar <taller>». Every write
 * goes through the existing server actions (transitionTemporada,
 * agregarTallerATemporada, quitarTallerDeTemporada), which the RPCs / RLS
 * check again. Controls show only with `puedeEditar` (the page's existing
 * director.write | admin.manage check) and while the temporada is vigente
 * (borrador / abierta): a cerrada or cancelada one admits no changes.
 *
 * «Abrir temporada» runs at once (as before); «Cerrar» now asks first.
 * «Editar» (name and dates) is left out: no existing action supports it.
 */

import { useState, useTransition, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarRange, Check, Plus, X } from 'lucide-react'

import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo, useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { edicionEstadoLabel, temporadaEstadoLabel } from '@/components/talleres/labels'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import {
  agregarTallerATemporada,
  quitarTallerDeTemporada,
  transitionTemporada,
} from '@/app/(auth)/talleres/temporadas/actions'
import { rutaEdicion } from '@/lib/platform/talleres/rutas'
import { edicionBajoMinimo, type EdicionPanel, type TemporadaPanel } from '@/lib/platform/talleres/temporadas'

import {
  edicionesBajoMinimo,
  esVigente,
  formatearFecha,
  inscritosDe,
  plural,
  talleresDe,
  talleresSinEdicion,
} from './vista-temporadas'

export const TONO_TEMPORADA: Record<TemporadaPanel['estado'], TonoEstado> = {
  abierto: 'success',
  borrador: 'muted',
  cerrado: 'muted',
  cancelado: 'danger',
}

const TONO_EDICION: Record<EdicionPanel['estado'], TonoEstado> = {
  borrador: 'muted',
  abierto: 'success',
  en_curso: 'info',
  cerrado: 'muted',
  cancelado: 'danger',
}

type Vista =
  | { readonly tipo: 'ver' }
  | { readonly tipo: 'cerrar' }
  | { readonly tipo: 'cancelar' }
  | { readonly tipo: 'quitar'; readonly edicion: EdicionPanel }

interface Props {
  readonly temporada: TemporadaPanel | null
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly puedeEditar: boolean
  /** After any successful write: the page refreshes its data. */
  readonly onCambio: () => void
}

function Numero({ children }: { readonly children: ReactNode }): ReactElement {
  return <span className="font-mono tabular-nums">{children}</span>
}

function Datos({ filas }: { readonly filas: readonly (readonly [string, ReactNode])[] }): ReactElement {
  return (
    <dl className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
      {filas.map(([clave, valor]) => (
        <div key={clave} className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5 text-sm">
          <dt className="text-muted-foreground">{clave}</dt>
          <dd className="min-w-0 text-right text-foreground">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Warning notice: `AvisoFormulario` has no warning tone yet (components.md, planned), same composition as Estudiantes. */
function AvisoAtencion({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-text" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Subtitulo({ children }: { readonly children: ReactNode }): ReactElement {
  return <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>
}

function faltan(edicion: EdicionPanel): number {
  return (edicion.minimo ?? 0) - edicion.aprobados
}

function FilaEdicion({
  edicion,
  borrador,
  onQuitar,
}: {
  readonly edicion: EdicionPanel
  readonly borrador: boolean
  readonly onQuitar?: () => void
}): ReactElement {
  const bajo = edicionBajoMinimo(edicion)
  const titulo = `${edicion.tallerNombre} · ${edicion.nombre}`
  return (
    <li className="flex min-h-16 min-w-0 items-start gap-3 px-4 py-3">
      <div className="grid min-w-0 flex-1 gap-1">
        {edicion.tallerSlug ? (
          <Link
            href={rutaEdicion(edicion.tallerSlug, edicion.id)}
            className="focus-ring truncate rounded-sm font-medium text-foreground hover:underline"
          >
            {titulo}
          </Link>
        ) : (
          <span className="truncate font-medium text-foreground">{titulo}</span>
        )}
        <span className="truncate text-[13px] text-muted-foreground">
          {formatearFecha(edicion.fechaInicio, false)} → {formatearFecha(edicion.fechaFin, false)}
        </span>
        {!borrador && (
          <span className="text-[13px] text-muted-foreground">
            <Numero>{edicion.inscritos}</Numero> {plural(edicion.inscritos, 'inscrito', 'inscritos')}
            {edicion.minimo !== null && (
              <>
                {' · mín. '}
                <Numero>{edicion.minimo}</Numero>
              </>
            )}
          </span>
        )}
        {bajo ? (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-warning-text">
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
            <span>
              {plural(faltan(edicion), 'Falta', 'Faltan')} <Numero>{faltan(edicion)}</Numero>{' '}
              {plural(faltan(edicion), 'aprobado', 'aprobados')} para el mínimo
            </span>
          </span>
        ) : (
          <PuntoEstado tono={TONO_EDICION[edicion.estado]} etiqueta={edicionEstadoLabel(edicion.estado)} />
        )}
      </div>
      {onQuitar && (
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          soloIcono
          icono={X}
          aria-label={`Quitar ${edicion.tallerNombre} de la temporada`}
          title="Quitar de la temporada"
          onClick={onQuitar}
        />
      )}
    </li>
  )
}

export function DetalleTemporada({ temporada, abierto, onCambioAbierto, puedeEditar, onCambio }: Props): ReactElement | null {
  const toast = useNotificaciones()
  const escritorio = useEsEscritorio() !== false
  const [pendiente, startTransition] = useTransition()
  const [vista, setVista] = useState<Vista>({ tipo: 'ver' })
  const [error, setError] = useState<string | null>(null)
  const [tallerAAgregar, setTallerAAgregar] = useState('')
  const [abiertaId, setAbiertaId] = useState<string | null>(temporada?.id ?? null)

  // Another temporada opened: back to its detail, without the previous one's leftovers.
  if ((temporada?.id ?? null) !== abiertaId) {
    setAbiertaId(temporada?.id ?? null)
    setVista({ tipo: 'ver' })
    setError(null)
    setTallerAAgregar('')
  }

  if (!temporada) return null

  const vigente = esVigente(temporada)
  const editable = puedeEditar && vigente
  const borrador = temporada.estado === 'borrador'
  const bajos = edicionesBajoMinimo(temporada)
  const disponibles = talleresSinEdicion(temporada)
  const nombre = temporada.nombre

  function cambiarVista(siguiente: Vista): void {
    setError(null)
    setVista(siguiente)
  }

  function cerrarPanel(abiertoAhora: boolean): void {
    if (!abiertoAhora) cambiarVista({ tipo: 'ver' })
    onCambioAbierto(abiertoAhora)
  }

  function ejecutar(
    accion: () => Promise<{ readonly ok: boolean; readonly message?: string; readonly error?: string }>,
    exito: string,
    despues: () => void = () => cambiarVista({ tipo: 'ver' }),
  ): void {
    setError(null)
    startTransition(async () => {
      const resultado = await accion()
      if (resultado.ok) {
        toast.success(exito)
        despues()
        onCambio()
      } else {
        setError(resultado.message ?? 'No se pudo completar la acción.')
      }
    })
  }

  const abrir = () =>
    ejecutar(() => transitionTemporada({ temporadaId: temporada.id, next: 'abierto' }), `Abriste «${nombre}».`)
  const cerrar = () =>
    ejecutar(
      () => transitionTemporada({ temporadaId: temporada.id, next: 'cerrado' }),
      `Cerraste «${nombre}». Queda en Historial.`,
    )
  const cancelar = () =>
    ejecutar(() => transitionTemporada({ temporadaId: temporada.id, next: 'cancelado' }), `Cancelaste «${nombre}».`)
  const agregar = () => {
    const taller = disponibles.find((t) => t.id === tallerAAgregar)
    if (!taller) return
    ejecutar(
      () => agregarTallerATemporada({ temporadaId: temporada.id, tallerId: taller.id }),
      `Agregaste ${taller.nombre} a «${nombre}».`,
      () => setTallerAAgregar(''),
    )
  }
  const quitar = (edicion: EdicionPanel) =>
    ejecutar(
      () => quitarTallerDeTemporada({ temporadaId: temporada.id, tallerId: edicion.tallerId }),
      `Quitaste ${edicion.tallerNombre} de «${nombre}».`,
    )

  const avisoError = error ? <AvisoFormulario tono="error">{error}</AvisoFormulario> : null

  const volver = (
    <BotonSistema type="button" variante="outline" onClick={() => cambiarVista({ tipo: 'ver' })} disabled={pendiente}>
      Volver
    </BotonSistema>
  )

  let titulo = nombre
  let cuerpo: ReactNode
  let pie: ReactNode

  if (vista.tipo === 'cerrar') {
    titulo = `Cerrar ${nombre}`
    cuerpo = (
      <div className="grid gap-5">
        <AvisoAtencion>
          <strong>Una temporada cerrada no se puede volver a abrir</strong> y ya no admite agregar ni quitar talleres.
        </AvisoAtencion>
        <div className="grid gap-2">
          <Subtitulo>Así queda</Subtitulo>
          <Datos
            filas={[
              ['Ediciones', <><Numero>{temporada.ediciones.length}</Numero> {plural(temporada.ediciones.length, 'edición', 'ediciones')}</>],
              ['Inscritos', <Numero key="n">{inscritosDe(temporada)}</Numero>],
              ['Termina', formatearFecha(temporada.fecha_cierre)],
            ]}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Lo normal es cerrarla cuando terminó la última clase de sus ediciones. Para abrir talleres nuevos, crea la
          siguiente temporada.
        </p>
        {avisoError}
      </div>
    )
    pie = (
      <div className="flex w-full items-center justify-end gap-2">
        {volver}
        <BotonSistema type="button" onClick={cerrar} cargando={pendiente}>
          Sí, cerrar temporada
        </BotonSistema>
      </div>
    )
  } else if (vista.tipo === 'cancelar') {
    titulo = `Cancelar ${nombre}`
    cuerpo = (
      <div className="grid gap-5">
        <AvisoAtencion>
          <strong>Esta acción no se puede deshacer.</strong> La temporada pasa al Historial como cancelada.
        </AvisoAtencion>
        {avisoError}
      </div>
    )
    pie = (
      <div className="flex w-full items-center justify-end gap-2">
        {volver}
        <BotonSistema type="button" variante="peligro" onClick={cancelar} cargando={pendiente}>
          Sí, cancelar temporada
        </BotonSistema>
      </div>
    )
  } else if (vista.tipo === 'quitar') {
    const edicion = vista.edicion
    titulo = `Quitar ${edicion.tallerNombre}`
    cuerpo = (
      <div className="grid gap-5">
        <p className="text-sm text-foreground">
          Se cancela su edición en «{nombre}». Si ya tiene inscritos, no se puede quitar.
        </p>
        {avisoError}
      </div>
    )
    pie = (
      <div className="flex w-full items-center justify-end gap-2">
        {volver}
        <BotonSistema type="button" variante="peligro" onClick={() => quitar(edicion)} cargando={pendiente}>
          Quitar taller
        </BotonSistema>
      </div>
    )
  } else {
    cuerpo = (
      <div className="grid gap-5">
        <Datos
          filas={[
            ['Estado', <PuntoEstado key="e" tono={TONO_TEMPORADA[temporada.estado]} etiqueta={temporadaEstadoLabel(temporada.estado)} />],
            ['Fechas', `${formatearFecha(temporada.fecha_apertura)} → ${formatearFecha(temporada.fecha_cierre)}`],
            [
              'Talleres',
              <>
                <Numero>{talleresDe(temporada)}</Numero> {plural(talleresDe(temporada), 'taller', 'talleres')} ·{' '}
                <Numero>{temporada.ediciones.length}</Numero> {plural(temporada.ediciones.length, 'edición', 'ediciones')}
              </>,
            ],
            ['Inscritos', borrador ? 'Aún sin inscripción' : <Numero key="i">{inscritosDe(temporada)}</Numero>],
          ]}
        />

        {bajos.length > 0 && (
          <AvisoAtencion>
            <strong>
              {bajos.length === 1 ? 'Una edición no llega' : `${bajos.length} ediciones no llegan`} al mínimo:
            </strong>{' '}
            {bajos.map((e) => `${e.tallerNombre} (${plural(faltan(e), 'falta', 'faltan')} ${faltan(e)})`).join(', ')}. Si al
            cierre no llegan, decides tú en cada edición: mover de fecha, abrir igual o cancelar.
          </AvisoAtencion>
        )}

        {borrador && (
          <AvisoFormulario tono="info" className="flex items-start gap-2">
            <CalendarRange aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" />
            <span>
              <strong>Está en borrador.</strong> Revisa las ediciones y ábrela cuando estén listas.
            </span>
          </AvisoFormulario>
        )}

        {vista.tipo === 'ver' && avisoError}

        <section aria-labelledby="ediciones-temporada" className="grid gap-2">
          <h3 id="ediciones-temporada" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Ediciones de esta temporada
          </h3>
          {temporada.ediciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay talleres en esta temporada.</p>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
              {temporada.ediciones.map((edicion) => (
                <FilaEdicion
                  key={edicion.id}
                  edicion={edicion}
                  borrador={borrador}
                  onQuitar={editable ? () => cambiarVista({ tipo: 'quitar', edicion }) : undefined}
                />
              ))}
            </ul>
          )}
        </section>

        {editable && (
          <section aria-labelledby="agregar-taller" className="grid gap-2">
            <h3 id="agregar-taller" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Agregar taller
            </h3>
            {disponibles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todos los talleres por temporada de esta dirección ya tienen su edición aquí.
              </p>
            ) : (
              <>
                <div className="flex min-w-0 flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1">
                    <SelectSistema
                      label="Taller"
                      value={tallerAAgregar}
                      onValueChange={setTallerAAgregar}
                      placeholder="Elige un taller"
                      opciones={disponibles.map((t) => ({ valor: t.id, etiqueta: t.nombre }))}
                    />
                  </div>
                  <BotonSistema
                    type="button"
                    variante="outline"
                    icono={Plus}
                    onClick={agregar}
                    disabled={!tallerAAgregar || pendiente}
                  >
                    Agregar
                  </BotonSistema>
                </div>
                <p className="text-xs text-muted-foreground">
                  Se crea su edición con primera clase el {formatearFecha(temporada.fecha_apertura)}.
                </p>
              </>
            )}
          </section>
        )}
      </div>
    )
    const botonCancelar = (
      <BotonSistema
        type="button"
        variante="outline"
        onClick={() => cambiarVista({ tipo: 'cancelar' })}
        disabled={pendiente}
        className={escritorio ? undefined : 'w-full'}
      >
        Cancelar temporada
      </BotonSistema>
    )
    if (editable && !escritorio) {
      // Phone (artboard 27): the footer keeps the one primary action; «Cancelar temporada» closes the body.
      cuerpo = (
        <div className="grid gap-5">
          {cuerpo}
          {botonCancelar}
        </div>
      )
    }
    pie = editable ? (
      <div className="flex w-full items-center gap-2">
        {escritorio && botonCancelar}
        <span className="flex-1" />
        {borrador ? (
          <BotonSistema type="button" icono={Check} onClick={abrir} cargando={pendiente} className={escritorio ? undefined : 'w-full'}>
            Abrir temporada
          </BotonSistema>
        ) : (
          <BotonSistema
            type="button"
            onClick={() => cambiarVista({ tipo: 'cerrar' })}
            disabled={pendiente}
            className={escritorio ? undefined : 'w-full'}
          >
            Cerrar temporada
          </BotonSistema>
        )}
      </div>
    ) : (
      <div className="flex w-full items-center gap-2">
        {!vigente && (
          <span className="text-sm text-muted-foreground">
            {temporada.estado === 'cerrado' ? 'Cerrada' : 'Cancelada'}: ya no admite cambios.
          </span>
        )}
        <span className="flex-1" />
        <BotonSistema type="button" variante="outline" onClick={() => cerrarPanel(false)}>
          Cerrar
        </BotonSistema>
      </div>
    )
  }

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={cerrarPanel}
      titulo={titulo}
      descripcion={temporada.direccionLabel || undefined}
      pie={pie}
    >
      {cuerpo}
    </DetalleResponsivo>
  )
}

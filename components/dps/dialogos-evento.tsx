'use client'

/**
 * DPS › Programación — the two dialogs of a special row's menu (T11b of
 * odd/tasks/dps-asistencia-pco.md; S9, L44), the 420px dialogs of the
 * planning style on `ui/dialog`, like dialogo-copiar.tsx.
 *
 * «Mover fecha»: the new date (from today on). Everything goes with the plan
 * (convocados, order and data); a day of a multi-day event moves alone. A
 * day that already passed or has attendance cannot move: the dialog says
 * why and only closes. It warns about a date before today and about a day
 * that already has an event of that tipo and título; dps_plan_mover has the
 * last word (its refusal shows inside).
 *
 * «Eliminar evento» (an alert dialog): the plan with its convocados, after
 * confirming. A day of a multi-day event offers that day alone or every
 * day; a day with attendance is never deleted (the dialog says why), and
 * every day only when none has attendance. dps_plan_eliminar decides.
 *
 * While either one works, it cannot be closed.
 */
import { useState, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { CLASE_DIALOGO, CLASE_TITULO_DIALOGO } from '@/components/grupos-vida/planner/estilo-planner'
import { eliminarPlanDps, moverPlanDps } from '@/lib/actions/dps-programacion.actions'
import { ETIQUETA_TIPO } from '@/lib/platform/dps/planilla'
import { bloqueoEliminar, bloqueoMover, choquesEvento, diasEvento, fechaCorta, nombreEspecial, type PlanHoja } from '@/lib/platform/dps/programacion'

function Fallo({ mensaje }: { readonly mensaje: string | null }): ReactElement | null {
  if (!mensaje) return null
  return (
    <p role="alert" className="text-sm text-danger-text">
      {mensaje}
    </p>
  )
}

export interface DialogoMoverFechaProps {
  readonly plan: PlanHoja
  readonly planes: readonly PlanHoja[]
  readonly hoy: string
  readonly onCerrar: () => void
  /** Moved: the parent reloads the year. */
  readonly onMovido: (nombre: string, fecha: string) => void
}

export function DialogoMoverFecha({ plan, planes, hoy, onCerrar, onMovido }: DialogoMoverFechaProps): ReactElement {
  const [fecha, setFecha] = useState(plan.fecha)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nombre = nombreEspecial(plan)
  const bloqueo = bloqueoMover(plan, hoy)
  const valida = diasEvento(fecha, '').length === 1
  const choques = valida ? choquesEvento(planes.filter((p) => p.id !== plan.id), plan.tipo, plan.titulo ?? '', [fecha]) : []
  const aviso = !valida
    ? 'Elige la nueva fecha.'
    : fecha < hoy
      ? 'Elige una fecha de hoy en adelante.'
      : choques.length > 0
        ? `El ${fechaCorta(fecha)} ya tiene «${plan.titulo}». Elige otra fecha.`
        : null
  const puedeMover = !bloqueo && aviso === null && fecha !== plan.fecha && !enviando

  async function moverPlan(): Promise<void> {
    if (!puedeMover) return
    setEnviando(true)
    setError(null)
    const r = await moverPlanDps({ planId: plan.id, fecha })
    setEnviando(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
    onMovido(nombre, fecha)
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !enviando && onCerrar()}>
      <DialogContent className={CLASE_DIALOGO} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className={CLASE_TITULO_DIALOGO}>Mover fecha</DialogTitle>
          <DialogDescription>
            «{nombre}», {fechaCorta(plan.fecha)}.{' '}
            {bloqueo ?? (
              <>
                {plan.evento && plan.evento.dias > 1 && 'Solo se mueve este día; los otros días del evento quedan donde están. '}
                Se mueve todo: convocados, orden y datos van a la fecha nueva.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {!bloqueo && (
          <>
            <InputSistema label="Nueva fecha" type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} />
            {aviso && <p className="text-[13px] text-warning-text">{aviso}</p>}
          </>
        )}
        <Fallo mensaje={error} />
        <DialogFooter>
          <BotonSistema type="button" variante={bloqueo ? 'outline' : 'ghost'} tamaño="sm" disabled={enviando} onClick={onCerrar}>
            {bloqueo ? 'Cerrar' : 'Cancelar'}
          </BotonSistema>
          {!bloqueo && (
            <BotonSistema type="button" tamaño="sm" cargando={enviando} disabled={!puedeMover} onClick={() => void moverPlan()}>
              Mover
            </BotonSistema>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export interface DialogoEliminarEventoProps {
  readonly plan: PlanHoja
  /** Every day of its event, by date (diasDelEvento); just the plan when it is not an event day. */
  readonly dias: readonly PlanHoja[]
  readonly onCerrar: () => void
  /** Deleted: the sentence to announce; the parent reloads the year. */
  readonly onEliminado: (frase: string) => void
}

export function DialogoEliminarEvento({ plan, dias, onCerrar, onEliminado }: DialogoEliminarEventoProps): ReactElement {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titulo = plan.titulo ?? ETIQUETA_TIPO[plan.tipo]
  const bloqueo = bloqueoEliminar(plan)
  const varios = dias.length > 1
  const todosPosible = varios && !dias.some((d) => d.conAsistencia)

  async function eliminar(todoElEvento: boolean): Promise<void> {
    setEnviando(true)
    setError(null)
    const r = await eliminarPlanDps({ planId: plan.id, todoElEvento })
    setEnviando(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
    onEliminado(
      todoElEvento ? `Eliminamos «${titulo}» (${dias.length} días).` : varios ? `Eliminamos el día ${plan.evento?.dia ?? 1} de «${titulo}».` : `Eliminamos «${titulo}».`,
    )
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !enviando && onCerrar()}>
      <DialogContent role="alertdialog" className={CLASE_DIALOGO} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className={CLASE_TITULO_DIALOGO}>¿Eliminar «{titulo}»?</DialogTitle>
          <DialogDescription>
            {bloqueo ??
              (varios
                ? `Es un evento de ${dias.length} días. Puedes quitar solo el día ${plan.evento?.dia ?? 1} (${fechaCorta(plan.fecha)}) o todos, con sus convocados. No se puede deshacer.`
                : `Se quita el plan del ${fechaCorta(plan.fecha)} con sus convocados. No se puede deshacer.`)}
          </DialogDescription>
        </DialogHeader>
        {!bloqueo && varios && !todosPosible && <p className="text-[13px] text-warning-text">Otro día del evento tiene asistencia marcada: solo puedes eliminar este día.</p>}
        <Fallo mensaje={error} />
        <DialogFooter>
          <BotonSistema type="button" variante="outline" tamaño="sm" disabled={enviando} onClick={onCerrar}>
            {bloqueo ? 'Cerrar' : 'Cancelar'}
          </BotonSistema>
          {!bloqueo && varios && (
            <BotonSistema type="button" variante={todosPosible ? 'outline' : 'peligro'} tamaño="sm" disabled={enviando} onClick={() => void eliminar(false)}>
              Eliminar solo este día
            </BotonSistema>
          )}
          {!bloqueo && (!varios || todosPosible) && (
            <BotonSistema type="button" variante="peligro" tamaño="sm" cargando={enviando} disabled={enviando} onClick={() => void eliminar(varios)}>
              {varios ? `Eliminar los ${dias.length} días` : 'Eliminar'}
            </BotonSistema>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

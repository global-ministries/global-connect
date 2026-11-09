'use client'

/**
 * DPS › Plan — «Horarios» of the context sidebar (`.ps .hr` of
 * prototipos/planificacion-dps/02-plan-domingo-orden.html; planned
 * `SeccionContexto` of docs/design-system/components.md#planning-style-components,
 * local here until it moves to components/ui). Each plan has its own
 * services and llegada (S10, odd/tasks/dps-asistencia-pco.md L48): a Cena
 * del Señor can be one evening service. The list reads «Llegada del equipo
 * 7:00», the later pre servicio sections («Ensayo general 8:00») and each
 * «Servicio 9:15 – 10:23», the end coming from the order (lib/platform/dps/orden.ts).
 *
 * Whoever plans opens «Editar horarios»: the llegada and 1 to 4 service
 * starts as time fields, «+ Servicio» (two hours after the last) and
 * «Quitar el servicio de las …». Each change saves on its own when the field
 * is left (autosave, patterns.md › Inline edit); an invalid set (unsorted,
 * llegada after the first service) is not saved and says why. The parent
 * applies it at once and rolls it back if the database refuses.
 */
import { useId, useState, type ReactElement } from 'react'
import { Plus, X } from 'lucide-react'

import { InputSistema } from '@/components/ui/sistema-diseno'
import { CLASE_ACCION_TEXTO, CLASE_BOTON_ICONO, CLASE_CONTROL_COMPACTO, CLASE_TITULO_SECCION } from '@/components/grupos-vida/planner/estilo-planner'
import { mensajeErrorDps } from '@/lib/platform/dps/errores'
import { MAX_SERVICIOS, siguienteHorario, validarHorarios } from '@/lib/platform/dps/horarios'
import type { PasoCronograma } from '@/lib/platform/dps/orden'
import { cn } from '@/lib/utils'

export interface HorariosPlanProps {
  readonly horarios: readonly string[]
  readonly llegada: string
  readonly cronograma: readonly PasoCronograma[]
  readonly editable: boolean
  readonly onGuardar: (horarios: readonly string[], llegada: string) => void
}

const horaCorta = (hora: string): string => hora.replace(/^0(\d)/, '$1')

export function HorariosPlan({ horarios, llegada, cronograma, editable, onGuardar }: HorariosPlanProps): ReactElement {
  const id = useId()
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState({ horarios: [...horarios], llegada })
  const [error, setError] = useState<string | null>(null)

  const [guardados, setGuardados] = useState({ horarios, llegada })

  // What the parent holds wins (a save, a rollback), adjusted while rendering.
  if (guardados.horarios !== horarios || guardados.llegada !== llegada) {
    setGuardados({ horarios, llegada })
    setBorrador({ horarios: [...horarios], llegada })
  }

  function guardar(siguientes: readonly string[], nuevaLlegada: string): void {
    const invalido = validarHorarios(siguientes, nuevaLlegada)
    if (invalido) {
      setError(mensajeErrorDps({ message: invalido }, 'horarios'))
      return
    }
    setError(null)
    if (nuevaLlegada === llegada && siguientes.length === horarios.length && siguientes.every((h, i) => h === horarios[i])) return
    onGuardar(siguientes, nuevaLlegada)
  }

  const siguiente = siguienteHorario(borrador.horarios)

  return (
    <section aria-labelledby={`${id}-t`} className="px-4 pt-2.5 pb-3">
      <h2 className={cn(CLASE_TITULO_SECCION, 'flex min-h-[26px] items-center justify-between')}>
        <span id={`${id}-t`}>Horarios</span>
        {editable && (
          <button
            type="button"
            className={cn(CLASE_ACCION_TEXTO, 'min-h-0 text-xs normal-case tracking-normal')}
            aria-label={editando ? 'Terminar de editar los horarios' : 'Editar horarios'}
            onClick={() => {
              setEditando((e) => !e)
              setError(null)
            }}
          >
            {editando ? 'Listo' : 'Editar'}
          </button>
        )}
      </h2>

      {!editando ? (
        <ul className="mt-1">
          {cronograma.map((paso, i) => (
            <li key={`${paso.etiqueta}-${i}`} className="flex justify-between gap-3 py-[3px] text-[13px]">
              <span className="min-w-0 break-words">{paso.etiqueta}</span>
              <span className="shrink-0 font-mono tabular-nums">
                {paso.hora}
                {paso.fin && ` – ${paso.fin}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-1 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span>Llegada del equipo</span>
            <InputSistema
              type="time"
              aria-label="Llegada del equipo"
              value={borrador.llegada}
              onChange={(e) => setBorrador((b) => ({ ...b, llegada: e.target.value }))}
              onBlur={() => guardar(borrador.horarios, borrador.llegada)}
              className={cn(CLASE_CONTROL_COMPACTO, 'w-[7.5rem] px-2 font-mono tabular-nums')}
            />
          </div>
          {borrador.horarios.map((hora, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[13px]">
              <span>Servicio {borrador.horarios.length > 1 ? i + 1 : ''}</span>
              <div className="flex items-center gap-1">
                <InputSistema
                  type="time"
                  aria-label={`Servicio ${i + 1}`}
                  value={hora}
                  onChange={(e) => setBorrador((b) => ({ ...b, horarios: b.horarios.map((h, k) => (k === i ? e.target.value : h)) }))}
                  onBlur={() => guardar(borrador.horarios, borrador.llegada)}
                  className={cn(CLASE_CONTROL_COMPACTO, 'w-[7.5rem] px-2 font-mono tabular-nums')}
                />
                {borrador.horarios.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Quitar el servicio de las ${horaCorta(hora)}`}
                    className={CLASE_BOTON_ICONO}
                    onClick={() => guardar(borrador.horarios.filter((_, k) => k !== i), borrador.llegada)}
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {error && (
            <p role="alert" className="text-xs text-danger-text">
              {error}
            </p>
          )}
          {siguiente && borrador.horarios.length < MAX_SERVICIOS && (
            <button type="button" className={cn(CLASE_ACCION_TEXTO, 'text-xs')} onClick={() => guardar([...borrador.horarios, siguiente], borrador.llegada)}>
              <Plus aria-hidden="true" className="size-3.5" />
              Servicio
            </button>
          )}
          <p className="text-xs text-muted-foreground">Cada servicio termina cuando termina su orden.</p>
        </div>
      )}
    </section>
  )
}

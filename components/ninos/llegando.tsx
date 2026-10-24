'use client'

/**
 * "Llegando" at the top of the check-in screen (odd/tasks/ninos-precheck.md,
 * P3): the families that told the table they are on their way to the selected
 * service (ninos_prechecks_pendientes), each child with its suggested room and
 * health alerts. "Llegaron" hands the family to the check-in screen, which
 * checks them in through the usual path and shows the code. The list is read
 * every 30 s while the screen is visible, and again when it comes back after
 * the code ("Siguiente familia"), so the family that just came in is gone.
 */
import { useCallback, useEffect, useState } from 'react'
import { Car } from 'lucide-react'

import { BadgeSistema, BotonSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { alertasDeHijo, type Servicio } from '@/lib/platform/ninos/checkin'
import { salonParaHijo, type SalonFila } from '@/lib/platform/ninos/familias-vista'
import { horaEnCaracas } from '@/lib/platform/ninos/fecha'
import { parseLlegando, type FamiliaLlegando } from '@/lib/platform/ninos/precheck'
import { createClient } from '@/lib/supabase/client'

import { useRefrescoVisible } from './use-refresco'

type Props = {
  servicio: Servicio
  salones: SalonFila[]
  /** Checks the family in; resolves to an error message, or null when done. */
  onLlegaron: (f: FamiliaLlegando) => Promise<string | null>
}

export function Llegando({ servicio, salones, onLlegaron }: Props) {
  const [familias, setFamilias] = useState<FamiliaLlegando[]>([])
  const [procesando, setProcesando] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})

  const cargar = useCallback(async () => {
    if (!servicio.turnoId) return
    const { data, error } = await createClient().rpc('ninos_prechecks_pendientes', {
      p_turno_id: servicio.turnoId,
      p_fecha: servicio.fecha,
    })
    // A failed read keeps the last list: the table can always search by hand.
    if (!error) setFamilias(parseLlegando(data))
  }, [servicio])

  useEffect(() => {
    // Fetch on mount and on service change; state is set after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar()
  }, [cargar])
  useRefrescoVisible(() => void cargar(), 30_000)

  async function llegaron(f: FamiliaLlegando) {
    setProcesando(f.padre.id)
    setErrores((x) => ({ ...x, [f.padre.id]: '' }))
    const error = await onLlegaron(f)
    setProcesando(null)
    if (error) setErrores((x) => ({ ...x, [f.padre.id]: error }))
  }

  if (!servicio.turnoId || familias.length === 0) return null

  return (
    <TarjetaSistema role="region" aria-label="Llegando" className="space-y-3 border-2 border-[var(--brand-primary)]/30 p-4 md:p-5">
      <div className="flex items-center gap-2">
        <Car className="h-5 w-5 text-[var(--brand-primary)]" aria-hidden />
        <TituloSistema nivel={4}>Llegando</TituloSistema>
        <BadgeSistema variante="info" tamaño="sm">
          {familias.length}
        </BadgeSistema>
      </div>
      <ul className="space-y-3">
        {familias.map((f) => {
          const nombrePadre = `${f.padre.nombre} ${f.padre.apellido}`
          const avisado = horaEnCaracas(f.avisadoAt || null)
          return (
            <li key={f.padre.id} data-testid={`llegando-${f.padre.id}`} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{nombrePadre}</p>
                  {avisado && (
                    <TextoSistema variante="sutil" tamaño="sm">
                      Avisó a las {avisado}
                    </TextoSistema>
                  )}
                </div>
                <BotonSistema
                  type="button"
                  tamaño="sm"
                  aria-label={`Llegaron: ${nombrePadre}`}
                  disabled={procesando !== null}
                  onClick={() => void llegaron(f)}
                >
                  {procesando === f.padre.id ? 'Registrando…' : 'Llegaron'}
                </BotonSistema>
              </div>
              <ul className="space-y-1.5">
                {f.hijos.map((h) => {
                  const sugerencia = salonParaHijo(h, salones, servicio.fecha)
                  const alertas = alertasDeHijo(h)
                  return (
                    <li key={h.id} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-foreground">
                          {h.nombre} {h.apellido}
                        </span>
                        <span className="text-muted-foreground">
                          → {sugerencia.tipo === 'ninguno' ? 'sin salón sugerido' : sugerencia.salon.nombre}
                        </span>
                        {h.desde_casa && (
                          <BadgeSistema variante="info" tamaño="sm">
                            Registrado desde casa
                          </BadgeSistema>
                        )}
                      </div>
                      {alertas.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {alertas.map((a) => (
                            <BadgeSistema key={a} variante="error" tamaño="sm">
                              {a}
                            </BadgeSistema>
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {errores[f.padre.id] && (
                <p role="alert" className="text-sm text-red-500 dark:text-red-400">
                  {errores[f.padre.id]}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </TarjetaSistema>
  )
}

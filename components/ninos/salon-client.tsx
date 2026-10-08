'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

import { Label } from '@/components/ui/label'
import type { Servicio, TurnoFila } from '@/lib/platform/ninos/checkin'
import { horaEnCaracas } from '@/lib/platform/ninos/fecha'
import { alertasDeLista, edadOGrado, type FilaLista } from '@/lib/platform/ninos/salon'
import { createClient } from '@/lib/supabase/client'

import { SELECT_CLASS } from './campos-nino'
import { RetiroPanel } from './retiro-panel'
import { SelectorServicio } from './selector-servicio'
import { useRefrescoVisible } from './use-refresco'

export type SalonOpcion = { id: string; nombre: string }

type Props = {
  salones: SalonOpcion[]
  turnos: TurnoFila[]
  servicio: Servicio
  salonId: string | null
  /** Check-out is offered only to whoever may operate (Anfitriones, coordinators, admin). */
  puedeOperar: boolean
}

function urlSalon(s: Servicio, salonId: string | null): string {
  return `/ninos/salon?turno=${encodeURIComponent(s.turnoId ?? '')}&fecha=${s.fecha}&salon=${encodeURIComponent(salonId ?? '')}`
}

/** Live list of the children present in one room, with their alerts; check-out for operators. */
export function SalonClient({ salones, turnos, servicio: servicioInicial, salonId: salonInicial, puedeOperar }: Props) {
  const router = useRouter()
  const [servicio, setServicio] = useState<Servicio>(servicioInicial)
  const [salonId, setSalonId] = useState<string | null>(salonInicial)
  const [filas, setFilas] = useState<FilaLista[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!servicio.turnoId || !salonId) return
    const { data, error: err } = await createClient().rpc('ninos_lista_salon', {
      p_salon_id: salonId,
      p_fecha: servicio.fecha,
      p_turno_id: servicio.turnoId,
    })
    if (err) {
      setError('No se pudo cargar la lista del salón.')
      return
    }
    setError(null)
    setFilas((data ?? []) as FilaLista[])
  }, [servicio, salonId])

  useEffect(() => {
    // Fetch on mount and on service/room change; state is set after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar()
  }, [cargar])
  useRefrescoVisible(() => void cargar())

  function cambiar(s: Servicio, salon: string | null) {
    setServicio(s)
    setSalonId(salon)
    setFilas(null)
    router.replace(urlSalon(s, salon))
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold md:text-2xl">Salones</h1>
      <div className="space-y-4 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-end md:gap-4 md:space-y-0">
        <SelectorServicio idPrefijo="salon" turnos={turnos} servicio={servicio} onCambiar={(s) => cambiar(s, salonId)} />
        <div className="space-y-1">
          <Label htmlFor="salon-salon">Salón</Label>
          <select
            id="salon-salon"
            className={SELECT_CLASS}
            value={salonId ?? ''}
            onChange={(e) => cambiar(servicio, e.target.value || null)}
          >
            {salones.length === 0 && <option value="">Sin salones</option>}
            {salones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={puedeOperar ? 'space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-6 lg:space-y-0' : 'space-y-4'}>
        <section className="min-w-0 space-y-2" aria-label="Niños en el salón">
          <h2 className="text-sm font-semibold">
            {filas ? `${filas.length} ${filas.length === 1 ? 'niño presente' : 'niños presentes'}` : 'Cargando…'}
          </h2>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {filas && filas.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay niños en este salón.</p>}
          {filas && filas.length > 0 && (
            <div
              aria-hidden
              className="hidden gap-4 border-b px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_minmax(0,1.6fr)]"
            >
              <span>Niño</span>
              <span>Edad · ingreso</span>
              <span>Código</span>
              <span>Alertas</span>
            </div>
          )}
          <ul className="space-y-2">
            {(filas ?? []).map((f) => {
              const alertas = alertasDeLista(f)
              return (
                <li
                  key={f.nino_id}
                  data-testid={`fila-${f.nino_id}`}
                  className="space-y-1 rounded-lg border p-3 lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_minmax(0,1.6fr)] lg:items-start lg:gap-4 lg:space-y-0"
                >
                  <div className="flex items-start justify-between gap-2 lg:contents">
                    <div className="min-w-0 lg:contents">
                      <p className="break-words font-semibold">
                        {f.nombre} {f.apellido}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[edadOGrado(f, servicio.fecha), `ingresó ${horaEnCaracas(f.entrada_at)}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="font-mono text-2xl font-bold tracking-widest" aria-label={`Código ${f.codigo}`}>
                      {f.codigo}
                    </span>
                  </div>
                  <div className="min-w-0 space-y-1 lg:flex lg:flex-wrap lg:gap-1.5 lg:space-y-0">
                    {alertas.map((a) => (
                      <p
                        key={a.texto}
                        className={
                          a.grave
                            ? 'flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1 font-semibold text-destructive lg:rounded-full lg:text-xs'
                            : 'flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300 lg:rounded-full lg:bg-amber-100 lg:px-2 lg:py-1 lg:text-xs dark:lg:bg-amber-950'
                        }
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0 lg:h-3 lg:w-3" aria-hidden />
                        {a.texto}
                      </p>
                    ))}
                    {f.habitos && <p className="w-full text-sm text-muted-foreground lg:text-xs">Hábitos: {f.habitos}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        {puedeOperar && (
          <section className="min-w-0 space-y-2 rounded-lg border p-3 md:p-4 lg:sticky lg:top-4">
            <h2 className="text-sm font-semibold">Retiro</h2>
            <RetiroPanel servicio={servicio} onRetirado={() => void cargar()} />
          </section>
        )}
      </div>
    </div>
  )
}

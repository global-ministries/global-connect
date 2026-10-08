'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Baby } from 'lucide-react'

import { BadgeSistema, SelectSistema, SkeletonSistema, TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import type { Servicio, TurnoFila } from '@/lib/platform/ninos/checkin'
import { horaEnCaracas } from '@/lib/platform/ninos/fecha'
import { alertasDeLista, edadOGrado, type FilaLista } from '@/lib/platform/ninos/salon'
import { createClient } from '@/lib/supabase/client'

import { EncabezadoNinos } from './encabezado-ninos'
import { EstadoVacio } from './estado-vacio'
import { RetiroPanel } from './retiro-panel'
import { SelectorServicio } from './selector-servicio'
import { useRefrescoVisible } from './use-refresco'

type Alerta = ReturnType<typeof alertasDeLista>[number]

/** One alert as an app badge: serious ones (allergies, special needs) in the error color, the rest as warnings. */
function AlertaBadge({ alerta }: { alerta: Alerta }) {
  return (
    <BadgeSistema
      variante={alerta.grave ? 'error' : 'warning'}
      tamaño="sm"
      className={cn('gap-1.5 whitespace-normal', alerta.grave && 'font-semibold text-destructive')}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {alerta.texto}
    </BadgeSistema>
  )
}

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

  const titulo = filas ? `${filas.length} ${filas.length === 1 ? 'niño presente' : 'niños presentes'}` : 'Cargando…'
  const nombreSalon = salones.find((s) => s.id === salonId)?.nombre

  return (
    <>
      <EncabezadoNinos titulo="Salones" subtitulo="Lista en vivo de los niños presentes y sus alertas." />

      <div className="space-y-4 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-end md:gap-4 md:space-y-0">
        <SelectorServicio idPrefijo="salon" turnos={turnos} servicio={servicio} onCambiar={(s) => cambiar(s, salonId)} />
        <SelectSistema
          id="salon-salon"
          label="Salón"
          opciones={salones.length === 0 ? [{ valor: '', etiqueta: 'Sin salones' }] : salones.map((s) => ({ valor: s.id, etiqueta: s.nombre }))}
          value={salonId ?? ''}
          onValueChange={(v) => cambiar(servicio, v || null)}
        />
      </div>

      <div className={puedeOperar ? 'space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-6 lg:space-y-0' : 'space-y-6'}>
        <section className="min-w-0 space-y-3" aria-label="Niños en el salón">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <TituloSistema nivel={3}>{titulo}</TituloSistema>
            {nombreSalon && <span className="text-sm text-muted-foreground">{nombreSalon}</span>}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-500 dark:text-red-400">
              {error}
            </p>
          )}
          {filas === null && !error && (
            <TarjetaSistema className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <SkeletonSistema key={i} alto="40px" />
              ))}
            </TarjetaSistema>
          )}
          {filas && filas.length === 0 && <EstadoVacio icono={Baby} titulo="Aún no hay niños en este salón." />}

          {filas && filas.length > 0 && (
            <>
              {/* Phones and tablets: one card per child. */}
              <ul className="space-y-3 lg:hidden">
                {filas.map((f) => {
                  const alertas = alertasDeLista(f)
                  return (
                    <li key={f.nino_id} data-testid={`fila-${f.nino_id}`}>
                      <TarjetaSistema className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-words text-[15px] font-semibold text-foreground">
                              {f.nombre} {f.apellido}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {[edadOGrado(f, servicio.fecha), `ingresó ${horaEnCaracas(f.entrada_at)}`].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <span className="font-mono text-2xl font-bold tracking-widest text-[var(--brand-primary)]" aria-label={`Código ${f.codigo}`}>
                            {f.codigo}
                          </span>
                        </div>
                        {(alertas.length > 0 || f.habitos) && (
                          <div className="flex flex-wrap gap-1.5">
                            {alertas.map((a) => (
                              <AlertaBadge key={a.texto} alerta={a} />
                            ))}
                            {f.habitos && <p className="w-full text-sm text-muted-foreground">Hábitos: {f.habitos}</p>}
                          </div>
                        )}
                      </TarjetaSistema>
                    </li>
                  )
                })}
              </ul>

              {/* Desktop: the app's table pattern (Dream Team servidores). */}
              <TarjetaSistema className="hidden overflow-hidden p-0 lg:block">
                <table aria-label="Niños presentes" className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {['Niño', 'Edad · ingreso', 'Código', 'Alertas'].map((c) => (
                        <th key={c} scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filas.map((f) => {
                      const alertas = alertasDeLista(f)
                      return (
                        <tr key={f.nino_id} data-testid={`fila-tabla-${f.nino_id}`} className="align-top hover:bg-accent/50">
                          <td className="px-4 py-3 text-[15px] font-medium text-foreground">
                            {f.nombre} {f.apellido}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                            {[edadOGrado(f, servicio.fecha), `ingresó ${horaEnCaracas(f.entrada_at)}`].filter(Boolean).join(' · ')}
                          </td>
                          <td className="px-4 py-3 font-mono text-xl font-bold tracking-widest text-[var(--brand-primary)]">{f.codigo}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {alertas.map((a) => (
                                <AlertaBadge key={a.texto} alerta={a} />
                              ))}
                              {f.habitos && <p className="w-full text-xs text-muted-foreground">Hábitos: {f.habitos}</p>}
                              {alertas.length === 0 && !f.habitos && <span className="text-sm text-muted-foreground">—</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TarjetaSistema>
            </>
          )}
        </section>

        {puedeOperar && (
          <TarjetaSistema className="min-w-0 space-y-3 p-4 md:p-6 lg:sticky lg:top-20">
            <TituloSistema nivel={3}>Retiro</TituloSistema>
            <RetiroPanel servicio={servicio} onRetirado={() => void cargar()} />
          </TarjetaSistema>
        )}
      </div>
    </>
  )
}

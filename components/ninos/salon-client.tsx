'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Baby } from 'lucide-react'

import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { SelectSistema, SkeletonSistema, TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import type { Servicio, TurnoFila } from '@/lib/platform/ninos/checkin'
import { horaEnCaracas } from '@/lib/platform/ninos/fecha'
import { alertasDeLista, edadOGrado, type FilaLista } from '@/lib/platform/ninos/salon'
import {
  cargarEstadoSalon,
  opcionesPestanas,
  textoEsperado,
  textoRetiradoSalon,
  type EstadoSalon,
  type Pestana,
} from '@/lib/platform/ninos/salon-estados'
import { cargarSalonVoluntarios, type SalonVoluntarios } from '@/lib/platform/ninos/salon-voluntarios'
import { createClient } from '@/lib/supabase/client'

import { ChipCustodia } from './custodia/chip-custodia'
import { useCustodia } from './custodia/use-custodia'
import { EncabezadoNinos } from './encabezado-ninos'
import { EstadoVacio } from './estado-vacio'
import { RetiroPanel } from './retiro-panel'
import { AlertaBadge } from './salon/alerta-badge'
import { HojaNino, type SeleccionSalon } from './salon/hoja-nino'
import { ListaEstado } from './salon/lista-estado'
import { VoluntariosSalon } from './salon/voluntarios-salon'
import { SelectorServicio } from './selector-servicio'
import { useRefrescoVisible } from './use-refresco'

/** The child's name; a button that opens their sheet when the salón data is there. */
function NombreNino({ fila, onAbrir, className }: { fila: FilaLista; onAbrir: (() => void) | null; className: string }) {
  const nombre = `${fila.nombre} ${fila.apellido}`
  if (!onAbrir) return <span className={className}>{nombre}</span>
  return (
    <button type="button" aria-label={`Abrir ${nombre}`} onClick={onAbrir} className={`focus-ring rounded-md text-left hover:underline ${className}`}>
      {nombre}
    </button>
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

/**
 * Live list of one room: Esperados · Aquí · Retirados (T2b of
 * odd/tasks/ninos-checkin-pco.md, artboard 06-salon-celular) with a sheet per
 * child (move to another salón, pickup, «Llegó»), the volunteers of today and
 * check-out for operators. Without ninos_salon_estado it is the Aquí list as
 * before. A child with an active custody restriction carries the «Custodia»
 * icon and its sheet says who not to hand over to (T2e, S9.2).
 */
export function SalonClient({ salones, turnos, servicio: servicioInicial, salonId: salonInicial, puedeOperar }: Props) {
  const router = useRouter()
  const [servicio, setServicio] = useState<Servicio>(servicioInicial)
  const [salonId, setSalonId] = useState<string | null>(salonInicial)
  const [filas, setFilas] = useState<FilaLista[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Today's volunteers of the room (read-only); null hides the block, as before T2c.
  const [voluntarios, setVoluntarios] = useState<SalonVoluntarios | null>(null)
  // Esperados, Retirados, moves and destinations; null shows only Aquí, as before T2b.
  const [estado, setEstado] = useState<EstadoSalon | null>(null)
  const [pestana, setPestana] = useState<Pestana>('aqui')
  const [seleccion, setSeleccion] = useState<SeleccionSalon | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!servicio.turnoId || !salonId) return
    const cliente = createClient()
    const [{ data, error: err }, datosVoluntarios, datosEstado] = await Promise.all([
      cliente.rpc('ninos_lista_salon', {
        p_salon_id: salonId,
        p_fecha: servicio.fecha,
        p_turno_id: servicio.turnoId,
      }),
      cargarSalonVoluntarios(cliente, salonId, servicio.turnoId, servicio.fecha),
      cargarEstadoSalon(cliente, salonId, servicio.turnoId, servicio.fecha),
    ])
    setVoluntarios(datosVoluntarios)
    setEstado(datosEstado)
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
    setVoluntarios(null)
    setEstado(null)
    setSeleccion(null)
    setAviso(null)
    router.replace(urlSalon(s, salon))
  }

  function hecho(mensaje: string) {
    setSeleccion(null)
    setAviso(mensaje)
    void cargar()
  }

  /** «Retirar» from the sheet: the pickup by code of this screen, focused. */
  function retirar(f: FilaLista) {
    setSeleccion(null)
    setAviso(`Escribe el código ${f.codigo} en Retiro y elige quién retira a ${f.nombre}.`)
    // After the sheet gives the focus back, move it to the code field.
    window.setTimeout(() => {
      const campo = document.getElementById('retiro-codigo')
      campo?.scrollIntoView?.({ block: 'center' })
      campo?.focus()
    }, 0)
  }

  const idsCustodia = useMemo(
    () => [...(filas ?? []).map((f) => f.nino_id), ...(estado?.esperados ?? []).map((f) => f.nino_id)],
    [filas, estado],
  )
  const custodia = useCustodia(idsCustodia)
  const abrirAqui = estado ? (f: FilaLista) => () => setSeleccion({ tipo: 'aqui', fila: f }) : null

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
          {filas && voluntarios && <VoluntariosSalon datos={voluntarios} ninos={filas.length} />}
          {filas && estado && (
            <ControlSegmentado
              etiqueta="Mostrar"
              opciones={opcionesPestanas(estado, filas.length)}
              valor={pestana}
              onCambio={setPestana}
              className="flex w-full md:w-auto [&>button]:flex-1"
            />
          )}
          {aviso && (
            <p role="status" className="rounded-md border border-success/20 bg-success/10 p-3 text-sm font-medium text-success-text">
              {aviso}
            </p>
          )}
          {estado && pestana === 'esperados' && (
            <ListaEstado
              etiqueta="Esperados"
              vacio="No hay más niños avisados para este salón."
              filas={estado.esperados.map((f) => ({
                id: f.nino_id,
                nombre: `${f.nombre} ${f.apellido}`,
                detalle: textoEsperado(f),
                custodia: (custodia[f.nino_id]?.length ?? 0) > 0,
              }))}
              onAbrir={(id) => {
                const f = estado.esperados.find((x) => x.nino_id === id)
                if (f) setSeleccion({ tipo: 'esperado', fila: f })
              }}
            />
          )}
          {estado && pestana === 'retirados' && (
            <ListaEstado
              etiqueta="Retirados"
              vacio="Nadie ha salido todavía."
              filas={estado.retirados.map((f) => ({ id: f.checkinId, nombre: `${f.nombre} ${f.apellido}`, detalle: textoRetiradoSalon(f) }))}
              onAbrir={(id) => {
                const f = estado.retirados.find((x) => x.checkinId === id)
                if (f) setSeleccion({ tipo: 'retirado', fila: f })
              }}
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
          {(pestana === 'aqui' || !estado) && filas === null && !error && (
            <TarjetaSistema className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <SkeletonSistema key={i} alto="40px" />
              ))}
            </TarjetaSistema>
          )}
          {(pestana === 'aqui' || !estado) && filas && filas.length === 0 && <EstadoVacio icono={Baby} titulo="Aún no hay niños en este salón." />}

          {(pestana === 'aqui' || !estado) && filas && filas.length > 0 && (
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
                            <p className="break-words text-base font-semibold text-foreground">
                              <NombreNino fila={f} onAbrir={abrirAqui ? abrirAqui(f) : null} className="break-words" />
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {[edadOGrado(f, servicio.fecha), `ingresó ${horaEnCaracas(f.entrada_at)}`].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <span className="font-mono text-2xl font-bold tracking-widest text-[var(--brand-primary)]" aria-label={`Código ${f.codigo}`}>
                            {f.codigo}
                          </span>
                        </div>
                        {(alertas.length > 0 || f.habitos || (custodia[f.nino_id]?.length ?? 0) > 0) && (
                          <div className="flex flex-wrap gap-1.5">
                            <ChipCustodia restricciones={custodia[f.nino_id] ?? []} />
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
                          <td className="px-4 py-3 text-base font-medium text-foreground">
                            <NombreNino fila={f} onAbrir={abrirAqui ? abrirAqui(f) : null} className="" />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                            {[edadOGrado(f, servicio.fecha), `ingresó ${horaEnCaracas(f.entrada_at)}`].filter(Boolean).join(' · ')}
                          </td>
                          <td className="px-4 py-3 font-mono text-xl font-bold tracking-widest text-[var(--brand-primary)]">{f.codigo}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <ChipCustodia restricciones={custodia[f.nino_id] ?? []} />
                              {alertas.map((a) => (
                                <AlertaBadge key={a.texto} alerta={a} />
                              ))}
                              {f.habitos && <p className="w-full text-xs text-muted-foreground">Hábitos: {f.habitos}</p>}
                              {alertas.length === 0 && !f.habitos && !custodia[f.nino_id]?.length && (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
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

      {estado && salonId && (
        <HojaNino
          seleccion={seleccion}
          onCerrar={() => setSeleccion(null)}
          servicio={servicio}
          salonId={salonId}
          estado={estado}
          puedeRetirar={puedeOperar && estado.puedeOperar}
          onHecho={hecho}
          onRetirar={retirar}
          custodia={seleccion && seleccion.tipo !== 'retirado' ? (custodia[seleccion.fila.nino_id] ?? []) : []}
        />
      )}
    </>
  )
}

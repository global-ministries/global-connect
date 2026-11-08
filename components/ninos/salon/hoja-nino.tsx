'use client'

/**
 * Niños › Salón, the child sheet (odd/tasks/ninos-checkin-pco.md, T2b, S6,
 * S9.4; artboard design/ninos-checkin-pco/06-salon-celular.html, B). One
 * `DetalleResponsivo` per child:
 *  - Aquí: the alerts (as the list), «Mover a otro salón» (one step: the
 *    destinations open under it and a tap moves; same code; T2f, S9.5: only
 *    the salones that correspond to the child's age or grade) and «Retirar»,
 *    which hands over to the pickup by code of this screen (RetiroPanel).
 *  - Esperado: who sent the notice and «Llegó al salón» (S9.4), for whoever
 *    sees the salón (L32: coordinators, Líderes, Anfitriones).
 *  - Retirado: when and with whom.
 * Not here (other tasks): «Avisar al representante» (T4), custody (T2e).
 */
import { useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronRight, LogOut } from 'lucide-react'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import type { Servicio } from '@/lib/platform/ninos/checkin'
import { horaEnCaracas } from '@/lib/platform/ninos/fecha'
import { alertasDeLista, edadOGrado, type FilaLista } from '@/lib/platform/ninos/salon'
import {
  destinosDelNino,
  moverDeSalon,
  registrarLlegada,
  textoDestino,
  textoEsperado,
  textoMovimiento,
  textoRetiradoSalon,
  type EstadoSalon,
  type FilaEsperado,
  type FilaRetirado,
} from '@/lib/platform/ninos/salon-estados'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

import { AlertaBadge } from './alerta-badge'

export type SeleccionSalon =
  | { readonly tipo: 'aqui'; readonly fila: FilaLista }
  | { readonly tipo: 'esperado'; readonly fila: FilaEsperado }
  | { readonly tipo: 'retirado'; readonly fila: FilaRetirado }

type Props = {
  readonly seleccion: SeleccionSalon | null
  readonly onCerrar: () => void
  readonly servicio: Servicio
  readonly salonId: string
  readonly estado: EstadoSalon
  /** The pickup by code is on this screen (whoever may operate). */
  readonly puedeRetirar: boolean
  /** After a move or a «Llegó»: the sentence to announce. */
  readonly onHecho: (mensaje: string) => void
  readonly onRetirar: (fila: FilaLista) => void
}

const nombreDe = (f: { nombre: string; apellido: string }) => `${f.nombre} ${f.apellido}`.trim()

function Alertas({ fila }: { fila: Parameters<typeof alertasDeLista>[0] }) {
  const alertas = alertasDeLista(fila)
  if (alertas.length === 0 && !fila.habitos) return null
  return (
    <section aria-label="Alertas" className="flex flex-wrap gap-1.5">
      {alertas.map((a) => (
        <AlertaBadge key={a.texto} alerta={a} />
      ))}
      {fila.habitos && <p className="w-full text-sm text-muted-foreground">Hábitos: {fila.habitos}</p>}
    </section>
  )
}

/** One action of the sheet: icon, title, one line of consequence. */
function Accion({
  icono: Icono,
  titulo,
  detalle,
  expandida,
  onClick,
}: {
  icono: typeof LogOut
  titulo: string
  detalle: string
  expandida?: boolean
  onClick: () => void
}) {
  const Flecha = expandida ? ChevronDown : ChevronRight
  return (
    <button
      type="button"
      aria-expanded={expandida}
      onClick={onClick}
      className="focus-ring flex min-h-14 w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-accent/50 active:bg-accent"
    >
      <Icono className="size-5 shrink-0 text-brand-text" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-foreground">{titulo}</span>
        <span className="block text-[13px] text-muted-foreground">{detalle}</span>
      </span>
      <Flecha className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

export function HojaNino({ seleccion, onCerrar, servicio, salonId, estado, puedeRetirar, onHecho, onRetirar }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [abreMover, setAbreMover] = useState(false)

  function cerrar() {
    if (enviando) return
    setError(null)
    setAbreMover(false)
    onCerrar()
  }

  async function mover(fila: FilaLista, destinoId: string) {
    if (!servicio.turnoId) return
    setEnviando(true)
    setError(null)
    const r = await moverDeSalon(createClient(), { ninoId: fila.nino_id, turnoId: servicio.turnoId, fecha: servicio.fecha, salonDestinoId: destinoId })
    setEnviando(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
    setAbreMover(false)
    onHecho(`${nombreDe(fila)} ahora está en ${r.salonDestino}. Su código ${r.codigo || fila.codigo} sigue sirviendo.`)
  }

  async function llego(fila: FilaEsperado) {
    if (!servicio.turnoId) return
    setEnviando(true)
    setError(null)
    const r = await registrarLlegada(createClient(), { ninoId: fila.nino_id, salonId, turnoId: servicio.turnoId, fecha: servicio.fecha })
    setEnviando(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
    onHecho(`${nombreDe(fila)} quedó en el salón con el código ${r.codigo}. Su representante lo ve en su teléfono.`)
  }

  const fila = seleccion?.fila
  const titulo = fila ? nombreDe(fila) : ''
  let descripcion = ''
  if (seleccion?.tipo === 'aqui') {
    const f = seleccion.fila
    descripcion = [edadOGrado(f, servicio.fecha), `código ${f.codigo}`, `aquí desde ${horaEnCaracas(f.entrada_at)}`].filter(Boolean).join(' · ')
  } else if (seleccion) {
    descripcion = edadOGrado(seleccion.fila, servicio.fecha)
  }
  const movimiento =
    seleccion?.tipo === 'aqui' ? [...estado.movimientos].reverse().find((m) => m.ninoId === seleccion.fila.nino_id && m.haciaId === salonId) : undefined
  const destinos = seleccion?.tipo === 'aqui' ? destinosDelNino(estado, seleccion.fila.nino_id) : []

  return (
    <DetalleResponsivo abierto={seleccion !== null} onCambioAbierto={(a) => !a && cerrar()} titulo={titulo} descripcion={descripcion || undefined}>
      {seleccion && (
        <div className="grid gap-5">
          {seleccion.tipo !== 'retirado' && <Alertas fila={seleccion.fila} />}

          {seleccion.tipo === 'aqui' && (
            <>
              {movimiento && <p className="text-sm text-muted-foreground">{textoMovimiento(movimiento, salonId)}</p>}
              {(estado.puedeOperar || puedeRetirar) && (
                <section aria-label="Acciones" className="grid gap-2">
                  {estado.puedeOperar && (
                    <>
                      <Accion
                        icono={ArrowLeftRight}
                        titulo="Mover a otro salón"
                        detalle="Un paso: su código sigue sirviendo"
                        expandida={abreMover}
                        onClick={() => setAbreMover((v) => !v)}
                      />
                      {abreMover && (
                        <div role="group" aria-label="Salones disponibles" className="grid gap-1.5 pl-2">
                          {destinos.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              {estado.destinos.length === 0
                                ? 'No hay otro salón de este campus al que puedas moverlo.'
                                : 'No hay otro salón para su edad o grado.'}
                            </p>
                          )}
                          {destinos.map((d) => {
                            const lleno = d.capacidad !== null && d.ocupados >= d.capacidad
                            return (
                              <button
                                key={d.id}
                                type="button"
                                disabled={enviando}
                                onClick={() => void mover(seleccion.fila, d.id)}
                                className="focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50 disabled:opacity-60"
                              >
                                <span className="min-w-0 truncate font-medium text-foreground">{d.nombre}</span>
                                <span className={cn('shrink-0 font-mono text-[13px] tabular-nums', lleno || !d.abierto ? 'text-warning-text' : 'text-muted-foreground')}>
                                  {textoDestino(d)}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}
                  {puedeRetirar && (
                    <>
                      <Accion icono={LogOut} titulo="Retirar" detalle="Con el código de la etiqueta del adulto" onClick={() => onRetirar(seleccion.fila)} />
                      <p className="pl-2 text-[13px] text-muted-foreground">
                        La etiqueta del adulto debe decir <span className="font-mono font-semibold tabular-nums text-foreground">{seleccion.fila.codigo}</span>.
                      </p>
                    </>
                  )}
                </section>
              )}
            </>
          )}

          {seleccion.tipo === 'esperado' && (
            <>
              <p className="text-sm text-foreground">
                {textoEsperado(seleccion.fila)}. Si llega directo al salón, regístralo aquí: queda registrado y su representante ve el código en su
                teléfono.
              </p>
              {estado.puedeLlegar ? (
                <BotonSistema type="button" tamaño="lg" className="w-full" cargando={enviando} disabled={enviando} onClick={() => void llego(seleccion.fila)}>
                  Llegó al salón
                </BotonSistema>
              ) : (
                <p className="text-sm text-muted-foreground">Su llegada se registra en la mesa.</p>
              )}
            </>
          )}

          {seleccion.tipo === 'retirado' && (
            <p className="text-sm text-foreground">
              {textoRetiradoSalon(seleccion.fila)} · código{' '}
              <span className="font-mono font-semibold tabular-nums">{seleccion.fila.codigo}</span>
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {error}
            </p>
          )}
        </div>
      )}
    </DetalleResponsivo>
  )
}

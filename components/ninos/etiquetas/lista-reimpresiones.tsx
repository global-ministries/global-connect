'use client'

/**
 * Niños › Etiquetas — «Reimpresiones de hoy» and «Historial» (artboard
 * design/ninos-checkin-pco/03-admin-etiquetas.html, `.rp`; T3b, S6 reprint
 * with audit, S10 "con motivo"). Each row: hour (and day in the history),
 * what was reprinted, the reason and note, who, station and código, and the
 * status the agent reported. The history reads a range of at most 31 days
 * (ninos_impresion_reimpresiones, as the user).
 */
import { useState, type FormEvent, type ReactElement } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { fechaCorta } from '@/lib/platform/ninos/eventos'
import { horaEnCaracas, hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import {
  ESTADOS_IMPRESION,
  ETIQUETA_MOTIVO,
  MAX_DIAS_HISTORIAL,
  cargarReimpresiones,
  validarRango,
  type Reimpresion,
} from '@/lib/platform/ninos/impresion-vista'
import { createClient } from '@/lib/supabase/client'

const quePieza = (r: Reimpresion) =>
  r.tipo === 'representante' ? `Recibo · ${r.ninos.join(', ') || 'representante'}` : `${r.nino ?? 'Niño'} · etiqueta del niño`

export function ListaReimpresiones({
  reimpresiones,
  etiqueta,
  conDia = false,
}: {
  readonly reimpresiones: readonly Reimpresion[]
  readonly etiqueta: string
  readonly conDia?: boolean
}): ReactElement {
  return (
    <ul aria-label={etiqueta} className="min-w-0">
      {reimpresiones.map((r) => {
        const estado = ESTADOS_IMPRESION[r.estado]
        return (
          <li key={r.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-3 py-2.5 text-[13px] [&+li]:border-t [&+li]:border-border/60">
            <span className="pt-px font-mono tabular-nums text-muted-foreground">
              {conDia ? `${fechaCorta(hoyEnCaracas(new Date(r.createdAt)))} · ` : ''}
              {horaEnCaracas(r.createdAt)}
            </span>
            <span className="grid min-w-0 gap-0.5">
              <b className="truncate text-[14px] font-semibold text-foreground">{quePieza(r)}</b>
              <span className="text-foreground">{[ETIQUETA_MOTIVO[r.motivo], r.nota].filter(Boolean).join(' · ')}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                <span className="min-w-0 truncate">
                  {r.quien ?? 'Alguien que ya no está'} · {r.estacion} · <span className="font-mono tabular-nums">{r.codigo}</span>
                </span>
                <PuntoEstado tono={estado.tono} etiqueta={r.estado === 'error' && r.error ? `${estado.texto}: ${r.error}` : estado.texto} />
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

const restarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** The history of a campus between two dates (default: the last 7 days). */
export function HistorialReimpresiones({ campusId, hoy }: { readonly campusId: string; readonly hoy: string }): ReactElement {
  const [desde, setDesde] = useState(restarDias(hoy, 6))
  const [hasta, setHasta] = useState(hoy)
  const [filas, setFilas] = useState<Reimpresion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function ver(e: FormEvent) {
    e.preventDefault()
    const invalido = validarRango(desde, hasta)
    setError(invalido)
    if (invalido) return
    setCargando(true)
    const cliente = createClient() as unknown as SupabaseClient
    const r = await cargarReimpresiones((nombre, args) => cliente.rpc(nombre, args), { campusId, desde, hasta })
    setCargando(false)
    if (r.ok) setFilas(r.data)
    else setError(r.message)
  }

  return (
    <section role="region" aria-label="Historial de reimpresiones" className="grid min-w-0 gap-3 border-t border-border p-3">
      <form className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" onSubmit={(e) => void ver(e)} noValidate>
        <InputSistema label="Desde" type="date" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} />
        <InputSistema label="Hasta" type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} />
        <BotonSistema type="submit" variante="outline" cargando={cargando} disabled={cargando}>
          Ver
        </BotonSistema>
      </form>
      <p className="text-[13px] text-muted-foreground">Hasta {MAX_DIAS_HISTORIAL} días por consulta.</p>
      {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
      {filas &&
        (filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hubo reimpresiones en esas fechas.</p>
        ) : (
          <div className="min-w-0 rounded-md border border-border">
            <ListaReimpresiones reimpresiones={filas} etiqueta="Reimpresiones del historial" conDia />
          </div>
        ))}
    </section>
  )
}

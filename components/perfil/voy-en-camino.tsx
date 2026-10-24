'use client'

/**
 * "Voy en camino" in Mis hijos (odd/tasks/ninos-precheck.md, P2): while a
 * service of today is in its window, the parent tells the check-in table the
 * family is on its way (ninos_precheck_avisar). Every child with a Niños ficha
 * comes preselected; children already checked in are skipped. Once sent, the
 * card shows "Avisado a la mesa" with a cancel. No code is ever shown here:
 * the table issues it when the children arrive.
 */
import { useState } from 'react'
import { Car, CheckCircle2, X } from 'lucide-react'

import { BotonSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { MiHijo } from '@/lib/platform/ninos/mis-hijos'
import {
  horaServicio,
  mensajeDeErrorPrecheck,
  type AvisoPrecheck,
  type MisPrechecks,
  type ServicioPrecheck,
} from '@/lib/platform/ninos/precheck'
import { createClient } from '@/lib/supabase/client'

type Props = {
  hijos: MiHijo[]
  prechecks: MisPrechecks
}

function etiquetaServicio(s: ServicioPrecheck, conCampus: boolean): string {
  return [s.nombre, horaServicio(s.hora), conCampus ? s.campus : ''].filter(Boolean).join(' · ')
}

export function VoyEnCamino({ hijos, prechecks }: Props) {
  const { servicios } = prechecks
  const [avisos, setAvisos] = useState<AvisoPrecheck[]>(prechecks.avisos)
  const [abierto, setAbierto] = useState(false)
  const [turnoId, setTurnoId] = useState(servicios[0]?.turnoId ?? '')
  const [desmarcados, setDesmarcados] = useState<Record<string, boolean>>({})
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (servicios.length === 0) return null

  const conCampus = new Set(servicios.map((s) => s.campus)).size > 1
  const nombreDe = (id: string) => hijos.find((h) => h.id === id)?.nombre ?? 'Niño'
  const avisoPendiente = avisos.find((a) => a.estado === 'pendiente' && servicios.some((s) => s.turnoId === a.turnoId))

  async function cancelar(turno: string) {
    setEnviando(true)
    setError(null)
    const { error: err } = await createClient().rpc('ninos_precheck_cancelar', { p_turno_id: turno })
    setEnviando(false)
    if (err) {
      setError(mensajeDeErrorPrecheck(err))
      return
    }
    setAvisos((xs) => xs.filter((a) => !(a.turnoId === turno && a.estado === 'pendiente')))
  }

  if (avisoPendiente) {
    const servicio = servicios.find((s) => s.turnoId === avisoPendiente.turnoId) as ServicioPrecheck
    const nombres = avisos
      .filter((a) => a.turnoId === servicio.turnoId && a.estado === 'pendiente')
      .map((a) => nombreDe(a.ninoId))
    return (
      <div
        role="status"
        aria-label="Aviso a la mesa"
        className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-green-500/20 bg-green-500/10 p-4"
      >
        <div className="flex min-w-0 items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700 dark:text-green-400" aria-hidden />
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold text-green-800 dark:text-green-300">Avisado a la mesa</p>
            <p className="break-words text-sm text-green-800 dark:text-green-300">
              {nombres.join(', ')} · {etiquetaServicio(servicio, conCampus)}
            </p>
            <TextoSistema variante="sutil" tamaño="sm">
              Al llegar, la mesa de Niños los recibe y te da el código.
            </TextoSistema>
            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        </div>
        <BotonSistema
          type="button"
          variante="outline"
          tamaño="sm"
          icono={X}
          disabled={enviando}
          onClick={() => void cancelar(servicio.turnoId)}
        >
          Cancelar aviso
        </BotonSistema>
      </div>
    )
  }

  if (!abierto) {
    return (
      <BotonSistema
        type="button"
        icono={Car}
        className="w-full sm:w-auto"
        onClick={() => {
          setError(null)
          setAbierto(true)
        }}
      >
        Voy en camino
      </BotonSistema>
    )
  }

  const ingresados = new Set(avisos.filter((a) => a.turnoId === turnoId && a.estado === 'ingresado').map((a) => a.ninoId))
  const candidatos = hijos.filter((h) => h.tiene_ficha && !ingresados.has(h.id))
  const elegidos = candidatos.filter((h) => !desmarcados[h.id]).map((h) => h.id)

  async function avisar() {
    setEnviando(true)
    setError(null)
    const { error: err } = await createClient().rpc('ninos_precheck_avisar', { p_turno_id: turnoId, p_nino_ids: elegidos })
    setEnviando(false)
    if (err) {
      setError(mensajeDeErrorPrecheck(err))
      return
    }
    setAvisos((xs) => [
      ...xs.filter((a) => !(a.turnoId === turnoId && elegidos.includes(a.ninoId))),
      ...elegidos.map((ninoId) => ({ ninoId, turnoId, estado: 'pendiente' as const })),
    ])
    setAbierto(false)
  }

  return (
    <TarjetaSistema role="region" aria-label="Voy en camino" className="space-y-4 p-4">
      <div className="space-y-1">
        <p className="text-[15px] font-semibold text-foreground">Voy en camino</p>
        <TextoSistema variante="sutil" tamaño="sm">
          Avisa a la mesa de Niños que vienen: al llegar solo confirman y reciben el código.
        </TextoSistema>
      </div>

      {servicios.length === 1 ? (
        <p className="text-sm font-medium text-foreground">{etiquetaServicio(servicios[0], conCampus)}</p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Servicio</legend>
          {servicios.map((s) => (
            <label key={s.turnoId} className="flex min-h-[44px] cursor-pointer items-center gap-3 text-foreground">
              <input
                type="radio"
                name="voy-en-camino-servicio"
                className="h-5 w-5 shrink-0 accent-[var(--brand-primary)]"
                checked={turnoId === s.turnoId}
                onChange={() => {
                  setTurnoId(s.turnoId)
                  setDesmarcados({})
                }}
              />
              {etiquetaServicio(s, conCampus)}
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-foreground">¿Quiénes vienen?</legend>
        {candidatos.map((h) => {
          const nombre = `${h.nombre} ${h.apellido}`
          return (
            <label key={h.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 text-foreground">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 rounded accent-[var(--brand-primary)]"
                aria-label={nombre}
                checked={!desmarcados[h.id]}
                onChange={(e) => setDesmarcados((x) => ({ ...x, [h.id]: !e.target.checked }))}
              />
              {nombre}
            </label>
          )
        })}
        {hijos
          .filter((h) => ingresados.has(h.id))
          .map((h) => (
            <TextoSistema key={h.id} variante="sutil" tamaño="sm">
              {h.nombre} ya ingresó.
            </TextoSistema>
          ))}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <BotonSistema type="button" icono={Car} disabled={enviando || elegidos.length === 0} onClick={() => void avisar()}>
          {enviando ? 'Avisando…' : 'Avisar a la mesa'}
        </BotonSistema>
        <BotonSistema type="button" variante="ghost" disabled={enviando} onClick={() => setAbierto(false)}>
          Ahora no
        </BotonSistema>
      </div>
    </TarjetaSistema>
  )
}

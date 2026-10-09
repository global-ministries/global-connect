'use client'

import { useState } from 'react'
import { Phone, RotateCcw, Search } from 'lucide-react'

import { BadgeSistema, BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import type { Servicio } from '@/lib/platform/ninos/checkin'
import {
  agruparRetiro,
  mensajeDeErrorRetiro,
  textoRetirado,
  validarCodigo,
  type FilaCodigo,
  type Retiro,
} from '@/lib/platform/ninos/retiro'
import { createClient } from '@/lib/supabase/client'

import { registrarRetiroApi } from './api-visita'

type Props = {
  servicio: Servicio
  /** Called after a confirmed check-out (e.g. to refresh a room list). */
  onRetirado?: () => void
}

/** Check-out by code: type the code, see the children and pickup people, confirm who picks up. */
export function RetiroPanel({ servicio, onRetirado }: Props) {
  const [texto, setTexto] = useState('')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [retiro, setRetiro] = useState<Retiro | null>(null)
  const [retiradoPor, setRetiradoPor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)

  async function buscar(c: string) {
    if (!servicio.turnoId) return
    setCargando(true)
    const { data, error: err } = await createClient().rpc('ninos_buscar_codigo', {
      p_codigo: c,
      p_turno_id: servicio.turnoId,
      p_fecha: servicio.fecha,
    })
    setCargando(false)
    if (err) {
      setError(mensajeDeErrorRetiro(err))
      return
    }
    const filas = (data ?? []) as unknown as FilaCodigo[]
    if (filas.length === 0) {
      setRetiro(null)
      setError(`No hay niños con el código ${c} en este servicio. Revisa el número y el servicio elegido.`)
      return
    }
    setCodigo(c)
    setRetiro(agruparRetiro(filas))
  }

  function onBuscar(e: React.FormEvent) {
    e.preventDefault()
    setHecho(null)
    setError(null)
    const v = validarCodigo(texto)
    if (!v.ok) {
      setRetiro(null)
      setError(v.error)
      return
    }
    void buscar(v.codigo)
  }

  async function confirmar() {
    if (!codigo || !servicio.turnoId) return
    if (!retiradoPor.trim()) {
      setError('Escribe quién retira al niño.')
      return
    }
    setError(null)
    setCargando(true)
    const { data, error: err } = await registrarRetiroApi({
      codigo,
      turnoId: servicio.turnoId,
      fecha: servicio.fecha,
      retiradoPor: retiradoPor.trim(),
    })
    setCargando(false)
    if (err) {
      setError(mensajeDeErrorRetiro(err))
      return
    }
    setHecho(`Retiro registrado: ${(data ?? []).length} niño(s) con el código ${codigo}.`)
    setRetiradoPor('')
    onRetirado?.()
    await buscar(codigo)
  }

  function otroCodigo() {
    setTexto('')
    setCodigo(null)
    setRetiro(null)
    setHecho(null)
    setError(null)
  }

  return (
    <section className="space-y-4" aria-label="Retiro">
      <form className="flex items-end gap-2" onSubmit={onBuscar}>
        <div className="min-w-0 flex-1">
          <InputSistema
            id="retiro-codigo"
            label="Código de seguridad"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="1234"
            className="font-mono text-2xl tracking-widest"
            value={texto}
            onChange={(e) => setTexto(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <BotonSistema type="submit" icono={Search} disabled={cargando || !servicio.turnoId}>
          Buscar
        </BotonSistema>
      </form>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
      {hecho && (
        <p role="status" className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm font-medium text-green-700 dark:text-green-400">
          {hecho}
        </p>
      )}

      {retiro && (
        <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
          <ul className="divide-y divide-border" aria-label="Niños con este código">
            {retiro.adentro.map((f) => (
              <li key={f.checkin_id} className="flex flex-wrap items-center justify-between gap-2 py-2 font-medium text-foreground">
                <span>
                  {f.nombre} {f.apellido}
                </span>
                <span className="text-sm font-normal text-muted-foreground">— {f.salon}</span>
              </li>
            ))}
            {retiro.retirados.map((f) => (
              <li key={f.checkin_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-muted-foreground">
                <span>
                  {f.nombre} {f.apellido}
                </span>
                <BadgeSistema variante="default" tamaño="sm">
                  {textoRetirado(f)}
                </BadgeSistema>
              </li>
            ))}
          </ul>

          {retiro.adentro.length > 0 && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Autorizados para retirar</p>
                {retiro.autorizados.length === 0 ? (
                  <BadgeSistema variante="warning" tamaño="sm">
                    Sin personas autorizadas registradas.
                  </BadgeSistema>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {retiro.autorizados.map((a) => (
                      <li key={`${a.nombre}-${a.telefono ?? ''}`} className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium text-foreground">{a.nombre}</span>
                        {a.relacion && <span className="text-muted-foreground">({a.relacion})</span>}
                        {a.telefono && (
                          <a href={`tel:${a.telefono}`} className="inline-flex min-h-[44px] items-center gap-1 text-[var(--brand-primary)] hover:underline">
                            <Phone className="h-3 w-3" aria-hidden />
                            {a.telefono}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <InputSistema
                id="retiro-quien"
                label="¿Quién retira?"
                placeholder="Nombre de quien retira"
                value={retiradoPor}
                onChange={(e) => setRetiradoPor(e.target.value)}
              />
              <BotonSistema type="button" tamaño="lg" className="w-full" disabled={cargando} onClick={() => void confirmar()}>
                {cargando ? 'Registrando…' : 'Confirmar retiro'}
              </BotonSistema>
            </>
          )}
          <BotonSistema type="button" variante="ghost" tamaño="sm" icono={RotateCcw} onClick={otroCodigo}>
            Otro código
          </BotonSistema>
        </div>
      )}
    </section>
  )
}

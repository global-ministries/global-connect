'use client'

import { useState } from 'react'
import { Phone } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    const { data, error: err } = await createClient().rpc('ninos_checkout', {
      p_codigo: codigo,
      p_turno_id: servicio.turnoId,
      p_fecha: servicio.fecha,
      p_retirado_por: retiradoPor.trim(),
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
    <section className="space-y-3" aria-label="Retiro">
      <form className="flex items-end gap-2" onSubmit={onBuscar}>
        <div className="flex-1 space-y-1">
          <Label htmlFor="retiro-codigo">Código de seguridad</Label>
          <Input
            id="retiro-codigo"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="1234"
            className="h-12 font-mono text-2xl tracking-widest"
            value={texto}
            onChange={(e) => setTexto(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <Button type="submit" className="h-12" disabled={cargando || !servicio.turnoId}>
          Buscar
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {hecho && (
        <p role="status" className="text-sm font-medium text-green-700 dark:text-green-300">
          {hecho}
        </p>
      )}

      {retiro && (
        <div className="space-y-3 rounded-lg border p-3">
          <ul className="space-y-1" aria-label="Niños con este código">
            {retiro.adentro.map((f) => (
              <li key={f.checkin_id} className="font-medium">
                {f.nombre} {f.apellido} <span className="text-sm font-normal text-muted-foreground">— {f.salon}</span>
              </li>
            ))}
            {retiro.retirados.map((f) => (
              <li key={f.checkin_id} className="text-muted-foreground">
                {f.nombre} {f.apellido} <span className="text-sm">— {textoRetirado(f)}</span>
              </li>
            ))}
          </ul>

          {retiro.adentro.length > 0 && (
            <>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Autorizados para retirar</p>
                {retiro.autorizados.length === 0 ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">Sin personas autorizadas registradas.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {retiro.autorizados.map((a) => (
                      <li key={`${a.nombre}-${a.telefono ?? ''}`} className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium">{a.nombre}</span>
                        {a.relacion && <span className="text-muted-foreground">({a.relacion})</span>}
                        {a.telefono && (
                          <a href={`tel:${a.telefono}`} className="inline-flex items-center gap-1 underline">
                            <Phone className="h-3 w-3" aria-hidden />
                            {a.telefono}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="retiro-quien">¿Quién retira?</Label>
                <Input
                  id="retiro-quien"
                  className="h-11"
                  placeholder="Nombre de quien retira"
                  value={retiradoPor}
                  onChange={(e) => setRetiradoPor(e.target.value)}
                />
              </div>
              <Button className="h-12 w-full text-base" disabled={cargando} onClick={() => void confirmar()}>
                {cargando ? 'Registrando…' : 'Confirmar retiro'}
              </Button>
            </>
          )}
          <button type="button" className="text-sm text-muted-foreground underline" onClick={otroCodigo}>
            Otro código
          </button>
        </div>
      )}
    </section>
  )
}

'use client'

import { useState } from 'react'
import { Phone, RotateCcw, Search } from 'lucide-react'

import { BadgeSistema, BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import type { Servicio } from '@/lib/platform/ninos/checkin'
import {
  agruparRetiro,
  MAX_MOTIVO_RETIRO,
  mensajeDeErrorRetiro,
  parseOpcionesRetiro,
  textoRetirado,
  validarCodigo,
  validarRetiro,
  type FilaCodigo,
  type OpcionRetiro,
  type Retiro,
} from '@/lib/platform/ninos/retiro'
import { createClient } from '@/lib/supabase/client'

import { registrarRetiroApi } from './api-visita'

type Props = {
  servicio: Servicio
  /** Called after a confirmed check-out (e.g. to refresh a room list). */
  onRetirado?: () => void
}

/** The "Otra persona" choice (anyone outside the list, with a reason). */
const OTRA = '__otra__'

/** Check-out by code: type the code, see the children, pick who picks up from their list, confirm. */
export function RetiroPanel({ servicio, onRetirado }: Props) {
  const [texto, setTexto] = useState('')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [retiro, setRetiro] = useState<Retiro | null>(null)
  const [opciones, setOpciones] = useState<OpcionRetiro[]>([])
  /** The chosen option's name, OTRA, or null. */
  const [eleccion, setEleccion] = useState<string | null>(null)
  const [otraNombre, setOtraNombre] = useState('')
  const [motivo, setMotivo] = useState('')
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
    const agrupado = agruparRetiro(filas)
    let lista: OpcionRetiro[] = []
    if (agrupado.adentro.length > 0) {
      const r = await createClient().rpc('ninos_retiro_opciones', {
        p_codigo: c,
        p_turno_id: servicio.turnoId,
        p_fecha: servicio.fecha,
      })
      // Without the list, "Otra persona" with a reason still works.
      lista = r.error ? [] : parseOpcionesRetiro(r.data)
    }
    setCodigo(c)
    setRetiro(agrupado)
    setOpciones(lista)
    setEleccion(null)
    setOtraNombre('')
    setMotivo('')
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
    const v = validarRetiro(
      eleccion === OTRA ? { tipo: 'otra', nombre: otraNombre, motivo } : eleccion ? { tipo: 'lista', nombre: eleccion } : null,
    )
    if (!v.ok) {
      setError(v.error)
      return
    }
    setError(null)
    setCargando(true)
    const { data, error: err } = await registrarRetiroApi({
      codigo,
      turnoId: servicio.turnoId,
      fecha: servicio.fecha,
      retiradoPor: v.retiradoPor,
      motivoOtra: v.motivoOtra,
    })
    setCargando(false)
    if (err) {
      setError(mensajeDeErrorRetiro(err))
      return
    }
    setHecho(`Retiro registrado: ${(data ?? []).length} niño(s) con el código ${codigo}.`)
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
        <p role="alert" className="text-sm font-medium text-danger-text">
          {error}
        </p>
      )}
      {hecho && (
        <p role="status" className="rounded-xl border border-success/20 bg-success/10 p-3 text-sm font-medium text-success-text">
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
              <fieldset className="space-y-2">
                <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">¿Quién retira?</legend>
                {opciones.length === 0 && (
                  <BadgeSistema variante="warning" tamaño="sm">
                    Sin personas autorizadas ni representantes registrados.
                  </BadgeSistema>
                )}
                {opciones.map((o) => (
                  <div
                    key={o.nombre}
                    className="flex flex-wrap items-center gap-x-3 rounded-xl border border-border px-3 transition-colors has-[:checked]:border-[var(--brand-primary)] has-[:checked]:bg-[var(--brand-primary)]/5"
                  >
                    <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3 text-sm">
                      <input
                        type="radio"
                        name="retiro-quien"
                        value={o.nombre}
                        checked={eleccion === o.nombre}
                        onChange={() => setEleccion(o.nombre)}
                        className="h-4 w-4 accent-[var(--brand-primary)]"
                      />
                      <span>
                        <span className="font-medium text-foreground">{o.nombre}</span>
                        {o.relacion && <span className="text-muted-foreground"> ({o.relacion})</span>}
                      </span>
                    </label>
                    {o.telefono && (
                      <a href={`tel:${o.telefono}`} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-[var(--brand-primary)] hover:underline">
                        <Phone className="h-3 w-3" aria-hidden />
                        {o.telefono}
                      </a>
                    )}
                  </div>
                ))}
                <div className="rounded-xl border border-dashed border-border px-3 has-[:checked]:border-warning/60 has-[:checked]:bg-warning/5">
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="radio"
                      name="retiro-quien"
                      value={OTRA}
                      checked={eleccion === OTRA}
                      onChange={() => setEleccion(OTRA)}
                      className="h-4 w-4 accent-[var(--brand-primary)]"
                    />
                    <span className="font-medium text-foreground">Otra persona</span>
                  </label>
                  {eleccion === OTRA && (
                    <div className="space-y-3 pb-3">
                      <p className="text-xs text-muted-foreground">No está en la lista: queda registrado con el motivo.</p>
                      <InputSistema
                        id="retiro-otra-nombre"
                        label="Nombre de quien retira"
                        autoComplete="off"
                        maxLength={200}
                        value={otraNombre}
                        onChange={(e) => setOtraNombre(e.target.value)}
                      />
                      <InputSistema
                        id="retiro-motivo"
                        label="Motivo"
                        placeholder="Ej.: la mamá avisó por teléfono"
                        maxLength={MAX_MOTIVO_RETIRO}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </fieldset>
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

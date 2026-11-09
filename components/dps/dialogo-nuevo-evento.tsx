'use client'

/**
 * DPS › Programación — «Nuevo evento» (T11b of odd/tasks/dps-asistencia-pco.md;
 * S9, L44): the 420px dialog of the planning style on `ui/dialog`, like
 * «Nueva serie» (dialogo-nueva-serie.tsx). Tipo (servicio especial, Cena del
 * Señor, Noche de adoración), título and the dates «Del … Al …» (Al empty =
 * one day, at most 14); the button says the result ("Crear 3 días").
 * dps_evento_crear makes one plan per day, grouped as one event: each day
 * has its own team, attendance and order, and the sheet shows them together
 * as «Título · Día N de M». Before sending it warns about the dates and
 * about a day that already has an event of that tipo and título; the RPC
 * has the last word (its refusal shows inside). While it creates, it cannot
 * be closed.
 */
import { useState, type FormEvent, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { CLASE_DIALOGO, CLASE_TITULO_DIALOGO } from '@/components/grupos-vida/planner/estilo-planner'
import { crearEventoDps } from '@/lib/actions/dps-programacion.actions'
import { avisoEvento, choquesEvento, diasEvento, fechaCorta, TIPOS_EVENTO, type PlanHoja, type TipoEvento } from '@/lib/platform/dps/programacion'

export interface DialogoNuevoEventoProps {
  readonly planes: readonly PlanHoja[]
  readonly hoy: string
  readonly onCerrar: () => void
  /** The event exists: the parent reloads the year. */
  readonly onCreado: (titulo: string, dias: number) => void
}

export function DialogoNuevoEvento({ planes, hoy, onCerrar, onCreado }: DialogoNuevoEventoProps): ReactElement {
  const [tipo, setTipo] = useState<TipoEvento>('especial')
  const [titulo, setTitulo] = useState('')
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const avisoFechas = avisoEvento(desde, hasta)
  const dias = diasEvento(desde, hasta)
  const choques = avisoFechas ? [] : choquesEvento(planes, tipo, titulo, dias)
  const aviso =
    avisoFechas ??
    (choques.length > 0
      ? `El ${fechaCorta(choques[0])} ya tiene «${titulo.trim()}»${choques.length > 1 ? ` (y ${choques.length - 1} más)` : ''}. Cambia el título o las fechas.`
      : null)
  const puedeCrear = titulo.trim() !== '' && aviso === null && dias.length > 0 && !enviando

  async function crear(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!puedeCrear) return
    setEnviando(true)
    setError(null)
    const r = await crearEventoDps({ tipo, titulo: titulo.trim(), desde, hasta: dias.length > 1 ? hasta : null })
    setEnviando(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
    onCreado(titulo.trim(), dias.length)
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !enviando && onCerrar()}>
      <DialogContent className={CLASE_DIALOGO} showCloseButton={false}>
        <form onSubmit={(e) => void crear(e)} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>Nuevo evento</DialogTitle>
            <DialogDescription>Cada día es un plan con su propio equipo, asistencia y orden; en la hoja se ven juntos.</DialogDescription>
          </DialogHeader>
          <SelectSistema
            label="Tipo"
            opciones={TIPOS_EVENTO.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta }))}
            value={tipo}
            onValueChange={(v) => setTipo(v as TipoEvento)}
          />
          <InputSistema label="Título" value={titulo} maxLength={120} autoComplete="off" onChange={(e) => setTitulo(e.target.value)} />
          <div className="grid grid-cols-2 gap-2.5">
            <InputSistema label="Del" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            <InputSistema label="Al (opcional)" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          </div>
          {aviso && <p className="text-[13px] text-warning-text">{aviso}</p>}
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
          <DialogFooter>
            <BotonSistema type="button" variante="ghost" tamaño="sm" disabled={enviando} onClick={onCerrar}>
              Cancelar
            </BotonSistema>
            <BotonSistema type="submit" tamaño="sm" cargando={enviando} disabled={!puedeCrear}>
              Crear <span className="font-mono tabular-nums">{dias.length}</span> {dias.length === 1 ? 'día' : 'días'}
            </BotonSistema>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

'use client'

/**
 * Niños › Check-in — «Reimprimir» (odd/tasks/ninos-checkin-pco.md, T3b, S10
 * "Anfitriones y coordinación, con motivo", S6 reprint with audit; artboard
 * 05 «Reimprimir (queda registrado)»). Inside the desk panel: which labels
 * (each child of the código and/or the parent receipt), the reason (Se trabó ·
 * Se perdió · Otro) and a note, required for «Otro» (up to 200). Sends one
 * POST /api/ninos/impresion/reimprimir per piece (every child + the receipt
 * is one «todas»); the database records who, when and why, and the código
 * never changes. Errors and the result are said in plain Spanish.
 */
import { useState, type FormEvent, type ReactElement } from 'react'
import { Printer } from 'lucide-react'

import { FilaSeleccion, ListaInset } from '@/components/estudiantes/filas-inset'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { BotonSistema, TextareaSistema } from '@/components/ui/sistema-diseno'
import {
  MAX_NOTA_REIMPRESION,
  OPCIONES_MOTIVO,
  planReimpresion,
  reimprimirEtiquetas,
  textoReimpresion,
  validarNota,
  type MotivoReimpresion,
} from '@/lib/platform/ninos/impresion-vista'

export interface ReimprimirEtiquetasProps {
  readonly estacion: { readonly id: string; readonly nombre: string }
  readonly turnoId: string
  readonly fecha: string
  readonly codigo: string
  /** The children of that código at this desk. */
  readonly ninos: readonly { readonly id: string; readonly nombre: string }[]
  readonly onCerrar: () => void
}

export function ReimprimirEtiquetas({ estacion, turnoId, fecha, codigo, ninos, onCerrar }: ReimprimirEtiquetasProps): ReactElement {
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set())
  const [recibo, setRecibo] = useState(false)
  const [motivo, setMotivo] = useState<MotivoReimpresion | ''>('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const piezas = planReimpresion({ ninoIds: [...elegidos], todos: ninos.map((n) => n.id), recibo })
  const cuantas = elegidos.size + (recibo ? 1 : 0)

  const marcar = (id: string, v: boolean) =>
    setElegidos((s) => {
      const x = new Set(s)
      if (v) x.add(id)
      else x.delete(id)
      return x
    })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const invalido = validarNota(motivo, nota)
    if (invalido || !motivo) {
      setError(invalido ?? 'Elige el motivo.')
      return
    }
    setError(null)
    setEnviando(true)
    const r = await reimprimirEtiquetas(fetch, { estacionId: estacion.id, turnoId, fecha, codigo, motivo, nota }, piezas)
    setEnviando(false)
    if (r.ok) setListo(textoReimpresion(r.data, estacion.nombre, codigo))
    else setError(r.message)
  }

  if (listo) {
    return (
      <div className="grid min-w-0 gap-4">
        <p role="status" className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-foreground">
          {listo}
        </p>
        <BotonSistema type="button" variante="outline" className="w-full" onClick={onCerrar}>
          Cerrar
        </BotonSistema>
      </div>
    )
  }

  return (
    <form className="grid min-w-0 gap-5" onSubmit={(e) => void enviar(e)} noValidate>
      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Qué reimprimir</legend>
        <ListaInset etiqueta="Etiquetas del código">
          {ninos.map((n) => (
            <FilaSeleccion
              key={n.id}
              id={`reimprimir-${n.id}`}
              titulo={`Etiqueta de ${n.nombre}`}
              marcada={elegidos.has(n.id)}
              onCambio={(v) => marcar(n.id, v)}
            />
          ))}
          <FilaSeleccion id="reimprimir-recibo" titulo="Recibo del representante" marcada={recibo} onCambio={setRecibo} />
        </ListaInset>
      </fieldset>

      <div className="grid min-w-0 gap-2">
        <p id="reimprimir-motivo" className="text-sm font-medium text-foreground">
          Motivo
        </p>
        <ControlSegmentado<MotivoReimpresion | ''>
          etiqueta="Motivo"
          opciones={OPCIONES_MOTIVO}
          valor={motivo}
          onCambio={(m) => {
            setMotivo(m)
            setError(null)
          }}
          className="flex w-full [&>button]:flex-1"
        />
      </div>

      <div className="grid min-w-0 gap-1">
        <TextareaSistema
          label={motivo === 'otro' ? 'Nota (obligatoria)' : 'Nota (opcional)'}
          filas={2}
          maxLength={MAX_NOTA_REIMPRESION}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={motivo === 'otro' ? 'Qué pasó' : 'Por ejemplo: verificado con cédula'}
        />
        <p className="text-right font-mono text-xs tabular-nums text-muted-foreground">
          {nota.trim().length}/{MAX_NOTA_REIMPRESION}
        </p>
      </div>

      {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}

      <p className="text-[13px] text-muted-foreground">El código no cambia. Queda registrado quién reimprimió, cuándo y por qué.</p>

      <BotonSistema type="submit" icono={Printer} className="w-full" cargando={enviando} disabled={enviando || cuantas === 0}>
        {cuantas === 0 ? 'Elige qué reimprimir' : `Reimprimir · ${cuantas}`}
      </BotonSistema>
    </form>
  )
}

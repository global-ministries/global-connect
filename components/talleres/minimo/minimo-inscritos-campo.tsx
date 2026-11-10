'use client'

/**
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S16) — «Mínimo de inscritos
 * para abrir» inside the taller's Configuración (artboard 14). It reads and
 * saves its own value (leerMinimoInscritos / guardarMinimoInscritos) because
 * the taller page does not pass it yet; the parent folds it into the single
 * «Guardar configuración» in T9. Empty = no minimum.
 *
 * The two actions are imported on demand: ConfiguracionTaller is a plain
 * client form and should not pull the server-action module (and its server
 * dependencies) until this field actually reads or saves.
 */

import { useEffect, useState, useTransition, type ReactElement } from 'react'

import { BotonSistema, InputSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'

export interface MinimoInscritosCampoProps {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly tipo: 'individual' | 'pareja'
  readonly puedeEditar: boolean
}

export const NOTA_MINIMO =
  'Cuentan solo las inscripciones aprobadas. Si al cierre no llega al mínimo, decides: suspender y mover a una nueva fecha, abrir igual o cancelar. Abrir por debajo del mínimo: solo la dirección de Conexión y el coordinador del taller.'

export function MinimoInscritosCampo({ tallerId, tallerSlug, tipo, puedeEditar }: MinimoInscritosCampoProps): ReactElement {
  const notificar = useNotificaciones()
  const [cargado, setCargado] = useState(false)
  const [guardado, setGuardado] = useState<number | null>(null)
  const [valor, setValor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sinLectura, setSinLectura] = useState(false)
  const [pending, startTransition] = useTransition()
  const unidad = tipo === 'pareja' ? 'parejas' : 'personas'

  useEffect(() => {
    let vigente = true
    import('@/lib/platform/talleres/minimo-suspension-actions')
      .then(({ leerMinimoInscritos }) => leerMinimoInscritos(tallerId))
      .then((r) => {
        if (!vigente) return
        if (r.ok) {
          setGuardado(r.minimo)
          setValor(r.minimo === null ? '' : String(r.minimo))
          setCargado(true)
        } else {
          setSinLectura(true)
        }
      })
      .catch(() => {
        if (vigente) setSinLectura(true)
      })
    return () => {
      vigente = false
    }
  }, [tallerId])

  function guardar(): void {
    setError(null)
    const texto = valor.trim()
    const minimo = texto === '' ? null : Number(texto)
    startTransition(async () => {
      const { guardarMinimoInscritos } = await import('@/lib/platform/talleres/minimo-suspension-actions')
      const r = await guardarMinimoInscritos({ tallerId, tallerSlug, minimo })
      if (r.ok) {
        setGuardado(minimo)
        notificar.success(minimo === null ? 'El taller ya no tiene mínimo.' : `Mínimo para abrir: ${minimo} ${unidad}.`)
      } else {
        setError(r.message)
      }
    })
  }

  if (!puedeEditar) {
    return (
      <div>
        <TextoSistema variante="sutil" tamaño="sm" className="block uppercase tracking-wide">
          Mínimo de inscritos para abrir
        </TextoSistema>
        <TextoSistema className="mt-1 block">
          {sinLectura ? 'No se pudo leer' : !cargado ? '…' : guardado === null ? 'Sin mínimo' : `${guardado} ${unidad}`}
        </TextoSistema>
      </div>
    )
  }

  const sinCambios = valor.trim() === (guardado === null ? '' : String(guardado))

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <InputSistema
          label={`Mínimo de inscritos para abrir (${unidad})`}
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Sin mínimo"
          disabled={!cargado}
          className="w-32 font-mono tabular-nums"
        />
        <BotonSistema type="button" variante="outline" onClick={guardar} disabled={!cargado || sinCambios} cargando={pending}>
          Guardar mínimo
        </BotonSistema>
      </div>
      <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
        {sinLectura ? 'No se pudo leer el mínimo de inscritos. Recarga la página para intentarlo de nuevo.' : NOTA_MINIMO}
      </TextoSistema>
      {error && (
        <TextoSistema role="alert" tamaño="sm" className="mt-1 block text-danger-text">
          {error}
        </TextoSistema>
      )}
    </div>
  )
}

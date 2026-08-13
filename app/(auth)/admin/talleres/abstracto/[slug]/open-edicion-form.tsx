"use client"

/**
 * PR23.2a — Open edicion form (client wrapper).
 *
 * Renders the form to open a new edicion of the abstract taller.
 * Calls the server action `openEdicion` and on success redirects to
 * the edicion detail page.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Send } from 'lucide-react'

import { TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { openEdicion } from './actions'

interface Input {
  readonly tallerId: string
  readonly tallerNombre: string
  readonly defaultModalidad: 'periodo_general' | 'permanente_custom'
}

export function OpenEdicionForm({
  tallerId,
  tallerNombre,
  defaultModalidad,
}: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const [nombreEdicion, setNombreEdicion] = useState('')
  const [linkType, setLinkType] = useState<'matrimonio' | 'novios' | ''>('')
  const [sesiones, setSesiones] = useState<number>(1)
  const [duracion, setDuracion] = useState<number>(60)
  const [modalidad, setModalidad] = useState<'periodo_general' | 'permanente_custom'>(defaultModalidad)
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  const canSubmit = nombreEdicion.trim().length > 0 && fechaInicio.length > 0 && !pending

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await openEdicion({
        taller_id: tallerId,
        nombre_edicion: nombreEdicion.trim(),
        link_type: linkType === '' ? null : (linkType as 'matrimonio' | 'novios'),
        sesiones_estimadas: sesiones,
        duracion_estimada_minutos: duracion,
        modalidad_inscripcion: modalidad,
        fecha_inicio_periodo: new Date(fechaInicio).toISOString(),
        fecha_fin_periodo: fechaFin ? new Date(fechaFin).toISOString() : null,
        firmantes: [],
      })
      if (result.ok) {
        router.refresh()
        setNombreEdicion('')
        setFechaInicio('')
        setFechaFin('')
        setOpen(false)
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white"
      >
        <Plus className="h-4 w-4" /> Abrir nueva edición
      </button>
    )
  }

  return (
    <TarjetaSistema variante="elevated" className="p-5">
      <TextoSistema className="text-lg font-medium">Nueva edición de {tallerNombre}</TextoSistema>
      <TextoSistema variante="sutil" className="mt-1 block text-sm">
        Una edición es una ocurrencia específica del grupo (ej. &quot;otoño 2026&quot;).
        La edición se crea en estado <strong>borrador</strong>; podés abrirla (cambiar a
        <code>abierto</code>) después desde la página de la edición.
      </TextoSistema>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium">Nombre de la edición *</span>
          <input
            value={nombreEdicion}
            onChange={(e) => setNombreEdicion(e.target.value)}
            className="w-full rounded border px-3 py-2"
            placeholder="Ej. Otoño 2026, Primavera 2027"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Vínculo (opcional)</span>
          <select
            value={linkType}
            onChange={(e) => setLinkType(e.target.value as 'matrimonio' | 'novios' | '')}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">— Ninguno —</option>
            <option value="matrimonio">Matrimonio</option>
            <option value="novios">Novios</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Sesiones *</span>
          <input
            type="number"
            min={1}
            value={sesiones}
            onChange={(e) => setSesiones(Number(e.target.value))}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Duración por sesión (min) *</span>
          <input
            type="number"
            min={15}
            step={15}
            value={duracion}
            onChange={(e) => setDuracion(Number(e.target.value))}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Modalidad</span>
          <select
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value as 'periodo_general' | 'permanente_custom')}
            className="w-full rounded border px-3 py-2"
          >
            <option value="periodo_general">Periodo general</option>
            <option value="permanente_custom">Permanente custom</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Fecha inicio *</span>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Fecha fin (opcional)</span>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="rounded border px-3 py-1.5 text-sm"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1 rounded bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {pending ? 'Abriendo…' : 'Abrir edición'}
        </button>
      </div>
    </TarjetaSistema>
  )
}

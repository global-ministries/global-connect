'use client'

/**
 * PR23.1 — Create taller abstracto form (client wrapper).
 *
 * Renders an inline form to create a new abstract taller. Calls the
 * server action `createTallerAbstract` and on success redirects to
 * the taller detail page (PR23.2 will provide this; until then,
 * a 404 is acceptable — the form still works and the taller is
 * created in the DB).
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

import { TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { createTallerAbstract } from './actions'

export function CrearTallerAbstractoForm(): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [modalidad, setModalidad] = useState<'periodo_general' | 'permanente_custom'>('periodo_general')
  const [slug, setSlug] = useState('')

  const canSubmit = nombre.trim().length >= 2 && !pending

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await createTallerAbstract({
        nombre,
        descripcion: descripcion.trim() === '' ? null : descripcion,
        modalidad_default: modalidad,
        slug: slug.trim() === '' ? undefined : slug,
      })
      if (result.ok) {
        router.refresh()
        setNombre('')
        setDescripcion('')
        setSlug('')
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
        <Plus className="h-4 w-4" /> Crear taller abstracto
      </button>
    )
  }

  return (
    <TarjetaSistema variante="elevated" className="p-5">
      <TextoSistema className="text-lg font-medium">Nuevo taller abstracto</TextoSistema>
      <TextoSistema variante="sutil" className="mt-1 block text-sm">
        El slug se genera automáticamente del nombre si lo dejás vacío. Una
        vez creado, podés abrir ediciones específicas (otoño 2026, etc.) — eso
        es PR23.2.
      </TextoSistema>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nombre *</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded border px-3 py-2"
            placeholder="Ej. Matrimonio sobre la Roca"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Slug (opcional)</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded border px-3 py-2 font-mono text-sm"
            placeholder="auto: matrimoniosobrela-roca"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium">Descripción (opcional)</span>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded border px-3 py-2"
            rows={3}
            placeholder="Descripción del taller, objetivos, público objetivo..."
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Modalidad default</span>
          <select
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value as 'periodo_general' | 'permanente_custom')}
            className="w-full rounded border px-3 py-2"
          >
            <option value="periodo_general">Periodo general</option>
            <option value="permanente_custom">Permanente custom</option>
          </select>
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
          className="rounded bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Creando…' : 'Crear taller'}
        </button>
      </div>
    </TarjetaSistema>
  )
}

'use client'

/**
 * PR29-D — Client form to create a new edicion global.
 *
 * Renders an inline form with: nombre, slug, descripcion, fecha_apertura,
 * fecha_cierre, and a multi-select of talleres iniciales.
 *
 * On submit, calls `createEdicionGlobalSubmit` server action and
 * redirects to the new detail page on success.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'

import { TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { createEdicionGlobalSubmit, redirectToEdicionGlobalDetail } from './nueva/actions'

interface TallerInicial {
  readonly id: string
  readonly nombre: string
  readonly slug: string
}

interface Input {
  readonly talleresDisponibles: ReadonlyArray<TallerInicial>
}

const SLUG_REGEX = /^[a-z0-9-]+$/

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

export function CrearEdicionGlobalForm({ talleresDisponibles }: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [fechaApertura, setFechaApertura] = useState('')
  const [fechaCierre, setFechaCierre] = useState('')
  const [selectedTallers, setSelectedTallers] = useState<ReadonlyArray<string>>([])

  const autoSlug = slugify(nombre)
  const effectiveSlug = slugTouched ? slug : autoSlug

  const fechaAperturaDate = fechaApertura ? new Date(fechaApertura + 'T00:00:00') : null
  const fechaCierreDate = fechaCierre ? new Date(fechaCierre + 'T00:00:00') : null
  const fechasValidas =
    fechaAperturaDate !== null &&
    fechaCierreDate !== null &&
    fechaCierreDate.getTime() > fechaAperturaDate.getTime()

  const slugValido =
    SLUG_REGEX.test(effectiveSlug) &&
    effectiveSlug.length >= 2 &&
    effectiveSlug.length <= 80 &&
    effectiveSlug !== '__legacy__' &&
    effectiveSlug !== 'legacy-pre-pr29'

  const canSubmit =
    nombre.trim().length >= 2 &&
    slugValido &&
    fechasValidas &&
    !pending

  function toggleTaller(id: string): void {
    setSelectedTallers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      // Compose the ISO timestamps: midnight UTC on the chosen dates.
      // The RPC expects timestamptz; we use UTC midnight to avoid
      // timezone drift.
      const fa = fechaAperturaDate!.toISOString()
      const fc = fechaCierreDate!.toISOString()
      const result = await createEdicionGlobalSubmit({
        nombre,
        slug: effectiveSlug,
        descripcion: descripcion.trim() === '' ? null : descripcion,
        fecha_apertura: fa,
        fecha_cierre: fc,
        taller_ids: selectedTallers,
      })
      if (result.ok) {
        // Use the server redirect for the navigation (clean URL + works
        // with Next's RSC cache invalidation).
        router.refresh()
        await redirectToEdicionGlobalDetail(result.edicionGlobalId)
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  return (
    <TarjetaSistema variante="elevated" className="p-5">
      <TextoSistema className="text-lg font-medium">Nueva edición global</TextoSistema>
      <TextoSistema variante="sutil" className="mt-1 block text-sm">
        Una edición global es una temporada que agrupa N talleres (ej.
        &quot;Otoño 2026&quot;, &quot;Primavera 2027&quot;). Al abrirla, los talleres
        asociados se abren en simultáneo. Creala en estado{' '}
        <strong>borrador</strong> y después abrila desde la página de detalle.
      </TextoSistema>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium">Nombre *</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded border px-3 py-2"
            placeholder="Ej. Otoño 2026"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Slug *</span>
          <input
            value={effectiveSlug}
            onChange={(e) => {
              setSlug(e.target.value)
              setSlugTouched(true)
            }}
            className="w-full rounded border px-3 py-2 font-mono text-sm"
            placeholder="auto: otono-2026"
          />
          {slug && !slugValido && (
            <span className="mt-1 block text-xs text-red-600">
              Slug inválido. Solo letras minúsculas, números y guiones.
            </span>
          )}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Fecha apertura *</span>
          <input
            type="date"
            value={fechaApertura}
            onChange={(e) => setFechaApertura(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium">Descripción (opcional)</span>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded border px-3 py-2"
            rows={3}
            placeholder="Descripción breve de la temporada, objetivo, etc."
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Fecha cierre *</span>
          <input
            type="date"
            value={fechaCierre}
            onChange={(e) => setFechaCierre(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
          {fechaApertura && fechaCierre && !fechasValidas && (
            <span className="mt-1 block text-xs text-red-600">
              La fecha de cierre debe ser posterior a la de apertura.
            </span>
          )}
        </label>

        <div className="md:col-span-2">
          <span className="mb-1 block text-sm font-medium">
            Talleres iniciales (opcional)
          </span>
          <TextoSistema variante="sutil" className="mb-2 block text-xs">
            Podés agregar y quitar talleres después mientras la edición esté en
            borrador.
          </TextoSistema>
          {talleresDisponibles.length === 0 ? (
            <TextoSistema variante="sutil" className="block text-sm">
              No hay grupos activos para asociar.
            </TextoSistema>
          ) : (
            <div className="grid gap-1 max-h-56 overflow-y-auto rounded border p-2">
              {talleresDisponibles.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTallers.includes(t.id)}
                    onChange={() => toggleTaller(t.id)}
                  />
                  <span>{t.nombre}</span>
                  <code className="text-xs text-muted-foreground">{t.slug}</code>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1 rounded bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {pending ? 'Creando…' : 'Crear edición global'}
        </button>
      </div>
    </TarjetaSistema>
  )
}
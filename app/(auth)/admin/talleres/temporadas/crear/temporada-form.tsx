'use client'

/**
 * PR C (Fase 5 GdV-parity) — Season create form (client).
 *
 * Raw-Tailwind form (matching open-edicion-form.tsx). Auto-suggests a slug from
 * the nombre until the user edits the slug manually. Calls the createTemporada
 * server action and, on success, navigates to the new season's detail page
 * where the "which talleres open" toggles live.
 */

import { useMemo, useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'

import { TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { createTemporada } from '../actions'

/** minúsculas, números y guiones; colapsa separadores; recorta guiones. */
function slugify(value: string): string {
  // Strip combining diacritical marks (U+0300–U+036F) after NFD decomposition
  // without embedding raw combining characters in this source file.
  const stripped = value
    .normalize('NFD')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      return code < 0x0300 || code > 0x036f
    })
    .join('')
  return stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function TallerTemporadaForm(): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [fechaApertura, setFechaApertura] = useState('')
  const [fechaCierre, setFechaCierre] = useState('')

  const effectiveSlug = useMemo(
    () => (slugTouched ? slug : slugify(nombre)),
    [slugTouched, slug, nombre],
  )

  const canSubmit =
    nombre.trim().length >= 2 &&
    effectiveSlug.length >= 2 &&
    effectiveSlug !== 'legacy' &&
    fechaApertura.length > 0 &&
    fechaCierre.length > 0 &&
    !pending

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await createTemporada({
        nombre: nombre.trim(),
        slug: effectiveSlug,
        descripcion: descripcion.trim() ? descripcion.trim() : null,
        fecha_apertura: new Date(fechaApertura).toISOString(),
        fecha_cierre: new Date(fechaCierre).toISOString(),
      })
      if (result.ok && result.temporadaId) {
        router.push(`/admin/talleres/temporadas/${result.temporadaId}`)
      } else if (result.ok) {
        router.push('/admin/talleres/temporadas')
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  return (
    <TarjetaSistema variante="elevated" className="p-5">
      <TextoSistema variante="sutil" className="mb-4 block text-sm">
        Una temporada agrupa qué talleres abren inscripción a la vez. Se crea en estado{' '}
        <strong>borrador</strong>; luego elegís qué talleres abren y la pasás a{' '}
        <code>abierto</code> desde su detalle.
      </TextoSistema>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium">Nombre *</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded border px-3 py-2"
            placeholder="Ej. Temporada Otoño 2026"
            maxLength={120}
          />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium">Slug *</span>
          <input
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(slugify(e.target.value))
            }}
            className="w-full rounded border px-3 py-2 font-mono text-sm"
            placeholder="otono-2026"
            maxLength={80}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Solo minúsculas, números y guiones. Se sugiere desde el nombre. &quot;legacy&quot; está
            reservado.
          </span>
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium">Descripción</span>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded border px-3 py-2"
            rows={3}
            maxLength={1000}
            placeholder="Opcional"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Fecha de apertura *</span>
          <input
            type="date"
            value={fechaApertura}
            onChange={(e) => setFechaApertura(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Fecha de cierre *</span>
          <input
            type="date"
            value={fechaCierre}
            onChange={(e) => setFechaCierre(e.target.value)}
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
          onClick={() => router.push('/admin/talleres/temporadas')}
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
          {pending ? 'Creando…' : 'Crear temporada'}
        </button>
      </div>
    </TarjetaSistema>
  )
}

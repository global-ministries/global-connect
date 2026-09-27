'use client'

/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — season create form,
 * ported from app/(auth)/admin/talleres/temporadas/crear/temporada-form.tsx.
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — rewritten:
 * the temporada now needs a dueño (talleres_crear_temporada's p_equipo_id,
 * T3 migration 20260928120000_talleres_temporadas_por_direccion.sql), so
 * this form PICKS a dirección first (preselected when the page only found
 * one eligible one), then offers a checklist of that dirección's own
 * talleres — régimen=temporada ones checked by default and toggleable
 * (talleres_crear_temporada creates one edición per checked id in the
 * SAME call), régimen=cadencia ones shown disabled with a hint (they open
 * by their own cadencia, never by a temporada). `slug`/`descripcion` are
 * GONE: talleres_crear_temporada derives its own slug and has no
 * p_descripcion parameter (verified against the RPC's own signature).
 *
 * Everything the preview needs (which talleres, their régimen) is already
 * in `direcciones` (loaded once, server-side, by crear/page.tsx via
 * loadTalleresDeDireccion) — switching the dirección picker never triggers
 * a second round trip.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'

import {
  TarjetaSistema,
  TextoSistema,
  InputSistema,
  SelectSistema,
  BotonSistema,
} from '@/components/ui/sistema-diseno'

import { createTemporada } from '../actions'
import { rutaTemporada, rutaTemporadas } from '@/lib/platform/talleres/rutas'
import type { TallerParaTemporada } from '@/lib/platform/talleres/temporadas'

export interface DireccionParaCrearVM {
  readonly id: string
  readonly label: string
  readonly talleres: readonly TallerParaTemporada[]
}

interface Props {
  readonly direcciones: readonly DireccionParaCrearVM[]
}

/** Same UTC-anchored formatting used across the taller/edición screens, so a `YYYY-MM-DD` never shifts a day. */
function formatFechaCorta(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number)
  if (!y || !m || !d) return dateOnly
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es', { timeZone: 'UTC' })
}

function talleresPorTemporadaIds(talleres: readonly TallerParaTemporada[]): Set<string> {
  return new Set(talleres.filter((t) => t.regimen === 'temporada').map((t) => t.id))
}

export function TallerTemporadaForm({ direcciones }: Props): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [direccionId, setDireccionId] = useState(direcciones.length === 1 ? direcciones[0]!.id : '')
  const [nombre, setNombre] = useState('')
  const [fechaApertura, setFechaApertura] = useState('')
  const [fechaCierre, setFechaCierre] = useState('')

  const direccion = direcciones.find((d) => d.id === direccionId) ?? null

  const [seleccionados, setSeleccionados] = useState<Set<string>>(() =>
    talleresPorTemporadaIds(direccion?.talleres ?? []),
  )

  function elegirDireccion(id: string): void {
    setDireccionId(id)
    const nueva = direcciones.find((d) => d.id === id)
    setSeleccionados(talleresPorTemporadaIds(nueva?.talleres ?? []))
  }

  function toggleTaller(id: string, checked: boolean): void {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const canSubmit =
    !pending &&
    direccionId !== '' &&
    nombre.trim().length >= 2 &&
    fechaApertura.length > 0 &&
    fechaCierre.length > 0

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await createTemporada({
        equipoId: direccionId,
        nombre: nombre.trim(),
        fecha_apertura: fechaApertura,
        fecha_cierre: fechaCierre,
        tallerIds: Array.from(seleccionados),
      })
      if (result.ok && result.temporadaId) {
        router.push(`${rutaTemporada(result.temporadaId)}?creadas=${result.edicionesCreadas ?? 0}`)
      } else if (!result.ok) {
        setError(result.message ?? result.error)
      }
    })
  }

  return (
    <TarjetaSistema variante="elevated" className="p-5">
      <TextoSistema variante="sutil" className="mb-4 block text-sm">
        Una temporada agrupa qué talleres abren inscripción a la vez en una dirección. Se crea en
        estado <strong>borrador</strong>.
      </TextoSistema>

      <div className="grid gap-4">
        <SelectSistema
          label="Dirección"
          value={direccionId}
          onValueChange={elegirDireccion}
          placeholder="— Elige una dirección —"
          opciones={direcciones.map((d) => ({ valor: d.id, etiqueta: d.label }))}
        />

        <InputSistema
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. 2027 - I"
          maxLength={120}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <InputSistema
            label="Fecha de apertura"
            type="date"
            value={fechaApertura}
            onChange={(e) => setFechaApertura(e.target.value)}
          />
          <InputSistema
            label="Fecha de cierre"
            type="date"
            value={fechaCierre}
            onChange={(e) => setFechaCierre(e.target.value)}
          />
        </div>

        {direccion && (
          <div>
            <TextoSistema className="mb-1 block text-sm font-medium">
              Talleres que abren en esta temporada
            </TextoSistema>
            {direccion.talleres.length === 0 ? (
              <TextoSistema variante="sutil" className="block text-sm">
                Esta dirección todavía no tiene talleres.
              </TextoSistema>
            ) : (
              <ul className="grid gap-2">
                {direccion.talleres.map((taller) => {
                  const esPorTemporada = taller.regimen === 'temporada'
                  const checked = esPorTemporada && seleccionados.has(taller.id)
                  return (
                    <li key={taller.id}>
                      <label
                        className={`flex min-h-[44px] items-center gap-3 rounded border p-3 ${
                          esPorTemporada ? '' : 'opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!esPorTemporada}
                          onChange={(e) => toggleTaller(taller.id, e.target.checked)}
                          className="h-5 w-5"
                          aria-label={taller.nombre}
                        />
                        <span className="flex-1">
                          <span className="block text-sm font-medium">{taller.nombre}</span>
                          <span className="block text-xs text-muted-foreground">{taller.nodoLabel}</span>
                        </span>
                        {!esPorTemporada && (
                          <span className="text-xs text-muted-foreground">abre por su propia cadencia</span>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {direccion && fechaApertura && (
          <TarjetaSistema variante="outlined" className="p-3">
            <TextoSistema tamaño="sm">
              Se crearán {seleccionados.size} {seleccionados.size === 1 ? 'edición' : 'ediciones'} con
              primera clase el {formatFechaCorta(fechaApertura)}.
            </TextoSistema>
          </TarjetaSistema>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <BotonSistema type="button" variante="outline" onClick={() => router.push(rutaTemporadas())}>
          Cancelar
        </BotonSistema>
        <BotonSistema type="button" variante="primario" onClick={submit} disabled={!canSubmit}>
          {pending ? 'Creando…' : 'Crear temporada'}
        </BotonSistema>
      </div>
    </TarjetaSistema>
  )
}

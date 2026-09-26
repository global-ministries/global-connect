"use client"

/**
 * PR23.2a — Open edicion form (client wrapper).
 *
 * Renders the form to open a new edicion of the abstract taller.
 * Calls the server action `openEdicion` and on success redirects to
 * the edicion detail page.
 *
 * T3 (odd/tasks/talleres-consolidar-pantallas.md) — moved here from
 * app/(auth)/admin/talleres/abstracto/[slug]/open-edicion-form.tsx so the
 * new /talleres/[taller] page can reuse it without importing across an
 * app/ route folder — same move-and-share approach T2 used for
 * CrearTallerAbstractoForm. The old [slug]/page.tsx now imports it from
 * this shared location too; this is a move, not a copy. The server action
 * (openEdicion) stays in its original location — only the client form
 * component moved.
 *
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — the "Duración
 * (semanas)" field (sesiones_estimadas) is gone (Decisiones: "sesiones_
 * estimadas deja de pedirse en el formulario"). The page now derives it
 * from the taller's active plantilla clases (or the form's previous
 * default of 1 when there is no plantilla) and passes it down as
 * `sesionesEstimadas` — a plain number, never user-editable here.
 *
 * After a successful open, open_edicion's instantiation summary (T2,
 * migration 20260927100000_talleres_instanciar_edicion.sql) is shown:
 * how many grupos were created, how many clases per grupo, and — when
 * non-empty — a warning naming every facilitador skipped because they
 * are no longer an active servidor (acceptance criterion 3).
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Send } from 'lucide-react'

import { TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { openEdicion, type OpenEdicionResult } from '@/app/(auth)/admin/talleres/abstracto/[slug]/actions'

interface Input {
  readonly tallerId: string
  readonly tallerNombre: string
  readonly defaultModalidad: 'periodo_general' | 'permanente_custom'
  /**
   * PR46 — open global seasons (talleres_temporadas, estado='abierto') this
   * edición can be bound to. Empty ⇒ no picker is shown and the edición is
   * opened with temporada_id=null (backward-compatible).
   */
  readonly temporadasAbiertas: ReadonlyArray<{ readonly id: string; readonly nombre: string }>
  /**
   * T3 — number of active plantilla clases (or the previous default of 1
   * when the taller has none yet). Sent verbatim as `sesiones_estimadas`;
   * open_edicion still requires the parameter, it just no longer comes
   * from user input.
   */
  readonly sesionesEstimadas: number
}

type Resumen = Extract<OpenEdicionResult, { ok: true }>

function nombreCompletoOmitido(f: { nombre: string | null; apellido: string | null }): string {
  return [f.nombre, f.apellido].filter((p): p is string => Boolean(p)).join(' ') || 'Persona sin nombre'
}

export function OpenEdicionForm({
  tallerId,
  tallerNombre,
  defaultModalidad,
  temporadasAbiertas,
  sesionesEstimadas,
}: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [resumen, setResumen] = useState<Resumen | null>(null)

  const [nombreEdicion, setNombreEdicion] = useState('')
  const [tipo, setTipo] = useState<'individual' | 'pareja'>('pareja')
  const [linkType, setLinkType] = useState<'matrimonio' | 'novios' | ''>('')
  const [duracion, setDuracion] = useState<number>(60)
  const [modalidad, setModalidad] = useState<'periodo_general' | 'permanente_custom'>(defaultModalidad)
  const [temporadaId, setTemporadaId] = useState<string>('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  const canSubmit = nombreEdicion.trim().length > 0 && fechaInicio.length > 0 && !pending

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await openEdicion({
        taller_id: tallerId,
        tipo,
        nombre_edicion: nombreEdicion.trim(),
        link_type: tipo === 'pareja' && linkType !== '' ? (linkType as 'matrimonio' | 'novios') : null,
        sesiones_estimadas: sesionesEstimadas,
        duracion_estimada_minutos: duracion,
        modalidad_inscripcion: modalidad,
        fecha_inicio_periodo: new Date(fechaInicio).toISOString(),
        fecha_fin_periodo: fechaFin ? new Date(fechaFin).toISOString() : null,
        firmantes: [],
        // PR46 — bind to a global season when one is picked; '' ⇒ null.
        temporada_id: temporadaId === '' ? null : temporadaId,
      })
      if (result.ok) {
        router.refresh()
        setNombreEdicion('')
        setFechaInicio('')
        setFechaFin('')
        setTemporadaId('')
        setOpen(false)
        setResumen(result)
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setResumen(null)
          }}
          className="inline-flex items-center gap-2 rounded bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" /> Abrir nueva edición
        </button>

        {resumen && (
          <TarjetaSistema variante="outlined" className="w-full p-4">
            <TextoSistema className="font-medium">Edición abierta</TextoSistema>
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
              {resumen.gruposCreados.length} grupos creados · {resumen.clasesPorGrupo} clases por grupo
            </TextoSistema>
            {resumen.facilitadoresOmitidos.length > 0 && (
              <TextoSistema role="alert" tamaño="sm" className="mt-2 block text-warning">
                No se asignaron (ya no son servidores activos): {resumen.facilitadoresOmitidos
                  .map((f) => `${nombreCompletoOmitido(f)} (${f.plantillaGrupo})`)
                  .join(', ')}
              </TextoSistema>
            )}
          </TarjetaSistema>
        )}
      </div>
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
          <span className="mb-1 block text-sm font-medium">Tipo *</span>
          <select
            value={tipo}
            onChange={(e) => {
              const v = e.target.value as 'individual' | 'pareja'
              setTipo(v)
              if (v === 'individual') setLinkType('')
            }}
            className="w-full rounded border px-3 py-2"
          >
            <option value="pareja">Pareja</option>
            <option value="individual">Individual</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Vínculo (solo pareja)</span>
          <select
            value={linkType}
            onChange={(e) => setLinkType(e.target.value as 'matrimonio' | 'novios' | '')}
            disabled={tipo !== 'pareja'}
            className="w-full rounded border px-3 py-2 disabled:opacity-50"
          >
            <option value="">— Ninguno —</option>
            <option value="matrimonio">Matrimonio</option>
            <option value="novios">Novios</option>
          </select>
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
        {temporadasAbiertas.length > 0 && (
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Temporada</span>
            <select
              value={temporadaId}
              onChange={(e) => setTemporadaId(e.target.value)}
              className="w-full rounded border px-3 py-2"
            >
              <option value="">— Sin temporada —</option>
              {temporadasAbiertas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              Vinculá esta edición a una temporada global abierta para agrupar
              métricas. Opcional.
            </span>
          </label>
        )}
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
        <div role="alert" className="mt-3 rounded border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
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

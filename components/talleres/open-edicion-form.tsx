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
 * (semanas)" field (sesiones_estimadas) is gone ONLY when the taller has
 * an active plantilla (Decisiones: "sesiones_estimadas deja de pedirse
 * en el formulario"): the page derives the count from it and passes a
 * plain number as `sesionesEstimadas`, never user-editable. A taller
 * with NO active plantilla clases keeps behaving exactly as before
 * (acceptance criterion 8) — the page passes `sesionesEstimadas: null`,
 * and this component falls back to its own original numeric field
 * (label, min=1, default=1, "1 semana = 1 sesión" helper text), sending
 * whatever the user types.
 *
 * After a successful open, open_edicion's instantiation summary (T2,
 * migration 20260927100000_talleres_instanciar_edicion.sql) is shown:
 * how many grupos were created, how many clases per grupo, and — when
 * non-empty — a warning naming every facilitador skipped because they
 * are no longer an active servidor (acceptance criterion 3).
 *
 * T10 (design audit) — the flat `bg-[var(--brand-primary)]` trigger became
 * a `BotonSistema variante="primario"`, and the form itself moved into a
 * `Dialog` opened from that trigger (it used to render inline, pushing the
 * rest of the taller screen down while open). Every raw `<input>`/
 * `<select>` became `InputSistema`/`SelectSistema`. T11 renames the
 * trigger's label ("Crear edición") and reworks the flow this form is
 * part of — this pass only touches layout and controls, not copy or
 * behaviour, except for the two voseo→neutral fixes below.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Send } from 'lucide-react'

import {
  BotonSistema,
  InputSistema,
  SelectSistema,
  TarjetaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
   * T3 — number of active plantilla clases, or `null` when the taller
   * has none yet (acceptance criterion 8: keep the old form). A number
   * is sent verbatim as `sesiones_estimadas`, hiding the field; `null`
   * shows the field again and sends whatever the user types.
   */
  readonly sesionesEstimadas: number | null
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
  const [sesiones, setSesiones] = useState<number>(1)
  const [duracion, setDuracion] = useState<number>(60)
  const [modalidad, setModalidad] = useState<'periodo_general' | 'permanente_custom'>(defaultModalidad)
  const [temporadaId, setTemporadaId] = useState<string>('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  const canSubmit = nombreEdicion.trim().length > 0 && fechaInicio.length > 0 && !pending

  function abrirDialogo(): void {
    setOpen(true)
    setResumen(null)
    setError(null)
  }

  function cerrarDialogo(): void {
    setOpen(false)
    setError(null)
  }

  function submit(): void {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await openEdicion({
        taller_id: tallerId,
        tipo,
        nombre_edicion: nombreEdicion.trim(),
        link_type: tipo === 'pareja' && linkType !== '' ? (linkType as 'matrimonio' | 'novios') : null,
        sesiones_estimadas: sesionesEstimadas ?? sesiones,
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

  return (
    <div className="flex flex-col items-start gap-3">
      <BotonSistema type="button" variante="primario" tamaño="sm" icono={Plus} onClick={abrirDialogo}>
        Abrir nueva edición
      </BotonSistema>

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

      <Dialog open={open} onOpenChange={(next) => (next ? abrirDialogo() : cerrarDialogo())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nueva edición de {tallerNombre}</DialogTitle>
            <DialogDescription>
              Una edición es una ocurrencia específica del grupo (ej. &quot;otoño 2026&quot;). La
              edición se crea en estado <strong>borrador</strong>; puedes abrirla (cambiar a{' '}
              <code>abierto</code>) después desde la página de la edición.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <InputSistema
                label="Nombre de la edición *"
                value={nombreEdicion}
                onChange={(e) => setNombreEdicion(e.target.value)}
                placeholder="Ej. Otoño 2026, Primavera 2027"
              />
            </div>
            <SelectSistema
              label="Tipo *"
              value={tipo}
              onValueChange={(v) => {
                const value = v as 'individual' | 'pareja'
                setTipo(value)
                if (value === 'individual') setLinkType('')
              }}
              opciones={[
                { valor: 'pareja', etiqueta: 'Pareja' },
                { valor: 'individual', etiqueta: 'Individual' },
              ]}
            />
            <SelectSistema
              label="Vínculo (solo pareja)"
              value={linkType}
              onValueChange={(v) => setLinkType(v as 'matrimonio' | 'novios' | '')}
              disabled={tipo !== 'pareja'}
              placeholder="— Ninguno —"
              opciones={[
                { valor: 'matrimonio', etiqueta: 'Matrimonio' },
                { valor: 'novios', etiqueta: 'Novios' },
              ]}
            />
            {sesionesEstimadas === null && (
              <div>
                <InputSistema
                  label="Duración (semanas) *"
                  type="number"
                  min={1}
                  value={sesiones}
                  onChange={(e) => setSesiones(Number(e.target.value))}
                />
                <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                  1 semana = 1 sesión.
                </TextoSistema>
              </div>
            )}
            <InputSistema
              label="Duración por sesión (min) *"
              type="number"
              min={15}
              step={15}
              value={duracion}
              onChange={(e) => setDuracion(Number(e.target.value))}
            />
            <SelectSistema
              label="Modalidad"
              value={modalidad}
              onValueChange={(v) => setModalidad(v as 'periodo_general' | 'permanente_custom')}
              opciones={[
                { valor: 'periodo_general', etiqueta: 'Periodo general' },
                { valor: 'permanente_custom', etiqueta: 'Permanente custom' },
              ]}
            />
            {temporadasAbiertas.length > 0 && (
              <div className="md:col-span-2">
                <SelectSistema
                  label="Temporada"
                  value={temporadaId}
                  onValueChange={setTemporadaId}
                  placeholder="— Sin temporada —"
                  opciones={temporadasAbiertas.map((t) => ({ valor: t.id, etiqueta: t.nombre }))}
                />
                <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                  Vincula esta edición a una temporada global abierta para agrupar métricas. Opcional.
                </TextoSistema>
              </div>
            )}
            <InputSistema
              label="Fecha inicio *"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
            <InputSistema
              label="Fecha fin (opcional)"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>

          {error && (
            <TextoSistema role="alert" className="block text-destructive">
              {error}
            </TextoSistema>
          )}

          <div className="flex items-center justify-end gap-2">
            <BotonSistema type="button" variante="outline" onClick={cerrarDialogo}>
              Cancelar
            </BotonSistema>
            <BotonSistema type="button" variante="primario" icono={Send} onClick={submit} disabled={!canSubmit}>
              {pending ? 'Abriendo…' : 'Abrir edición'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

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
 * and this component falls back to its own original numeric field,
 * relabeled "Cantidad de clases" in T11 (one vocabulary: "clase", never
 * "sesión", in talleres UI copy — docs/talleres-de-punta-a-punta.md §2),
 * sending whatever the user types.
 *
 * T11 — the "Duración por sesión (min)" field is GONE for good (not just
 * conditionally): that value now lives on the taller as `duracion_minutos`
 * (editable in PlantillaClasesSection's "cadencia y duración" controls),
 * so the page derives it and passes it down as `duracionMinutos`, sent
 * verbatim as `duracion_estimada_minutos`, never user-typed here.
 *
 * T10 (design audit) — the flat `bg-[var(--brand-primary)]` trigger became
 * a `BotonSistema variante="primario"`, and the form itself moved into a
 * `Dialog` opened from that trigger (it used to render inline, pushing the
 * rest of the taller screen down while open). Every raw `<input>`/
 * `<select>` became `InputSistema`/`SelectSistema`.
 *
 * T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) — the
 * action is "Crear edición" everywhere (trigger, dialog title, submit
 * button), never "Abrir": the edición is CREATED here (in `borrador`), and
 * a separate "Abrir esta edición" control on the edición page later
 * transitions it to `abierto` for inscriptions — two different verbs for
 * two different transitions, no longer sharing a name. Before submitting,
 * the dialog shows a PREVIEW computed from props the taller page already
 * has: "Se crearán N grupos y M clases por grupo" (`gruposPlantillaActivos`
 * and `sesionesEstimadas`), or, when the taller has no active plantilla
 * clases, a notice asking how many it will have; and the list of plantilla
 * facilitadores that `open_edicion` would omit right now because they are
 * no longer active servidores of this equipo (`facilitadoresOmitidosPreview`,
 * computed by the page via `previewFacilitadoresOmitidos`, acceptance
 * criterion 3). On a successful create there is no more success card on
 * the taller page — the form redirects straight to the new edición's page
 * (`rutaEdicion`), since `openEdicion` already returns its id.
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

import { openEdicion } from '@/app/(auth)/admin/talleres/abstracto/[slug]/actions'
import { rutaEdicion } from '@/lib/platform/talleres/rutas'
import type { FacilitadorOmitidoPreview } from '@/lib/platform/talleres/plantilla'

interface Input {
  readonly tallerId: string
  /** T11 — needed to build rutaEdicion(tallerSlug, edicionId) after a successful create. */
  readonly tallerSlug: string
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
   * is sent verbatim as `sesiones_estimadas`, hiding the field (and is
   * also the preview's "M clases por grupo"); `null` shows the field
   * again, sends whatever the user types, and switches the preview to a
   * notice asking how many clases the edición will have.
   */
  readonly sesionesEstimadas: number | null
  /** T11 — number of active plantilla grupos ("N" in the preview sentence). */
  readonly gruposPlantillaActivos: number
  /** T11 — plantilla facilitadores `open_edicion` would omit right now (lib/platform/talleres/plantilla.ts's previewFacilitadoresOmitidos). */
  readonly facilitadoresOmitidosPreview: readonly FacilitadorOmitidoPreview[]
  /** T11 — the taller's own `duracion_minutos`, sent verbatim as `duracion_estimada_minutos`; never user-editable here (docs §12: it lives on the taller). */
  readonly duracionMinutos: number
}

export function OpenEdicionForm({
  tallerId,
  tallerSlug,
  tallerNombre,
  defaultModalidad,
  temporadasAbiertas,
  sesionesEstimadas,
  gruposPlantillaActivos,
  facilitadoresOmitidosPreview,
  duracionMinutos,
}: Input): ReactElement {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const [nombreEdicion, setNombreEdicion] = useState('')
  const [tipo, setTipo] = useState<'individual' | 'pareja'>('pareja')
  const [linkType, setLinkType] = useState<'matrimonio' | 'novios' | ''>('')
  const [cantidadClases, setCantidadClases] = useState<number>(1)
  const [modalidad, setModalidad] = useState<'periodo_general' | 'permanente_custom'>(defaultModalidad)
  const [temporadaId, setTemporadaId] = useState<string>('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  const canSubmit = nombreEdicion.trim().length > 0 && fechaInicio.length > 0 && !pending

  function abrirDialogo(): void {
    setOpen(true)
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
        sesiones_estimadas: sesionesEstimadas ?? cantidadClases,
        duracion_estimada_minutos: duracionMinutos,
        modalidad_inscripcion: modalidad,
        fecha_inicio_periodo: new Date(fechaInicio).toISOString(),
        fecha_fin_periodo: fechaFin ? new Date(fechaFin).toISOString() : null,
        firmantes: [],
        // PR46 — bind to a global season when one is picked; '' ⇒ null.
        temporada_id: temporadaId === '' ? null : temporadaId,
      })
      if (result.ok) {
        // T11 — no more success card on the taller page: land straight on
        // the new edición, which already shows its own "borrador" banner
        // and, when the viewer can edit it, the "Abrir esta edición" button.
        setOpen(false)
        router.push(rutaEdicion(tallerSlug, result.edicionId))
      } else {
        setError(result.message ?? result.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <BotonSistema type="button" variante="primario" tamaño="sm" icono={Plus} onClick={abrirDialogo}>
        Crear edición
      </BotonSistema>

      <Dialog open={open} onOpenChange={(next) => (next ? abrirDialogo() : cerrarDialogo())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear edición de {tallerNombre}</DialogTitle>
            <DialogDescription>
              Una edición es una ocurrencia específica del grupo (ej. &quot;otoño 2026&quot;). La
              edición se crea en estado <strong>borrador</strong>; puedes abrirla (cambiar a{' '}
              <code>abierto</code>) después desde la página de la edición.
            </DialogDescription>
          </DialogHeader>

          {/* T11 — preview of what "Crear edición" will do, before the director confirms. */}
          <TarjetaSistema variante="outlined" className="p-3">
            {sesionesEstimadas !== null ? (
              <TextoSistema tamaño="sm">
                Se crearán {gruposPlantillaActivos} grupos y {sesionesEstimadas} clases por grupo.
              </TextoSistema>
            ) : (
              <TextoSistema tamaño="sm">
                Este taller no tiene clases en la plantilla: indica cuántas clases tendrá.
              </TextoSistema>
            )}
            {facilitadoresOmitidosPreview.length > 0 && (
              <TextoSistema role="alert" tamaño="sm" className="mt-2 block text-warning">
                No se asignarán porque ya no sirven en este equipo:{' '}
                {facilitadoresOmitidosPreview
                  .map((f) => `${f.nombre} (${f.plantillaGrupo})`)
                  .join(', ')}
              </TextoSistema>
            )}
          </TarjetaSistema>

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
              <InputSistema
                label="Cantidad de clases *"
                type="number"
                min={1}
                value={cantidadClases}
                onChange={(e) => setCantidadClases(Number(e.target.value))}
              />
            )}
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
              {pending ? 'Creando…' : 'Crear edición'}
            </BotonSistema>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
